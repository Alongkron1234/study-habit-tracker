import React from 'react';
import { Link } from 'react-router-dom';

export function UnauthorizedPage() {
  return (
    <div className="unauthorized-container">
      <h2>403 - Forbidden</h2>
      <p>You do not have permission to access this resource.</p>
      <Link to="/dashboard" className="btn-primary">
        Return to Dashboard
      </Link>
    </div>
  );
}
