import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';

export function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="dashboard-container">
      <header className="page-header">
        <h1>Dashboard</h1>
        <p className="welcome-text">
          Welcome back, <strong>{user?.username}</strong>!
        </p>
      </header>

      <div className="dashboard-card user-profile-card">
        <h3>User Profile</h3>
        <div className="profile-details">
          <div className="profile-row">
            <span className="profile-label">Username:</span>
            <span className="profile-value">{user?.username}</span>
          </div>
          <div className="profile-row">
            <span className="profile-label">Role:</span>
            <span className={`role-badge role-${user?.role}`}>{user?.role}</span>
          </div>
        </div>
      </div>

      <div className="dashboard-card role-guidance-card">
        <h3>Quick Actions</h3>
        {user?.role === 'pm' ? (
          <div>
            <p>
              As a <strong>Project Manager</strong>, you can define habit templates for participants.
            </p>
            <div style={{ marginTop: '1rem' }}>
              <Link to="/templates" className="btn-primary" data-testid="nav-templates-btn">
                Manage Activity Templates
              </Link>
            </div>
          </div>
        ) : (
          <div>
            <p>
              As a <strong>Participant</strong>, you can set goals, record your daily study minutes, and see your progress.
            </p>
            <div style={{ marginTop: '1rem' }}>
              <Link to="/goals" className="btn-primary" data-testid="nav-goals-btn">
                Go to My Goals
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
