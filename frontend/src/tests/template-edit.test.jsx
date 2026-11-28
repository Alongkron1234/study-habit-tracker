import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TemplatesPage } from '../pages/TemplatesPage';
import * as tplApi from '../api/templates';

// F-09 UI (AC-F09-08, S-12): ปุ่ม Edit/Archive เฉพาะแม่แบบที่ยังไม่ archived

vi.mock('../api/templates', () => ({
  getTemplates: vi.fn(),
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  archiveTemplate: vi.fn(),
}));

const active = { id: 10, name: 'Reading', unit: 'minutes', min_value: 10, max_value: 120, is_archived: false };
const archived = { id: 11, name: 'Old Habit', unit: 'minutes', min_value: 5, max_value: 60, is_archived: true };

function apiError(status, fields) {
  const err = new Error(status === 400 ? 'Bad Request' : 'Conflict');
  err.status = status;
  err.data = fields ? { error: 'Bad Request', fields } : { error: 'Conflict' };
  return err;
}

async function renderPage(templates = [active, archived]) {
  tplApi.getTemplates.mockResolvedValue({ templates });
  render(<TemplatesPage />);
  await waitFor(() => expect(screen.getByTestId(`template-card-${templates[0].id}`)).toBeInTheDocument());
}

describe('TEST-F09-10 (UI) — edit/archive template on the templates page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows Edit and Archive only on templates that are not archived', async () => {
    await renderPage();

    expect(screen.getByRole('button', { name: 'Edit template Reading' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive template Reading' })).toBeInTheDocument();
    const oldCard = screen.getByTestId('template-card-11');
    expect(within(oldCard).getByText('Archived')).toBeInTheDocument();
    expect(within(oldCard).queryByRole('button')).not.toBeInTheDocument();
  });

  it('opens the edit form with the current name and range', async () => {
    await renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Edit template Reading' }));

    expect(screen.getByLabelText('Edit template name')).toHaveValue('Reading');
    expect(screen.getByLabelText('Edit min minutes')).toHaveValue(10);
    expect(screen.getByLabelText('Edit max minutes')).toHaveValue(120);
  });

  it('saves: PATCH with the new values, closes the form, shows the new values from the reload', async () => {
    await renderPage();
    tplApi.updateTemplate.mockResolvedValue({ template: { ...active, name: 'Deep Reading', min_value: 15, max_value: 90 } });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Edit template Reading' }));
    const name = screen.getByLabelText('Edit template name');
    await user.clear(name);
    await user.type(name, 'Deep Reading');
    const min = screen.getByLabelText('Edit min minutes');
    await user.clear(min);
    await user.type(min, '15');
    const max = screen.getByLabelText('Edit max minutes');
    await user.clear(max);
    await user.type(max, '90');

    tplApi.getTemplates.mockResolvedValue({
      templates: [{ ...active, name: 'Deep Reading', min_value: 15, max_value: 90 }, archived],
    });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(tplApi.updateTemplate).toHaveBeenCalledWith(10, { name: 'Deep Reading', min_value: 15, max_value: 90 })
    );
    await waitFor(() => expect(screen.queryByLabelText('Edit template name')).not.toBeInTheDocument());
    const card = screen.getByTestId('template-card-10');
    expect(within(card).getByText('Deep Reading')).toBeInTheDocument();
    expect(within(card).getByText(/15 - 90 mins/)).toBeInTheDocument();
  });

  it('Cancel closes the form without calling the API', async () => {
    await renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Edit template Reading' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(tplApi.updateTemplate).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Edit template name')).not.toBeInTheDocument();
  });

  it('400 on max_value: shows the translated message under the max field and stays open', async () => {
    await renderPage();
    tplApi.updateTemplate.mockRejectedValue(apiError(400, { max_value: 'must be >= min_value' }));
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Edit template Reading' }));
    const min = screen.getByLabelText('Edit min minutes');
    await user.clear(min);
    await user.type(min, '200');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Max minutes must be at least the min minutes.')).toBeInTheDocument();
    expect(screen.getByLabelText('Edit template name')).toBeInTheDocument();
  });

  it('400 on min_value cross-check: translated message "at most the max minutes"', async () => {
    await renderPage();
    tplApi.updateTemplate.mockRejectedValue(apiError(400, { min_value: 'must be <= max_value' }));
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Edit template Reading' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Min minutes must be at most the max minutes.')).toBeInTheDocument();
  });

  it('409: tells the user the template is archived, closes the form and reloads the list', async () => {
    await renderPage();
    tplApi.updateTemplate.mockRejectedValue(apiError(409));
    const user = userEvent.setup();
    const callsBefore = tplApi.getTemplates.mock.calls.length;

    await user.click(screen.getByRole('button', { name: 'Edit template Reading' }));
    tplApi.getTemplates.mockResolvedValue({ templates: [{ ...active, is_archived: true }, archived] });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('This template is archived and can no longer be edited.')).toBeInTheDocument();
    await waitFor(() => expect(tplApi.getTemplates.mock.calls.length).toBeGreaterThan(callsBefore));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Edit template Reading' })).not.toBeInTheDocument()
    );
  });

  it('archives after confirmation: the card shows Archived and loses its buttons', async () => {
    await renderPage();
    tplApi.archiveTemplate.mockResolvedValue({ template: { ...active, is_archived: true } });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    tplApi.getTemplates.mockResolvedValue({ templates: [{ ...active, is_archived: true }, archived] });
    await user.click(screen.getByRole('button', { name: 'Archive template Reading' }));

    expect(confirmSpy).toHaveBeenCalledWith(
      'Archive template "Reading"? Participants will no longer be able to start new goals with it.'
    );
    await waitFor(() => expect(tplApi.archiveTemplate).toHaveBeenCalledWith(10));
    await waitFor(() => {
      expect(within(screen.getByTestId('template-card-10')).getByText('Archived')).toBeInTheDocument();
    });
    expect(within(screen.getByTestId('template-card-10')).queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not archive when the confirmation is dismissed', async () => {
    await renderPage();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Archive template Reading' }));

    expect(tplApi.archiveTemplate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Edit template Reading' })).toBeInTheDocument();
  });
});
