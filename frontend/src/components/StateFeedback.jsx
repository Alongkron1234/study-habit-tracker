import React from 'react';

export function LoadingSpinner({ message = 'Loading...' }) {
  return (
    <div className="state-feedback loading-state" role="status" aria-live="polite">
      <div className="spinner"></div>
      <p>{message}</p>
    </div>
  );
}

export function EmptyState({ message = 'No data available', action = null }) {
  return (
    <div className="state-feedback empty-state" data-testid="empty-state">
      <p className="empty-message">{message}</p>
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function ErrorAlert({ message = 'An error occurred', onRetry = null }) {
  return (
    <div className="state-feedback error-alert" role="alert" data-testid="error-alert">
      <p className="error-message">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-retry">
          Retry
        </button>
      )}
    </div>
  );
}
