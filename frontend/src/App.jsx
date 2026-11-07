import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Navbar } from './components/Navbar';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { GoalsPage } from './pages/GoalsPage';
import { GoalDetailPage } from './pages/GoalDetailPage';
import { UnauthorizedPage } from './pages/UnauthorizedPage';

export function AppRoutes() {
  return (
    <div className="app-layout">
      <Navbar />
      <main className="main-content">
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
          {/* PM only route (F-03) */}
          <Route
            path="/templates"
            element={
              <ProtectedRoute allowedRoles={['pm']}>
                <TemplatesPage />
              </ProtectedRoute>
            }
          />
          {/* Participant only routes (F-04, F-05, F-06) */}
          <Route
            path="/goals"
            element={
              <ProtectedRoute allowedRoles={['participant']}>
                <GoalsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/goals/:id"
            element={
              <ProtectedRoute allowedRoles={['participant']}>
                <GoalDetailPage />
              </ProtectedRoute>
            }
          />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
