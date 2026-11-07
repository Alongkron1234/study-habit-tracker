import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  if (!user) {
    return null;
  }

  const isPM = user.role === 'pm';
  const isParticipant = user.role === 'participant';

  return (
    <nav className="navbar" data-testid="navbar">
      <div className="nav-brand">
        <Link to="/dashboard">Study Habit Tracker</Link>
      </div>

      <ul className="nav-menu">
        <li>
          <Link to="/dashboard">Dashboard</Link>
        </li>
        {isPM && (
          <li>
            <Link to="/templates">Templates</Link>
          </li>
        )}
        {isParticipant && (
          <>
            <li>
              <Link to="/goals">My Goals</Link>
            </li>
          </>
        )}
      </ul>

      <div className="nav-user-section">
        <span className="user-info">
          <strong className="user-name">{user.username}</strong>
          <span className={`role-badge role-${user.role}`}>
            {user.role}
          </span>
        </span>
        <button
          type="button"
          onClick={handleLogout}
          className="btn-logout"
          data-testid="logout-button"
        >
          Logout
        </button>
      </div>
    </nav>
  );
}

