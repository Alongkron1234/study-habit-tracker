import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getGoals, createGoal } from '../api/goals';
import { getTemplates } from '../api/templates';
import { LoadingSpinner, EmptyState, ErrorAlert } from '../components/StateFeedback';

export function GoalsPage() {
  const [goals, setGoals] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form state
  const [templateId, setTemplateId] = useState('');
  const [targetMinutes, setTargetMinutes] = useState(600);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Default start to today (YYYY-MM-DD), end to +30 days
  useEffect(() => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
    setStartDate(today);
    const end = new Date();
    end.setDate(end.getDate() + 29);
    setEndDate(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(end));
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [goalsRes, tplsRes] = await Promise.all([getGoals(), getTemplates()]);
      setGoals(goalsRes.goals || []);
      const activeTpls = (tplsRes.templates || []).filter((t) => !t.is_archived);
      setTemplates(activeTpls);
      if (activeTpls.length > 0 && !templateId) {
        setTemplateId(activeTpls[0].id);
      }
    } catch {
      setError('Failed to load goals or available templates');
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setFieldErrors({});
    setSuccessMsg('');
    setSubmitting(true);

    try {
      await createGoal({
        template_id: Number(templateId),
        target_minutes: Number(targetMinutes),
        start_date: startDate,
        end_date: endDate,
      });
      setSuccessMsg('Goal created successfully!');
      loadData();
    } catch (err) {
      if (err.status === 409) {
        setFormError('You already have an active goal for this activity template (BR-05)');
      } else if (err.data?.fields) {
        setFieldErrors(err.data.fields);
        setFormError('Please check the form for errors');
      } else {
        setFormError(err.message || 'Failed to create goal');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <h1>My Study Goals</h1>
        <p className="page-subtitle">Set goals and track daily reading/study habits</p>
      </header>

      {/* Goal Creation Form */}
      <div className="dashboard-card form-card">
        <h3>Set a New Study Goal</h3>
        {successMsg && <div className="alert alert-success">{successMsg}</div>}
        {formError && <ErrorAlert message={formError} />}

        {templates.length === 0 ? (
          <p className="text-muted">No activity templates available. Ask your PM to create one.</p>
        ) : (
          <form onSubmit={handleSubmit} className="form-grid">
            <div className="form-group">
              <label htmlFor="goal-template">Activity Template</label>
              <select
                id="goal-template"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                required
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.min_value} - {t.max_value} mins/day)
                  </option>
                ))}
              </select>
              {fieldErrors.template_id && (
                <span className="field-error">{fieldErrors.template_id}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="target-minutes">Target Minutes (Total)</label>
              <input
                id="target-minutes"
                type="number"
                min="1"
                value={targetMinutes}
                onChange={(e) => setTargetMinutes(e.target.value)}
                required
              />
              {fieldErrors.target_minutes && (
                <span className="field-error">{fieldErrors.target_minutes}</span>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="start-date">Start Date</label>
                <input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
                {fieldErrors.start_date && (
                  <span className="field-error">{fieldErrors.start_date}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="end-date">End Date</label>
                <input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
                {fieldErrors.end_date && (
                  <span className="field-error">{fieldErrors.end_date}</span>
                )}
              </div>
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={submitting}
              data-testid="create-goal-btn"
            >
              {submitting ? 'Creating...' : 'Set Goal'}
            </button>
          </form>
        )}
      </div>

      {/* Goal List */}
      <div className="list-section">
        <h3>Your Current & Past Goals</h3>
        {loading && <LoadingSpinner message="Loading your goals..." />}
        {error && <ErrorAlert message={error} onRetry={loadData} />}
        {!loading && !error && goals.length === 0 && (
          <EmptyState message="You haven't set any study goals yet. Choose a template above to get started!" />
        )}
        {!loading && !error && goals.length > 0 && (
          <div className="card-grid">
            {goals.map((g) => (
              <div key={g.id} className="item-card goal-card" data-testid={`goal-card-${g.id}`}>
                <div className="goal-header">
                  <h4>Goal #{g.id}</h4>
                  <span className={`status-tag tag-${g.status}`}>{g.status}</span>
                </div>
                <div className="item-meta">
                  <span>Target: {g.target_minutes} mins</span>
                  <span>
                    Period: {g.start_date} to {g.end_date}
                  </span>
                </div>
                <div className="card-actions">
                  <Link
                    to={`/goals/${g.id}`}
                    className="btn-primary btn-sm"
                    data-testid={`view-goal-btn-${g.id}`}
                  >
                    View Progress & Record
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

