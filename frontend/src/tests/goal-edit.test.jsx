import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { GoalDetailPage } from '../pages/GoalDetailPage';
import * as tplApi from '../api/templates';
import * as goalApi from '../api/goals';

// F-10 UI (AC-F10-09, S-15): ปุ่ม "Edit goal" เฉพาะ goal ที่ active; แก้ target_minutes / end_date

vi.mock('../api/templates', () => ({
  getTemplates: vi.fn(),
  createTemplate: vi.fn(),
}));

vi.mock('../api/goals', () => ({
  getGoals: vi.fn(),
  getGoal: vi.fn(),
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  getGoalProgress: vi.fn(),
  getGoalEntries: vi.fn(),
  createGoalEntry: vi.fn(),
  updateGoalEntry: vi.fn(),
  deleteGoalEntry: vi.fn(),
}));

const todayBkk = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());

function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const TODAY = todayBkk();
const START = addDays(TODAY, -10);
const END = addDays(TODAY, 20);
const NEW_END = addDays(TODAY, 40);

const template = { id: 10, name: 'Reading', unit: 'minutes', min_value: 10, max_value: 120, is_archived: false };

function goalOf(status, overrides = {}) {
  return {
    id: 5,
    template_id: 10,
    status,
    start_date: START,
    end_date: status === 'ended' ? addDays(TODAY, -1) : END,
    target_minutes: 600,
    ...overrides,
  };
}

function progressOf(total, target) {
  return { total_minutes: total, target_minutes: target, percent: Math.min(100, Math.round((total / target) * 100)) };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/goals/5']}>
      <Routes>
        <Route path="/goals/:id" element={<GoalDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

function setup(status = 'active') {
  goalApi.getGoal.mockResolvedValue({ goal: goalOf(status) });
  goalApi.getGoalProgress.mockResolvedValue({ progress: progressOf(60, 600) });
  goalApi.getGoalEntries.mockResolvedValue({ entries: [] });
  tplApi.getTemplates.mockResolvedValue({ templates: [template] });
}

async function loaded() {
  await waitFor(() => expect(screen.getByTestId('progress-summary')).toBeInTheDocument());
}

function apiError(status, fields) {
  const err = new Error(status === 400 ? 'Bad Request' : 'Conflict');
  err.status = status;
  err.data = fields ? { error: 'Bad Request', fields } : { error: 'Conflict' };
  return err;
}

describe('TEST-F10-10 (UI) — edit goal on goal detail page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the Edit goal button only for an active goal', async () => {
    setup('active');
    const first = renderPage();
    await loaded();
    expect(screen.getByRole('button', { name: 'Edit goal' })).toBeInTheDocument();
    first.unmount();

    setup('ended');
    renderPage();
    await loaded();
    expect(screen.queryByRole('button', { name: 'Edit goal' })).not.toBeInTheDocument();
  });

  it('opens a form prefilled with the current target and end date', async () => {
    setup('active');
    const user = userEvent.setup();
    renderPage();
    await loaded();

    await user.click(screen.getByRole('button', { name: 'Edit goal' }));

    expect(screen.getByLabelText('Target minutes')).toHaveValue(600);
    expect(screen.getByLabelText('End date')).toHaveValue(END);
  });

  it('saves: sends PATCH with the new values, closes the form, shows the new target and progress', async () => {
    setup('active');
    goalApi.updateGoal.mockResolvedValue({ goal: goalOf('active', { target_minutes: 900, end_date: NEW_END }) });
    const user = userEvent.setup();
    renderPage();
    await loaded();

    await user.click(screen.getByRole('button', { name: 'Edit goal' }));
    const target = screen.getByLabelText('Target minutes');
    await user.clear(target);
    await user.type(target, '900');
    const end = screen.getByLabelText('End date');
    await user.clear(end);
    await user.type(end, NEW_END);

    goalApi.getGoal.mockResolvedValue({ goal: goalOf('active', { target_minutes: 900, end_date: NEW_END }) });
    goalApi.getGoalProgress.mockResolvedValue({ progress: progressOf(60, 900) });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(goalApi.updateGoal).toHaveBeenCalledWith('5', { target_minutes: 900, end_date: NEW_END })
    );
    await waitFor(() => expect(screen.queryByLabelText('Target minutes')).not.toBeInTheDocument());
    expect(screen.getByText(new RegExp(`Target: 900 mins`))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`to ${NEW_END}`))).toBeInTheDocument();
    expect(screen.getByTestId('progress-percent')).toHaveTextContent('7%');
  });

  it('Cancel closes the form without calling the API', async () => {
    setup('active');
    const user = userEvent.setup();
    renderPage();
    await loaded();

    await user.click(screen.getByRole('button', { name: 'Edit goal' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(goalApi.updateGoal).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Target minutes')).not.toBeInTheDocument();
  });

  it('400 on target_minutes: shows the translated message under the field and stays open', async () => {
    setup('active');
    goalApi.updateGoal.mockRejectedValue(apiError(400, { target_minutes: 'positive integer' }));
    const user = userEvent.setup();
    renderPage();
    await loaded();

    await user.click(screen.getByRole('button', { name: 'Edit goal' }));
    const target = screen.getByLabelText('Target minutes');
    await user.clear(target);
    await user.type(target, '0');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Enter a whole number greater than 0.')).toBeInTheDocument();
    expect(screen.getByLabelText('Target minutes')).toBeInTheDocument();
  });

  it('400 on end_date in the past: says "end date", not "start date"', async () => {
    setup('active');
    goalApi.updateGoal.mockRejectedValue(apiError(400, { end_date: 'must not be in the past' }));
    const user = userEvent.setup();
    renderPage();
    await loaded();

    await user.click(screen.getByRole('button', { name: 'Edit goal' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('The end date cannot be in the past.')).toBeInTheDocument();
    expect(screen.queryByText(/start date/i)).not.toBeInTheDocument();
  });

  it('409: tells the user the goal has ended, closes the form and reloads the goal', async () => {
    setup('active');
    goalApi.updateGoal.mockRejectedValue(apiError(409));
    const user = userEvent.setup();
    renderPage();
    await loaded();
    const callsBefore = goalApi.getGoal.mock.calls.length;

    await user.click(screen.getByRole('button', { name: 'Edit goal' }));
    goalApi.getGoal.mockResolvedValue({ goal: goalOf('ended') });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('This goal has ended and can no longer be edited.')).toBeInTheDocument();
    await waitFor(() => expect(goalApi.getGoal.mock.calls.length).toBeGreaterThan(callsBefore));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Edit goal' })).not.toBeInTheDocument());
    expect(screen.queryByLabelText('Target minutes')).not.toBeInTheDocument();
  });
});
