import React, { useState, useEffect } from 'react';
import dataService from '../services/dataService';
import { useCurrency } from '../hooks/useCurrency';
import './Withdrawals.css';

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function resolveDate(entry) {
  const raw = entry.date || entry.createdAt;
  if (!raw) return null;
  if (typeof raw === 'object' && raw.seconds) return new Date(raw.seconds * 1000);
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(entry) {
  const d = resolveDate(entry);
  if (!d) return 'N/A';
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'2-digit', year:'numeric' });
}

function formatTime(entry) {
  const d = resolveDate(entry);
  if (!d) return '';
  return d.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12: true });
}

function toMidnight(d) { const c = new Date(d); c.setHours(0,0,0,0); return c; }

// ── Main Component ────────────────────────────────────────────────────────────
export default function Withdrawals() {
  const { fmt } = useCurrency();
  const [entries, setEntries]         = useState([]);
  const [filtered, setFiltered]       = useState([]);
  const [shopName, setShopName]       = useState('Shop');
  const [ownerUser, setOwnerUser]     = useState(null);

  // ── Filter state (pending / applied — same pattern as SalesRecord) ──
  const [dateFilter, setDateFilter]         = useState('today');
  const [selectedDate, setSelectedDate]     = useState('');
  const [startDate, setStartDate]           = useState('');
  const [endDate, setEndDate]               = useState('');
  const [typeFilter, setTypeFilter]         = useState('all'); // all | out | in

  const [appliedDateFilter, setAppliedDateFilter]     = useState('today');
  const [appliedSelectedDate, setAppliedSelectedDate] = useState('');
  const [appliedStartDate, setAppliedStartDate]       = useState('');
  const [appliedEndDate, setAppliedEndDate]           = useState('');
  const [appliedTypeFilter, setAppliedTypeFilter]     = useState('all');

  const [showFilters, setShowFilters] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────
  useEffect(() => {
    load();
    dataService.getShopName().then(n => setShopName(n || 'Shop'));
    dataService.getUsers().then(users => {
      const owner = (users||[]).find(u => ['shop owner','owner'].includes((u.role||'').toLowerCase()));
      setOwnerUser(owner || null);
    });
    const handleVisibility = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { applyFilters(); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, appliedDateFilter, appliedSelectedDate, appliedStartDate, appliedEndDate, appliedTypeFilter]);

  const load = async () => {
    const data = await dataService.getWithdrawals();
    // Sort oldest → newest to calculate running balance correctly
    const sorted = [...(data || [])].sort((a, b) => new Date(a.date||0) - new Date(b.date||0));
    // Attach running balance
    let running = 0;
    const withBalance = sorted.map(e => {
      running += e.type === 'out' ? e.amount : -e.amount;
      return { ...e, balance: running };
    });
    setEntries([...withBalance].reverse()); // newest first for display
  };

  const applyFilters = () => {
    let f = [...entries];

    // Type filter
    if (appliedTypeFilter !== 'all') f = f.filter(e => e.type === appliedTypeFilter);

    // Date filter
    const today    = toMidnight(new Date());
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
    if (appliedDateFilter === 'today')
      f = f.filter(e => { const d = resolveDate(e); return d && d >= today && d < tomorrow; });
    if (appliedDateFilter === 'single' && appliedSelectedDate) {
      const s = toMidnight(new Date(appliedSelectedDate)), ex = new Date(s); ex.setDate(ex.getDate()+1);
      f = f.filter(e => { const d = resolveDate(e); return d && d >= s && d < ex; });
    }
    if (appliedDateFilter === 'range' && appliedStartDate && appliedEndDate) {
      const s = toMidnight(new Date(appliedStartDate));
      const ex = new Date(toMidnight(new Date(appliedEndDate))); ex.setDate(ex.getDate()+1);
      f = f.filter(e => { const d = resolveDate(e); return d && d >= s && d < ex; });
    }

    setFiltered(f);
  };

  // ── Filter helpers ────────────────────────────────────────────────────
  const isFilterComplete = () => {
    if (dateFilter === 'today')  return true;
    if (dateFilter === 'single') return !!selectedDate;
    if (dateFilter === 'range')  return !!(startDate && endDate);
    return false;
  };
  const hasChanged = () =>
    typeFilter !== appliedTypeFilter ||
    dateFilter !== appliedDateFilter ||
    selectedDate !== appliedSelectedDate ||
    startDate !== appliedStartDate ||
    endDate !== appliedEndDate;
  const showApply = isFilterComplete() && hasChanged();

  const handleClose = () => {
    setTypeFilter(appliedTypeFilter);
    setDateFilter(appliedDateFilter);
    setSelectedDate(appliedSelectedDate);
    setStartDate(appliedStartDate);
    setEndDate(appliedEndDate);
    setShowFilters(false);
  };
  const handleApply = () => {
    setAppliedTypeFilter(typeFilter);
    setAppliedDateFilter(dateFilter);
    setAppliedSelectedDate(selectedDate);
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
    setShowFilters(false);
  };

  // ── Running totals for header cards ──────────────────────────────────
  const totalOut = filtered.filter(e=>e.type==='out').reduce((a,e)=>a+e.amount,0);
  const totalIn  = filtered.filter(e=>e.type==='in').reduce((a,e)=>a+e.amount,0);
  // Current overall balance (using ALL entries, not just filtered)
  const overallBalance = entries.length > 0 ? entries[0].balance : 0; // entries[0] is newest

  // ── Filter title ──────────────────────────────────────────────────────
  const getTitle = () => {
    const typeMap = { all:'All Withdrawals', out:'Taken from Shop', in:'Returned to Shop' };
    const label = typeMap[appliedTypeFilter] || 'All Withdrawals';
    if (appliedDateFilter === 'today') return `${label} Today`;
    if (appliedDateFilter === 'single' && appliedSelectedDate) {
      const y = toMidnight(new Date()); y.setDate(y.getDate()-1);
      const isYest = toMidnight(new Date(appliedSelectedDate)).getTime() === y.getTime();
      if (isYest) return `${label} Yesterday`;
      return `${label} on ${new Date(appliedSelectedDate).toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'})}`;
    }
    if (appliedDateFilter === 'range' && appliedStartDate && appliedEndDate)
      return `${label} from ${new Date(appliedStartDate).toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit'})} to ${new Date(appliedEndDate).toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'})}`;
    return `${label} Today`;
  };

  return (
    <div className="wd-container">

      {/* ── Filter bar — above cards ── */}
      <div className="wd-filter-row">
        <button
          className={`wd-filter-btn${showFilters ? ' active' : ''}`}
          onClick={() => { if (!showFilters) setShowFilters(true); else if (showApply) handleApply(); else handleClose(); }}
        >
          {showFilters ? (showApply ? 'Apply' : 'Close') : 'Filter'}
        </button>
        {!showFilters && <span className="wd-filter-label">{getTitle()}</span>}
      </div>

      {showFilters && (
        <div className="filter-modal-overlay" onClick={handleClose}>
          <div className="filter-modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="filter-modal-handle"/>
            <div className="filter-modal-title">Filter Withdrawals</div>
          {/* Type */}
          <div className="wd-filter-section">
            <div className="wd-filter-section-label">Type</div>
            <div className="wd-filter-btns">
              {[['all','All'],['out','Taken from Shop'],['in','Returned to Shop']].map(([val,lbl])=>(
                <button key={val} className={`wd-ftype-btn${typeFilter===val?' active':''}`}
                  onClick={()=>setTypeFilter(val)}>{lbl}</button>
              ))}
            </div>
          </div>
          {/* Date */}
          <div className="wd-filter-section">
            <div className="wd-filter-section-label">Date</div>
            <div className="wd-filter-btns">
              {[['today','Today'],['single','Single Date'],['range','Date Range']].map(([val,lbl])=>(
                <button key={val} className={`wd-ftype-btn${dateFilter===val?' active':''}`}
                  onClick={()=>setDateFilter(val)}>{lbl}</button>
              ))}
            </div>
            {dateFilter === 'single' && (
              <input type="date" className="wd-date-input" value={selectedDate} max={todayStr()}
                onChange={e=>setSelectedDate(e.target.value)} />
            )}
            {dateFilter === 'range' && (
              <div className="wd-date-range">
                <input type="date" className="wd-date-input" value={startDate} max={todayStr()}
                  onChange={e=>setStartDate(e.target.value)} placeholder="From" />
                <span className="wd-date-to">to</span>
                <input type="date" className="wd-date-input" value={endDate} min={startDate||undefined} max={todayStr()}
                  onChange={e=>setEndDate(e.target.value)} placeholder="To" />
              </div>
            )}
          </div>
            <div className="filter-modal-actions">
              <button className="filter-modal-cancel" onClick={handleClose}>Cancel</button>
              <button className="filter-modal-apply" onClick={handleApply}>Apply Filter</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Summary cards ── */}
      <div className="wd-summary-row">
        <div className="wd-summary-card wd-card-balance">
          <div className="wd-card-label">Balance Outside Shop</div>
          <div className="wd-card-value">{fmt(overallBalance)}</div>
        </div>
        <div className="wd-summary-card wd-card-out">
          <div className="wd-card-label">Returned to Shop</div>
          <div className="wd-card-value">{fmt(totalOut)}</div>
        </div>
        <div className="wd-summary-card wd-card-in">
          <div className="wd-card-label">{ownerUser ? `Handed to ${(ownerUser.gender||'').toLowerCase()==='female'?'Ms':'Mr'} ${ownerUser.fullName||ownerUser.name||'Owner'}` : 'Handed to Owner'}</div>
          <div className="wd-card-value">{fmt(totalIn)}</div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="wd-table-header">
        <span className="wd-table-title wd-table-title-styled">{getTitle()}</span>
        <span className="wd-table-count">{filtered.length} record{filtered.length!==1?'s':''}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="wd-empty">
          <p>No withdrawal records found.</p>
          <p className="wd-empty-hint">
            Records appear here automatically when the shop is closed (money taken out)
            or opened with a float (money returned). Owner drawings from Expenses
            and manual entries from Cash at Shop also appear here.
          </p>
        </div>
      ) : (
        <div className="wd-table-wrap">
          <table className="wd-table">
            <thead>
              <tr>
                <th>Date / Time</th>
                <th>Description</th>
                <th>Type</th>
                <th className="wd-col-right">Amount</th>
                <th className="wd-col-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(entry => (
                <tr key={entry.id}>
                  <td className="wd-col-date">
                    <div>{formatDate(entry)}</div>
                    <div className="wd-time">{formatTime(entry)}</div>
                  </td>
                  <td className="wd-col-desc">{entry.description || '—'}</td>
                  <td>
                    <span className={`wd-type-badge ${entry.type === 'out' ? 'wd-badge-out' : 'wd-badge-in'}`}>
                      {entry.type === 'out' ? 'OUT' : 'IN'}
                    </span>
                  </td>
                  <td className={`wd-col-right wd-amount ${entry.type === 'out' ? 'wd-amount-out' : 'wd-amount-in'}`}>
                    {entry.type === 'out' ? '-' : '+'}{fmt(entry.amount)}
                  </td>
                  <td className="wd-col-right wd-balance">{fmt(entry.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
