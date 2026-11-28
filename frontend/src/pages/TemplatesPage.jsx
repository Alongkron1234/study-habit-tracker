import React, { useState, useEffect, useCallback } from 'react';
import { getTemplates, createTemplate, updateTemplate, archiveTemplate } from '../api/templates';
import { LoadingSpinner, EmptyState, ErrorAlert } from '../components/StateFeedback';
import { friendlyFields } from '../lib/messages';

export function TemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Form state
  const [name, setName] = useState('');
  const [minValue, setMinValue] = useState(10);
  const [maxValue, setMaxValue] = useState(120);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Edit/Archive state (F-09)
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editMin, setEditMin] = useState('');
  const [editMax, setEditMax] = useState('');
  const [editErrors, setEditErrors] = useState({});
  const [editFormError, setEditFormError] = useState('');
  const [tplNotice, setTplNotice] = useState('');
  const [rowBusy, setRowBusy] = useState(false);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getTemplates();
      setTemplates(data.templates || []);
    } catch {
      setError('Failed to load activity templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setFieldErrors({});
    setSuccessMsg('');
    setSubmitting(true);

    try {
      await createTemplate({
        name,
        min_value: Number(minValue),
        max_value: Number(maxValue),
      });
      setName('');
      setMinValue(10);
      setMaxValue(120);
      setSuccessMsg('Template created successfully!');
      loadTemplates();
    } catch (err) {
      if (err.data?.fields) {
        setFieldErrors(friendlyFields(err.data.fields));
        setFormError('Please check the form for errors');
      } else {
        setFormError(err.message || 'Failed to create template');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // รีเฟรชรายการโดยไม่กระพริบเป็นหน้า loading
  const refreshTemplates = async () => {
    const data = await getTemplates();
    setTemplates(data.templates || []);
  };

  const startEdit = (tpl) => {
    setTplNotice('');
    setEditErrors({});
    setEditFormError('');
    setEditingId(tpl.id);
    setEditName(tpl.name);
    setEditMin(String(tpl.min_value));
    setEditMax(String(tpl.max_value));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditErrors({});
    setEditFormError('');
  };

  // 409/404: แม่แบบถูก archive ไปแล้ว (หรือไม่มีแล้ว) → แจ้งผู้ใช้และโหลดรายการใหม่
  const handleStaleTemplate = async (err) => {
    setEditingId(null);
    setEditErrors({});
    setEditFormError('');
    setTplNotice(
      err.status === 409
        ? 'This template is archived and can no longer be edited.'
        : 'This template no longer exists.'
    );
    try {
      await refreshTemplates();
    } catch {
      /* ถ้ารีเฟรชไม่ได้ ผู้ใช้ยังเห็นข้อความแจ้งอยู่ */
    }
  };

  const handleEditSave = async (tpl) => {
    setEditErrors({});
    setEditFormError('');
    setTplNotice('');
    setRowBusy(true);
    try {
      await updateTemplate(tpl.id, {
        name: editName,
        min_value: Number(editMin),
        max_value: Number(editMax),
      });
      setEditingId(null);
      await refreshTemplates();
    } catch (err) {
      if (err.status === 409 || err.status === 404) {
        await handleStaleTemplate(err);
      } else if (err.data?.fields) {
        setEditErrors(friendlyFields(err.data.fields));
      } else {
        setEditFormError(err.message || 'Failed to update template');
      }
    } finally {
      setRowBusy(false);
    }
  };

  const handleArchive = async (tpl) => {
    setTplNotice('');
    if (
      !window.confirm(
        `Archive template "${tpl.name}"? Participants will no longer be able to start new goals with it.`
      )
    ) {
      return;
    }
    setRowBusy(true);
    try {
      await archiveTemplate(tpl.id);
      if (editingId === tpl.id) setEditingId(null);
      await refreshTemplates();
    } catch (err) {
      if (err.status === 404) {
        await handleStaleTemplate(err);
      } else {
        setTplNotice(err.message || 'Failed to archive template');
      }
    } finally {
      setRowBusy(false);
    }
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <h1>Activity Templates</h1>
        <p className="page-subtitle">Define habit boundaries for participants (PM Only)</p>
      </header>

      {/* Template Creation Form */}
      <div className="dashboard-card form-card">
        <h3>Create New Activity Template</h3>
        <form onSubmit={handleSubmit} className="form-grid">
          <div className="form-group">
            <label htmlFor="template-name">Template Name</label>
            <input
              id="template-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Daily Reading"
              required
            />
            {fieldErrors.name && <span className="field-error">{fieldErrors.name}</span>}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="min-value">Min Minutes</label>
              <input
                id="min-value"
                type="number"
                min="1"
                max="960"
                value={minValue}
                onChange={(e) => setMinValue(e.target.value)}
                required
              />
              {fieldErrors.min_value && <span className="field-error">{fieldErrors.min_value}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="max-value">Max Minutes</label>
              <input
                id="max-value"
                type="number"
                min="1"
                max="960"
                value={maxValue}
                onChange={(e) => setMaxValue(e.target.value)}
                required
              />
              {fieldErrors.max_value && <span className="field-error">{fieldErrors.max_value}</span>}
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={submitting}
            data-testid="create-template-btn"
          >
            {submitting ? 'Creating...' : 'Create Template'}
          </button>
        </form>
        {successMsg && <div className="alert alert-success" role="status">{successMsg}</div>}
        {formError && <ErrorAlert message={formError} />}
      </div>

      {/* Template List */}
      <div className="list-section">
        <h3>Your Templates</h3>
        {tplNotice && (
          <p className="field-error" role="alert">
            {tplNotice}
          </p>
        )}
        {loading && <LoadingSpinner message="Loading templates..." />}
        {error && <ErrorAlert message={error} onRetry={loadTemplates} />}
        {!loading && !error && templates.length === 0 && (
          <EmptyState message="No templates created yet. Create one above to get started." />
        )}
        {!loading && !error && templates.length > 0 && (
          <div className="card-grid">
            {templates.map((tpl) => (
              <div key={tpl.id} className="item-card" data-testid={`template-card-${tpl.id}`}>
                {editingId === tpl.id ? (
                  <form
                    className="template-edit-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleEditSave(tpl);
                    }}
                  >
                    <div className="form-group">
                      <span className="edit-hint" aria-hidden="true">Name</span>
                      <input
                        type="text"
                        aria-label="Edit template name"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                      {editErrors.name && <span className="field-error">{editErrors.name}</span>}
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <span className="edit-hint" aria-hidden="true">Min minutes</span>
                        <input
                          type="number"
                          aria-label="Edit min minutes"
                          value={editMin}
                          onChange={(e) => setEditMin(e.target.value)}
                        />
                        {editErrors.min_value && <span className="field-error">{editErrors.min_value}</span>}
                      </div>
                      <div className="form-group">
                        <span className="edit-hint" aria-hidden="true">Max minutes</span>
                        <input
                          type="number"
                          aria-label="Edit max minutes"
                          value={editMax}
                          onChange={(e) => setEditMax(e.target.value)}
                        />
                        {editErrors.max_value && <span className="field-error">{editErrors.max_value}</span>}
                      </div>
                    </div>
                    {(editErrors.body || editFormError) && (
                      <p className="field-error">{editErrors.body || editFormError}</p>
                    )}
                    <div className="entry-actions">
                      <button type="submit" className="btn-primary btn-sm" disabled={rowBusy}>
                        Save
                      </button>
                      <button type="button" className="btn-secondary btn-sm" onClick={cancelEdit} disabled={rowBusy}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <h4>{tpl.name}</h4>
                    <div className="item-meta">
                      <span>Unit: {tpl.unit}</span>
                      <span>
                        Range: {tpl.min_value} - {tpl.max_value} mins
                      </span>
                      <span className={`status-tag ${tpl.is_archived ? 'tag-archived' : 'tag-active'}`}>
                        {tpl.is_archived ? 'Archived' : 'Active'}
                      </span>
                    </div>
                    {!tpl.is_archived && (
                      <div className="entry-actions template-actions">
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          aria-label={`Edit template ${tpl.name}`}
                          onClick={() => startEdit(tpl)}
                          disabled={rowBusy}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn-danger btn-sm"
                          aria-label={`Archive template ${tpl.name}`}
                          onClick={() => handleArchive(tpl)}
                          disabled={rowBusy}
                        >
                          Archive
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

