import { apiClient } from './client';

export async function getTemplates() {
  return apiClient('/api/templates', { method: 'GET' });
}

export async function createTemplate(data) {
  return apiClient('/api/templates', {
    method: 'POST',
    body: data,
  });
}

