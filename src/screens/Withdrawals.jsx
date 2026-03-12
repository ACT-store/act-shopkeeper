import React, { useState, useEffect } from 'react';
import dataService from '../services/dataService';
import { useCurrency } from '../hooks/useCurrency';
import { formatDate as fmtDate, formatTime as fmtTime, toSortKey } from '../utils/formatDateTime';
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
  return fmtDate(entry.date || entry.createdAt);
}

function formatTime(entry) {
  return fmtTime(entry.date || entry.createdAt);
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
    const sorted = [...(data || [])].sort((a, b) => toSortKey(a.date) - toSortKey(b.date));
    // Attach running balance
    let running = 0;
    const withBalance = sorted.map(e => {
      // Credit entries: owner received money (manual withdrawal or shop-close handover)
      // Debit entries:  owner returned money to shop or paid a supplier
      running += e.type === 'out' ? e.amount : -e.amount;
      return { ...e, balance: running };
      // balance > 0 = Cr — owner still holds shop money (normal)
      // balance < 0 = Dr — owner has over-returned, shop owes owner
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

  // ── Owner's Withdrawal Account totals ───────────────────────────────
  // This is the owner's personal withdrawal account (liability account).
  // Credits increase it — money paid OUT to the owner, either:
  //   • manually recorded as a withdrawal
  //   • automatically when the shop closes (all cash at shop handed to owner)
  // Debits decrease it — money the owner returns to the shop or pays to suppliers.
  //   type='out' → CREDIT (owner received money — increases what they owe the shop)
  //   type='in'  → DEBIT  (owner returned money — decreases what they owe the shop)
  // Cr balance = owner still holds money that belongs to the shop (normal state)
  // Dr balance = owner has returned more than taken (shop owes owner)
  const totalCredit = filtered.filter(e=>e.type==='out').reduce((a,e)=>a+e.amount,0); // paid to owner
  const totalDebit  = filtered.filter(e=>e.type==='in').reduce((a,e)=>a+e.amount,0);  // returned by owner
  // Running balance = total still held by owner outside the shop (all entries, not filtered)
  const overallBalance = entries.length > 0 ? entries[0].balance : 0;

  // ── Filter title ──────────────────────────────────────────────────────
  const getTitle = () => {
    const typeMap = { all:"Owner's Account", out:'Credits (Taken from Shop)', in:'Debits (Returned to Shop)' };
    const label = typeMap[appliedTypeFilter] || "Owner's Account";
    if (appliedDateFilter === 'today') return `${label} — Today`;
    if (appliedDateFilter === 'single' && appliedSelectedDate) {
      const y = toMidnight(new Date()); y.setDate(y.getDate()-1);
      const isYest = toMidnight(new Date(appliedSelectedDate)).getTime() === y.getTime();
      if (isYest) return `${label} — Yesterday`;
      return `${label} — ${new Date(appliedSelectedDate).toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'})}`;
    }
    if (appliedDateFilter === 'range' && appliedStartDate && appliedEndDate)
      return `${label} — ${new Date(appliedStartDate).toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit'})} to ${new Date(appliedEndDate).toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'})}`;
    return `${label} — Today`;
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
              {[['all','All'],['out','Credit (Taken from Shop)'],['in','Debit (Returned to Shop)']].map(([val,lbl])=>(
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

      {/* ── Summary cards — owner's account perspective ── */}
      <div className="wd-summary-row">
        <div className="wd-summary-card wd-card-balance">
          <div className="wd-card-label">Balance Owed to Shop</div>
          <div className="wd-card-value">{fmt(overallBalance)}</div>
        </div>
        <div className="wd-summary-card wd-card-debit">
          <div className="wd-card-label">Total Debit (Returned)</div>
          <div className="wd-card-value">{fmt(totalDebit)}</div>
        </div>
        <div className="wd-summary-card wd-card-credit">
          <div className="wd-card-label">Total Credit (Taken)</div>
          <div className="wd-card-value">{fmt(totalCredit)}</div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="wd-table-header">
        <span className="wd-table-title wd-table-title-styled">{getTitle()}</span>
        <span className="wd-table-count">{filtered.length} record{filtered.length!==1?'s':''}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="wd-empty">
          <p>No records found for this period.</p>
          <p className="wd-empty-hint">
            This is the owner's personal withdrawal account. It is <strong>credited</strong> when the owner
            takes money from the shop — either as a manual withdrawal or automatically when
            the shop closes and cash is handed to the owner. Each credit <strong>increases the balance</strong>,
            meaning the owner holds more of the shop's money.<br/><br/>
            It is <strong>debited</strong> when the owner returns money to the shop or pays a supplier on
            the shop's behalf. Each debit <strong>reduces the balance</strong>.<br/><br/>
            A <strong>Cr balance</strong> means the owner still holds money that belongs to the shop — the normal state.
            A <strong>Dr balance</strong> means the owner has returned more than they took, so the shop owes the owner.
          </p>
        </div>
      ) : (
        <div className="wd-table-wrap">
          <table className="wd-table">
            <thead>
              <tr>
                <th className="wd-col-date">Date / Time</th>
                <th className="wd-col-desc">Description</th>
                <th className="wd-col-money wd-col-debit">Debit</th>
                <th className="wd-col-money wd-col-credit">Credit</th>
                <th className="wd-col-money wd-col-balance">Balance</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(entry => {
                // type='out' = taken from shop → CREDIT (increases withdrawal account)
                // type='in'  = returned to shop → DEBIT (decreases withdrawal account)
                const isCredit = entry.type === 'out';
                return (
                  <tr key={entry.id} className={isCredit ? 'wd-row-credit' : 'wd-row-debit'}>
                    <td className="wd-col-date">
                      <div className="wd-date-main">{formatDate(entry)}</div>
                      <div className="wd-time">{formatTime(entry)}</div>
                    </td>
                    <td className="wd-col-desc">{entry.description || '—'}</td>
                    <td className="wd-col-money wd-col-debit">
                      {!isCredit ? <span className="wd-debit-val">{fmt(entry.amount)}</span> : <span className="wd-nil">—</span>}
                    </td>
                    <td className="wd-col-money wd-col-credit">
                      {isCredit ? <span className="wd-credit-val">{fmt(entry.amount)}</span> : <span className="wd-nil">—</span>}
                    </td>
                    <td className="wd-col-money wd-col-balance">
                      <span className={entry.balance > 0 ? 'wd-bal-cr' : entry.balance < 0 ? 'wd-bal-dr' : 'wd-bal-zero'}>
                        {fmt(Math.abs(entry.balance))}
                        {entry.balance > 0 && <span className="wd-bal-tag"> Cr</span>}
                        {entry.balance < 0 && <span className="wd-bal-tag"> Dr</span>}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="wd-tfoot-row">
                <td colSpan={2} className="wd-tfoot-label">TOTALS</td>
                <td className="wd-col-money wd-col-debit"><span className="wd-debit-val wd-total-val">{fmt(totalDebit)}</span></td>
                <td className="wd-col-money wd-col-credit"><span className="wd-credit-val wd-total-val">{fmt(totalCredit)}</span></td>
                <td className="wd-col-money wd-col-balance">
                  <span className={overallBalance > 0 ? 'wd-bal-cr wd-total-val' : overallBalance < 0 ? 'wd-bal-dr wd-total-val' : 'wd-bal-zero wd-total-val'}>
                    {fmt(Math.abs(overallBalance))}
                    {overallBalance > 0 && <span className="wd-bal-tag"> Cr</span>}
                    {overallBalance < 0 && <span className="wd-bal-tag"> Dr</span>}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
