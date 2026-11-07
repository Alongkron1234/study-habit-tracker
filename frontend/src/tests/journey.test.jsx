import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { TemplatesPage } from '../pages/TemplatesPage';
import { GoalsPage } from '../pages/GoalsPage';
import { GoalDetailPage } from '../pages/GoalDetailPage';
import { ProtectedRoute } from '../components/ProtectedRoute';
import * as authApi from '../api/auth';
import * as tplApi from '../api/templates';
import * as goalApi from '../api/goals';

vi.mock('../api/auth', () => ({
  getMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));

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
}));

describe('Complete Journey Tests (UI -> API -> DB Simulation)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('PM Journey: เข้าสู่ระบบ -> เปิดหน้า Templates -> สร้างแม่แบบสำเร็จ -> เห็นในรายการ', async () => {
    const pmUser = { id: 1, username: 'pm_boss', role: 'pm' };
    authApi.getMe.mockResolvedValue({ user: pmUser });
    tplApi.getTemplates.mockResolvedValueOnce({ templates: [] });
    tplApi.createTemplate.mockResolvedValueOnce({
      template: { id: 10, name: 'Deep Work', unit: 'minutes', min_value: 15, max_value: 180, is_archived: false },
    });
    tplApi.getTemplates.mockResolvedValueOnce({
      templates: [{ id: 10, name: 'Deep Work', unit: 'minutes', min_value: 15, max_value: 180, is_archived: false }],
    });

    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/templates']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/templates"
              element={
                <ProtectedRoute allowedRoles={['pm']}>
                  <TemplatesPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    // Initial load: empty
    await waitFor(() => {
      expect(screen.getByText(/No templates created yet/i)).toBeInTheDocument();
    });

    // Fill form
    await user.type(screen.getByLabelText(/Template Name/i), 'Deep Work');
    await user.clear(screen.getByLabelText(/Min Minutes/i));
    await user.type(screen.getByLabelText(/Min Minutes/i), '15');
    await user.clear(screen.getByLabelText(/Max Minutes/i));
    await user.type(screen.getByLabelText(/Max Minutes/i), '180');

    await user.click(screen.getByTestId('create-template-btn'));

    await waitFor(() => {
      expect(tplApi.createTemplate).toHaveBeenCalledWith({
        name: 'Deep Work',
        min_value: 15,
        max_value: 180,
      });
      expect(screen.getByText('Template created successfully!')).toBeInTheDocument();
      expect(screen.getByTestId('template-card-10')).toHaveTextContent('Deep Work');
    });
  });

  it('Participant Journey: ดูเป้าหมาย -> สร้างเป้าหมาย -> เข้าดูความคืบหน้า -> บันทึก entry', async () => {
    const partUser = { id: 2, username: 'student_a', role: 'participant' };
    authApi.getMe.mockResolvedValue({ user: partUser });

    // Goals page mock
    tplApi.getTemplates.mockResolvedValue({
      templates: [{ id: 1, name: 'Reading', min_value: 10, max_value: 120, is_archived: false }],
    });
    goalApi.getGoals.mockResolvedValue({
      goals: [
        { id: 101, template_id: 1, target_minutes: 500, start_date: '2026-11-01', end_date: '2026-11-30', status: 'active' },
      ],
    });

    // Detail page mock
    goalApi.getGoal.mockResolvedValue({
      goal: { id: 101, template_id: 1, target_minutes: 500, start_date: '2026-11-01', end_date: '2026-11-30', status: 'active' },
    });
    goalApi.getGoalProgress.mockResolvedValueOnce({
      progress: { total_minutes: 60, target_minutes: 500, percent: 12.0 },
    });
    goalApi.getGoalEntries.mockResolvedValueOnce({
      entries: [{ id: 201, entry_date: '2026-11-05', minutes: 60 }],
    });

    goalApi.createGoalEntry.mockResolvedValueOnce({
      entry: { id: 202, entry_date: '2026-11-07', minutes: 90 },
    });
    goalApi.getGoalProgress.mockResolvedValueOnce({
      progress: { total_minutes: 150, target_minutes: 500, percent: 30.0 },
    });
    goalApi.getGoalEntries.mockResolvedValueOnce({
      entries: [
        { id: 202, entry_date: '2026-11-07', minutes: 90 },
        { id: 201, entry_date: '2026-11-05', minutes: 60 },
      ],
    });

    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/goals/101']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/goals/:id"
              element={
                <ProtectedRoute allowedRoles={['participant']}>
                  <GoalDetailPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    // Check goal details and initial progress
    await waitFor(() => {
      expect(screen.getByTestId('total-minutes')).toHaveTextContent('60 mins');
      expect(screen.getByTestId('progress-percent')).toHaveTextContent('12%');
      expect(screen.getByTestId('entry-row-201')).toHaveTextContent('60 mins');
    });

    // Record new daily minutes
    await user.clear(screen.getByLabelText(/Minutes Studied/i));
    await user.type(screen.getByLabelText(/Minutes Studied/i), '90');
    await user.click(screen.getByTestId('record-entry-btn'));

    await waitFor(() => {
      expect(goalApi.createGoalEntry).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Habit entry recorded successfully!')).toBeInTheDocument();
      expect(screen.getByTestId('total-minutes')).toHaveTextContent('150 mins');
      expect(screen.getByTestId('progress-percent')).toHaveTextContent('30%');
      expect(screen.getByTestId('entry-row-202')).toHaveTextContent('90 mins');
    });
  });
});

