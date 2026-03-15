import React, { useState, useEffect, useCallback } from 'react';
import { useValidation, ValidationNote, errorBorder } from '../utils/validation.jsx';
import dataService from '../services/dataService';
import { logAction } from '../services/activityLogger';
import { auth } from '../services/firebaseConfig';
import { formatTime } from '../utils/formatDateTime';
import './CashReconciliation.css';

// ── Helpers ──────────────────────────────────────────────────────────────────

// todayStr uses currentBusinessDate from dataService
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function fmt(amount) {
  const sym = dataService.getCurrencySymbol?.() || '$';
  return `${sym}${(parseFloat(amount) || 0).toFixed(2)}`;
}

function formatDateLabel(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday:'short', year:'numeric', month:'short', day:'numeric' });
}


// ── Detail Modal ─────────────────────────────────────────────────────────────
function buildNoteLabel(counted, expected, notes, closedByName) {
  if (counted === null || counted === undefined || expected === null || expected === undefined) return null;
  const diff = parseFloat(counted) - parseFloat(expected);
  const sym = dataService.getCurrencySymbol?.() || '$';
  const fmtVal = (v) => `${sym}${Math.abs(v).toFixed(2)}`;
  if (diff === 0) return '✅ Balanced';
  if (diff < 0) return `There was a shortage by ${fmtVal(diff)} and ${closedByName || 'staff'} says "${notes || '—'}"`;
  return `There was a SURPLUS by ${fmtVal(diff)} and ${closedByName || 'staff'} says "${notes || '—'}"`;
}

function SessionBlock({ label, openedBy, openedAt, float, expected, counted, notes, closedBy, closedAt, isLastSession, isDayClosed, onReopen, reopening }) {
  const noteLabel = buildNoteLabel(counted, expected, notes, closedBy);
  return (
    <div className="cr-session-block">
      {label && (
        <div className="cr-session-label">
          <span className="cr-session-label-text">{label}</span>
        </div>
      )}
      <div className="cr-summary-row">
        <span className="cr-summary-label">Opened by</span>
        <span className="cr-summary-value">{openedBy || '—'}</span>
      </div>
      <div className="cr-summary-row">
        <span className="cr-summary-label">Opened at</span>
        <span className="cr-summary-value">{formatTime(openedAt)}</span>
      </div>
      <div className="cr-summary-row">
        <span className="cr-summary-label">Opening Float</span>
        <span className="cr-summary-value">{float !== null && float !== undefined ? fmt(float) : '—'}</span>
      </div>
      <div className="cr-summary-row">
        <span className="cr-summary-label">Expected Cash in drawer</span>
        <span className="cr-summary-value expected">{expected !== null && expected !== undefined ? fmt(expected) : '—'}</span>
      </div>
      <div className="cr-summary-row">
        <span className="cr-summary-label">Counted Cash in drawer</span>
        <span className="cr-summary-value">{counted !== null && counted !== undefined ? fmt(counted) : '—'}</span>
      </div>
      {noteLabel && (
        <div className="cr-summary-row cr-note-row">
          <span className={`cr-session-note ${noteLabel === '✅ Balanced' ? 'note-balanced' : noteLabel.includes('shortage') ? 'note-short' : 'note-surplus'}`}>
            {noteLabel}
          </span>
        </div>
      )}
      <div className="cr-summary-row">
        <span className="cr-summary-label">Closed by</span>
        <span className="cr-summary-value">{closedBy || '—'}</span>
      </div>
      <div className="cr-summary-row" style={{ borderBottom: 'none' }}>
        <span className="cr-summary-label">Closed at</span>
        <span className="cr-summary-value">{closedAt ? formatTime(closedAt) : '—'}</span>
      </div>
      {isLastSession && isDayClosed && (
        <button className="cr-btn-reopen" onClick={onReopen} disabled={reopening}>
          {reopening ? 'Reopening…' : '🔓 Re-Open Shop'}
        </button>
      )}
    </div>
  );
}

function DetailModal({ record, onClose, onReopen, onStoreStatusChange }) {
  const [reopening, setReopening] = useState(false);
  if (!record) return null;

  // ── Understand the data structure ──────────────────────────────────────────
  // Each time the day is re-opened, reopenDay() pushes a snapshot into close_sessions[]:
  //   close_sessions[0] = snapshot of Session 1 at the moment Session 2 was opened
  //   close_sessions[1] = snapshot of Session 2 at the moment Session 3 was opened
  //   … and so on.
  //
  // Each snapshot contains:
  //   { reopen_float, expected_cash, counted_cash, closed_by_name, closed_at,
  //     reopened_by_name, reopened_at }   ← reopened_by/at = who OPENED the NEXT session
  //
  // The root record always holds the CURRENT (last) session's live data:
  //   opened_by_name / opened_at_client / opening_float  = original day open (Session 1)
  //   reopened_by_name / reopened_at                     = who opened the latest session
  //   expected_cash / counted_cash / closed_by_name / closed_at_client = current session close

  const closeSessions = Array.isArray(record.close_sessions) ? record.close_sessions : [];
  const hasMultipleSessions = closeSessions.length > 0;
  const ordinals = ['First','Second','Third','Fourth','Fifth','Sixth','Seventh','Eighth','Ninth','Tenth'];

  // Build sessions array in chronological order
  const sessions = [];

  if (!hasMultipleSessions) {
    sessions.push({
      label: null,
      openedBy:   record.opened_by_name   || '—',
      openedAt:   record.opened_at_client || null,
      float:      record.opening_float    ?? null,
      expected:   record.expected_cash    ?? null,
      counted:    record.counted_cash     ?? null,
      notes:      record.notes            || '',
      closedBy:   record.closed_by_name   || null,
      closedAt:   record.closed_at_client || null,
    });
  } else {
    sessions.push({
      label:    'First Session',
      openedBy: record.opened_by_name   || '—',
      openedAt: record.opened_at_client || null,
      float:    record.opening_float    ?? null,
      expected: closeSessions[0].expected_cash  ?? null,
      counted:  closeSessions[0].counted_cash   ?? null,
      notes:    closeSessions[0].notes          || '',
      closedBy: closeSessions[0].closed_by_name || null,
      closedAt: closeSessions[0].closed_at      || null,
    });

    for (let i = 1; i < closeSessions.length; i++) {
      sessions.push({
        label:    `${ordinals[i] || `#${i+1}`} Session`,
        openedBy: closeSessions[i-1].reopened_by_name || '—',
        openedAt: closeSessions[i-1].reopened_at      || null,
        float:    closeSessions[i].reopen_float        ?? null,
        expected: closeSessions[i].expected_cash       ?? null,
        counted:  closeSessions[i].counted_cash        ?? null,
        notes:    closeSessions[i].notes               || '',
        closedBy: closeSessions[i].closed_by_name      || null,
        closedAt: closeSessions[i].closed_at           || null,
      });
    }

    const prev = closeSessions[closeSessions.length - 1];
    sessions.push({
      label:    `${ordinals[closeSessions.length] || `#${closeSessions.length+1}`} Session`,
      openedBy: prev.reopened_by_name   || '—',
      openedAt: prev.reopened_at        || null,
      float:    prev.reopen_float       ?? null,
      expected: record.expected_cash    ?? null,
      counted:  record.counted_cash     ?? null,
      notes:    record.notes            || '',
      closedBy: record.closed_by_name   || null,
      closedAt: record.closed_at_client || null,
    });
  }

  const handleReopen = async () => {
    if (!window.confirm('Re-open this day? A new session will begin and the day will be marked as open again.')) return;
    setReopening(true);
    try {
      await dataService.reopenDay(record.business_date);
      await logAction('DAY_REOPEN', `Re-opened day ${record.business_date}`).catch(() => {});
      if (onStoreStatusChange) onStoreStatusChange(true);
      onReopen();
      onClose();
    } catch (e) {
      alert('Failed to re-open day: ' + e.message);
    } finally { setReopening(false); }
  };

  const isDayClosed = record.status === 'closed';

  return (
    <div className="cr-overlay" onClick={onClose}>
      <div className="cr-detail-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="cr-detail-header">
          <span className="cr-detail-title">{formatDateLabel(record.business_date)}</span>
          <button className="cr-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Day Summary card */}
        <div className="cr-card" style={{ gap: 10 }}>
          <p className="cr-card-title">Day Summary</p>
          <div className="cr-summary-row" style={{ borderBottom: 'none' }}>
            <span className="cr-summary-label">Status</span>
            <span className={`cr-record-status ${record.status}`}>{record.status}</span>
          </div>
        </div>

        {/* Session blocks */}
        {sessions.map((sess, idx) => (
          <SessionBlock
            key={idx}
            label={sess.label}
            openedBy={sess.openedBy}
            openedAt={sess.openedAt}
            float={sess.float}
            expected={sess.expected}
            counted={sess.counted}
            notes={sess.notes}
            closedBy={sess.closedBy}
            closedAt={sess.closedAt}
            isLastSession={idx === sessions.length - 1}
            isDayClosed={isDayClosed}
            onReopen={handleReopen}
            reopening={reopening}
          />
        ))}

        {/* Unlock events — audit trail */}
        {Array.isArray(record.unlock_events) && record.unlock_events.length > 0 && (
          <div className="cr-card" style={{ gap: 8 }}>
            <p className="cr-card-title">🔓 Checkout Unlocks ({record.unlock_events.length})</p>
            {record.unlock_events.map((ev, i) => (
              <div key={i} className="cr-summary-row" style={{ fontSize: '12px' }}>
                <span className="cr-summary-label">{ev.name || 'Staff'}</span>
                <span className="cr-summary-value">{formatTime(ev.at)}</span>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

function CashReconciliation({ onStoreStatusChange, storeIsOpen }) {
  const [activeTab, setActiveTab]       = useState('today');
  const [loading, setLoading]           = useState(true);
  const [todayRecord, setTodayRecord]   = useState(null);
  const [records, setRecords]           = useState([]);
  const [liveSummary, setLiveSummary]   = useState(null);
  const [detailRecord, setDetailRecord] = useState(null);
  const [showClosedTabModal, setShowClosedTabModal] = useState(false);

  // ── Close shop confirmation modal ─────────────────────────────────────────
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [ownerName, setOwnerName]               = useState('the Owner');

  const reopenBtnRef = React.useRef(null);

  const { fieldErrors, showError, clearFieldError } = useValidation();

  // Open Day form
  const [openingFloat, setOpeningFloat] = useState('');
  const [openingSaving, setOpeningSaving] = useState(false);
  const [reopenFloat, setReopenFloat] = useState('');

  // Close Day form
  const [countedCash, setCountedCash]   = useState('');
  const [closeNotes, setCloseNotes]     = useState('');
  const [closeSaving, setCloseSaving]   = useState(false);

  const today = todayStr();

  // ── Load data ────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const allRecs = await dataService.getDailyCashRecords();
      const rec = (allRecs || []).find(r => r.business_date === today) || null;
      setTodayRecord(rec);
      setRecords((allRecs || []).sort((a, b) => b.business_date.localeCompare(a.business_date)));
      const summary = await dataService.calculateExpectedCash(today);
      setLiveSummary(summary);
      // Fetch owner name for close-shop confirmation
      const oName = await dataService.getOwnerName();
      setOwnerName(oName);
    } catch (e) {
      console.error('CashReconciliation loadData error:', e);
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(user => {
      if (user) {
        dataService._dailyCashFetched = false;
        loadData();
      }
    });
    return () => unsub();
  }, [loadData]);

  // ── Open Day ─────────────────────────────────────────────────────────────

  const handleOpenDay = async () => {
    const float = parseFloat(openingFloat);
    if (isNaN(float) || float < 0) return showError('cr_float', 'Please enter a valid opening float (0 or more)');
    setOpeningSaving(true);
    try {
      await dataService.openDay({ opening_float: float });
      await logAction('DAY_OPEN', `Opened day with float $${float.toFixed(2)}`).catch(() => {});
      setOpeningFloat('');
      if (onStoreStatusChange) onStoreStatusChange(true);
      await loadData();
    } catch (e) {
      alert('Failed to open day: ' + e.message);
    } finally { setOpeningSaving(false); }
  };

  // ── Close Day ────────────────────────────────────────────────────────────

  const handleCloseDayConfirmed = async () => {
    setShowCloseConfirm(false);
    const counted = parseFloat(countedCash);
    if (isNaN(counted) || counted < 0) return showError('cr_counted', 'Please enter the counted cash amount');

    const summary = await dataService.calculateExpectedCash(today);
    const diff = counted - summary.expected;

    if (diff !== 0 && !closeNotes.trim()) {
      alert(diff < 0
        ? 'Notes are required when cash is SHORT. Please explain why.'
        : 'Notes are required when cash is SURPLUS. Please explain why.');
      return;
    }
    setCloseSaving(true);
    try {
      await dataService.closeDay({ counted_cash: counted, notes: closeNotes.trim() });
      const diffStr = diff === 0 ? 'Balanced' : diff < 0 ? `Short by $${Math.abs(diff).toFixed(2)}` : `Surplus of $${diff.toFixed(2)}`;
      await logAction('DAY_CLOSE', `Closed day — counted $${counted.toFixed(2)}, expected $${(summary.expected||0).toFixed(2)} — ${diffStr}`).catch(() => {});
      setCountedCash('');
      setCloseNotes('');
      if (onStoreStatusChange) onStoreStatusChange(false);
      await loadData();
    } catch (e) {
      alert('Failed to close day: ' + e.message);
    } finally { setCloseSaving(false); }
  };

  const handleCloseDay = async () => {
    const counted = parseFloat(countedCash);
    if (isNaN(counted) || counted < 0) return showError('cr_counted', 'Please enter the counted cash amount');

    const summary = await dataService.calculateExpectedCash(today);
    const diff = counted - summary.expected;

    if (diff !== 0 && !closeNotes.trim()) {
      alert(diff < 0
        ? 'Notes are required when cash is SHORT. Please explain why.'
        : 'Notes are required when cash is SURPLUS. Please explain why.');
      return;
    }
    // Show close-shop confirmation modal
    setShowCloseConfirm(true);
  };

  // ── Render helpers ───────────────────────────────────────────────────────

  const renderStatusBanner = () => {
    if (!todayRecord) {
      return (
        <div className="cr-status-banner none">
          <span className="cr-status-dot" />
          Day not started — tap Open Day to begin
        </div>
      );
    }
    if (todayRecord.status === 'open') {
      return (
        <div className="cr-status-banner open">
          <span className="cr-status-dot" />
          Day is OPEN — opened by {todayRecord.opened_by_name || 'staff'} at {formatTime(todayRecord.opened_at_client)}
        </div>
      );
    }
    return (
      <div className="cr-status-banner closed">
        <span className="cr-status-dot" />
        Day CLOSED — closed by {todayRecord.closed_by_name || 'staff'} at {formatTime(todayRecord.closed_at_client)}
      </div>
    );
  };

  const renderTodayTab = () => {
    if (loading) return <div className="cr-loading">Loading…</div>;

    // ── No open day ──
    if (!todayRecord) {
      return (
        <>
          {renderStatusBanner()}
          <div className="cr-card">
            <p className="cr-card-title">Open Day</p>
            <div className="cr-field">
              <label className="cr-label">Opening Float ($)</label>
              <input
                type="number"
                className="cr-input"
                placeholder="0.00"
                min="0"
                step="0.01"
                value={openingFloat}
                data-field="cr_float"
                style={errorBorder('cr_float', fieldErrors)}
                onChange={e => { setOpeningFloat(e.target.value); clearFieldError('cr_float'); }}
              />
              <ValidationNote field="cr_float" errors={fieldErrors} />
            </div>
            <button
              className="cr-btn cr-btn-open"
              onClick={handleOpenDay}
              disabled={openingSaving || openingFloat === ''}
            >
              {openingSaving ? 'Opening…' : '✅ Open Day'}
            </button>
          </div>
        </>
      );
    }

    // ── Day is closed ──
    if (todayRecord.status === 'closed') {
      const diff = todayRecord.counted_cash - todayRecord.expected_cash;

      const handleReopenToday = async () => {
        const float = parseFloat(reopenFloat);
        if (isNaN(float) || float < 0) return showError('cr_reopen', 'Please enter a valid Opening Float (0 or more)');
        if (!window.confirm('Re-open the shop? A new session will start.')) return;
        try {
          await dataService.reopenDay(today, float);
          setReopenFloat('');
          if (onStoreStatusChange) onStoreStatusChange(true);
          await loadData();
        } catch (e) { alert('Failed to re-open: ' + e.message); }
      };

      return (
        <>
          {renderStatusBanner()}
          <div className="cr-card">
            <p className="cr-card-title">Day Summary</p>

            <div className="cr-summary-row">
              <span className="cr-summary-label">Opening Float</span>
              <span className="cr-summary-value">{fmt(todayRecord.opening_float)}</span>
            </div>
            <div className="cr-summary-row">
              <span className="cr-summary-label">Sessions Cash In</span>
              <span className="cr-summary-value in">+{fmt(liveSummary?.sum_in || 0)}</span>
            </div>
            <div className="cr-summary-row">
              <span className="cr-summary-label">Sessions Cash Out</span>
              <span className="cr-summary-value out">-{fmt(liveSummary?.sum_out || 0)}</span>
            </div>
            <hr className="cr-divider" />
            <div className="cr-summary-row">
              <span className="cr-summary-label">Expected Cash in Drawer</span>
              <span className="cr-summary-value expected">{fmt(todayRecord.expected_cash)}</span>
            </div>
            <div className="cr-summary-row">
              <span className="cr-summary-label">Counted Cash</span>
              <span className="cr-summary-value">{fmt(todayRecord.counted_cash)}</span>
            </div>
            <div className="cr-summary-row">
              <span className="cr-summary-label">Difference</span>
              <span className={`cr-summary-value ${diff === 0 ? 'diff-zero' : diff < 0 ? 'diff-neg' : 'diff-pos'}`}>
                {diff >= 0 ? '+' : ''}{fmt(diff)}
                {diff < 0 && ' \u26a0\ufe0f Short'}
                {diff > 0 && ' \u26a0\ufe0f Surplus'}
                {diff === 0 && ' \u2705 Balanced'}
              </span>
            </div>
            <hr className="cr-divider" />
            <div className="cr-summary-row">
              <span className="cr-summary-label">Closed by</span>
              <span className="cr-summary-value">{todayRecord.closed_by_name || '\u2014'}</span>
            </div>
            <div className="cr-summary-row" style={{ borderBottom: 'none' }}>
              <span className="cr-summary-label">Closed at</span>
              <span className="cr-summary-value">{formatTime(todayRecord.closed_at_client)}</span>
            </div>
            {todayRecord.notes ? (
              <div className="cr-summary-row" style={{ borderBottom: 'none', marginTop: 4 }}>
                <span className="cr-summary-label">Notes</span>
                <span className="cr-summary-value" style={{ textAlign:'right', maxWidth:'65%', fontSize:13 }}>{todayRecord.notes}</span>
              </div>
            ) : null}
          </div>

          <div className="cr-closed-msg">
            <span className="cr-closed-icon">🔒</span>
            <span className="cr-closed-title">Day Closed</span>
            <span className="cr-closed-sub">Enter your Opening Float, then tap Re-Open Shop to start a new session.</span>
          </div>

          <div className="cr-card" style={{ marginBottom: 0 }}>
            <div className="cr-field">
              <label className="cr-label">Opening Float for New Session ($)</label>
              <input
                type="number"
                className="cr-input"
                placeholder="0.00"
                min="0"
                step="0.01"
                value={reopenFloat}
                data-field="cr_reopen"
                style={errorBorder('cr_reopen', fieldErrors)}
                onChange={e => { setReopenFloat(e.target.value); clearFieldError('cr_reopen'); }}
              />
              <ValidationNote field="cr_reopen" errors={fieldErrors} />
            </div>
          </div>

          <button className="cr-btn cr-btn-reopen" ref={reopenBtnRef} onClick={handleReopenToday}
            disabled={reopenFloat === ''}>
            🔓 Re-Open Shop
          </button>
        </>
      );
    }

    // ── Day is open — show live summary + close day form ──
    const expected = liveSummary?.expected ?? todayRecord.opening_float;
    const countedVal = parseFloat(countedCash) || 0;
    const previewDiff = countedCash !== '' ? countedVal - expected : null;

    // Determine note placeholder based on preview diff
    const notesPlaceholder = previewDiff === null
      ? 'Notes (optional)…'
      : previewDiff < 0
        ? 'Reason why balance is SHORT…'
        : previewDiff > 0
          ? 'Reason why balance is SURPLUS…'
          : 'Notes (optional)…';

    // Show notes only when reconciliation is "over" or "under" (not balanced, not empty)
    const showNotes = previewDiff !== null && previewDiff !== 0;

    return (
      <>
        {renderStatusBanner()}

        {/* Live cash summary */}
        <div className="cr-card">
          <p className="cr-card-title">Live Cash Summary</p>
          <div className="cr-summary-row">
            <span className="cr-summary-label">Opening Float</span>
            <span className="cr-summary-value">{fmt(todayRecord.opening_float)}</span>
          </div>
          <div className="cr-summary-row">
            <span className="cr-summary-label">Cash In today</span>
            <span className="cr-summary-value in">+{fmt(liveSummary?.sum_in || 0)}</span>
          </div>
          <div className="cr-summary-row">
            <span className="cr-summary-label">Cash Out today</span>
            <span className="cr-summary-value out">-{fmt(liveSummary?.sum_out || 0)}</span>
          </div>
          <hr className="cr-divider" />
          <div className="cr-summary-row">
            <span className="cr-summary-label">Expected Cash Now</span>
            <span className="cr-summary-value expected">{fmt(expected)}</span>
          </div>
        </div>

        {/* Close Day form */}
        <div className="cr-card">
          <p className="cr-card-title">Close Day</p>
          <div className="cr-field">
            <label className="cr-label">Counted Cash ($)</label>
            <input
              type="number"
              className="cr-input"
              placeholder="Enter amount in cash drawer"
              min="0"
              step="0.01"
              value={countedCash}
              data-field="cr_counted"
              style={errorBorder('cr_counted', fieldErrors)}
              onChange={e => { setCountedCash(e.target.value); setCloseNotes(''); clearFieldError('cr_counted'); }}
            />
            <ValidationNote field="cr_counted" errors={fieldErrors} />
          </div>

          {previewDiff !== null && (
            <div className={`cr-status-banner ${previewDiff === 0 ? 'open' : 'none'}`} style={{ fontSize:13 }}>
              <span className="cr-status-dot" />
              Difference: {previewDiff >= 0 ? '+' : ''}{fmt(previewDiff)}
              {previewDiff === 0 && ' ✅ Balanced'}
              {previewDiff < 0 && ' ⚠️ Short — notes required'}
              {previewDiff > 0 && ' ⚠️ Surplus — notes required'}
            </div>
          )}

          {/* Notes field — hidden until imbalance detected */}
          {showNotes && (
            <div className="cr-field">
              <label className="cr-label">
                Notes <span style={{ color:'#dc2626' }}>(required)</span>
              </label>
              <textarea
                className="cr-input cr-textarea"
                placeholder={notesPlaceholder}
                value={closeNotes}
                onChange={e => setCloseNotes(e.target.value)}
              />
            </div>
          )}

          <button
            className="cr-btn cr-btn-close"
            onClick={handleCloseDay}
            disabled={closeSaving || countedCash === ''}
          >
            {closeSaving ? 'Closing…' : '🔒 Close Day'}
          </button>
        </div>
      </>
    );
  };

  const renderRecordsTab = () => {
    if (loading) return <div className="cr-loading">Loading…</div>;
    if (records.length === 0) return <div className="cr-empty">No daily records yet.</div>;

    return (
      <div className="cr-records-list">
        {records.map(rec => {
          const diff = rec.status === 'closed' && rec.counted_cash !== null
            ? rec.counted_cash - rec.expected_cash
            : null;
          return (
            <div key={rec.id} className="cr-record-row" onClick={() => setDetailRecord(rec)}>
              <span className={`cr-record-dot ${rec.status}`} />
              <div className="cr-record-info">
                <div className="cr-record-date">{formatDateLabel(rec.business_date)}</div>
                <div className="cr-record-meta">
                  Opened by {rec.opened_by_name || '—'}
                  {rec.closed_by_name ? ` · Closed by ${rec.closed_by_name}` : ''}
                  {rec.reopened_by_name ? ` · Reopened by ${rec.reopened_by_name}` : ''}
                  {Array.isArray(rec.unlock_events) && rec.unlock_events.length > 0
                    ? ` · 🔓 ${rec.unlock_events.length} unlock${rec.unlock_events.length > 1 ? 's' : ''}`
                    : ''}
                </div>
              </div>
              <div className="cr-record-right">
                <span className={`cr-record-status ${rec.status}`}>{rec.status}</span>
                {diff !== null && (
                  <div className={`cr-record-diff ${diff === 0 ? 'zero' : diff < 0 ? 'neg' : 'pos'}`}>
                    {diff >= 0 ? '+' : ''}{fmt(diff)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="cr-screen">
      {/* Tab bar */}
      <div className="cr-tabs">
        <button
          className={`cr-tab ${activeTab === 'today' ? 'active' : ''}`}
          onClick={() => setActiveTab('today')}
        >
          Today — {today}
        </button>
        <button
          className={`cr-tab ${activeTab === 'records' ? 'active' : ''}`}
          onClick={() => {
            if (!storeIsOpen) {
              setShowClosedTabModal(true);
            } else {
              setActiveTab('records');
            }
          }}
        >
          Records
        </button>
      </div>

      {/* Body */}
      <div className="cr-body">
        {activeTab === 'today' ? renderTodayTab() : renderRecordsTab()}
      </div>

      {/* Detail modal */}
      {detailRecord && (
        <DetailModal
          record={detailRecord}
          onClose={() => setDetailRecord(null)}
          onReopen={() => { loadData(); }}
          onStoreStatusChange={onStoreStatusChange}
        />
      )}

      {/* ── Shop Closed modal (shown when RECORDS tab clicked while closed) ── */}
      {showClosedTabModal && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:9999,
          display:'flex', alignItems:'center', justifyContent:'center', padding:'20px'
        }}>
          <div style={{
            background:'var(--surface, #fff)', color:'var(--text-primary, #1a1a1a)',
            borderRadius:'16px', padding:'28px 24px', maxWidth:'360px', width:'100%',
            textAlign:'center', boxShadow:'0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <div style={{ fontSize:'48px', marginBottom:'12px' }}>🔒</div>
            <h3 style={{ margin:'0 0 12px', fontSize:'18px', fontWeight:700 }}>Shop is Closed</h3>
            <p style={{ margin:'0 0 20px', fontSize:'14px', lineHeight:'1.6', color:'var(--text-secondary, #666)' }}>
              The shop is currently closed. Re-open the shop first to view records or use the app.
            </p>
            <button
              onClick={() => {
                setShowClosedTabModal(false);
                setActiveTab('today');
                setTimeout(() => {
                  const btn = reopenBtnRef.current || document.querySelector('.cr-btn-reopen, .cr-btn-open');
                  if (btn) {
                    btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    btn.style.boxShadow = '0 0 0 4px rgba(102, 126, 234, 0.5)';
                    setTimeout(() => { btn.style.boxShadow = ''; }, 2000);
                  }
                }, 300);
              }}
              style={{
                width:'100%', padding:'12px', fontSize:'15px', fontWeight:700,
                background:'linear-gradient(135deg, #667eea, #764ba2)', color:'#fff',
                border:'none', borderRadius:'10px', cursor:'pointer',
              }}
            >
              OK &mdash; Go to Cash Reconciliation
            </button>
          </div>
        </div>
      )}

      {/* ── Close Shop confirmation modal ── */}
      {showCloseConfirm && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', zIndex:9999,
          display:'flex', alignItems:'center', justifyContent:'center', padding:'20px'
        }}>
          <div style={{
            background:'var(--surface, #fff)', color:'var(--text-primary, #1a1a1a)',
            borderRadius:'18px', padding:'28px 24px', maxWidth:'370px', width:'100%',
            textAlign:'center', boxShadow:'0 24px 64px rgba(0,0,0,0.35)'
          }}>
            <div style={{ fontSize:'52px', marginBottom:'14px' }}>🔒</div>
            <h3 style={{ margin:'0 0 10px', fontSize:'19px', fontWeight:800 }}>Close the Shop?</h3>
            <p style={{ margin:'0 0 8px', fontSize:'14px', lineHeight:'1.65', color:'var(--text-secondary, #555)' }}>
              Are you sure you want to close the shop for today?
            </p>
            <p style={{ margin:'0 0 22px', fontSize:'13px', lineHeight:'1.6', color:'#dc2626', fontWeight:600 }}>
              ⚠️ All logged-in staff will be automatically signed out.<br/>
              Re-opening the shop can only be done by <strong>{ownerName}</strong> via the ACT Admin app or Cash Reconciliation.
            </p>
            <div style={{ display:'flex', gap:'10px' }}>
              <button
                onClick={() => setShowCloseConfirm(false)}
                style={{
                  flex:1, padding:'13px', fontSize:'15px', fontWeight:600,
                  background:'var(--surface-alt, #f3f4f6)', color:'var(--text-primary, #111)',
                  border:'1px solid var(--border, #e5e7eb)', borderRadius:'10px', cursor:'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCloseDayConfirmed}
                disabled={closeSaving}
                style={{
                  flex:1, padding:'13px', fontSize:'15px', fontWeight:700,
                  background:'linear-gradient(135deg, #dc2626, #991b1b)', color:'#fff',
                  border:'none', borderRadius:'10px', cursor:'pointer',
                }}
              >
                {closeSaving ? 'Closing…' : '🔒 Yes, Close Shop'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CashReconciliation;