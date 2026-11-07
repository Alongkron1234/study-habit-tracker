import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getGoal, getGoalProgress, getGoalEntries, createGoalEntry } from '../api/goals';
import { getTemplates } from '../api/templates';
import { LoadingSpinner, EmptyState, ErrorAlert } from '../components/StateFeedback';
import { friendlyFields } from '../lib/messages';

export function GoalDetailPage() {
  const { id } = useParams();
  const [goal, setGoal] = useState(null);
  const [progress, setProgress] = useState(null);
  const [entries, setEntries] = useState([]);
  const [template, setTemplate] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Entry Form State
  const [entryDate, setEntryDate] = useState('');
  const [minutes, setMinutes] = useState(30);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Default entry date to today
  useEffect(() => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
    setEntryDate(today);
  }, []);

  const loadGoalData = useCallback(async () => {
    setLoading(true);
    setError('');
    setNotFound(false);
    try {
      const [goalRes, progRes, entriesRes, tplRes] = await Promise.all([
        getGoal(id),
        getGoalProgress(id),
        getGoalEntries(id),
        // ชื่อและช่วงของแม่แบบใช้แสดงผลเท่านั้น ถ้าโหลดไม่ได้ก็ไม่ให้หน้าล้ม
        Promise.resolve(getTemplates()).catch(() => null),
      ]);
      setGoal(goalRes.goal);
      setTemplate(
        ((tplRes && tplRes.templates) || []).find((t) => t.id === goalRes.goal.template_id) || null
      );
      setProgress(progRes.progress);
      setEntries(entriesRes.entries || []);
    } catch (err) {
      if (err.status === 404) setNotFound(true);
      setError(err.status === 404 ? 'Goal not found' : 'Failed to load goal details');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadGoalData();
  }, [loadGoalData]);

  const handleEntrySubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setFieldErrors({});
    setSuccessMsg('');
    setSubmitting(true);

    try {
      await createGoalEntry(id, {
        entry_date: entryDate,
        minutes: Number(minutes),
      });
      setSuccessMsg('Habit entry recorded successfully!');
      // Reload progress and entries
      const [progRes, entriesRes] = await Promise.all([
        getGoalProgress(id),
        getGoalEntries(id),
      ]);
      setProgress(progRes.progress);
      setEntries(entriesRes.entries || []);
    } catch (err) {
      if (err.status === 409) {
        setFormError('You already recorded minutes for this date, or this goal has ended.');
      } else if (err.data?.fields) {
        setFieldErrors(friendlyFields(err.data.fields, template));
        setFormError('Please check entry input values');
      } else {
        setFormError(err.message || 'Failed to record entry');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner message="Loading goal details..." />;
  if (error) {
    return (
      <div className="page-container">
        <ErrorAlert message={error} onRetry={notFound ? null : loadGoalData} />
        <Link to="/goals">← Back to Goals</Link>
      </div>
    );
  }
  if (!goal) return <EmptyState message="Goal not found" />;

  const isEnded = goal.status === 'ended';

  return (
    <div className="page-container goal-detail-page">
      <div className="detail-breadcrumb">
        <Link to="/goals">← Back to Goals</Link>
      </div>

      <header className="page-header">
        <div className="header-with-status">
          <h1>{template ? template.name : `Goal #${goal.id}`}</h1>
          <span className={`status-tag tag-${goal.status}`}>{goal.status}</span>
        </div>
        <p className="page-subtitle">
          {template && <>Allowed per day: {template.min_value}–{template.max_value} mins | </>}
          Period: {goal.start_date} to {goal.end_date} | Target: {goal.target_minutes} mins
        </p>
      </header>

      {/* Progress Summary Card (F-06, BR-06) */}
      <div className="dashboard-card progress-card" data-testid="progress-summary">
        <h3>Overall Progress</h3>
        <div className="progress-metrics">
          <div className="metric-box">
            <span className="metric-label">Completed</span>
            <span className="metric-value" data-testid="total-minutes">
              {progress?.total_minutes || 0} mins
            </span>
          </div>
          <div className="metric-box">
            <span className="metric-label">Target</span>
            <span className="metric-value">{progress?.target_minutes || goal.target_minutes} mins</span>
          </div>
          <div className="metric-box">
            <span className="metric-label">Progress</span>
            <span className="metric-value metric-percent" data-testid="progress-percent">
              {progress?.percent !== undefined ? `${progress.percent}%` : '0%'}
            </span>
          </div>
        </div>

        <div className="progress-bar-container">
          <div
            className="progress-bar-fill"
            style={{ width: `${Math.min(progress?.percent || 0, 100)}%` }}
          ></div>
        </div>
      </div>

      {/* Daily Entry Form (F-05) */}
      <div className="dashboard-card form-card">
        <h3>Record Daily Study Minutes</h3>
        {isEnded ? (
          <p className="text-muted">
            This goal has ended ({goal.end_date}). New entries cannot be added 
          </p>
        ) : (
          <>
            <form onSubmit={handleEntrySubmit} className="form-grid">
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="entry-date">Date</label>
                  <input
                    id="entry-date"
                    type="date"
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    required
                  />
                  {fieldErrors.entry_date && (
                    <span className="field-error">{fieldErrors.entry_date}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="minutes">Minutes Studied</label>
                  <input
                    id="minutes"
                    type="number"
                    min="1"
                    max="960"
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                    required
                  />
                  {fieldErrors.minutes && (
                    <span className="field-error">{fieldErrors.minutes}</span>
                  )}
                </div>
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={submitting}
                data-testid="record-entry-btn"
              >
                {submitting ? 'Recording...' : 'Record Minutes'}
              </button>
            </form>
            {successMsg && <div className="alert alert-success" role="status">{successMsg}</div>}
            {formError && <ErrorAlert message={formError} />}
          </>
        )}
      </div>

      {/* History Entries List (F-06, FR-10) */}
      <div className="list-section">
        <h3>Recorded Daily Habits</h3>
        {entries.length === 0 ? (
          <EmptyState message="No habit entries recorded for this goal yet." />
        ) : (
          <div className="entries-table-container">
            <table className="entries-table" data-testid="entries-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Minutes</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((item) => (
                  <tr key={item.id} data-testid={`entry-row-${item.id}`}>
                    <td>{item.entry_date}</td>
                    <td>{item.minutes} mins</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

