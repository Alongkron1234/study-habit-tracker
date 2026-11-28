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

// F-09: แก้ name / min_value / max_value ของแม่แบบที่ยังไม่ archived
export async function updateTemplate(templateId, data) {
  return apiClient(`/api/templates/${templateId}`, { method: 'PATCH', body: data });
}

// F-09: เก็บถาวรแม่แบบ (ซ้ำก็ 200; ไม่มี un-archive)
export async function archiveTemplate(templateId) {
  return apiClient(`/api/templates/${templateId}/archive`, { method: 'POST' });
}
