import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getGoal,
  getGoalProgress,
  getGoalEntries,
  createGoalEntry,
  updateGoal,
  updateGoalEntry,
  deleteGoalEntry,
} from '../api/goals';
import { getTemplates } from '../api/templates';
import { LoadingSpinner, EmptyState, ErrorAlert } from '../components/StateFeedback';
import { friendlyFields } from '../lib/messages';

const EDIT_WINDOW_DAYS = 7;

function todayBangkok() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
}

function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

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

  // Edit/Delete Entry State (F-11)
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [editError, setEditError] = useState('');
  const [entryNotice, setEntryNotice] = useState('');
  const [rowBusy, setRowBusy] = useState(false);

  // Edit Goal State (F-10)
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalTarget, setGoalTarget] = useState('');
  const [goalEnd, setGoalEnd] = useState('');
  const [goalFieldErrors, setGoalFieldErrors] = useState({});
  const [goalFormError, setGoalFormError] = useState('');
  const [goalNotice, setGoalNotice] = useState('');
  const [goalSaving, setGoalSaving] = useState(false);

  // Default entry date to today
  useEffect(() => {
    setEntryDate(todayBangkok());
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

  const refreshEntriesAndProgress = async () => {
    const [progRes, entriesRes] = await Promise.all([
      getGoalProgress(id),
      getGoalEntries(id),
    ]);
    setProgress(progRes.progress);
    setEntries(entriesRes.entries || []);
  };

  // F-10: โหลด goal และ progress ใหม่ (ไม่ใช้ loadGoalData เพราะจะกระพริบเป็นหน้า loading)
  const refreshGoalAndProgress = async () => {
    const [goalRes, progRes] = await Promise.all([getGoal(id), getGoalProgress(id)]);
    setGoal(goalRes.goal);
    setProgress(progRes.progress);
  };

  const startGoalEdit = () => {
    setGoalNotice('');
    setGoalFormError('');
    setGoalFieldErrors({});
    setGoalTarget(String(goal.target_minutes));
    setGoalEnd(goal.end_date);
    setEditingGoal(true);
  };

  const cancelGoalEdit = () => {
    setEditingGoal(false);
    setGoalFormError('');
    setGoalFieldErrors({});
  };

  const handleGoalSave = async (e) => {
    e.preventDefault();
    setGoalFormError('');
    setGoalFieldErrors({});
    setGoalNotice('');
    setGoalSaving(true);
    try {
      await updateGoal(id, { target_minutes: Number(goalTarget), end_date: goalEnd });
      setEditingGoal(false);
      await refreshGoalAndProgress();
    } catch (err) {
      if (err.status === 409) {
        // goal จบไปแล้ว: ปิดฟอร์ม แจ้งผู้ใช้ และโหลดสถานะล่าสุด (ปุ่มแก้จะหายไป)
        setEditingGoal(false);
        setGoalNotice('This goal has ended and can no longer be edited.');
        try {
          await refreshGoalAndProgress();
        } catch {
          /* ถ้ารีเฟรชไม่ได้ ผู้ใช้ยังเห็นข้อความแจ้งอยู่ */
        }
      } else if (err.data?.fields) {
        setGoalFieldErrors(friendlyFields(err.data.fields, template));
      } else {
        setGoalFormError(err.message || 'Failed to update goal');
      }
    } finally {
      setGoalSaving(false);
    }
  };

  // S-14: ปุ่มแก้/ลบแสดงเฉพาะ entry_date >= วันนี้ − 7 และ goal active
  // (UI ไม่ใช่การป้องกัน — backend ตรวจ S-1 เองเสมอ)
  const canModify = (entry) =>
    goal?.status === 'active' && entry.entry_date >= addDays(todayBangkok(), -EDIT_WINDOW_DAYS);

  const startEdit = (entry) => {
    setEntryNotice('');
    setEditError('');
    setEditingId(entry.id);
    setEditValue(String(entry.minutes));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditError('');
  };

  // 409/404: entry เปลี่ยนสถานะไปแล้ว → แจ้งผู้ใช้และโหลดรายการใหม่
  const handleStaleEntry = async (err) => {
    setEditingId(null);
    setEditError('');
    setEntryNotice(
      err.status === 409
        ? 'This entry can no longer be edited.'
        : 'This entry no longer exists.'
    );
    try {
      await refreshEntriesAndProgress();
    } catch {
      /* ถ้ารีเฟรชไม่ได้ ผู้ใช้ยังเห็นข้อความแจ้งอยู่ */
    }
  };

  const handleEditSave = async (entry) => {
    setEditError('');
    setEntryNotice('');
    setRowBusy(true);
    try {
      await updateGoalEntry(id, entry.id, { minutes: Number(editValue) });
      setEditingId(null);
      await refreshEntriesAndProgress();
    } catch (err) {
      if (err.status === 409 || err.status === 404) {
        await handleStaleEntry(err);
      } else if (err.data?.fields?.minutes) {
        setEditError(friendlyFields(err.data.fields, template).minutes);
      } else {
        setEditError(err.message || 'Failed to update entry');
      }
    } finally {
      setRowBusy(false);
    }
  };

  const handleDelete = async (entry) => {
    setEntryNotice('');
    if (!window.confirm(`Delete the entry for ${entry.entry_date} (${entry.minutes} mins)?`)) return;
    setRowBusy(true);
    try {
      await deleteGoalEntry(id, entry.id);
      if (editingId === entry.id) setEditingId(null);
      await refreshEntriesAndProgress();
    } catch (err) {
      if (err.status === 409 || err.status === 404) {
        await handleStaleEntry(err);
      } else {
        setEntryNotice(err.message || 'Failed to delete entry');
      }
    } finally {
      setRowBusy(false);
    }
  };

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

      {/* Edit Goal (F-10, S-15: ปุ่มเฉพาะ goal ที่ active — backend ตรวจ S-1 เองเสมอ) */}
      {goalNotice && (
        <p className="field-error" role="alert">
          {goalNotice}
        </p>
      )}
      {!isEnded && !editingGoal && (
        <button type="button" className="btn-secondary goal-edit-btn" onClick={startGoalEdit}>
          Edit goal
        </button>
      )}
      {editingGoal && (
        <form onSubmit={handleGoalSave} className="dashboard-card form-card goal-edit-form" data-testid="goal-edit-form">
          <h3>Edit Goal</h3>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="goal-target">Target minutes</label>
              <input
                id="goal-target"
                type="number"
                value={goalTarget}
                onChange={(e) => setGoalTarget(e.target.value)}
              />
              {goalFieldErrors.target_minutes && (
                <span className="field-error">{goalFieldErrors.target_minutes}</span>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="goal-end">End date</label>
              <input
                id="goal-end"
                type="date"
                value={goalEnd}
                onChange={(e) => setGoalEnd(e.target.value)}
              />
              {goalFieldErrors.end_date && <span className="field-error">{goalFieldErrors.end_date}</span>}
            </div>
          </div>
          {(goalFieldErrors.body || goalFormError) && (
            <p className="field-error">{goalFieldErrors.body || goalFormError}</p>
          )}
          <div className="entry-actions">
            <button type="submit" className="btn-primary" disabled={goalSaving}>
              Save
            </button>
            <button type="button" className="btn-secondary" onClick={cancelGoalEdit} disabled={goalSaving}>
              Cancel
            </button>
          </div>
        </form>
      )}

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
            {entryNotice && <ErrorAlert message={entryNotice} />}
            <table className="entries-table" data-testid="entries-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Minutes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((item) => {
                  const editable = canModify(item);
                  const isEditing = editingId === item.id;
                  return (
                    <tr key={item.id} data-testid={`entry-row-${item.id}`}>
                      <td>{item.entry_date}</td>
                      <td>
                        {isEditing ? (
                          <div className="entry-edit-field">
                            <input
                              type="number"
                              aria-label={`Minutes for ${item.entry_date}`}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleEditSave(item);
                                if (e.key === 'Escape') cancelEdit();
                              }}
                              autoFocus
                            />
                            {editError && <span className="field-error">{editError}</span>}
                          </div>
                        ) : (
                          <>{item.minutes} mins</>
                        )}
                      </td>
                      <td className="entry-actions">
                        {editable && isEditing && (
                          <>
                            <button
                              type="button"
                              className="btn-primary btn-sm"
                              onClick={() => handleEditSave(item)}
                              disabled={rowBusy}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              onClick={cancelEdit}
                              disabled={rowBusy}
                            >
                              Cancel
                            </button>
                          </>
                        )}
                        {editable && !isEditing && (
                          <>
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              aria-label={`Edit entry ${item.entry_date}`}
                              onClick={() => startEdit(item)}
                              disabled={rowBusy}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn-danger btn-sm"
                              aria-label={`Delete entry ${item.entry_date}`}
                              onClick={() => handleDelete(item)}
                              disabled={rowBusy}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

