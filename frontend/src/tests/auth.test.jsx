import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { Navbar } from '../components/Navbar';
import * as authApi from '../api/auth';
import { apiClient } from '../api/client';

// Mock auth API module
vi.mock('../api/auth', () => ({
  getMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));

describe('Auth & Route Protection (AC-UI-01, AC-UI-02, AC-UI-03, AC-UI-04, AC-UI-06)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TEST-UI-01: AC-UI-01 เข้าหน้าที่ป้องกันโดยยังไม่ login จะถูก redirect ไป /login', async () => {
    authApi.getMe.mockRejectedValueOnce(new Error('Unauthorized'));

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    // Initial check will reject getMe and redirect to login
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Study Habit Tracker/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Sign in/i })).toBeInTheDocument();
    });
  });

  it('TEST-UI-02a: AC-UI-02 Login สำเร็จ นำทางไปหน้า Dashboard แสดงชื่อผู้ใช้และ role', async () => {
    const mockUser = { id: 1, username: 'testuser', email: 'test@local.dev', role: 'participant' };
    authApi.getMe.mockRejectedValueOnce(new Error('Unauthorized')); // initial
    authApi.login.mockResolvedValueOnce({ user: mockUser });

    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Username/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/Username/i), 'testuser');
    await user.type(screen.getByLabelText(/Password/i), 'correct-pass');
    await user.click(screen.getByTestId('login-submit'));

    await waitFor(() => {
      expect(screen.getByText(/Welcome back,/i)).toBeInTheDocument();
      expect(screen.getAllByText('testuser').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('participant')).toBeInTheDocument();
    });
  });

  it('TEST-UI-02b: AC-UI-02 Login ผิดพลาด (401) แสดงข้อความ Invalid username or password (NFR-06)', async () => {
    authApi.getMe.mockRejectedValueOnce(new Error('Unauthorized'));
    authApi.login.mockRejectedValueOnce(new Error('Unauthorized'));

    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Username/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/Username/i), 'testuser');
    await user.type(screen.getByLabelText(/Password/i), 'wrong-pass');
    await user.click(screen.getByTestId('login-submit'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Invalid username or password/i);
    });
  });

  it('TEST-UI-03: AC-UI-03 กดปุ่ม Logout ล้าง session และพากลับหน้า Login', async () => {
    const mockUser = { id: 1, username: 'testuser', role: 'participant' };
    authApi.getMe.mockResolvedValueOnce({ user: mockUser });
    authApi.logout.mockResolvedValueOnce(null);

    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider>
          <Navbar />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('logout-button')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('logout-button'));

    await waitFor(() => {
      expect(authApi.logout).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('heading', { name: /Study Habit Tracker/i })).toBeInTheDocument();
    });
  });

  it('TEST-UI-04: AC-UI-04 API ตอบ 401 ขณะใช้งาน ดักจับและพากลับหน้า Login พร้อมแจ้งเตือน', async () => {
    const mockUser = { id: 1, username: 'testuser', role: 'participant' };
    authApi.getMe.mockResolvedValueOnce({ user: mockUser });

    // Component to simulate an API call that returns 401
    function TriggerExpiredComponent() {
      return (
        <button
          onClick={async () => {
            // Mock fetch returning 401
            global.fetch = vi.fn().mockResolvedValueOnce({
              status: 401,
              ok: false,
              json: async () => ({ error: 'Unauthorized' }),
            });
            try {
              await apiClient('/api/goals/1/entries');
            } catch {
              // handled
            }
          }}
        >
          Call Protected API
        </button>
      );
    }

    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <TriggerExpiredComponent />
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Call Protected API')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Call Protected API'));

    await waitFor(() => {
      expect(screen.getByText(/Session expired, please login again/i)).toBeInTheDocument();
    });
  });

  it('TEST-UI-06: AC-UI-06 Navbar แสดงเมนูและ Badge ตามบทบาท', async () => {
    // PM
    authApi.getMe.mockResolvedValueOnce({
      user: { id: 1, username: 'pm_user', role: 'pm' },
    });

    const { unmount } = render(
      <MemoryRouter>
        <AuthProvider>
          <Navbar />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Templates')).toBeInTheDocument();
      expect(screen.queryByText('My Goals')).not.toBeInTheDocument();
      expect(screen.getByText('pm')).toBeInTheDocument();
    });

    unmount();

    // Participant
    authApi.getMe.mockResolvedValueOnce({
      user: { id: 2, username: 'participant_user', role: 'participant' },
    });

    render(
      <MemoryRouter>
        <AuthProvider>
          <Navbar />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('My Goals')).toBeInTheDocument();
      expect(screen.queryByText('Templates')).not.toBeInTheDocument();
      expect(screen.getByText('participant')).toBeInTheDocument();
    });
  });
});
