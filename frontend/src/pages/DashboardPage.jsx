import React from 'react';
import { useAuth } from '../context/AuthContext';

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
            <span className="profile-label">Email:</span>
            <span className="profile-value">{user?.email}</span>
          </div>
          <div className="profile-row">
            <span className="profile-label">Role:</span>
            <span className={`role-badge role-${user?.role}`}>{user?.role}</span>
          </div>
        </div>
      </div>

      <div className="dashboard-card role-guidance-card">
        <h3>Role Capabilities</h3>
        {user?.role === 'pm' ? (
          <p>
            As a <strong>Project Manager</strong>, you can create and manage activity templates for participants.
          </p>
        ) : (
          <p>
            As a <strong>Participant</strong>, you can set study goals, record daily habit minutes, and track your progress.
          </p>
        )}
      </div>
    </div>
  );
}

