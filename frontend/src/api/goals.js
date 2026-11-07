import { apiClient } from './client';

export async function getGoals() {
  return apiClient('/api/goals', { method: 'GET' });
}

export async function getGoal(id) {
  return apiClient(`/api/goals/${id}`, { method: 'GET' });
}

export async function createGoal(data) {
  return apiClient('/api/goals', {
    method: 'POST',
    body: data,
  });
}

export async function getGoalProgress(goalId) {
  return apiClient(`/api/goals/${goalId}/progress`, { method: 'GET' });
}

export async function getGoalEntries(goalId) {
  return apiClient(`/api/goals/${goalId}/entries`, { method: 'GET' });
}

export async function createGoalEntry(goalId, data) {
  return apiClient(`/api/goals/${goalId}/entries`, {
    method: 'POST',
    body: data,
  });
}

