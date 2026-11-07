import { apiClient } from './client';

export async function login(username, password) {
  return apiClient('/api/auth/login', {
    method: 'POST',
    body: { username, password },
  });
}

export async function logout() {
  return apiClient('/api/auth/logout', {
    method: 'POST',
  });
}

export async function getMe() {
  return apiClient('/api/auth/me', {
    method: 'GET',
  });
}
