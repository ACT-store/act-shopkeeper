import React, { useState, useEffect, useRef } from 'react';
import { useValidation, ValidationNote, errorBorder } from '../utils/validation.jsx';
import {
  Globe, Moon, Sun, Bell, Clock,
  ClipboardList, Wallet, X, Check, Plus, Trash2,
} from 'lucide-react';
import dataService from '../services/dataService';
import {
  scheduleCreditorReminders,
  cancelCreditorReminders,
  scheduleDebtReminders,
  cancelDebtReminders,
} from '../services/notificationService';
import { useCurrency } from '../hooks/useCurrency';
import './Settings.css';

// ─────────────────────────────────────────────────────────────
// Translations
// ─────────────────────────────────────────────────────────────
const T = {
  en: {
    title: 'Settings',
    language: 'Language',
    appearance: 'Appearance & Display',
    darkMode: 'Dark Mode',
    lightMode: 'Light Mode',
    notifications: 'Notification Preferences',
    notifDebtReminder: 'Debt reminder',
    notifDebtReminderDesc: 'Remind debtor a day before due date of debt repayment',
    notifLowStock: 'Low stock alert',
    notifLowStockDesc: 'Notify when a product reaches 5 items in stock',
    notifDailySales: 'Daily sales milestone',
    notifDailySalesDesc: 'Notify when daily sales reaches an increment of $500',
    notifCreditorOwed: 'Creditor payment reminder',
    notifCreditorOwedDesc: 'Ring alarm at 8:30 AM, 12:00 PM and 4:30 PM reminding you of outstanding amounts owed to creditors',
    notifReceiptReminder: 'Receipt / Ref number reminder',
    notifReceiptReminderDesc: 'Alert 2 hours after an expense is saved if a receipt or invoice reference number was not added',
    cancel: 'Cancel',
    saleDate: 'Sale Date',
    cashDate: 'Entry Date',
    addItem: 'Add Item',
    items: 'Products',
    total: 'Total',
    paymentType: 'Payment Type',
    cash: 'Cash',
    credit: 'Credit',
    description: 'Description',
    amount: 'Amount',
    type: 'Type',
    cashIn: 'Cash In',
    cashOut: 'Cash Out',
    recordSale: 'Record Sale',
    recordCredit: 'Record Credit',
    recordCash: 'Record Entry',
    qty: 'Qty',
    searchItem: 'Search item…',
    debtorName: 'Debtor Name',
    repayDate: 'Repayment Date',
    selectDebtor: 'Select debtor…',
    systemStartHint: 'Only dates before this system was first used are selectable.',
  },
};

const LANG_NAMES = { en: 'English', ki: 'Kiribati' };
const KIRIBATI_COMING_SOON = 'This language setting is still under development and will be available online soon.';

// ── Helpers ────────────────────────────────────────────────────────────────
const dateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

const yesterdayStr = () => {
  const d = new Date(); d.setDate(d.getDate() - 1); return dateStr(d);
};

const getSystemStartDate = async () => {
  const stored = localStorage.getItem('ks_system_start_date');
  if (stored) return stored;
  try {
    const [sales, entries] = await Promise.all([
      dataService.getSales(),
      dataService.getCashEntries(),
    ]);
    const allDates = [
      ...(sales || []).map(s => s.date || s.createdAt),
      ...(entries || []).map(e => e.date || e.createdAt),
    ].filter(Boolean).map(d => new Date(d).getTime()).filter(t => !isNaN(t));
    if (allDates.length === 0) return yesterdayStr();
    const earliest = new Date(Math.min(...allDates));
    const result = dateStr(earliest);
    localStorage.setItem('ks_system_start_date', result);
    return result;
  } catch { return yesterdayStr(); }
};

// ─────────────────────────────────────────────────────────────
// Dropup component — opens ABOVE the trigger button
// ─────────────────────────────────────────────────────────────
function Dropup({ options, value, onSelect, placeholder = 'Please select description' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = options.find(o => o.key === value);

  return (
    <div className="st-dropup-wrapper" ref={ref}>
      {open && (
        <div className="st-dropup-list">
          <div className="st-dropup-placeholder">{placeholder}</div>
          {options.map(opt => (
            <div
              key={opt.key}
              className={`st-dropup-item${value === opt.key ? ' st-dropup-selected' : ''}`}
              onMouseDown={() => { onSelect(opt.key); setOpen(false); }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        className={`st-dropup-trigger${open ? ' st-dropup-open' : ''}${value ? ' st-dropup-has-value' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        <span className={value ? '' : 'st-dropup-placeholder-text'}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="st-dropup-arrow">{open ? '▲' : '▼'}</span>
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Purchase Cargo child modal — full-screen catalogue
// ─────────────────────────────────────────────────────────────
function PurchaseCargoModal({ onConfirm, onCancel }) {
  const [rows, setRows] = useState([{ id: 1, qty: '', description: '', costPrice: '' }]);
  const nextId = useRef(2);

  const addRow = () => {
    setRows(prev => [...prev, { id: nextId.current++, qty: '', description: '', costPrice: '' }]);
  };
  const removeRow = (id) => setRows(prev => prev.filter(r => r.id !== id));
  const updateRow = (id, field, val) => setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r));

  const total = rows.reduce((sum, r) => {
    const q = parseFloat(r.qty) || 0;
    const c = parseFloat(r.costPrice) || 0;
    return sum + q * c;
  }, 0);

  const handleConfirm = () => {
    const valid = rows.filter(r => r.description.trim() && parseFloat(r.qty) > 0 && parseFloat(r.costPrice) >= 0);
    if (valid.length === 0) { alert('Please add at least one item with description and quantity.'); return; }
    onConfirm(valid.map(r => ({
      qty: parseFloat(r.qty),
      description: r.description.trim(),
      costPrice: parseFloat(r.costPrice) || 0,
      subtotal: (parseFloat(r.qty) || 0) * (parseFloat(r.costPrice) || 0),
    })), total);
  };

  return (
    <div className="st-cargo-overlay">
      <div className="st-cargo-modal">
        <div className="st-cargo-header">
          <h3>Purchase Details</h3>
          <button className="st-modal-close" onClick={onCancel}><X size={20}/></button>
        </div>
        <div className="st-cargo-body">
          <div className="st-cargo-col-headers">
            <span>Qty</span>
            <span>Item Description</span>
            <span>Cost Price ($)</span>
            <span>Subtotal</span>
            <span></span>
          </div>
          {rows.map(row => (
            <div key={row.id} className="st-cargo-row">
              <input
                type="number" className="st-cargo-input st-cargo-qty" placeholder="0"
                value={row.qty} min="0" step="1"
                onChange={e => updateRow(row.id, 'qty', e.target.value)}
              />
              <input
                type="text" className="st-cargo-input st-cargo-desc" placeholder="Item name…"
                value={row.description}
                onChange={e => updateRow(row.id, 'description', e.target.value)}
              />
              <input
                type="number" className="st-cargo-input st-cargo-cost" placeholder="0.00"
                value={row.costPrice} min="0" step="0.01"
                onChange={e => updateRow(row.id, 'costPrice', e.target.value)}
              />
              <span className="st-cargo-subtotal">
                ${((parseFloat(row.qty)||0)*(parseFloat(row.costPrice)||0)).toFixed(2)}
              </span>
              {rows.length > 1 && (
                <button className="st-cargo-remove" onClick={() => removeRow(row.id)}>
                  <Trash2 size={14}/>
                </button>
              )}
            </div>
          ))}
          <button className="st-cargo-add-row" onClick={addRow}>
            <Plus size={15}/> Add Next Product
          </button>
        </div>
        <div className="st-cargo-footer">
          <div className="st-cargo-total">
            Total Cost: <strong>{fmt(total)}</strong>
          </div>
          <div className="st-cargo-actions">
            <button className="st-btn-cancel" onClick={onCancel}>Cancel</button>
            <button className="st-btn-save" onClick={handleConfirm}>Confirm Items</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Unrecorded Sales Modal
// ─────────────────────────────────────────────────────────────
function ForgottenSaleModal({ t, onClose, onSaved }) {
  const [goods, setGoods]         = useState([]);
  const [debtors, setDebtors]     = useState([]);
  const [saleDate, setSaleDate]   = useState('');
  const [payType, setPayType]     = useState('cash');
  const [cart, setCart]           = useState([]);
  const [qtyInputs, setQtyInputs] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [debtorId, setDebtorId]   = useState('');
  const [repayDate, setRepayDate] = useState('');
  const [saving, setSaving]       = useState(false);
  const [maxDate]                 = useState('2026-02-22');
  const { fieldErrors, showError, clearFieldError } = useValidation();

  useEffect(() => {
    dataService.getGoods().then(g => setGoods(g || []));
    dataService.getDebtors().then(d => setDebtors(d || []));

    // Subscribe to real-time goods changes from Firebase listener
    const unsubscribe = dataService.onGoodsChange((updatedGoods) => {
      setGoods(updatedGoods || []);
    });
    return () => unsubscribe();
  }, []);

  // Repayment date: min = saleDate, max = saleDate + 14 days
  const repayMin = saleDate || '';
  const repayMax = (() => {
    if (!saleDate) return '';
    const d = new Date(saleDate + 'T12:00:00');
    d.setDate(d.getDate() + 14);
    return dateStr(d);
  })();

  const smartSearch = (term) => {
    if (!term.trim()) return [];
    const t2 = term.toLowerCase();
    return goods.filter(g => {
      const w = (g.name || '').toLowerCase().split(/\s+/);
      return w[0]?.startsWith(t2) || (w[1] && w[1].startsWith(t2)) || (w[2] && w[2].startsWith(t2));
    }).slice(0, 8);
  };
  const searchResults = smartSearch(searchTerm);

  const addToCart = (good) => {
    setCart(prev => {
      const ex = prev.find(i => i.id === good.id);
      if (ex) {
        const newQty = ex.qty + 1;
        setQtyInputs(q => ({ ...q, [good.id]: String(newQty) }));
        return prev.map(i => i.id === good.id ? { ...i, qty: newQty } : i);
      }
      setQtyInputs(q => ({ ...q, [good.id]: '1' }));
      return [...prev, { ...good, qty: 1 }];
    });
    setSearchTerm(''); setShowSearch(false);
  };

  const handleQtyChange = (id, raw) => {
    setQtyInputs(q => ({ ...q, [id]: raw }));
    const q = parseInt(raw, 10);
    if (!isNaN(q) && q >= 1) setCart(prev => prev.map(i => i.id === id ? { ...i, qty: q } : i));
  };

  const handleQtyBlur = (id) => {
    const raw = qtyInputs[id];
    const q = parseInt(raw, 10);
    if (isNaN(q) || q < 1) {
      setQtyInputs(inp => ({ ...inp, [id]: '1' }));
      setCart(prev => prev.map(i => i.id === id ? { ...i, qty: 1 } : i));
    }
  };

  const removeItem = (id) => {
    setCart(prev => prev.filter(i => i.id !== id));
    setQtyInputs(q => { const n = { ...q }; delete n[id]; return n; });
  };
  const total = cart.reduce((s, i) => s + (i.price || 0) * i.qty, 0);

  const handleSave = async () => {
    if (!saleDate) return showError('fs_date', 'Please select a sale date');
    if (cart.length === 0) return showError('fs_cart', 'Please add at least one item');
    if (payType === 'credit' && !debtorId) return showError('fs_debtor', 'Please select a debtor');
    if (payType === 'credit' && !repayDate) return showError('fs_repay', 'Please enter a repayment date');
    setSaving(true);
    try {
      const debtor = debtors.find(d => d.id === debtorId);
      const localNoonDate = new Date(saleDate + 'T12:00:00');
      await dataService.addSale({
        items: cart.map(i => ({ id: i.id, name: i.name, price: i.price, quantity: i.qty, subtotal: i.price * i.qty })),
        total,
        paymentType: payType,
        customerName: debtor?.name || debtor?.customerName || '',
        customerPhone: debtor?.phone || '',
        debtorId: payType === 'credit' ? debtorId : null,
        repaymentDate: payType === 'credit' ? repayDate : '',
        isDebt: payType === 'credit',
        date: localNoonDate.toISOString(),
        isUnrecorded: true,
      });
      onSaved();
    } catch (e) { console.error(e); alert('Failed to save. Please try again.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="st-modal-overlay">
      <div className="st-modal">
        <div className="st-modal-header">
          <h3>{t.forgottenSale}</h3>
          <button className="st-modal-close" onClick={onClose}><X size={20}/></button>
        </div>
        <div className="st-modal-body">

          <div className="st-field">
            <label>{t.saleDate} *</label>
            <input type="date" max={maxDate} value={saleDate} data-field="fs_date"
              style={errorBorder('fs_date', fieldErrors)}
              onChange={e => { setSaleDate(e.target.value); setRepayDate(''); clearFieldError('fs_date'); }} className="st-input" />
            <ValidationNote field="fs_date" errors={fieldErrors} />
            <span className="st-field-hint">{t.systemStartHint}</span>
          </div>

          <div className="st-field">
            <label>{t.paymentType}</label>
            <div className="st-toggle-row">
              {['cash','credit'].map(p => (
                <button key={p} className={`st-toggle-btn${payType===p?' st-active':''}`}
                  onClick={() => setPayType(p)}>
                  {p === 'cash' ? t.cash : t.credit}
                </button>
              ))}
            </div>
          </div>

          {payType === 'credit' && (
            <>
              <div className="st-field">
                <label>{t.debtorName} *</label>
                <select className="st-input" value={debtorId} data-field="fs_debtor"
                  style={errorBorder('fs_debtor', fieldErrors)}
                  onChange={e => { setDebtorId(e.target.value); clearFieldError('fs_debtor'); }}>
                  <option value="">{t.selectDebtor}</option>
                  {debtors.map(d => (
                    <option key={d.id} value={d.id}>{d.name || d.customerName}</option>
                  ))}
                </select>
                <ValidationNote field="fs_debtor" errors={fieldErrors} />
              </div>
              <div className="st-field">
                <label>{t.repayDate} *</label>
                <input
                  type="date"
                  className="st-input"
                  value={repayDate}
                  min={repayMin}
                  max={repayMax}
                  disabled={!saleDate}
                  data-field="fs_repay"
                  style={errorBorder('fs_repay', fieldErrors)}
                  onChange={e => { setRepayDate(e.target.value); clearFieldError('fs_repay'); }}
                />
                <ValidationNote field="fs_repay" errors={fieldErrors} />
                {!saleDate && <span className="st-field-hint">Select a sale date first to enable repayment date.</span>}
                {saleDate && <span className="st-field-hint">Date range: {saleDate} to {repayMax} (sale date + 14 days)</span>}
              </div>
            </>
          )}

          <div className="st-field" style={{ position: 'relative' }}>
            <label>{t.addItem}</label>
            <input type="text" className="st-input" placeholder={t.searchItem}
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setShowSearch(true); }}
              onFocus={() => setShowSearch(true)}
              onBlur={() => setTimeout(() => setShowSearch(false), 200)} />
            {showSearch && searchResults.length > 0 && (
              <div className="st-search-dropdown">
                {searchResults.map(g => (
                  <div key={g.id} className="st-search-item" onMouseDown={() => addToCart(g)}>
                    <span>{g.name}</span>
                    <span className="st-search-price">{fmt((g.price||0))}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {cart.length > 0 && (
            <div className="st-cart">
              <div className="st-cart-header">
                <span>{t.items}</span><span>{t.qty}</span><span>Selling Price</span><span></span>
              </div>
              {cart.map(item => (
                <div key={item.id} className="st-cart-row">
                  <span className="st-cart-name">{item.name}</span>
                  <input
                    type="number" className="st-cart-qty"
                    value={qtyInputs[item.id] ?? String(item.qty)} min="1"
                    onChange={e => handleQtyChange(item.id, e.target.value)}
                    onBlur={() => handleQtyBlur(item.id)}
                    onFocus={e => e.target.select()}
                  />
                  <span className="st-cart-price">{fmt((item.price * item.qty))}</span>
                  <button className="st-cart-remove" onClick={() => removeItem(item.id)}>
                    <X size={14}/>
                  </button>
                </div>
              ))}
              <div className="st-cart-total">
                <span>{t.total}</span>
                <span className="st-cart-total-val">{fmt(total)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="st-modal-footer">
          <button className="st-btn-cancel" onClick={onClose}>{t.cancel}</button>
          <button className="st-btn-save" onClick={handleSave} disabled={saving}>
            {saving ? '…' : payType === 'credit' ? t.recordCredit : t.recordSale}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Unrecorded Cash Entry Modal
// Enhanced with From/Paid To fields, dropup descriptions,
// and Purchase Cargo child modal
// ─────────────────────────────────────────────────────────────
function ForgottenCashModal({ t, onClose, onSaved }) {
  const [cashDate, setCashDate]     = useState('');
  const [cashType, setCashType]     = useState('in');
  const [amount, setAmount]         = useState('');
  const [fromName, setFromName]     = useState('');   // Cash IN: lender name
  const [paidTo, setPaidTo]         = useState('');   // Cash OUT: receiver name
  const [descKey, setDescKey]       = useState('');   // selected dropup key
  const [cargoItems, setCargoItems] = useState([]);   // filled from PurchaseCargoModal
  const [cargoTotal, setCargoTotal] = useState(0);
  const [showCargo, setShowCargo]   = useState(false);
  const [saving, setSaving]         = useState(false);
  const [maxDate]                   = useState('2026-02-22');
  const { fieldErrors, showError, clearFieldError } = useValidation();

  // Reset per-type fields when type changes
  const switchType = (type) => {
    setCashType(type);
    setDescKey('');
    setFromName('');
    setPaidTo('');
    setCargoItems([]);
    setCargoTotal(0);
    setAmount('');
  };

  // Cash IN description options
  const IN_OPTIONS = [
    { key: 'float',   label: 'Float'   },
    { key: 'capital', label: 'Capital' },
  ];

  // Cash OUT description options
  const OUT_OPTIONS = [
    { key: 'withdrawal', label: 'Withdrawal for personal use' },
    { key: 'cargo',      label: 'Purchases cargo'             },
    { key: 'bill',       label: 'Pay bill'                    },
  ];

  // Build the note string that will appear in CASH RECORD Description column
  const buildNote = () => {
    if (cashType === 'in') {
      const name = fromName.trim() || 'Lender';
      if (descKey === 'float')   return `From ${name} for additional FLOAT`;
      if (descKey === 'capital') return `From ${name} - additional capital contribution`;
    } else {
      const name = paidTo.trim() || 'Receiver';
      if (descKey === 'withdrawal') return `Paid to ${name} for personal withdrawal`;
      if (descKey === 'bill')       return `Paid to ${name} - bills`;
      if (descKey === 'cargo') {
        if (cargoItems.length > 0) return `Paid to ${name} to purchase cargo`;
        return ''; // not complete until cargo confirmed
      }
    }
    return '';
  };

  const note = buildNote();

  // When cargo option is selected, open the cargo child modal
  const handleDescSelect = (key) => {
    setDescKey(key);
    setCargoItems([]);
    setCargoTotal(0);
    if (key === 'cargo') setShowCargo(true);
  };

  const handleCargoConfirm = (items, total) => {
    setCargoItems(items);
    setCargoTotal(total);
    setAmount(total.toFixed(2));
    setShowCargo(false);
  };

  const handleSave = async () => {
    if (!cashDate) return showError('fc_date', 'Please select an entry date');
    const amt = descKey === 'cargo' ? cargoTotal : parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return showError('fc_amount', 'Please enter a valid amount');
    if (!note) return showError('fc_desc', 'Please complete all description fields');
    if (cashType === 'in' && !fromName.trim()) return showError('fc_from', "Please enter the lender's name");
    if (cashType === 'out' && descKey !== 'cargo' && !paidTo.trim()) return showError('fc_paidto', "Please enter the receiver's name");
    if (cashType === 'out' && descKey === 'cargo' && cargoItems.length === 0) return showError('fc_cargo', 'Please add cargo items');

    setSaving(true);
    try {
      const localNoonDate = new Date(cashDate + 'T12:00:00');

      if (cashType === 'out' && descKey === 'cargo') {
        // Save as a full Purchase record (which auto-creates Cash OUT)
        await dataService.addPurchase({
          supplierName: paidTo.trim() || 'Supplier',
          date: localNoonDate.toISOString(),
          items: cargoItems,
          total: cargoTotal,
          notes: note,
          isUnrecorded: true,
        });
      } else {
        await dataService.addCashEntry({
          type: cashType,
          amount: amt,
          note,
          date: localNoonDate.toISOString(),
          source: 'manual_backdated',
          isUnrecorded: true,
        });
      }
      onSaved();
    } catch (e) { console.error(e); alert('Failed to save. Please try again.'); }
    finally { setSaving(false); }
  };

  const cargoAmountDisplay = cargoItems.length > 0
    ? `${fmt(cargoTotal)} (${cargoItems.length} item${cargoItems.length !== 1 ? 's' : ''})`
    : null;

  return (
    <div className="st-modal-overlay">
      <div className="st-modal st-modal-sm">
        <div className="st-modal-header">
          <h3>{t.forgottenCash}</h3>
          <button className="st-modal-close" onClick={onClose}><X size={20}/></button>
        </div>
        <div className="st-modal-body">

          {/* Date */}
          <div className="st-field">
            <label>{t.cashDate} *</label>
            <input type="date" max={maxDate} value={cashDate} data-field="fc_date"
              style={errorBorder('fc_date', fieldErrors)}
              onChange={e => { setCashDate(e.target.value); clearFieldError('fc_date'); }} className="st-input" />
            <ValidationNote field="fc_date" errors={fieldErrors} />
            <span className="st-field-hint">{t.systemStartHint}</span>
          </div>

          {/* Type toggle */}
          <div className="st-field">
            <label>{t.type}</label>
            <div className="st-toggle-row">
              {['in','out'].map(tp => (
                <button key={tp} className={`st-toggle-btn${cashType===tp?' st-active':''}`}
                  onClick={() => switchType(tp)}>
                  {tp === 'in' ? t.cashIn : t.cashOut}
                </button>
              ))}
            </div>
          </div>

          {/* Amount — hidden for cargo (auto-set from cargo total) */}
          {!(cashType === 'out' && descKey === 'cargo') && (
            <div className="st-field">
              <label>{t.amount} *</label>
              <input type="number" className="st-input" placeholder="0.00" data-field="fc_amount"
                style={errorBorder('fc_amount', fieldErrors)}
                value={amount} onChange={e => { setAmount(e.target.value); clearFieldError('fc_amount'); }} min="0.01" step="0.01" />
              <ValidationNote field="fc_amount" errors={fieldErrors} />
            </div>
          )}

          {/* Cash IN: From field */}
          {cashType === 'in' && (
            <div className="st-field">
              <label>From: *</label>
              <input type="text" className="st-input" data-field="fc_from"
                style={errorBorder('fc_from', fieldErrors)}
                placeholder="Please enter name of lender"
                value={fromName} onChange={e => { setFromName(e.target.value); clearFieldError('fc_from'); }} />
              <ValidationNote field="fc_from" errors={fieldErrors} />
            </div>
          )}

          {/* Cash OUT: Paid to field */}
          {cashType === 'out' && (
            <div className="st-field">
              <label>Paid to: *</label>
              <input type="text" className="st-input" data-field="fc_paidto"
                style={errorBorder('fc_paidto', fieldErrors)}
                placeholder="Name of receiver/supplier"
                value={paidTo} onChange={e => { setPaidTo(e.target.value); clearFieldError('fc_paidto'); }} />
              <ValidationNote field="fc_paidto" errors={fieldErrors} />
            </div>
          )}

          {/* Description dropup */}
          <div className="st-field">
            <label>{t.description} *</label>
            <Dropup
              options={cashType === 'in' ? IN_OPTIONS : OUT_OPTIONS}
              value={descKey}
              onSelect={handleDescSelect}
            />
            <ValidationNote field="fc_desc" errors={fieldErrors} />
          </div>

          {/* Cargo summary if cargo was selected and confirmed */}
          {cashType === 'out' && descKey === 'cargo' && cargoAmountDisplay && (
            <div className="st-cargo-summary">
              <span>📦 {cargoAmountDisplay}</span>
              <button className="st-cargo-edit-btn" onClick={() => setShowCargo(true)}>Edit Items</button>
            </div>
          )}

          {/* Note preview */}
          {note && (
            <div className="st-note-preview">
              <span className="st-note-preview-label">Will appear as:</span>
              <span className="st-note-preview-text">"{note}"</span>
            </div>
          )}

        </div>

        <div className="st-modal-footer">
          <button className="st-btn-cancel" onClick={onClose}>{t.cancel}</button>
          <button className="st-btn-save" onClick={handleSave} disabled={saving}>
            {saving ? '…' : t.recordCash}
          </button>
        </div>

        {/* Purchase Cargo child modal */}
        {showCargo && (
          <PurchaseCargoModal
            onConfirm={handleCargoConfirm}
            onCancel={() => { setShowCargo(false); if (cargoItems.length === 0) setDescKey(''); }}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Android-style Setting Row
// ─────────────────────────────────────────────────────────────
function SettingRow({ label, desc, children }) {
  return (
    <div className="st-android-row">
      <div className="st-android-text">
        <span className="st-android-label">{label}</span>
        {desc && <span className="st-android-desc">{desc}</span>}
      </div>
      <div className="st-android-control">{children}</div>
    </div>
  );
}

function Section({ icon, title, children }) {
  return (
    <div className="st-section">
      <div className="st-section-header">
        {icon}
        <h3 className="st-section-title">{title}</h3>
      </div>
      <div className="st-section-body">{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Settings component
// ─────────────────────────────────────────────────────────────
function Settings({ onSettingsChange }) {
  const { fmt } = useCurrency();
  const [lang, setLang]         = useState(() => localStorage.getItem('ks_lang') || 'en');
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('ks_darkMode') === 'true');
  const [notifDebtReminder, setNotifDebtReminder] = useState(false);
  const [notifLowStock, setNotifLowStock]         = useState(false);
  const [notifDailySales, setNotifDailySales]     = useState(false);
  const [notifCreditorOwed, setNotifCreditorOwed] = useState(false);
  const [notifReceiptReminder, setNotifReceiptReminder] = useState(true);
  const [loaded, setLoaded]     = useState(false);
  const [savedToast, setSavedToast]         = useState('');
  const [kiNotice, setKiNotice] = useState(false);

  const t = T[lang] || T.en;

  useEffect(() => {
    dataService.getSettings().then(s => {
      setLang(s.lang || 'en');
      setDarkMode(!!s.darkMode);
      setNotifDebtReminder(!!s.notifDebtReminder);
      setNotifLowStock(!!s.notifLowStock);
      setNotifDailySales(!!s.notifDailySales);
      setNotifCreditorOwed(!!s.notifCreditorOwed);
      setNotifReceiptReminder(s.notifReceiptReminder !== false); // default ON
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const autoSave = async (updates) => {
    const current = await dataService.getSettings();
    const merged = { ...current, ...updates };
    await dataService.saveSettings(merged);
    if (onSettingsChange) onSettingsChange(merged);
  };

  const handleLang = (code) => {
    if (code === 'ki') {
      setKiNotice(true);
      setTimeout(() => setKiNotice(false), 5000);
      return;
    }
    setLang(code);
    autoSave({ lang: code });
  };

  const handleDarkMode = (val) => { setDarkMode(val); autoSave({ darkMode: val }); };

  const handleToggle = (key, setter, current) => {
    const next = !current;
    setter(next);
    autoSave({ [key]: next });
    if (key === 'notifCreditorOwed') {
      if (next) scheduleCreditorReminders();
      else cancelCreditorReminders();
    }
    if (key === 'notifDebtReminder') {
      if (next) scheduleDebtReminders();
      else cancelDebtReminders();
    }
    if (key === 'notifReceiptReminder') {
      localStorage.setItem('ks_receipt_reminders', next ? 'true' : 'false');
    }
  };

  const flashSaved = (msg = 'Saved!') => {
    setSavedToast(msg);
    setTimeout(() => setSavedToast(''), 2000);
  };

  if (!loaded) {
    return (
      <div className="st-screen" style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%' }}>
        <div style={{ color:'#888', fontSize:'14px' }}>Loading settings…</div>
      </div>
    );
  }

  return (
    <div className="st-screen">
      {savedToast && <div className="st-toast"><Check size={16}/> {savedToast}</div>}

      <Section icon={<Globe size={18}/>} title={t.language}>
        {Object.entries(LANG_NAMES).map(([code, name]) => (
          <SettingRow key={code} label={name}>
            <div className={`st-android-radio${lang === code ? ' st-radio-on' : ''}`}
              onClick={() => handleLang(code)}>
              <div className="st-radio-dot"/>
            </div>
          </SettingRow>
        ))}
        {kiNotice && <div className="st-ki-notice">ℹ️ {KIRIBATI_COMING_SOON}</div>}
      </Section>

      <Section icon={darkMode ? <Moon size={18}/> : <Sun size={18}/>} title={t.appearance}>
        <SettingRow
          label={darkMode ? t.darkMode : t.lightMode}
          desc={darkMode ? 'Dark background, light text' : 'Light background, dark text'}
        >
          <div className={`st-switch${darkMode ? ' st-switch-on' : ''}`}
            onClick={() => handleDarkMode(!darkMode)}>
            <div className="st-switch-thumb"/>
          </div>
        </SettingRow>
      </Section>

      <Section icon={<Bell size={18}/>} title={t.notifications}>
        {[
          { key: 'notifDebtReminder', val: notifDebtReminder, set: setNotifDebtReminder, label: t.notifDebtReminder, desc: t.notifDebtReminderDesc },
          { key: 'notifLowStock',     val: notifLowStock,     set: setNotifLowStock,     label: t.notifLowStock,     desc: t.notifLowStockDesc    },
          { key: 'notifDailySales',   val: notifDailySales,   set: setNotifDailySales,   label: t.notifDailySales,   desc: t.notifDailySalesDesc  },
          { key: 'notifCreditorOwed', val: notifCreditorOwed, set: setNotifCreditorOwed, label: t.notifCreditorOwed, desc: t.notifCreditorOwedDesc },
          { key: 'notifReceiptReminder', val: notifReceiptReminder, set: setNotifReceiptReminder, label: t.notifReceiptReminder, desc: t.notifReceiptReminderDesc },
        ].map(({ key, val, set, label, desc }) => (
          <SettingRow key={key} label={label} desc={desc}>
            <div className={`st-switch${val ? ' st-switch-on' : ''}`}
              onClick={() => handleToggle(key, set, val)}>
              <div className="st-switch-thumb"/>
            </div>
          </SettingRow>
        ))}
      </Section>


    </div>
  );
}

export default Settings;
