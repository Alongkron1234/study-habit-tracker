import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ErrorAlert } from '../components/StateFeedback';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { login, sessionExpiredMessage } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/dashboard';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!username.trim() || !password) {
      setErrorMessage('Please enter both username and password');
      return;
    }

    setSubmitting(true);
    try {
      await login(username.trim(), password);
      navigate(from, { replace: true });
    } catch {
      // General safe message according to AC-UI-02 and NFR-06
      setErrorMessage('Invalid username or password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h2>Study Habit Tracker</h2>
        <p className="login-subtitle">Sign in to your account</p>

        {sessionExpiredMessage && (
          <div className="session-expired-notice" role="alert">
            {sessionExpiredMessage}
          </div>
        )}

        {errorMessage && (
          <ErrorAlert message={errorMessage} />
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. atiwit"
              autoComplete="username"
              disabled={submitting}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              disabled={submitting}
              required
            />
          </div>

          <button
            type="submit"
            className="btn-primary btn-block"
            disabled={submitting}
            data-testid="login-submit"
          >
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
