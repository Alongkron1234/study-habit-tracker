/**
 * client.js — Centralized API Client with automatic session cookie handling & 401 interception
 */

let onUnauthorizedCallback = null;

export function setUnauthorizedHandler(callback) {
  onUnauthorizedCallback = callback;
}

export async function apiClient(url, options = {}) {
  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    // Always include credentials to send/receive express-session cookies (NFR-01, S-2)
    credentials: 'include',
  };

  if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(url, config);

  if (response.status === 401) {
    if (typeof onUnauthorizedCallback === 'function') {
      onUnauthorizedCallback();
    }
    const errData = await response.json().catch(() => ({}));
    const err = new Error(errData.error || 'Unauthorized');
    err.status = 401;
    err.data = errData;
    throw err;
  }

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const err = new Error(errData.error || 'Request failed');
    err.status = response.status;
    err.data = errData;
    throw err;
  }

  // Handle 204 or empty responses
  if (response.status === 204) {
    return null;
  }

  return response.json();
}
