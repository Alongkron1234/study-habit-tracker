import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { GoalDetailPage } from '../pages/GoalDetailPage';
import * as tplApi from '../api/templates';
import * as goalApi from '../api/goals';

// F-11 UI (AC-F11-09, S-14): ปุ่มแก้/ลบ เฉพาะแถวที่ entry_date >= วันนี้ − 7 และ goal active

vi.mock('../api/templates', () => ({
  getTemplates: vi.fn(),
  createTemplate: vi.fn(),
}));

vi.mock('../api/goals', () => ({
  getGoals: vi.fn(),
  getGoal: vi.fn(),
  createGoal: vi.fn(),
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
const OLD = addDays(TODAY, -8); // นอกช่วงแก้ได้
const EDGE = addDays(TODAY, -7); // ขอบของช่วงแก้ได้

const template = { id: 10, name: 'Reading', unit: 'minutes', min_value: 10, max_value: 120, is_archived: false };

function goalOf(status) {
  return {
    id: 5,
    template_id: 10,
    status,
    start_date: addDays(TODAY, -10),
    end_date: addDays(TODAY, status === 'ended' ? -1 : 29),
    target_minutes: 600,
  };
}

const entries = [
  { id: 3, entry_date: TODAY, minutes: 30 },
  { id: 2, entry_date: EDGE, minutes: 20 },
  { id: 1, entry_date: OLD, minutes: 15 },
];

function progressOf(total) {
  return { total_minutes: total, target_minutes: 600, percent: Math.round((total / 600) * 100) };
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
  goalApi.getGoalProgress.mockResolvedValue({ progress: progressOf(65) });
  goalApi.getGoalEntries.mockResolvedValue({ entries });
  tplApi.getTemplates.mockResolvedValue({ templates: [template] });
}

async function loaded() {
  await waitFor(() => expect(screen.getByTestId('entries-table')).toBeInTheDocument());
}

describe('TEST-F11-10 (UI) — edit/delete entry on goal detail page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows Edit/Delete only on rows within the last 7 days of an active goal', async () => {
    setup('active');
    renderPage();
    await loaded();

    expect(screen.getByRole('button', { name: `Edit entry ${TODAY}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Delete entry ${TODAY}` })).toBeInTheDocument();
    // วันที่ today-7 ยังแก้ได้ (ขอบ), today-8 ไม่ได้
    expect(screen.getByRole('button', { name: `Edit entry ${EDGE}` })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `Edit entry ${OLD}` })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `Delete entry ${OLD}` })).not.toBeInTheDocument();
  });

  it('shows no Edit/Delete buttons when the goal has ended', async () => {
    setup('ended');
    renderPage();
    await loaded();

    expect(screen.queryByRole('button', { name: /^Edit entry/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete entry/ })).not.toBeInTheDocument();
  });

  it('edits minutes: sends PATCH with the number, then refreshes entries and progress', async () => {
    setup('active');
    goalApi.updateGoalEntry.mockResolvedValue({ entry: { id: 3, entry_date: TODAY, minutes: 45 } });
    const user = userEvent.setup();
    renderPage();
    await loaded();

    await user.click(screen.getByRole('button', { name: `Edit entry ${TODAY}` }));
    const input = screen.getByLabelText(`Minutes for ${TODAY}`);
    expect(input).toHaveValue(30);

    // หลังบันทึก backend ให้ค่าใหม่
    goalApi.getGoalEntries.mockResolvedValue({
      entries: [{ id: 3, entry_date: TODAY, minutes: 45 }, entries[1], entries[2]],
    });
    goalApi.getGoalProgress.mockResolvedValue({ progress: progressOf(80) });

    await user.clear(input);
    await user.type(input, '45');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(goalApi.updateGoalEntry).toHaveBeenCalledWith('5', 3, { minutes: 45 }));
    await waitFor(() => {
      expect(within(screen.getByTestId('entry-row-3')).getByText('45 mins')).toBeInTheDocument();
    });
    expect(screen.getByTestId('total-minutes')).toHaveTextContent('80 mins');
    // ออกจากโหมดแก้ไขแล้ว
    expect(screen.queryByLabelText(`Minutes for ${TODAY}`)).not.toBeInTheDocument();
  });

  it('Cancel leaves edit mode without calling the API', async () => {
    setup('active');
    const user = userEvent.setup();
    renderPage();
    await loaded();

    await user.click(screen.getByRole('button', { name: `Edit entry ${TODAY}` }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(goalApi.updateGoalEntry).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(`Minutes for ${TODAY}`)).not.toBeInTheDocument();
    expect(within(screen.getByTestId('entry-row-3')).getByText('30 mins')).toBeInTheDocument();
  });

  it('400 out of template range: shows the message under the field and stays in edit mode', async () => {
    setup('active');
    const err = new Error('Bad Request');
    err.status = 400;
    err.data = { error: 'Bad Request', fields: { minutes: 'out of template range' } };
    goalApi.updateGoalEntry.mockRejectedValue(err);
    const user = userEvent.setup();
    renderPage();
    await loaded();

    await user.click(screen.getByRole('button', { name: `Edit entry ${TODAY}` }));
    const input = screen.getByLabelText(`Minutes for ${TODAY}`);
    await user.clear(input);
    await user.type(input, '5');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Minutes must be between 10 and 120.')).toBeInTheDocument();
    expect(screen.getByLabelText(`Minutes for ${TODAY}`)).toBeInTheDocument();
  });

  it('409: tells the user the entry can no longer be edited and reloads the list', async () => {
    setup('active');
    const err = new Error('Conflict');
    err.status = 409;
    err.data = { error: 'Conflict' };
    goalApi.updateGoalEntry.mockRejectedValue(err);
    const user = userEvent.setup();
    renderPage();
    await loaded();
    const callsBefore = goalApi.getGoalEntries.mock.calls.length;

    await user.click(screen.getByRole('button', { name: `Edit entry ${EDGE}` }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('This entry can no longer be edited.')).toBeInTheDocument();
    await waitFor(() => expect(goalApi.getGoalEntries.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it('deletes after confirmation: row disappears and progress is refreshed', async () => {
    setup('active');
    goalApi.deleteGoalEntry.mockResolvedValue(null);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderPage();
    await loaded();

    goalApi.getGoalEntries.mockResolvedValue({ entries: [entries[1], entries[2]] });
    goalApi.getGoalProgress.mockResolvedValue({ progress: progressOf(35) });

    await user.click(screen.getByRole('button', { name: `Delete entry ${TODAY}` }));

    expect(confirmSpy).toHaveBeenCalledWith(`Delete the entry for ${TODAY} (30 mins)?`);
    await waitFor(() => expect(goalApi.deleteGoalEntry).toHaveBeenCalledWith('5', 3));
    await waitFor(() => expect(screen.queryByTestId('entry-row-3')).not.toBeInTheDocument());
    expect(screen.getByTestId('total-minutes')).toHaveTextContent('35 mins');
  });

  it('does not delete when the confirmation is dismissed', async () => {
    setup('active');
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderPage();
    await loaded();

    await user.click(screen.getByRole('button', { name: `Delete entry ${TODAY}` }));

    expect(goalApi.deleteGoalEntry).not.toHaveBeenCalled();
    expect(screen.getByTestId('entry-row-3')).toBeInTheDocument();
  });

  it('409 on delete: shows the same message and reloads the list', async () => {
    setup('active');
    const err = new Error('Conflict');
    err.status = 409;
    err.data = { error: 'Conflict' };
    goalApi.deleteGoalEntry.mockRejectedValue(err);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderPage();
    await loaded();
    const callsBefore = goalApi.getGoalEntries.mock.calls.length;

    await user.click(screen.getByRole('button', { name: `Delete entry ${EDGE}` }));

    expect(await screen.findByText('This entry can no longer be edited.')).toBeInTheDocument();
    await waitFor(() => expect(goalApi.getGoalEntries.mock.calls.length).toBeGreaterThan(callsBefore));
  });
});
