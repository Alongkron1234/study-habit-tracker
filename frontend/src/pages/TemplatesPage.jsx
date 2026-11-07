import React, { useState, useEffect, useCallback } from 'react';
import { getTemplates, createTemplate } from '../api/templates';
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
        {loading && <LoadingSpinner message="Loading templates..." />}
        {error && <ErrorAlert message={error} onRetry={loadTemplates} />}
        {!loading && !error && templates.length === 0 && (
          <EmptyState message="No templates created yet. Create one above to get started." />
        )}
        {!loading && !error && templates.length > 0 && (
          <div className="card-grid">
            {templates.map((tpl) => (
              <div key={tpl.id} className="item-card" data-testid={`template-card-${tpl.id}`}>
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

