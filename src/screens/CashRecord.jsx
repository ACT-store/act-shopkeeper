import { APP_NAME } from '../utils/appConfig';
import React, { useState, useEffect, useRef } from 'react';
import { Edit2, X, Plus, Trash2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import dataService from '../services/dataService';
import { useCurrency } from '../hooks/useCurrency';
import { useValidation, ValidationNote, errorBorder } from '../utils/validation.jsx';
import PdfTableButton from '../components/PdfTableButton';
import './CashRecord.css';
import './PurchaseRecord.css';

const TYPE_IN  = 'in';
const TYPE_OUT = 'out';

function isWithin30Mins(entry) {
  const ts = entry.createdAt || entry.date;
  if (!ts) return false;
  return (new Date() - new Date(ts)) / (1000 * 60) <= 30;
}

// ── Cash Entry Edit Modal ──────────────────────────────────────────────────
function CashEditModal({ entry, onSave, onClose, onDeleted, fmt }) {
  const [type, setType] = useState(entry.type || TYPE_IN);
  const [amount, setAmount] = useState(String(entry.amount || ''));
  const [note, setNote] = useState(entry.note || '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { showError } = useValidation();

  const handleSave = async () => {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) { showError('editAmount', 'Enter the Amount'); return; }
    if (!note.trim()) { showError('editNote', 'Enter the Description'); return; }
    setSaving(true);
    try {
      await dataService.updateCashEntry(entry.id, { type, amount: parsedAmount, note: note.trim() });
      onSave();
    } catch (e) { showError('editNote', e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this cash entry? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await dataService.deleteCashEntry(entry.id);
      onDeleted();
    } catch (e) { showError('editNote', e.message); }
    finally { setDeleting(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:3000, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}>
      <div style={{ background:'var(--surface)', color:'var(--text-primary)', borderRadius:'12px', padding:'20px', width:'100%', maxWidth:'380px' }}>
        <h3 style={{ margin:'0 0 16px', fontSize:'16px' }}>✏️ Edit Cash Entry</h3>
        <div style={{ marginBottom:'12px' }}>
          <label style={{ display:'block', fontWeight:600, fontSize:'13px', marginBottom:'4px' }}>Type</label>
          <div style={{ display:'flex', gap:'8px' }}>
            {[[TYPE_IN,'Cash In'],[TYPE_OUT,'Cash Out']].map(([t, lbl]) => (
              <button key={t} onClick={() => setType(t)} style={{
                flex:1, padding:'8px', borderRadius:'7px', border:'2px solid',
                borderColor: type === t ? (t === TYPE_IN ? '#16a34a' : '#dc2626') : '#d1d5db',
                background: type === t ? (t === TYPE_IN ? '#f0fdf4' : '#fff5f5') : 'var(--surface)',
                fontWeight: type === t ? 700 : 400, cursor:'pointer', fontSize:'13px',
              }}>{lbl}</button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom:'12px' }}>
          <label style={{ display:'block', fontWeight:600, fontSize:'13px', marginBottom:'4px' }}>Amount</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} min="0.01" step="0.01"
            style={{ width:'100%', padding:'8px 10px', border:'1.5px solid #d1d5db', borderRadius:'6px', fontSize:'14px', boxSizing:'border-box' }} />
        </div>
        <div style={{ marginBottom:'16px' }}>
          <label style={{ display:'block', fontWeight:600, fontSize:'13px', marginBottom:'4px' }}>Description</label>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Description…"
            style={{ width:'100%', padding:'8px 10px', border:'1.5px solid #d1d5db', borderRadius:'6px', fontSize:'14px', boxSizing:'border-box' }} />
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          <div style={{ display:'flex', gap:'8px' }}>
            <button onClick={onClose} style={{ flex:1, padding:'10px', borderRadius:'8px', border:'1.5px solid var(--border)', background:'var(--surface)', color:'var(--text-primary)', cursor:'pointer', fontWeight:600 }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ flex:1, padding:'10px', borderRadius:'8px', border:'none', background:'#667eea', color:'white', cursor:'pointer', fontWeight:700 }}>
              {saving ? 'Saving…' : 'Update Record'}
            </button>
          </div>
          <button onClick={handleDelete} disabled={deleting} style={{ width:'100%', padding:'10px', borderRadius:'8px', border:'none', background:'#fee2e2', color:'#dc2626', cursor:'pointer', fontWeight:700 }}>
            {deleting ? 'Deleting…' : 'Delete Record'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Dropdown constants ──────────────────────────────────────────────────────
const CASH_FROM_NAMES = ['Riti', 'Kamwatie', 'Tikanboi', 'Baikite', 'Landlord', 'Others'];
const PAID_TO_NAMES   = ['Riti', 'Kamwatie', 'Tikanboi', 'Baikite', 'Landlord', 'Others'];

// ── Role-based BEING FOR options for Cash In (CASH FROM) ───────────────────
// Returns array of { key, label, phrase } based on the selected user's role & gender
function getCashFromBeingForOptions(role, gender, shopName) {
  const pronoun = gender === 'Female' ? 'her' : gender === 'Male' ? 'his' : 'their';
  const shop = shopName || APP_NAME;
  const r = (role || '').toLowerCase().trim();

  if (r === "shop's withdrawals" || r === 'withdrawals') {
    return [
      { key: 'float',        label: 'Float (change money)',                        phrase: 'for float (change money)' },
      { key: 'purchases',    label: 'Purchases (money to buy stock)',               phrase: 'to purchase stock' },
      { key: 'wages',        label: 'Wages (to pay staff)',                         phrase: 'to pay wages' },
      { key: 'expenses',     label: 'Expenses (to pay for expenses)',               phrase: 'to pay for expenses' },
      { key: 'safe_keeping', label: 'Safe Keeping (store its money temporarily)',   phrase: 'for safe keeping (shop funds)' },
    ];
  }
  if (r === 'shop owner') {
    return [
      { key: 'float',        label: 'Float (top-up change money)',                            phrase: 'for float top-up (change money)' },
      { key: 'purchases',    label: 'Purchases (top-up money to buy stock)',                  phrase: 'to top-up purchase money' },
      { key: 'wages',        label: 'Wages (to pay staff)',                                   phrase: 'to pay wages' },
      { key: 'expenses',     label: 'Expenses (help pay for expenses)',                       phrase: 'to help pay for expenses' },
      { key: 'safe_keeping', label: `Safe Keeping (store ${pronoun} money temporarily)`,      phrase: `for safe keeping (${pronoun} money)` },
    ];
  }
  if (r === 'shop manager') {
    return [
      { key: 'float',        label: 'Float (top-up change money)',                            phrase: 'for float top-up (change money)' },
      { key: 'purchases',    label: 'Purchases (adding money to buy stock)',                  phrase: 'to add money for purchases' },
      { key: 'expenses',     label: 'Expenses (top-up money for expenses)',                   phrase: 'to top-up expense money' },
      { key: 'safe_keeping', label: `Safe Keeping (store ${pronoun} money temporarily)`,      phrase: `for safe keeping (${pronoun} money)` },
    ];
  }
  if (r === 'shopkeeper') {
    return [
      { key: 'float',        label: 'Float (top-up change money)',                            phrase: 'for float top-up (change money)' },
      { key: 'purchases',    label: 'Purchases (adding money to buy stock)',                  phrase: 'to add money for purchases' },
      { key: 'expenses',     label: 'Expenses (top-up money for expenses)',                   phrase: 'to top-up expense money' },
      { key: 'safe_keeping', label: `Safe Keeping (store ${pronoun} money temporarily)`,      phrase: `for safe keeping (${pronoun} money)` },
    ];
  }
  if (r === 'landlord') {
    return [
      { key: 'safe_keeping', label: `Safe Keeping (store ${pronoun} money temporarily)`,      phrase: `for safe keeping (${pronoun} money)` },
    ];
  }
  // Default fallback
  return [
    { key: 'float',        label: 'Float (change money)',           phrase: 'for float (change money)' },
    { key: 'purchases',    label: 'Purchases (money to buy stock)', phrase: 'to purchase stock' },
    { key: 'safe_keeping', label: 'Safe Keeping',                   phrase: 'for safe keeping' },
  ];
}

const CASH_IN_REASONS = [
  { key: 'float',        label: 'Float (change money)',           phrase: 'for float (change money)' },
  { key: 'purchases',    label: 'Purchases (money to buy stock)', phrase: 'to purchase stock' },
  { key: 'safe_keeping', label: 'Safe Keeping',                   phrase: 'for safe keeping' },
];

const PAID_TO_REASONS = [
  { key: 'advance',      label: 'Cash Advance',      phrase: 'for cash advance' },
  { key: 'electricity',  label: 'Electricity bill',   phrase: 'to pay electricity bill' },
  { key: 'rent',         label: 'Land Rental',        phrase: 'to pay land rental' },
  { key: 'other',        label: 'Other reason…',      phrase: '' },
];

// Helper: check if a PAID TO name is a known supplier (loaded at runtime)
function isKnownSupplier(name, suppliersList) {
  if (!name) return false;
  const low = name.toLowerCase().trim();
  return suppliersList.some(s =>
    (s.name || s.customerName || '').toLowerCase().trim() === low
  );
}

function getSupplierRecord(name, suppliersList) {
  if (!name) return null;
  const low = name.toLowerCase().trim();
  return suppliersList.find(s =>
    (s.name || s.customerName || '').toLowerCase().trim() === low
  ) || null;
}

// ── Add Operational Assets Modal ─────────────────────────────────────────────
// Opens when user clicks BEING FOR and the PAID TO name is a known supplier.
// Mirrors the Admin app's AssetFormModal exactly, but supports multiple items
// per submission and pre-populates supplierName from the selected PAID TO name.
// Each item saved is written individually to the operational_assets collection.
function AddOperationalAssetsModal({ initialSupplierName, initialSupplierId, suppliersList, onSave, onClose, onNewSupplier }) {
  const { fmt } = useCurrency();
  const { fieldErrors, showError, clearFieldError } = useValidation();

  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };

  // Supplier search state (the supplier name field has a live dropdown)
  const [supplierSearch, setSupplierSearch]   = useState(initialSupplierName || '');
  const [showSupplierDrop, setShowSupplierDrop] = useState(false);
  const [resolvedSupplierId, setResolvedSupplierId] = useState(initialSupplierId || null);

  // Shared fields across all items in this submission
  const [paymentType, setPaymentType] = useState('cash');
  const [invoiceRef, setInvoiceRef]   = useState('');
  const [comments, setComments]       = useState('');
  const [date, setDate]               = useState(todayStr());
  const [saving, setSaving]           = useState(false);

  // Each item row: { id, name, qty, costPrice }
  const nextId = useRef(2);
  const [items, setItems] = useState([{ id: 1, name: '', qty: '', costPrice: '' }]);

  const [cashBalance, setCashBalance] = useState(null);

  useEffect(() => {
    dataService.getCashEntries().then(entries => {
      const bal = (entries || []).reduce((sum, e) =>
        sum + (e.type === 'in' ? (e.amount || 0) : -(e.amount || 0)), 0);
      setCashBalance(bal);
    });
  }, []);

  const filteredSuppliers = (() => {
    const q = supplierSearch.toLowerCase();
    return suppliersList.filter(s =>
      (s.name || s.customerName || '').toLowerCase().includes(q)
    );
  })();

  const updateItem = (id, field, val) =>
    setItems(prev => prev.map(it => it.id === id ? { ...it, [field]: val } : it));

  const addItem = () => {
    setItems(prev => [...prev, { id: nextId.current++, name: '', qty: '', costPrice: '' }]);
  };

  const removeItem = (id) => setItems(prev => prev.filter(it => it.id !== id));

  const grandTotal = items.reduce((sum, it) =>
    sum + (parseFloat(it.qty) || 0) * (parseFloat(it.costPrice) || 0), 0);

  const lastItemComplete = () => {
    const last = items[items.length - 1];
    return last && last.name.trim() && parseFloat(last.qty) > 0 && parseFloat(last.costPrice) >= 0;
  };

  const handleSave = async () => {
    const supplierName = supplierSearch.trim();
    if (!supplierName) return showError('oa_supplier', 'Enter the Supplier Name');
    if (!invoiceRef.trim()) return showError('oa_ref', 'Enter the Invoice / Ref');
    if (!date) return showError('oa_date', 'Enter the Date');

    const validItems = items.filter(it => it.name.trim() && parseFloat(it.qty) > 0);
    if (validItems.length === 0) return showError('oa_items', 'Add at least one item');
    // Block save if any item has a name but qty is missing/zero
    const badItems = items.filter(it => it.name.trim() && !(parseFloat(it.qty) > 0));
    if (badItems.length > 0) {
      badItems.forEach(it => showError('oa_qty_' + it.id, 'Enter a quantity'));
      return;
    }

    for (const it of validItems) {
      if (!it.name.trim()) return showError('oa_items', 'All items must have a name');
      if (!(parseFloat(it.qty) > 0)) return showError('oa_items', 'Quantity must be greater than 0');
      if (parseFloat(it.costPrice) < 0) return showError('oa_items', 'Cost price cannot be negative');
    }

    if (paymentType === 'cash' && cashBalance !== null && grandTotal > cashBalance) {
      return showError('oa_items', `Total exceeds Cash Balance. Reduce amount or switch to Credit.`);
    }

    setSaving(true);
    try {
      const dateISO = new Date(date + 'T12:00:00').toISOString();
      const savedItems = [];

      for (const it of validItems) {
        const qty       = parseFloat(it.qty) || 0;
        const costPrice = parseFloat(it.costPrice) || 0;
        const subtotal  = qty * costPrice;

        await dataService.addOperationalAsset({
          name: it.name.trim(),
          qty,
          costPrice,
          subtotal,
          supplierName,
          supplierId: resolvedSupplierId || null,
          invoiceRef: invoiceRef.trim(),
          paymentType,
          comments: comments.trim(),
          date: dateISO,
          source: 'purchase',
        });

        savedItems.push({ name: it.name.trim(), qty, costPrice, subtotal });
      }

      onSave({
        supplierName,
        supplierId: resolvedSupplierId || null,
        paymentType,
        total: grandTotal,
        invoiceRef: invoiceRef.trim(),
        itemsSummary: savedItems.map(i => i.name).join(', '),
        items: savedItems,
      });
    } catch (e) {
      console.error(e);
      showError('oa_items', 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px',
    }}>
      <div style={{
        background: 'var(--surface, white)', color: 'var(--text-primary, #111)',
        borderRadius: '14px', width: '100%', maxWidth: '480px',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 12px 48px rgba(0,0,0,0.3)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px', borderBottom: '1px solid var(--border, #e5e7eb)',
          flexShrink: 0,
        }}>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>
            🛒 Buy Operational Assets/Expenses{resolvedSupplierId && supplierSearch.trim() ? ` from ${supplierSearch.trim()}` : ''}
          </h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-secondary, #6b7280)', padding: '4px', borderRadius: '4px',
            display: 'flex', alignItems: 'center',
          }}><X size={20}/></button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Supplier Name with dropdown + New Supplier button */}
          <div style={{ position: 'relative' }}>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '6px', color: 'var(--text-primary, #374151)' }}>
              Supplier Name *
            </label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <input
                  data-field="oa_supplier"
                  style={{
                    width: '100%', padding: '10px 12px', border: '2px solid var(--border, #e5e7eb)',
                    borderRadius: '8px', fontSize: '14px', background: 'var(--surface, white)',
                    color: 'var(--text-primary, #111)', boxSizing: 'border-box',
                    ...errorBorder('oa_supplier', fieldErrors),
                  }}
                  value={supplierSearch}
                  placeholder="Search existing suppliers"
                  onChange={e => {
                    setSupplierSearch(e.target.value);
                    setShowSupplierDrop(true);
                    setResolvedSupplierId(null);
                    clearFieldError('oa_supplier');
                  }}
                  onFocus={() => setShowSupplierDrop(true)}
                  onBlur={() => setTimeout(() => setShowSupplierDrop(false), 180)}
                />
                {showSupplierDrop && filteredSuppliers.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 500,
                    background: 'var(--surface, white)', border: '1px solid var(--border, #e5e7eb)',
                    borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                    maxHeight: '160px', overflowY: 'auto',
                  }}>
                    {filteredSuppliers.map(s => {
                      const n = s.name || s.customerName || '';
                      return (
                        <button key={s.id}
                          onMouseDown={() => {
                            setSupplierSearch(n);
                            setResolvedSupplierId(s.id);
                            setShowSupplierDrop(false);
                          }}
                          style={{
                            display: 'block', width: '100%', textAlign: 'left',
                            padding: '10px 14px', background: 'none', border: 'none',
                            cursor: 'pointer', fontSize: '14px', color: 'var(--text-primary, #111)',
                          }}
                        >{n}</button>
                      );
                    })}
                  </div>
                )}
              </div>
              {onNewSupplier && (
                <button onClick={onNewSupplier} style={{
                  padding: '10px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                  border: '2px solid #667eea', background: '#eef2ff', color: '#667eea',
                  cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                }}>+ New Supplier</button>
              )}
            </div>
            <ValidationNote field="oa_supplier" errors={fieldErrors} />
          </div>

          {/* Payment Type */}
          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '6px', color: 'var(--text-primary, #374151)' }}>
              Payment Type
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[['cash', '💵 Cash'], ['credit', '📋 Credit']].map(([pt, lbl]) => (
                <button key={pt} type="button"
                  onClick={() => setPaymentType(pt)}
                  style={{
                    flex: 1, padding: '9px', borderRadius: '8px', border: '2px solid',
                    borderColor: paymentType === pt ? (pt === 'cash' ? '#16a34a' : '#4f46e5') : 'var(--border, #d1d5db)',
                    background: paymentType === pt ? (pt === 'cash' ? '#f0fdf4' : '#eef2ff') : 'var(--surface, white)',
                    fontWeight: paymentType === pt ? 700 : 400,
                    cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary, #111)',
                  }}>{lbl}</button>
              ))}
            </div>
            <p style={{ fontSize: '11px', marginTop: '4px', color: paymentType === 'credit' ? '#4f46e5' : '#6b7280' }}>
              {paymentType === 'cash'
                ? 'Cash paid now — a Cash OUT entry will be recorded.'
                : 'Items received, pay later — no immediate cash deducted.'}
            </p>
          </div>

          {/* Invoice / Ref */}
          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '6px', color: 'var(--text-primary, #374151)' }}>
              Invoice / Ref *
            </label>
            <input
              style={{
                width: '100%', padding: '10px 12px', border: '2px solid var(--border, #e5e7eb)',
                borderRadius: '8px', fontSize: '14px', background: 'var(--surface, white)',
                color: 'var(--text-primary, #111)', boxSizing: 'border-box',
              }}
              value={invoiceRef}
              placeholder="Receipt or invoice number…"
              onChange={e => setInvoiceRef(e.target.value)}
            />
          </div>

          {/* Comments */}
          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '6px', color: 'var(--text-primary, #374151)' }}>
              Comments <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span>
            </label>
            <textarea
              style={{
                width: '100%', padding: '10px 12px', border: '2px solid var(--border, #e5e7eb)',
                borderRadius: '8px', fontSize: '14px', background: 'var(--surface, white)',
                color: 'var(--text-primary, #111)', boxSizing: 'border-box', minHeight: '70px', resize: 'vertical',
              }}
              value={comments}
              placeholder="Any additional notes or comments…"
              onChange={e => setComments(e.target.value)}
            />
          </div>

          {/* Date */}
          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '6px', color: 'var(--text-primary, #374151)' }}>
              Date *
            </label>
            <input
              type="date"
              style={{
                width: '100%', padding: '10px 12px', border: '2px solid var(--border, #e5e7eb)',
                borderRadius: '8px', fontSize: '14px', background: 'var(--surface, white)',
                color: 'var(--text-primary, #111)', boxSizing: 'border-box',
              }}
              value={date}
              max={todayStr()}
              onChange={e => setDate(e.target.value)}
            />
          </div>

          {/* Items */}
          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '8px', color: 'var(--text-primary, #374151)' }}>
              Items *
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {items.map((it, idx) => {
                const subtotal = (parseFloat(it.qty) || 0) * (parseFloat(it.costPrice) || 0);
                return (
                  <div key={it.id} style={{
                    border: '1.5px solid var(--border, #e5e7eb)', borderRadius: '10px',
                    padding: '12px', background: 'var(--background, #f9fafb)',
                    display: 'flex', flexDirection: 'column', gap: '10px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#667eea' }}>Item {idx + 1}</span>
                      {items.length > 1 && (
                        <button onClick={() => removeItem(it.id)} style={{
                          background: '#fee2e2', border: 'none', borderRadius: '6px',
                          padding: '4px 8px', cursor: 'pointer', color: '#dc2626',
                          display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px',
                        }}>
                          <Trash2 size={12}/> Remove
                        </button>
                      )}
                    </div>

                    {/* Asset Name */}
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary, #6b7280)', marginBottom: '4px' }}>
                        Asset Name *
                      </label>
                      <input
                        style={{
                          width: '100%', padding: '8px 10px', border: '1.5px solid var(--border, #e5e7eb)',
                          borderRadius: '7px', fontSize: '13px', background: 'var(--surface, white)',
                          color: 'var(--text-primary, #111)', boxSizing: 'border-box',
                        }}
                        value={it.name}
                        placeholder="e.g. Generator, Office Chair…"
                        onChange={e => updateItem(it.id, 'name', e.target.value)}
                      />
                    </div>

                    {/* Qty + Cost side by side */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary, #6b7280)', marginBottom: '4px' }}>
                          Quantity *
                        </label>
                        <input type="number" min="0" step="1"
                          style={{
                            width: '100%', padding: '8px 10px', borderRadius: '7px', fontSize: '13px',
                            background: 'var(--surface, white)', color: 'var(--text-primary, #111)',
                            boxSizing: 'border-box', ...errorBorder('oa_qty_' + it.id, fieldErrors),
                          }}
                          value={it.qty}
                          placeholder="0"
                          onChange={e => { updateItem(it.id, 'qty', e.target.value); clearFieldError('oa_qty_' + it.id); }}
                        />
                        <ValidationNote field={'oa_qty_' + it.id} errors={fieldErrors} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary, #6b7280)', marginBottom: '4px' }}>
                          Unit Cost
                        </label>
                        <input type="number" min="0" step="0.01"
                          style={{
                            width: '100%', padding: '8px 10px', border: '1.5px solid var(--border, #e5e7eb)',
                            borderRadius: '7px', fontSize: '13px', background: 'var(--surface, white)',
                            color: 'var(--text-primary, #111)', boxSizing: 'border-box',
                          }}
                          value={it.costPrice}
                          placeholder="0.00"
                          onChange={e => updateItem(it.id, 'costPrice', e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Subtotal preview */}
                    {(parseFloat(it.qty) > 0 || parseFloat(it.costPrice) > 0) && (
                      <div style={{
                        padding: '6px 10px', background: '#f0f4ff',
                        border: '1px solid #c7d2fe', borderRadius: '7px',
                        fontSize: '12px', color: '#4338ca', fontWeight: 600,
                      }}>
                        Subtotal: {fmt(subtotal)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add another item button */}
            <button
              onClick={addItem}
              disabled={!lastItemComplete()}
              style={{
                marginTop: '10px', width: '100%', padding: '10px',
                border: '1.5px dashed var(--border, #d1d5db)', borderRadius: '8px',
                background: lastItemComplete() ? 'var(--surface, white)' : 'var(--background, #f9fafb)',
                color: lastItemComplete() ? '#667eea' : '#9ca3af',
                cursor: lastItemComplete() ? 'pointer' : 'not-allowed',
                fontSize: '13px', fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}
            >
              <Plus size={14}/> Add Another Item
            </button>
          </div>

          {/* Grand total */}
          {grandTotal > 0 && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 14px', background: '#f0f4ff',
              border: '1.5px solid #c7d2fe', borderRadius: '10px',
            }}>
              <span style={{ fontWeight: 700, fontSize: '14px', color: '#4338ca' }}>Grand Total</span>
              <span style={{ fontWeight: 800, fontSize: '15px', color: '#3730a3' }}>{fmt(grandTotal)}</span>
            </div>
          )}

          {/* Cash balance warning */}
          {paymentType === 'cash' && cashBalance !== null && grandTotal > cashBalance && grandTotal > 0 && (
            <div style={{
              background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px',
              padding: '10px 12px', fontSize: '12px', color: '#b91c1c',
            }}>
              ⚠️ Total ({fmt(grandTotal)}) exceeds Cash Balance ({fmt(cashBalance)}).
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', gap: '10px', padding: '16px 20px',
          borderTop: '1px solid var(--border, #e5e7eb)', flexShrink: 0,
        }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '12px', borderRadius: '8px',
            border: '1.5px solid var(--border, #e5e7eb)',
            background: 'var(--surface, white)', color: 'var(--text-primary, #111)',
            cursor: 'pointer', fontWeight: 600, fontSize: '14px',
          }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{
            flex: 1, padding: '12px', borderRadius: '8px', border: 'none',
            background: saving ? '#9ca3af' : '#f59e0b', color: 'white',
            cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '14px',
          }}>
            {saving ? 'Saving…' : 'Save Assets'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Create New Customer Advanced Order Modal ──────────────────────────────────
function CreateNewCustomerAdvanceOrderModal({ onSave, onClose, advanceOrdersList = [] }) {
  const { fmt } = useCurrency();
  const { fieldErrors, showError, clearFieldError } = useValidation();

  // Tabs
  const [activeTab, setActiveTab] = useState('details');

  // Customer search mode: 'search' (default) or 'new'
  const [customerMode, setCustomerMode] = useState('search');
  const [customerSearchText, setCustomerSearchText] = useState('');
  const [showCustomerDrop, setShowCustomerDrop] = useState(false);
  const [selectedExistingCustomer, setSelectedExistingCustomer] = useState(null);

  // Customer Details tab
  const [fullName, setFullName]   = useState('');
  const [gender, setGender]       = useState('');
  const [phone, setPhone]         = useState('');
  const [whatsapp, setWhatsapp]   = useState('');
  const [email, setEmail]         = useState('');
  const [address, setAddress]     = useState('');

  // Advance Order tab
  const [invoiceRef, setInvoiceRef] = useState('');
  const [date, setDate]             = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  });
  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };

  // Rows: { id, qty, productName, productSearch, showDrop, dropTop, dropLeft, dropWidth, sellingPrice }
  const nextId = useRef(2);
  const [rows, setRows] = useState([{
    id: 1, qty: '', productName: '', productSearch: '', showDrop: false,
    dropTop: 0, dropLeft: 0, dropWidth: 180, sellingPrice: '',
  }]);
  const [goods, setGoods] = useState([]);
  const [saving, setSaving] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const detailsErrorRef = useRef(null);
  const modalBodyRef = useRef(null);
  const fieldRefs = {
    fullName: useRef(null),
    gender:   useRef(null),
    phone:    useRef(null),
    whatsapp: useRef(null),
    address:  useRef(null),
  };

  useEffect(() => {
    dataService.getGoods().then(d => setGoods(d || []));
    const unsub = dataService.onGoodsChange?.(g => setGoods(g || []));
    return () => unsub?.();
  }, []);

  const updateRow = (id, field, val) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r));

  const addRow = () => setRows(prev => [...prev, {
    id: nextId.current++, qty: '', productName: '', productSearch: '',
    showDrop: false, dropTop: 0, dropLeft: 0, dropWidth: 180, sellingPrice: '',
  }]);

  const removeRow = id => setRows(prev => prev.filter(r => r.id !== id));

  const descResults = (search) => {
    if (!search.trim()) return [];
    const t = search.toLowerCase();
    const tier1 = [], tier2 = [], tier3 = [];
    for (const g of goods) {
      const name = (g.name || '').toLowerCase();
      const words = name.split(/\s+/);
      if (words[0]?.startsWith(t)) tier1.push(g);
      else if (words[1]?.startsWith(t)) tier2.push(g);
      else if (name.includes(t)) tier3.push(g);
    }
    return [...tier1, ...tier2, ...tier3].slice(0, 8);
  };

  const grandTotal = rows.reduce((sum, r) =>
    sum + (parseFloat(r.qty) || 0) * (parseFloat(r.sellingPrice) || 0), 0);

  const lastRowComplete = () => {
    const last = rows[rows.length - 1];
    return last && last.productName.trim() && parseFloat(last.qty) > 0;
  };

  const validateDetails = () => {
    if (!fullName.trim()) return { msg: 'Full Name is required.',               field: 'fullName' };
    if (!gender)          return { msg: 'Gender is required.',                   field: 'gender' };
    if (!phone.trim())    return { msg: 'Phone number is required.',             field: 'phone' };
    if (!whatsapp.trim() && !email.trim()) return { msg: 'At least WhatsApp or Email is required.', field: 'whatsapp' };
    if (email.trim() && !email.includes('@')) return { msg: 'Email must contain "@".', field: 'whatsapp' };
    if (!address.trim())  return { msg: 'Address is required.',                 field: 'address' };
    return null;
  };

  const scrollToField = (fieldKey) => {
    setTimeout(() => {
      const ref = fieldRefs[fieldKey];
      const target = ref?.current || detailsErrorRef.current;
      if (!target) return;

      // Scroll the modal body container so the field comes into view
      const body = modalBodyRef.current;
      if (body) {
        const targetTop = target.getBoundingClientRect().top;
        const bodyTop   = body.getBoundingClientRect().top;
        body.scrollTop += (targetTop - bodyTop) - 24; // 24px breathing room above
      } else {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      // Highlight the first focusable input/select inside the target element
      const focusable = target.querySelector('input, select, textarea');
      if (focusable) {
        focusable.focus();
        focusable.style.outline = '2.5px solid #ef4444';
        focusable.style.outlineOffset = '1px';
        setTimeout(() => {
          focusable.style.outline = '';
          focusable.style.outlineOffset = '';
        }, 2000);
      }
    }, 60);
  };

  const handleNextToOrder = () => {
    const err = validateDetails();
    if (err) {
      setDetailsError(err.msg);
      scrollToField(err.field);
      return;
    }
    setDetailsError('');
    setActiveTab('order');
  };

  const handleSave = async () => {
    const err = validateDetails();
    if (err) { setActiveTab('details'); setDetailsError(err.msg); scrollToField(err.field); return; }
    if (!invoiceRef.trim()) return showError('ao_invoiceRef', 'Enter the Invoice / Ref number');
    if (!date) return showError('ao_date', 'Enter the Date');
    const validRows = rows.filter(r => r.productName.trim() && parseFloat(r.qty) > 0);
    if (validRows.length === 0) return showError('ao_items', 'Add at least one product with a quantity');
    // Block save if any row has a product name but qty is missing/zero
    const badRows = rows.filter(r => r.productName.trim() && !(parseFloat(r.qty) > 0));
    if (badRows.length > 0) {
      badRows.forEach(r => showError('ao_qty_' + r.id, 'Enter a quantity'));
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const orderItems = validRows.map(r => ({
        name: r.productName.trim(),
        qty: parseFloat(r.qty) || 0,
        sellingPrice: parseFloat(r.sellingPrice) || 0,
        subtotal: (parseFloat(r.qty) || 0) * (parseFloat(r.sellingPrice) || 0),
      }));

      const newOrder = await dataService.addAdvanceOrder({
        name: fullName.trim(),
        customerName: fullName.trim(),
        gender,
        phone: phone.trim(),
        whatsapp: whatsapp.trim(),
        email: email.trim(),
        address: address.trim(),
        invoiceRef: invoiceRef.trim(),
        orderDate: date,
        items: orderItems,
        totalDue: grandTotal,
        balance: grandTotal,
        totalPaid: 0,
        deposits: [],
        saleIds: [],
        purchaseIds: [],
        updatedAt: now,
      });

      onSave(newOrder);
    } catch (e) {
      console.error(e);
      showError('ao_items', 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const fieldStyle = {
    width: '100%', padding: '10px 12px',
    border: '2px solid var(--border, #e5e7eb)', borderRadius: '8px',
    fontSize: '14px', background: 'var(--surface, white)',
    color: 'var(--text-primary, #111)', boxSizing: 'border-box',
  };
  const labelStyle = {
    display: 'block', fontWeight: 600, fontSize: '13px',
    marginBottom: '6px', color: 'var(--text-primary, #374151)',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px',
    }}>
      <div style={{
        background: 'var(--surface, white)', color: 'var(--text-primary, #111)',
        borderRadius: '14px', width: '100%', maxWidth: '480px',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 12px 48px rgba(0,0,0,0.3)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px', borderBottom: '1px solid var(--border, #e5e7eb)', flexShrink: 0,
        }}>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>🛒 New Customer Advance Order</h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-secondary, #6b7280)', padding: '4px', borderRadius: '4px',
            display: 'flex', alignItems: 'center',
          }}><X size={20}/></button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', borderBottom: '1px solid var(--border, #e5e7eb)', flexShrink: 0,
        }}>
          {[['details', '👤 Customer Details'], ['order', '📋 Advance Order']].map(([key, lbl]) => (
            <button key={key}
              onClick={() => {
                if (key === 'order') handleNextToOrder();
                else setActiveTab(key);
              }}
              style={{
                flex: 1, padding: '12px', background: 'none', border: 'none',
                borderBottom: activeTab === key ? '3px solid #667eea' : '3px solid transparent',
                fontWeight: activeTab === key ? 700 : 500, fontSize: '13px',
                color: activeTab === key ? '#667eea' : 'var(--text-secondary, #6b7280)',
                cursor: 'pointer',
              }}>{lbl}</button>
          ))}
        </div>

        {/* Body */}
        <div ref={modalBodyRef} style={{ overflowY: 'auto', padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* ── Customer Details Tab ── */}
          {activeTab === 'details' && (
            <>
              {detailsError && (
                <div ref={detailsErrorRef} style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#b91c1c' }}>
                  {detailsError}
                </div>
              )}
              <div style={{ position:'relative' }} ref={fieldRefs.fullName}>
                <label style={labelStyle}>Full Name *</label>
                <div style={{ display:'flex', gap:'8px', alignItems:'flex-start' }}>
                  <div style={{ flex:1, position:'relative' }}>
                    <input
                      style={{
                        ...fieldStyle,
                        background: customerMode === 'search' && selectedExistingCustomer
                          ? 'var(--background, #f0fdf4)'
                          : fieldStyle.background,
                      }}
                      value={customerMode === 'search' ? customerSearchText : fullName}
                      placeholder="Search Customer"
                      readOnly={customerMode === 'search' && !!selectedExistingCustomer}
                      onChange={e => {
                        if (customerMode === 'search') {
                          setCustomerSearchText(e.target.value);
                          setShowCustomerDrop(true);
                          setSelectedExistingCustomer(null);
                          // Clear prefilled fields when search changes
                          setFullName(''); setGender(''); setPhone('');
                          setWhatsapp(''); setEmail(''); setAddress('');
                        } else {
                          setFullName(e.target.value);
                        }
                      }}
                      onFocus={() => {
                        if (customerMode === 'search' && !selectedExistingCustomer) {
                          setShowCustomerDrop(true);
                        }
                      }}
                      onBlur={() => setTimeout(() => setShowCustomerDrop(false), 220)}
                    />
                    {/* Customer search dropdown */}
                    {showCustomerDrop && customerMode === 'search' && (() => {
                      const q = customerSearchText.toLowerCase();
                      const matches = advanceOrdersList.filter(o => {
                        const n = (o.name || o.customerName || '').toLowerCase();
                        return !q || n.includes(q);
                      });
                      return matches.length > 0 ? (
                        <div className="cj-desc-dropdown" style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:500 }}>
                          {matches.map(o => {
                            const n = o.name || o.customerName || '';
                            return (
                              <button key={o.id} className="cj-desc-dropdown-item"
                                onMouseDown={() => {
                                  setCustomerSearchText(n);
                                  setSelectedExistingCustomer(o);
                                  setShowCustomerDrop(false);
                                  // Prefill customer details from the existing order
                                  setFullName(n);
                                  setGender(o.gender || '');
                                  setPhone(o.phone || '');
                                  setWhatsapp(o.whatsapp || '');
                                  setEmail(o.email || '');
                                  setAddress(o.address || '');
                                }}>
                                {n}
                                {o.invoiceRef ? <span style={{ fontSize:'11px', color:'#9ca3af', marginLeft:'6px' }}>({o.invoiceRef})</span> : null}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        q ? (
                          <div className="cj-desc-dropdown" style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:500 }}>
                            <div className="cj-desc-dropdown-item" style={{ color:'#9ca3af', fontStyle:'italic', pointerEvents:'none' }}>
                              No matching customers found
                            </div>
                          </div>
                        ) : null
                      );
                    })()}
                    {/* Show clear button if existing customer selected */}
                    {customerMode === 'search' && selectedExistingCustomer && (
                      <button
                        onClick={() => {
                          setSelectedExistingCustomer(null);
                          setCustomerSearchText('');
                          setFullName(''); setGender(''); setPhone('');
                          setWhatsapp(''); setEmail(''); setAddress('');
                        }}
                        style={{
                          position:'absolute', right:'8px', top:'50%', transform:'translateY(-50%)',
                          background:'none', border:'none', cursor:'pointer', color:'#9ca3af',
                          fontSize:'16px', padding:'2px 4px', lineHeight:1,
                        }}
                        title="Clear selection"
                      >✕</button>
                    )}
                  </div>
                  {/* New Customer button */}
                  <button
                    onClick={() => {
                      if (customerMode === 'search') {
                        // Switch to new customer mode — unlock fields
                        setCustomerMode('new');
                        setSelectedExistingCustomer(null);
                        setCustomerSearchText('');
                        setShowCustomerDrop(false);
                        setFullName(''); setGender(''); setPhone('');
                        setWhatsapp(''); setEmail(''); setAddress('');
                      } else {
                        // Switch back to search mode
                        setCustomerMode('search');
                        setFullName(''); setGender(''); setPhone('');
                        setWhatsapp(''); setEmail(''); setAddress('');
                        setCustomerSearchText('');
                      }
                    }}
                    style={{
                      padding:'10px 12px', borderRadius:'8px', fontSize:'12px', fontWeight:600,
                      border: customerMode === 'new' ? '2px solid #667eea' : '2px solid var(--border, #e5e7eb)',
                      background: customerMode === 'new' ? '#eef2ff' : 'var(--surface, white)',
                      color: customerMode === 'new' ? '#667eea' : 'var(--text-secondary, #6b7280)',
                      cursor:'pointer', whiteSpace:'nowrap', flexShrink:0,
                    }}
                  >
                    {customerMode === 'new' ? '🔍 Search' : '+ New Customer'}
                  </button>
                </div>
              </div>
              <div ref={fieldRefs.gender}>
                <label style={labelStyle}>Gender *</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {['Male', 'Female'].map(g => (
                    <label key={g} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px' }}>
                      <input type="radio" name="cao-gender" checked={gender === g} onChange={() => setGender(g)} />
                      {g}
                    </label>
                  ))}
                </div>
              </div>
              <div ref={fieldRefs.phone}>
                <label style={labelStyle}>Phone *</label>
                <input style={fieldStyle} type="tel" value={phone} placeholder="Phone number"
                  onChange={e => setPhone(e.target.value)} />
              </div>
              <div ref={fieldRefs.whatsapp}>
                <label style={labelStyle}>WhatsApp <span style={{ fontWeight: 400, color: '#9ca3af' }}>(at least WhatsApp or Email required)</span></label>
                <input style={fieldStyle} type="tel" value={whatsapp} placeholder="WhatsApp number"
                  onChange={e => setWhatsapp(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input style={fieldStyle} type="email" value={email} placeholder="Email address"
                  onChange={e => setEmail(e.target.value)} />
              </div>
              <div ref={fieldRefs.address}>
                <label style={labelStyle}>Address *</label>
                <textarea style={{ ...fieldStyle, resize: 'none' }} rows={2} value={address} placeholder="Enter address"
                  onChange={e => setAddress(e.target.value)} />
              </div>
            </>
          )}

          {/* ── Advance Order Tab ── */}
          {activeTab === 'order' && (
            <>
              {/* Name of Customer (read-only display) */}
              <div>
                <label style={labelStyle}>Name of Customer</label>
                <div style={{ ...fieldStyle, background: 'var(--background, #f9fafb)', color: '#6b7280', border: '2px solid var(--border, #e5e7eb)' }}>
                  {fullName || <em style={{ color: '#9ca3af' }}>Fill in Customer Details first</em>}
                </div>
              </div>

              {/* Invoice / Ref */}
              <div>
                <label style={labelStyle}>Invoice / Ref *</label>
                <input style={fieldStyle} value={invoiceRef} placeholder="Receipt or order reference number…"
                  onChange={e => setInvoiceRef(e.target.value)} />
              </div>

              {/* Date */}
              <div>
                <label style={labelStyle}>Date *</label>
                <input type="date" style={fieldStyle} value={date} max={todayStr()}
                  onChange={e => setDate(e.target.value)} />
              </div>

              {/* Product rows table */}
              <div>
                <label style={labelStyle}>Products Ordered *</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {rows.map((row, idx) => {
                    const results = descResults(row.productSearch);
                    const subtotal = (parseFloat(row.qty) || 0) * (parseFloat(row.sellingPrice) || 0);
                    return (
                      <div key={row.id} style={{
                        border: '1.5px solid var(--border, #e5e7eb)', borderRadius: '10px',
                        padding: '12px', background: 'var(--background, #f9fafb)',
                        display: 'flex', flexDirection: 'column', gap: '10px',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#667eea' }}>Item {idx + 1}</span>
                          {rows.length > 1 && (
                            <button onClick={() => removeRow(row.id)} style={{
                              background: '#fee2e2', border: 'none', borderRadius: '6px',
                              padding: '4px 8px', cursor: 'pointer', color: '#dc2626',
                              display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px',
                            }}>
                              <Trash2 size={12}/> Remove
                            </button>
                          )}
                        </div>

                        {/* Product Name — inventory search */}
                        <div style={{ position: 'relative' }}>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary, #6b7280)', marginBottom: '4px' }}>
                            Product Name *
                          </label>
                          <input
                            style={{ width: '100%', padding: '8px 10px', border: '1.5px solid var(--border, #e5e7eb)', borderRadius: '7px', fontSize: '13px', background: 'var(--surface, white)', color: 'var(--text-primary, #111)', boxSizing: 'border-box' }}
                            value={row.productSearch !== undefined ? row.productSearch : row.productName}
                            placeholder="Search inventory…"
                            onChange={e => {
                              updateRow(row.id, 'productSearch', e.target.value);
                              updateRow(row.id, 'showDrop', true);
                            }}
                            onFocus={e => {
                              const input = e.target;
                              updateRow(row.id, 'showDrop', true);
                              const reposition = () => {
                                const rect = input.getBoundingClientRect();
                                updateRow(row.id, 'dropTop', rect.bottom + 2);
                                updateRow(row.id, 'dropLeft', rect.left);
                                updateRow(row.id, 'dropWidth', rect.width);
                              };
                              setTimeout(reposition, 100);
                              input._scrollHandler = reposition;
                              window.addEventListener('scroll', reposition, true);
                            }}
                            onBlur={e => {
                              const input = e.target;
                              if (input._scrollHandler) {
                                window.removeEventListener('scroll', input._scrollHandler, true);
                                input._scrollHandler = null;
                              }
                              setTimeout(() => {
                                setRows(prev => prev.map(r => r.id === row.id
                                  ? { ...r, showDrop: false, productSearch: r.productName || r.productSearch }
                                  : r));
                              }, 180);
                            }}
                          />
                          {row.showDrop && results.length > 0 && (
                            <div style={{
                              position: 'fixed', top: row.dropTop, left: row.dropLeft,
                              width: row.dropWidth, zIndex: 6000,
                              background: 'var(--surface, white)', border: '1px solid var(--border, #e5e7eb)',
                              borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                              maxHeight: '160px', overflowY: 'auto',
                            }}>
                              {results.map(g => (
                                <div key={g.id}
                                  onMouseDown={() => {
                                    const nameWithSize = g.size ? `${g.name} (${g.size})` : (g.name || '');
                                    updateRow(row.id, 'productName', nameWithSize);
                                    updateRow(row.id, 'productSearch', nameWithSize);
                                    updateRow(row.id, 'sellingPrice', String(g.price || g.sellingPrice || ''));
                                    updateRow(row.id, 'showDrop', false);
                                  }}
                                  style={{
                                    padding: '9px 14px', cursor: 'pointer', fontSize: '13px',
                                    color: 'var(--text-primary, #111)',
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.background = 'var(--background, #f9fafb)'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                  {g.name}
                                  {g.size ? <span style={{ color: '#6b7280', fontSize: '0.85em', marginLeft: 4 }}>{g.size}</span> : null}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Qty + Selling Price */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary, #6b7280)', marginBottom: '4px' }}>Quantity *</label>
                            <input type="number" min="0" step="1"
                              style={{ width: '100%', padding: '8px 10px', borderRadius: '7px', fontSize: '13px', background: 'var(--surface, white)', color: 'var(--text-primary, #111)', boxSizing: 'border-box', ...errorBorder('ao_qty_' + row.id, fieldErrors) }}
                              value={row.qty} placeholder="0"
                              onChange={e => { updateRow(row.id, 'qty', e.target.value); clearFieldError('ao_qty_' + row.id); }} />
                            <ValidationNote field={'ao_qty_' + row.id} errors={fieldErrors} />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary, #6b7280)', marginBottom: '4px' }}>Selling Price</label>
                            <input type="number" min="0" step="0.01"
                              style={{ width: '100%', padding: '8px 10px', border: '1.5px solid var(--border, #e5e7eb)', borderRadius: '7px', fontSize: '13px', background: 'var(--surface, white)', color: 'var(--text-primary, #111)', boxSizing: 'border-box' }}
                              value={row.sellingPrice} placeholder="0.00"
                              onChange={e => updateRow(row.id, 'sellingPrice', e.target.value)} />
                          </div>
                        </div>

                        {/* Subtotal preview */}
                        {subtotal > 0 && (
                          <div style={{
                            padding: '6px 10px', background: '#f0f4ff',
                            border: '1px solid #c7d2fe', borderRadius: '7px',
                            fontSize: '12px', color: '#4338ca', fontWeight: 600,
                          }}>
                            Subtotal: {fmt(subtotal)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Add another row */}
                <button
                  onClick={addRow}
                  disabled={!lastRowComplete()}
                  style={{
                    marginTop: '10px', width: '100%', padding: '10px',
                    border: '1.5px dashed var(--border, #d1d5db)', borderRadius: '8px',
                    background: lastRowComplete() ? 'var(--surface, white)' : 'var(--background, #f9fafb)',
                    color: lastRowComplete() ? '#667eea' : '#9ca3af',
                    cursor: lastRowComplete() ? 'pointer' : 'not-allowed',
                    fontSize: '13px', fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  }}
                >
                  <Plus size={14}/> Add Another Product
                </button>
              </div>

              {/* Grand total */}
              {grandTotal > 0 && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 14px', background: '#f0f4ff',
                  border: '1.5px solid #c7d2fe', borderRadius: '10px',
                }}>
                  <span style={{ fontWeight: 700, fontSize: '14px', color: '#4338ca' }}>Order Total</span>
                  <span style={{ fontWeight: 800, fontSize: '15px', color: '#3730a3' }}>{fmt(grandTotal)}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', gap: '10px', padding: '16px 20px',
          borderTop: '1px solid var(--border, #e5e7eb)', flexShrink: 0,
        }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '12px', borderRadius: '8px',
            border: '1.5px solid var(--border, #e5e7eb)',
            background: 'var(--surface, white)', color: 'var(--text-primary, #111)',
            cursor: 'pointer', fontWeight: 600, fontSize: '14px',
          }}>Cancel</button>
          {activeTab === 'details' ? (
            <button onClick={handleNextToOrder} style={{
              flex: 1, padding: '12px', borderRadius: '8px', border: 'none',
              background: '#667eea', color: 'white',
              cursor: 'pointer', fontWeight: 700, fontSize: '14px',
            }}>Next: Advance Order →</button>
          ) : (
            <button onClick={handleSave} disabled={saving} style={{
              flex: 1, padding: '12px', borderRadius: '8px', border: 'none',
              background: saving ? '#9ca3af' : '#f59e0b', color: 'white',
              cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '14px',
            }}>
              {saving ? 'Saving…' : 'Save Advance Order'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Store Closed Banner ────────────────────────────────────────────────────────
function StoreClosedBanner() {
  return (
    <div style={{
      background:'#fef3c7', border:'1.5px solid #f59e0b', borderRadius:'10px',
      padding:'20px', margin:'16px', textAlign:'center', color:'#92400e'
    }}>
      <div style={{ fontSize:'32px', marginBottom:'8px' }}>🔒</div>
      <div style={{ fontWeight:700, fontSize:'15px', marginBottom:'4px' }}>Store Not Open</div>
      <div style={{ fontSize:'13px', lineHeight:'1.5' }}>
        Open the day in <strong>Cash Reconciliation</strong> to use the Cash Record and add entries.
      </div>
    </div>
  );
}

// ── New Supplier Modal ────────────────────────────────────────────────────────
function NewSupplierModal({ onSave, onClose, suppliersList = [] }) {
  const { fmt } = useCurrency();
  const { fieldErrors, showError, clearFieldError } = useValidation();
  const [activeTab, setActiveTab] = useState('details');
  const [supplierMode, setSupplierMode] = useState('search');
  const [supplierSearchText, setSupplierSearchText] = useState('');
  const [showSupplierDrop, setShowSupplierDrop] = useState(false);
  const [selectedExistingSupplier, setSelectedExistingSupplier] = useState(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [detailsError, setDetailsError] = useState('');
  const detailsErrorRef = useRef(null);
  const nsFieldRefs = { fullName: useRef(null), phone: useRef(null), whatsapp: useRef(null), address: useRef(null) };
  const [paymentType, setPaymentType] = useState('cash');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [date, setDate] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; });
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const nextId = useRef(2);
  const [items, setItems] = useState([{ id: 1, name: '', qty: '', costPrice: '' }]);
  const [saving, setSaving] = useState(false);

  const updateItem = (id, field, val) => setItems(prev => prev.map(it => it.id === id ? { ...it, [field]: val } : it));
  const addItem = () => setItems(prev => [...prev, { id: nextId.current++, name: '', qty: '', costPrice: '' }]);
  const removeItem = id => setItems(prev => prev.filter(it => it.id !== id));
  const grandTotal = items.reduce((sum, it) => sum + (parseFloat(it.qty) || 0) * (parseFloat(it.costPrice) || 0), 0);
  const lastItemComplete = () => { const last = items[items.length - 1]; return last && last.name.trim() && parseFloat(last.qty) > 0; };

  const validateDetails = () => {
    if (!fullName.trim()) { showError('ns_fullName', 'Enter the Supplier Name'); return { msg: 'Supplier Name is required.', field: 'fullName' }; }
    if (!phone.trim())    { showError('ns_phone', 'Enter the Phone');            return { msg: 'Phone is required.',           field: 'phone' }; }
    if (!whatsapp.trim() && !email.trim()) return { msg: 'At least WhatsApp or Email is required.', field: 'whatsapp' };
    if (email.trim() && !email.includes('@')) return { msg: 'Email must contain "@".', field: 'whatsapp' };
    if (!address.trim())  { showError('ns_address', 'Enter the Address');        return { msg: 'Address is required.',         field: 'address' }; }
    return null;
  };
  const nsScrollToField = (fieldKey) => {
    setTimeout(() => {
      const ref = nsFieldRefs[fieldKey];
      if (ref?.current) ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      else detailsErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  };
  const handleNextToPurchase = () => {
    const err = validateDetails();
    if (err) { setDetailsError(err.msg); nsScrollToField(err.field); return; }
    setDetailsError('');
    setActiveTab('purchase');
  };

  const handleSave = async () => {
    const err = validateDetails();
    if (err) { setActiveTab('details'); setDetailsError(err.msg); nsScrollToField(err.field); return; }
    if (!invoiceRef.trim()) return showError('ns_invoiceRef', 'Enter the Invoice / Ref');
    if (!date) return showError('ns_date', 'Enter the Date');
    const validItems = items.filter(it => it.name.trim() && parseFloat(it.qty) > 0);
    if (validItems.length === 0) return showError('ns_items', 'Add at least one item');
    setSaving(true);
    try {
      const dateISO = new Date(date + 'T12:00:00').toISOString();
      const supplierName = fullName.trim();
      let supplierId = selectedExistingSupplier?.id || null;
      if (!supplierId) {
        const supplierData = {
          id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
          customerName: supplierName, name: supplierName,
          phone: phone.trim(), customerPhone: phone.trim(), gender: '',
          whatsapp: whatsapp.trim(), email: email.trim(), address: address.trim(),
          totalDue: 0, totalPaid: 0, balance: 0, purchaseIds: [], deposits: [],
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastSale: null,
        };
        const current = await dataService.getSuppliers() || [];
        current.push(supplierData);
        await dataService.setSuppliers(current);
        supplierId = supplierData.id;
      }
      const savedItems = [];
      for (const it of validItems) {
        const qty = parseFloat(it.qty) || 0, costPrice = parseFloat(it.costPrice) || 0, subtotal = qty * costPrice;
        await dataService.addOperationalAsset({ name: it.name.trim(), qty, costPrice, subtotal, supplierName, supplierId, invoiceRef: invoiceRef.trim(), paymentType, date: dateISO, source: 'purchase' });
        savedItems.push({ name: it.name.trim(), qty, costPrice, subtotal });
      }
      onSave({ supplierName, supplierId, paymentType, total: grandTotal, invoiceRef: invoiceRef.trim(), itemsSummary: savedItems.map(i => i.name).join(', '), items: savedItems });
    } catch (e) { console.error(e); showError('ns_items', 'Failed to save. Please try again.'); }
    finally { setSaving(false); }
  };

  const fs = { width:'100%', padding:'10px 12px', border:'2px solid var(--border, #e5e7eb)', borderRadius:'8px', fontSize:'14px', background:'var(--surface, white)', color:'var(--text-primary, #111)', boxSizing:'border-box' };
  const ls = { display:'block', fontWeight:600, fontSize:'13px', marginBottom:'6px', color:'var(--text-primary, #374151)' };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:5500, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}>
      <div style={{ background:'var(--surface, white)', color:'var(--text-primary, #111)', borderRadius:'14px', width:'100%', maxWidth:'480px', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 12px 48px rgba(0,0,0,0.3)', overflow:'hidden' }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 20px', borderBottom:'1px solid var(--border, #e5e7eb)', flexShrink:0 }}>
          <h2 style={{ margin:0, fontSize:'16px', fontWeight:700 }}>📦 {selectedExistingSupplier ? `${(selectedExistingSupplier.name || selectedExistingSupplier.customerName)}'s Purchase` : 'New Supplier'}</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-secondary, #6b7280)', padding:'4px', borderRadius:'4px', display:'flex', alignItems:'center' }}><X size={20}/></button>
        </div>
        {/* Tabs */}
        <div style={{ display:'flex', borderBottom:'1px solid var(--border, #e5e7eb)', flexShrink:0 }}>
          {[['details','📦 Supplier Details'],['purchase','📋 Purchase History']].map(([key, lbl]) => (
            <button key={key} onClick={() => { if (key === 'purchase') handleNextToPurchase(); else setActiveTab(key); }}
              style={{ flex:1, padding:'12px', background:'none', border:'none', borderBottom: activeTab === key ? '3px solid #667eea' : '3px solid transparent', fontWeight: activeTab === key ? 700 : 500, fontSize:'13px', color: activeTab === key ? '#667eea' : 'var(--text-secondary, #6b7280)', cursor:'pointer' }}>{lbl}</button>
          ))}
        </div>
        {/* Body */}
        <div style={{ overflowY:'auto', padding:'20px', flex:1, display:'flex', flexDirection:'column', gap:'14px' }}>
          {activeTab === 'details' && (<>
            {detailsError && <div ref={detailsErrorRef} style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:'8px', padding:'10px 12px', fontSize:'13px', color:'#b91c1c' }}>{detailsError}</div>}
            <div ref={nsFieldRefs.fullName} style={{ position:'relative' }}>
              <label style={ls}>Supplier Name *</label>
              <div style={{ display:'flex', gap:'8px', alignItems:'flex-start' }}>
                <div style={{ flex:1, position:'relative' }}>
                  <input data-field="ns_fullName" style={{ ...fs, ...errorBorder('ns_fullName', fieldErrors), background: supplierMode === 'search' && selectedExistingSupplier ? 'var(--background, #f0fdf4)' : fs.background }}
                    value={supplierMode === 'search' ? supplierSearchText : fullName} placeholder="Search Suppliers"
                    readOnly={supplierMode === 'search' && !!selectedExistingSupplier}
                    onChange={e => { if (supplierMode === 'search') { setSupplierSearchText(e.target.value); setShowSupplierDrop(true); setSelectedExistingSupplier(null); setFullName(''); setPhone(''); setWhatsapp(''); setEmail(''); setAddress(''); } else { setFullName(e.target.value); } clearFieldError('ns_fullName'); }}
                    onFocus={() => { if (supplierMode === 'search' && !selectedExistingSupplier) setShowSupplierDrop(true); }}
                    onBlur={() => setTimeout(() => setShowSupplierDrop(false), 220)} />
                  {showSupplierDrop && supplierMode === 'search' && (() => {
                    const q = supplierSearchText.toLowerCase();
                    const matches = suppliersList.filter(s => !q || (s.name || s.customerName || '').toLowerCase().includes(q));
                    return matches.length > 0 ? (
                      <div className="cj-desc-dropdown" style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:500 }}>
                        {matches.map(s => { const n = s.name || s.customerName || ''; return (
                          <button key={s.id} className="cj-desc-dropdown-item" onMouseDown={() => { setSupplierSearchText(n); setSelectedExistingSupplier(s); setShowSupplierDrop(false); setFullName(n); setPhone(s.phone || ''); setWhatsapp(s.whatsapp || ''); setEmail(s.email || ''); setAddress(s.address || ''); }}>{n}</button>
                        ); })}
                      </div>
                    ) : null;
                  })()}
                  {supplierMode === 'search' && selectedExistingSupplier && (
                    <button onClick={() => { setSelectedExistingSupplier(null); setSupplierSearchText(''); setFullName(''); setPhone(''); setWhatsapp(''); setEmail(''); setAddress(''); }}
                      style={{ position:'absolute', right:'8px', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#9ca3af', fontSize:'16px', padding:'2px 4px', lineHeight:1 }} title="Clear">✕</button>
                  )}
                </div>
                <button onClick={() => { if (supplierMode === 'search') { setSupplierMode('new'); setSelectedExistingSupplier(null); setSupplierSearchText(''); setShowSupplierDrop(false); setFullName(''); setPhone(''); setWhatsapp(''); setEmail(''); setAddress(''); } else { setSupplierMode('search'); setFullName(''); setPhone(''); setWhatsapp(''); setEmail(''); setAddress(''); setSupplierSearchText(''); } }}
                  style={{ padding:'10px 12px', borderRadius:'8px', fontSize:'12px', fontWeight:600, border: supplierMode === 'new' ? '2px solid #16a34a' : '2px solid #667eea', background: supplierMode === 'new' ? '#f0fdf4' : '#eef2ff', color: supplierMode === 'new' ? '#16a34a' : '#667eea', cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 }}>
                  {supplierMode === 'new' ? '🔍 Search' : '+ New'}
                </button>
              </div>
              <ValidationNote field="ns_fullName" errors={fieldErrors} />
            </div>
            <div ref={nsFieldRefs.phone}><label style={ls}>Phone *</label><input data-field="ns_phone" style={{ ...fs, ...errorBorder('ns_phone', fieldErrors) }} value={phone} placeholder="Phone number" readOnly={supplierMode === 'search' && !!selectedExistingSupplier} onChange={e => { setPhone(e.target.value); clearFieldError('ns_phone'); }} /><ValidationNote field="ns_phone" errors={fieldErrors} /></div>
            <div ref={nsFieldRefs.whatsapp}><label style={ls}>WhatsApp</label><input style={fs} value={whatsapp} placeholder="WhatsApp number" readOnly={supplierMode === 'search' && !!selectedExistingSupplier} onChange={e => setWhatsapp(e.target.value)} /></div>
            <div><label style={ls}>Email</label><input style={fs} value={email} placeholder="email@example.com" readOnly={supplierMode === 'search' && !!selectedExistingSupplier} onChange={e => setEmail(e.target.value)} /></div>
            <div ref={nsFieldRefs.address}><label style={ls}>Address *</label><input data-field="ns_address" style={{ ...fs, ...errorBorder('ns_address', fieldErrors) }} value={address} placeholder="Supplier address" readOnly={supplierMode === 'search' && !!selectedExistingSupplier} onChange={e => { setAddress(e.target.value); clearFieldError('ns_address'); }} /><ValidationNote field="ns_address" errors={fieldErrors} /></div>
          </>)}
          {activeTab === 'purchase' && (<>
            <div><label style={ls}>Payment Type</label>
              <div style={{ display:'flex', gap:'8px' }}>
                {[['cash','💵 Cash'],['credit','📋 Credit']].map(([pt, lbl]) => (
                  <button key={pt} onClick={() => setPaymentType(pt)} style={{ flex:1, padding:'9px', borderRadius:'8px', border:'2px solid', borderColor: paymentType === pt ? (pt === 'cash' ? '#16a34a' : '#4f46e5') : 'var(--border, #d1d5db)', background: paymentType === pt ? (pt === 'cash' ? '#f0fdf4' : '#eef2ff') : 'var(--surface, white)', fontWeight: paymentType === pt ? 700 : 400, cursor:'pointer', fontSize:'13px', color:'var(--text-primary, #111)' }}>{lbl}</button>
                ))}
              </div>
            </div>
            <div><label style={ls}>Invoice / Ref *</label><input data-field="ns_invoiceRef" style={{ ...fs, ...errorBorder('ns_invoiceRef', fieldErrors) }} value={invoiceRef} placeholder="Receipt or invoice number…" onChange={e => { setInvoiceRef(e.target.value); clearFieldError('ns_invoiceRef'); }} /><ValidationNote field="ns_invoiceRef" errors={fieldErrors} /></div>
            <div><label style={ls}>Date *</label><input type="date" data-field="ns_date" style={{ ...fs, ...errorBorder('ns_date', fieldErrors) }} value={date} max={todayStr()} onChange={e => { setDate(e.target.value); clearFieldError('ns_date'); }} /><ValidationNote field="ns_date" errors={fieldErrors} /></div>
            <div>
              <label style={{ display:'block', fontWeight:600, fontSize:'13px', marginBottom:'8px', color:'var(--text-primary, #374151)' }}>Items *</label>
              <div data-field="ns_items" style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                {items.map((it, idx) => { const sub = (parseFloat(it.qty)||0)*(parseFloat(it.costPrice)||0); return (
                  <div key={it.id} style={{ border:'1.5px solid var(--border, #e5e7eb)', borderRadius:'10px', padding:'12px', background:'var(--background, #f9fafb)', display:'flex', flexDirection:'column', gap:'10px' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <span style={{ fontSize:'12px', fontWeight:700, color:'#667eea' }}>Item {idx+1}</span>
                      {items.length > 1 && <button onClick={() => removeItem(it.id)} style={{ background:'#fee2e2', border:'none', borderRadius:'6px', padding:'4px 8px', cursor:'pointer', color:'#dc2626', display:'flex', alignItems:'center', gap:'4px', fontSize:'12px' }}><Trash2 size={12}/> Remove</button>}
                    </div>
                    <div><label style={{ display:'block', fontSize:'12px', fontWeight:600, color:'var(--text-secondary, #6b7280)', marginBottom:'4px' }}>Asset Name *</label>
                      <input style={{ width:'100%', padding:'8px 10px', border:'1.5px solid var(--border, #e5e7eb)', borderRadius:'7px', fontSize:'13px', background:'var(--surface, white)', color:'var(--text-primary, #111)', boxSizing:'border-box' }} value={it.name} placeholder="e.g. Generator, Office Chair…" onChange={e => updateItem(it.id, 'name', e.target.value)} /></div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                      <div><label style={{ display:'block', fontSize:'12px', fontWeight:600, color:'var(--text-secondary, #6b7280)', marginBottom:'4px' }}>Quantity *</label>
                        <input type="number" min="0" step="1" style={{ width:'100%', padding:'8px 10px', border:'1.5px solid var(--border, #e5e7eb)', borderRadius:'7px', fontSize:'13px', background:'var(--surface, white)', color:'var(--text-primary, #111)', boxSizing:'border-box' }} value={it.qty} placeholder="0" onChange={e => updateItem(it.id, 'qty', e.target.value)} /></div>
                      <div><label style={{ display:'block', fontSize:'12px', fontWeight:600, color:'var(--text-secondary, #6b7280)', marginBottom:'4px' }}>Unit Cost</label>
                        <input type="number" min="0" step="0.01" style={{ width:'100%', padding:'8px 10px', border:'1.5px solid var(--border, #e5e7eb)', borderRadius:'7px', fontSize:'13px', background:'var(--surface, white)', color:'var(--text-primary, #111)', boxSizing:'border-box' }} value={it.costPrice} placeholder="0.00" onChange={e => updateItem(it.id, 'costPrice', e.target.value)} /></div>
                    </div>
                    {sub > 0 && <div style={{ padding:'6px 10px', background:'#f0f4ff', border:'1px solid #c7d2fe', borderRadius:'7px', fontSize:'12px', color:'#4338ca', fontWeight:600 }}>Subtotal: {fmt(sub)}</div>}
                  </div>
                ); })}
              </div>
              <ValidationNote field="ns_items" errors={fieldErrors} />
              <button onClick={addItem} disabled={!lastItemComplete()} style={{ marginTop:'10px', width:'100%', padding:'10px', border:'1.5px dashed var(--border, #d1d5db)', borderRadius:'8px', background: lastItemComplete() ? 'var(--surface, white)' : 'var(--background, #f9fafb)', color: lastItemComplete() ? '#667eea' : '#9ca3af', cursor: lastItemComplete() ? 'pointer' : 'not-allowed', fontSize:'13px', fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center', gap:'6px' }}><Plus size={14}/> Add Another Item</button>
            </div>
            {grandTotal > 0 && <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:'#f0f4ff', border:'1.5px solid #c7d2fe', borderRadius:'10px' }}><span style={{ fontWeight:700, fontSize:'14px', color:'#4338ca' }}>Grand Total</span><span style={{ fontWeight:800, fontSize:'15px', color:'#3730a3' }}>{fmt(grandTotal)}</span></div>}
          </>)}
        </div>
        {/* Footer */}
        <div style={{ display:'flex', gap:'10px', padding:'16px 20px', borderTop:'1px solid var(--border, #e5e7eb)', flexShrink:0 }}>
          <button onClick={onClose} style={{ flex:1, padding:'12px', borderRadius:'8px', border:'1.5px solid var(--border, #e5e7eb)', background:'var(--surface, white)', color:'var(--text-primary, #111)', cursor:'pointer', fontWeight:600, fontSize:'14px' }}>Cancel</button>
          {activeTab === 'details'
            ? <button onClick={handleNextToPurchase} style={{ flex:1, padding:'12px', borderRadius:'8px', border:'none', background:'#667eea', color:'white', cursor:'pointer', fontWeight:700, fontSize:'14px' }}>Next: Purchase History →</button>
            : <button onClick={handleSave} disabled={saving} style={{ flex:1, padding:'12px', borderRadius:'8px', border:'none', background: saving ? '#9ca3af' : '#f59e0b', color:'white', cursor: saving ? 'not-allowed' : 'pointer', fontWeight:700, fontSize:'14px' }}>{saving ? 'Saving…' : 'Save Purchase'}</button>
          }
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
function CashRecord() {
  const { fmt } = useCurrency();
  const { showError } = useValidation();
  const [entries, setEntries]             = useState([]);
  const [filteredEntries, setFilteredEntries] = useState([]);
  const [editEntry, setEditEntry]         = useState(null);
  const [currentBalance, setCurrentBalance] = useState(0);

  // Filter states
  const [typeFilter, setTypeFilter]       = useState('all');
  const [dateFilter, setDateFilter]       = useState('today');
  const [selectedDate, setSelectedDate]   = useState('');
  const [startDate, setStartDate]         = useState('');
  const [endDate, setEndDate]             = useState('');
  const [appliedTypeFilter, setAppliedTypeFilter] = useState('all');
  const [appliedDateFilter, setAppliedDateFilter] = useState('today');
  const [appliedSelectedDate, setAppliedSelectedDate] = useState('');
  const [appliedStartDate, setAppliedStartDate] = useState('');
  const [appliedEndDate, setAppliedEndDate]     = useState('');
  const [showFilters, setShowFilters]     = useState(false);

  // Add Entry modal
  const [showAddModal, setShowAddModal]   = useState(false);
  const [newType, setNewType]             = useState(TYPE_IN);
  const [newAmount, setNewAmount]         = useState('');
  const [isProcessing, setIsProcessing]   = useState(false);
  // Inline fields (shared)
  const [personName, setPersonName]           = useState('');
  const [isOthersMode, setIsOthersMode]       = useState(false);
  const [personSearch, setPersonSearch]        = useState('');
  const [showNameDrop, setShowNameDrop]        = useState(false);
  const [showSearchDrop, setShowSearchDrop]    = useState(false);
  const [creditorsList, setCreditorsList]      = useState([]);
  const [suppliersList, setSuppliersList]      = useState([]);
  const [usersList, setUsersList]              = useState([]);
  const [landlordInfo, setLandlordInfo]        = useState(null); // { name, monthlyRent }
  const [shopName, setShopName]                = useState(APP_NAME);
  const [selectedUserRole, setSelectedUserRole]   = useState('');
  const [selectedUserGender, setSelectedUserGender] = useState('');
  const [refNumber, setRefNumber]              = useState('');
  // Others-mode sub-dropdown (Advance Orders List vs Create New)
  const [showOthersSubDrop, setShowOthersSubDrop] = useState(false);
  const [advanceOrdersList, setAdvanceOrdersList]  = useState([]);
  const [showCreateAdvanceModal, setShowCreateAdvanceModal] = useState(false);
  const [selectedAdvanceOrder, setSelectedAdvanceOrder] = useState(null); // stores matched order {name, invoiceRef}
  const [advanceOrderCardData, setAdvanceOrderCardData] = useState(null); // full advance order record to show in card
  // Cash In specific
  const [cashInReasonKey, setCashInReasonKey]  = useState('');
  const [showCashInReasonDrop, setShowCashInReasonDrop] = useState(false);
  // Cash Out specific
  const [beingForKey, setBeingForKey]          = useState('');
  const [showBeingForDrop, setShowBeingForDrop] = useState(false);
  const [otherReasonText, setOtherReasonText]  = useState('');
  const [showOtherReasonInput, setShowOtherReasonInput] = useState(false);
  // Operational Expenses modal (supplier purchase from Cash Out)
  const [showExpensesModal, setShowExpensesModal] = useState(false);
  const [showNewSupplierModal, setShowNewSupplierModal] = useState(false);
  const [expensesResult, setExpensesResult]       = useState(null); // {paymentType, total, invoiceRef, itemsSummary}

  // ── Any dropdown currently open? ──────────────────────────────────────────
  const anyDropOpen = showNameDrop || showSearchDrop || showOthersSubDrop || showCashInReasonDrop || showBeingForDrop;

  // ── Close all dropdowns when clicking outside any dropdown field ──────────
  const closeAllDropdowns = () => {
    setShowNameDrop(false);
    setShowSearchDrop(false);
    setShowOthersSubDrop(false);
    setShowCashInReasonDrop(false);
    setShowBeingForDrop(false);
  };

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadEntries();
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) { loadEntries(); }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { applyFilters(); }, [entries, appliedTypeFilter, appliedDateFilter, appliedSelectedDate, appliedStartDate, appliedEndDate]);



  const loadEntries = async () => {
    const allEntries = await dataService.getCashEntries();
    const sorted = (allEntries || []).sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
    let running = 0;
    const withBalance = sorted.map(entry => {
      running += entry.type === TYPE_IN ? entry.amount : -entry.amount;
      return { ...entry, balance: running };
    });
    setCurrentBalance(running);
    setEntries([...withBalance].reverse());
  };

  const resolveDate = (entry) => {
    const raw = entry.date;
    if (!raw) return null;
    if (typeof raw === 'object' && raw.seconds) return new Date(raw.seconds * 1000);
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  };

  const toMidnight = (d) => { const c = new Date(d); c.setHours(0,0,0,0); return c; };

  const applyFilters = () => {
    let filtered = [...entries];
    if (appliedTypeFilter !== 'all') filtered = filtered.filter(e => e.type === appliedTypeFilter);
    const today = toMidnight(new Date());
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    if (appliedDateFilter === 'today')
      filtered = filtered.filter(e => { const d = resolveDate(e); return d && d >= today && d < tomorrow; });
    if (appliedDateFilter === 'single' && appliedSelectedDate) {
      const s = toMidnight(new Date(appliedSelectedDate)), e2 = new Date(s); e2.setDate(e2.getDate() + 1);
      filtered = filtered.filter(e => { const d = resolveDate(e); return d && d >= s && d < e2; });
    }
    if (appliedDateFilter === 'range' && appliedStartDate && appliedEndDate) {
      const s = toMidnight(new Date(appliedStartDate));
      const e2 = new Date(toMidnight(new Date(appliedEndDate))); e2.setDate(e2.getDate() + 1);
      filtered = filtered.filter(e => { const d = resolveDate(e); return d && d >= s && d < e2; });
    }
    setFilteredEntries(filtered);
  };

  // ── Filter controls ───────────────────────────────────────────────────────
  const isFilterComplete = () => {
    if (dateFilter === 'today') return true;
    if (dateFilter === 'single') return !!selectedDate;
    if (dateFilter === 'range') return !!(startDate && endDate);
    return false;
  };
  const hasChanged = () =>
    typeFilter !== appliedTypeFilter || dateFilter !== appliedDateFilter ||
    selectedDate !== appliedSelectedDate || startDate !== appliedStartDate || endDate !== appliedEndDate;
  const showApply = isFilterComplete() && hasChanged();

  const handleCloseFilter = () => {
    setTypeFilter(appliedTypeFilter); setDateFilter(appliedDateFilter);
    setSelectedDate(appliedSelectedDate); setStartDate(appliedStartDate); setEndDate(appliedEndDate);
    setShowFilters(false);
  };
  const handleApply = () => {
    setAppliedTypeFilter(typeFilter); setAppliedDateFilter(dateFilter);
    setAppliedSelectedDate(selectedDate); setAppliedStartDate(startDate); setAppliedEndDate(endDate);
    setShowFilters(false);
  };
  const handleFilterButtonClick = () => {
    if (!showFilters)    setShowFilters(true);
    else if (showApply)  handleApply();
    else                 handleCloseFilter();
  };

  // ── Add Entry ─────────────────────────────────────────────────────────────
  const resetAddModal = () => {
    setNewAmount(''); setNewType(TYPE_IN);
    setPersonName(''); setIsOthersMode(false); setPersonSearch('');
    setShowNameDrop(false); setShowSearchDrop(false);
    setRefNumber('');
    setCashInReasonKey(''); setShowCashInReasonDrop(false);
    setBeingForKey(''); setShowBeingForDrop(false);
    setOtherReasonText(''); setShowOtherReasonInput(false);
    setShowExpensesModal(false); setShowNewSupplierModal(false); setExpensesResult(null);
    setShowOthersSubDrop(false); setShowCreateAdvanceModal(false);
    setSelectedAdvanceOrder(null);
    setSelectedUserRole(''); setSelectedUserGender('');
  };
  const openAddModal = async () => {
    resetAddModal();
    setShowAddModal(true);
    // Pre-load creditors, suppliers, advance orders, users, landlord and shopName for dropdowns
    const [creds, supps, advOrders, users, landlord, sName] = await Promise.all([
      dataService.getCreditors(),
      dataService.getSuppliers(),
      dataService.getAdvanceOrders(),
      dataService.getUsers(),
      dataService.getLandlord(),
      dataService.getShopName(),
    ]);
    setCreditorsList(creds || []);
    setSuppliersList(supps || []);
    setAdvanceOrdersList(advOrders || []);
    setUsersList((users || []).filter(u => u.id !== '__landlord__'));
    setLandlordInfo(landlord || null);
    setShopName(sName || APP_NAME);
  };
  const closeAddModal = () => { setShowAddModal(false); resetAddModal(); };

  const handleNameSelect = (name, role, gender) => {
    setShowNameDrop(false);
    // Reset being-for and expenses when name changes
    setBeingForKey(''); setExpensesResult(null);
    setOtherReasonText(''); setShowOtherReasonInput(false);
    setSelectedAdvanceOrder(null);
    setAdvanceOrderCardData(null);
    setSelectedUserRole(role || '');
    setSelectedUserGender(gender || '');
    if (name === 'Others') {
      setIsOthersMode(true);
      setPersonName('');
      setPersonSearch('');
    } else {
      setIsOthersMode(false);
      setPersonName(name);
      setPersonSearch('');
      // Auto-set Being For if this name matches an advance order
      if (newType === TYPE_IN && advanceOrdersList.length > 0) {
        const match = advanceOrdersList.find(o =>
          (o.name || o.customerName || '').toLowerCase() === name.toLowerCase()
        );
        if (match) {
          setSelectedAdvanceOrder({ name: match.name || match.customerName, invoiceRef: match.invoiceRef || match.id });
          setCashInReasonKey('__advance_order__');
          // Show the customer's advance order card
          setAdvanceOrderCardData(match);
        }
      }
    }
  };

  const getResolvedName = () => {
    // For Cash Out, personSearch holds the typed/selected supplier name
    // For Cash In Others mode, personSearch holds the typed creditor name
    if (isOthersMode) return personSearch.trim() || personName.trim();
    if (personName.trim()) return personName.trim();
    return personSearch.trim();
  };

  const filteredOthersList = (() => {
    const list = newType === TYPE_IN ? creditorsList : suppliersList;
    const q = personSearch.toLowerCase();
    return list.filter(item => {
      const n = (item.name || item.customerName || '').toLowerCase();
      return n.includes(q);
    });
  })();

  const handleBeingForSelect = (key) => {
    setShowBeingForDrop(false);
    setBeingForKey(key);
    if (key === 'other') {
      setShowOtherReasonInput(true);
      setOtherReasonText('');
    } else {
      setShowOtherReasonInput(false);
      setOtherReasonText('');
    }
  };

  // When BEING FOR is clicked and paid-to is a supplier → open expenses modal
  const handleBeingForClick = () => {
    const name = getResolvedName();
    if (name && isKnownSupplier(name, suppliersList)) {
      // Open the operational expenses modal instead of the dropdown
      setShowExpensesModal(true);
    } else {
      setShowBeingForDrop(o => !o);
    }
  };

  // Called when AddOperationalAssetsModal saves.
  // The modal only writes operational_assets records directly.
  // For cash purchases we must also create the cash OUT entry here.
  const handleExpensesSaved = async (result) => {
    setExpensesResult(result);
    setShowExpensesModal(false);

    const supplierName = result.supplierName || getResolvedName();
    const note = `Paid ${supplierName} for ref: ${result.invoiceRef}`;

    if (result.paymentType === 'cash') {
      try {
        const now = new Date();
        await dataService.addCashEntry({
          type: TYPE_OUT,
          amount: result.total,
          note,
          date: now.toISOString(),
          source: 'purchase',
          business_date: now.toISOString().slice(0, 10),
          invoiceRef: result.invoiceRef,
        });
      } catch (e) { console.error('Error creating cash entry for asset purchase:', e); }
      setNewAmount(String(result.total));
    } else {
      setNewAmount('0');
    }

    if (result.invoiceRef) setRefNumber(result.invoiceRef);
    setBeingForKey('__supplier_purchase__');
    // Update personName/personSearch so the parent modal reflects the (possibly changed) supplier
    if (!isOthersMode) {
      setPersonName(result.supplierName || getResolvedName());
    } else {
      setPersonSearch(result.supplierName || getResolvedName());
    }
  };

  const buildNote = () => {
    const name = getResolvedName();
    if (newType === TYPE_IN) {
      // Advance order customer
      if (cashInReasonKey === '__advance_order__' && selectedAdvanceOrder) {
        return `Advance Order ref: ${selectedAdvanceOrder.invoiceRef || '—'} by ${selectedAdvanceOrder.name}.`;
      }
      // Use role-based reasons if available, otherwise fall back to CASH_IN_REASONS
      const roleReasons = selectedUserRole
        ? getCashFromBeingForOptions(selectedUserRole, selectedUserGender, shopName)
        : CASH_IN_REASONS;
      const reasonObj = roleReasons.find(r => r.key === cashInReasonKey) || CASH_IN_REASONS.find(r => r.key === cashInReasonKey);
      const phrase = reasonObj?.phrase || '';
      if (name && phrase) return `From ${name} ${phrase}.`;
      if (name) return `From ${name}.`;
      return '';
    } else {
      // Cash Out with supplier purchase
      if (beingForKey === '__supplier_purchase__' && expensesResult) {
        const supplierName = expensesResult.supplierName || name;
        return `Paid ${supplierName} for ref: ${expensesResult.invoiceRef}`;
      }
      // Cash Out with regular reason
      const phrase = beingForKey === 'other'
        ? (otherReasonText.trim() ? `for ${otherReasonText.trim()}` : '')
        : (PAID_TO_REASONS.find(r => r.key === beingForKey)?.phrase || '');
      if (name && phrase) return `Paid ${name} ${phrase}.`;
      if (name) return `Paid ${name}.`;
      return '';
    }
  };

  // ── Sequential unlock for add-cash modal fields ─────────────────────────
  const cr_seq_person   = !!(getResolvedName());                           // Cash From must be filled first
  const cr_seq_reason   = cr_seq_person;                                   // Being For unlocks after Cash From
  const cr_seq_amount   = cr_seq_reason && !!cashInReasonKey;               // Amount unlocks after Being For
  const cr_seq_ref      = cr_seq_amount && (parseFloat(newAmount) > 0 ||
    (newType === TYPE_OUT && beingForKey === '__supplier_purchase__' && !!expensesResult)); // Ref after Amount

  const canSave = () => {
    const name = getResolvedName();
    if (!name) return false;

    // Supplier purchase — assets + cash entry already saved, just need to confirm close
    if (newType === TYPE_OUT && beingForKey === '__supplier_purchase__' && expensesResult) {
      return true;
    }

    const amt = parseFloat(newAmount);
    if (isNaN(amt) || amt <= 0) return false;
    if (newType === TYPE_IN) {
      if (!cashInReasonKey) return false;
    }
    if (newType === TYPE_OUT) {
      if (!beingForKey) return false;
      if (beingForKey === 'other' && !otherReasonText.trim()) return false;
    }
    return true;
  };

  // Derive the active BEING FOR options for Cash In based on the selected user's role
  const activeCashInReasons = selectedUserRole
    ? getCashFromBeingForOptions(selectedUserRole, selectedUserGender, shopName)
    : CASH_IN_REASONS;

  const handleSaveEntry = async () => {
    const name = getResolvedName();
    if (!name) return showError('ce_person', `Enter the ${newType === TYPE_IN ? 'Cash From' : 'Paid To'}`);

    // ── Supplier purchase (assets + cash entry already saved by handleExpensesSaved) ──
    if (newType === TYPE_OUT && beingForKey === '__supplier_purchase__' && expensesResult) {
      closeAddModal();
      await loadEntries();
      return;
    }

    const amount = parseFloat(newAmount);
    if (isNaN(amount) || amount <= 0) return showError('ce_amount', 'Enter the Amount');
    if (newType === TYPE_IN && !cashInReasonKey) return showError('ce_reason', 'Select the Being For reason');
    if (newType === TYPE_OUT && !beingForKey) return showError('ce_reason', 'Select the Being For reason');
    if (newType === TYPE_OUT && beingForKey === 'other' && !otherReasonText.trim()) return showError('ce_otherReason', 'Enter the Reason');

    const note = buildNote();
    if (!note) return showError('ce_reason', 'Could not build description. Please fill all fields');

    setIsProcessing(true);
    try {
      const _now = new Date();
      await dataService.addCashEntry({
        type: newType, amount, note,
        date: _now.toISOString(),
        source: 'manual',
        business_date: _now.toISOString().slice(0, 10),
        ...(refNumber.trim() ? { invoiceRef: refNumber.trim() } : {}),
      });

      // If this is a "Shop's Withdrawals" Cash In — money returned to shop
      // from the withdrawal balance. Record as a Withdrawal IN entry.
      if (newType === TYPE_IN && selectedUserRole === "shop's withdrawals") {
        await dataService.addWithdrawal({
          type: 'in',
          amount,
          description: note,
          source: 'cash_in',
          date: _now.toISOString(),
        });
      }

      // If Cash In "Others" with a new name, create a creditor stub
      if (newType === TYPE_IN && isOthersMode && name) {
        const existing = creditorsList.find(c =>
          (c.name || c.customerName || '').toLowerCase() === name.toLowerCase()
        );
        if (!existing) {
          try {
            const creditors = await dataService.getCreditors() || [];
            const newCreditor = {
              id: Date.now(),
              name: name,
              customerName: name,
              phone: '', customerPhone: '', whatsapp: '', email: '', address: '', gender: '',
              repaymentDate: '',
              totalDue: 0, totalPaid: 0, balance: 0,
              deposits: [], purchaseIds: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            creditors.push(newCreditor);
            await dataService.setCreditors(creditors);
          } catch (e) { console.error('Error creating creditor stub:', e); }
        }
      }

      closeAddModal();
      await loadEntries();
    } catch (err) {
      console.error('Error saving cash entry:', err);
      showError('ce_amount', 'Failed to save entry. Please try again.');
    } finally { setIsProcessing(false); }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getTodayStr = () => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
  };
  const formatDisplayDate = (dateStr) =>
    new Date(dateStr).toLocaleDateString('en-GB', { day:'2-digit', month:'2-digit', year:'numeric' });
  const isYesterday = (dateStr) => {
    if (!dateStr) return false;
    const y = new Date(); y.setDate(y.getDate()-1);
    return toMidnight(new Date(dateStr)).getTime() === toMidnight(y).getTime();
  };
  const getTableTitle = () => {
    const typeMap = { all:'All Entries', in:'Cash In', out:'Cash Out' };
    const label = typeMap[appliedTypeFilter] || 'All Entries';
    if (appliedDateFilter === 'today') return `${label} Today`;
    if (appliedDateFilter === 'single' && appliedSelectedDate) {
      if (isYesterday(appliedSelectedDate)) return `${label} Yesterday`;
      return `${label} on ${formatDisplayDate(appliedSelectedDate)}`;
    }
    if (appliedDateFilter === 'range' && appliedStartDate && appliedEndDate)
      return `${label} from ${formatDisplayDate(appliedStartDate)} to ${formatDisplayDate(appliedEndDate)}`;
    return `${label} Today`;
  };
  const formatDateTime = (entry) => {
    const d = resolveDate(entry);
    if (!d) return { date:'N/A', time:'N/A' };
    return {
      date: d.toLocaleDateString('en-GB', { day:'2-digit', month:'2-digit', year:'numeric' }),
      time: entry.isUnrecorded ? 'UNRECORDED' : d.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12:true }),
    };
  };

  const totalRecords = filteredEntries.length;
  const netBalance = filteredEntries.reduce((sum, e) => sum + (e.type === TYPE_IN ? e.amount : -e.amount), 0);
  const btnLabel = !showFilters ? 'Filter Entries' : showApply ? 'Apply Filter' : 'Close Filter';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="cj-record">

      {/* ── Sticky header ── */}
      <div className="cj-sticky-bar">
        {showFilters && (
          <div className="filter-modal-overlay" onClick={handleCloseFilter}>
            <div className="filter-modal-sheet" onClick={e => e.stopPropagation()}>
              <div className="filter-modal-handle"/>
              <div className="filter-modal-title">Filter Entries</div>
            <div className="cj-filter-group">
              <label>Date Filter</label>
              <div className="cj-filter-buttons">
                {[['today','Today'],['single','Single Date'],['range','Date Range']].map(([val,lbl]) => (
                  <button key={val} className={`cj-filter-btn${dateFilter===val?' active':''}`}
                    onClick={() => { setDateFilter(val); setSelectedDate(''); setStartDate(''); setEndDate(''); }}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
            {dateFilter === 'single' && (
              <div className="cj-filter-group">
                <label>Select Date</label>
                <input type="date" value={selectedDate} max={getTodayStr()}
                  onChange={e => setSelectedDate(e.target.value)} className="cj-date-input" />
              </div>
            )}
            {dateFilter === 'range' && (
              <div className="cj-filter-group">
                <label>Date Range</label>
                <div className="cj-date-range-inputs">
                  <div className="cj-date-range-field">
                    <label className="cj-date-range-label">From:</label>
                    <input type="date" value={startDate} max={getTodayStr()}
                      onChange={e => { setStartDate(e.target.value); if (endDate && endDate < e.target.value) setEndDate(''); }}
                      className="cj-date-input" />
                  </div>
                  <div className="cj-date-range-field">
                    <label className="cj-date-range-label">To:</label>
                    <input type="date" value={endDate} min={startDate||undefined} max={getTodayStr()}
                      disabled={!startDate} onChange={e => setEndDate(e.target.value)}
                      className={`cj-date-input${!startDate?' cj-date-input-disabled':''}`} />
                  </div>
                </div>
                {!startDate && <span className="cj-date-range-hint">Select a "From" date first</span>}
              </div>
            )}
              <div className="filter-modal-actions">
                <button className="filter-modal-cancel" onClick={handleCloseFilter}>Cancel</button>
                <button className="filter-modal-apply" onClick={handleApply}>Apply Filter</button>
              </div>
            </div>
          </div>
        )}

        <div className="cj-top-row">
          <button
            className={`cj-filter-action-btn${!showFilters ? ' cjfab-open' : showApply ? ' cjfab-apply' : ' cjfab-close'}`}
            onClick={handleFilterButtonClick}>{btnLabel}</button>
          {!showFilters && (
            <button className="cj-add-btn" onClick={openAddModal}>+ Add Cash In</button>
          )}
        </div>
        <h3 className="cj-table-title">{getTableTitle()}</h3>
        <div className="cj-stats-boxes">
          <div className="cj-stat-box cj-stat-purple">
            <div className="cj-stat-label">Total Records</div>
            <div className="cj-stat-value">{totalRecords}</div>
          </div>
          <div className={`cj-stat-box ${netBalance >= 0 ? 'cj-stat-green' : 'cj-stat-red'}`}>
            <div className="cj-stat-label">Net Balance</div>
            <div className="cj-stat-value">{netBalance < 0 ? '-' : ''}{fmt(Math.abs(netBalance))}</div>
          </div>
        </div>
      </div>

      {/* ── Scroll body ── */}
      <div className="cj-scroll-body">
        <div className="cj-table-wrapper" style={{position:'relative'}}>
          <PdfTableButton
            title="Cash Journal"
            columns={[
              {header:'Date',key:'date'},{header:'Time',key:'time'},{header:'Ref',key:'ref'},
              {header:'Description',key:'desc'},{header:'Amount',key:'amount'},
              {header:'Type',key:'type'},{header:'Balance',key:'balance'}
            ]}
            rows={filteredEntries.map(entry => {
              const {date,time} = formatDateTime(entry);
              return {
                date, time,
                ref: entry.invoiceRef||entry.ref||'—',
                desc: entry.note||'—',
                amount: fmt(entry.amount||0),
                type: entry.type===TYPE_IN ? 'IN':'OUT',
                balance: fmt(entry.balance||0),
              };
            })}
            summary={[{label:'Net Balance', value: fmt(Math.abs(netBalance))+(netBalance<0?' (deficit)':'')}]}
          />
          <table className="cj-table">
            <thead className="cj-thead">
              <tr>
                <th>Date</th><th>Time</th><th>Ref</th><th>Description</th>
                <th className="cj-col-right">Amount</th>
                <th className="cj-col-center">Type</th>
                <th className="cj-col-right">Balance</th>
                <th className="cj-col-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.length === 0 ? (
                <tr><td colSpan="8" className="cj-empty-cell">No entries found</td></tr>
              ) : (
                filteredEntries.map(entry => {
                  const { date, time } = formatDateTime(entry);
                  const editable = isWithin30Mins(entry);
                  return (
                    <tr key={entry.id} className="cj-row">
                      <td>{date}</td>
                      <td>{time}</td>
                      <td className="cj-ref-cell">{entry.invoiceRef || entry.ref || '—'}</td>
                      <td className="cj-note-cell">{entry.note || '—'}</td>
                      <td className={`cj-col-right cj-amount ${entry.type === TYPE_IN ? 'cj-in' : 'cj-out'}`}>
                        {(() => { const s = entry.type === TYPE_IN ? '+' : '-'; const r = fmt(entry.amount); const sym = r.match(/^[^\d]+/)?.[0] ?? ''; const num = r.slice(sym.length); return `${s} ${sym} ${num}`; })()}
                      </td>
                      <td className="cj-col-center">
                        <span className={`cj-type-badge cj-badge-${entry.type}`}>
                          {entry.type === TYPE_IN ? 'IN' : 'OUT'}
                        </span>
                      </td>
                      <td className={`cj-col-right cj-balance ${entry.balance < 0 ? 'cj-balance-neg' : ''}`}>
                        {entry.balance < 0 ? '-' : ''}{fmt(Math.abs(entry.balance))}
                      </td>
                      <td className="cj-col-center">
                        {editable ? (
                          <button onClick={() => setEditEntry(entry)}
                            style={{ background:'none', border:'none', cursor:'pointer', color:'#667eea', padding:'4px', borderRadius:'4px', display:'inline-flex', alignItems:'center' }}
                            title="Edit entry">
                            <Edit2 size={15} />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Add Entry modal ── */}
      {showAddModal && (
        <div className="cj-modal-overlay">
          {/* Transparent overlay — blocks all interaction when any dropdown is open */}
          {anyDropOpen && (
            <div
              style={{ position:'fixed', inset:0, zIndex:200 }}
              onPointerDown={() => closeAllDropdowns()}
            />
          )}
          <div className="cj-modal-content">
            <h2 className="cj-modal-title">Add Cash In</h2>

            {/* ── Cash In fields ── */}
            {newType === TYPE_IN && (
              <>
                {/* Cash From */}
                <div className="cj-modal-field" style={{ position:'relative' }} data-dropdown-field>
                  <label>Cash From</label>
                  <button
                    className={`cj-desc-trigger${personName ? ' has-value' : ''}`}
                    onClick={() => setShowNameDrop(o => !o)}
                  >
                    <span className="cj-desc-trigger-text">{personName || 'Select name…'}</span>
                    <span className="cj-desc-chevron">{showNameDrop ? '▲' : '▼'}</span>
                  </button>
                  {showNameDrop && (() => {
                    // Separate users by role for ordering: Shop Owner, Shop Manager, Shopkeepers, others
                    const owners    = usersList.filter(u => (u.role||'').toLowerCase() === 'shop owner');
                    const managers  = usersList.filter(u => (u.role||'').toLowerCase() === 'shop manager');
                    const keepers   = usersList.filter(u => (u.role||'').toLowerCase() === 'shopkeeper');
                    const others    = usersList.filter(u => !['shop owner','shop manager','shopkeeper'].includes((u.role||'').toLowerCase()));
                    const ordered   = [...others, ...keepers, ...managers, ...owners];
                    return (
                      <div className="cj-desc-dropdown" style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:300 }}>
                        {/* [Shop Name]'s Withdrawals — comes before Shop Owner */}
                        <button
                          className="cj-desc-dropdown-item"
                          style={{ borderBottom:'1px solid var(--border,#e5e7eb)', paddingBottom:'8px', marginBottom:'2px' }}
                          onMouseDown={() => handleNameSelect(`${shopName}'s Withdrawals`, "shop's withdrawals", '')}
                        >
                          {shopName}'s Withdrawals
                        </button>
                        {/* Staff (Firebase users) — ordered with owners last so they appear at top visually */}
                        {ordered.length > 0
                          ? ordered.map(u => {
                              const n = u.fullName || u.username || '';
                              return (
                                <button key={u.id} className="cj-desc-dropdown-item" onMouseDown={() => handleNameSelect(n, u.role || '', u.gender || '')}>
                                  {n}
                                  {u.role ? <span style={{ fontSize:'11px', color:'#9ca3af', marginLeft:'6px' }}>({u.role})</span> : null}
                                </button>
                              );
                            })
                          : <div className="cj-desc-dropdown-item" style={{ color:'#9ca3af', fontStyle:'italic', pointerEvents:'none' }}>No staff found…</div>
                        }
                        {/* Landlord */}
                        {landlordInfo && (
                          <button
                            className="cj-desc-dropdown-item"
                            onMouseDown={() => handleNameSelect(landlordInfo.name || landlordInfo.fullName, 'landlord', landlordInfo.gender || '')}
                            style={{ color:'#92400e' }}
                          >
                            🏠 {landlordInfo.name || landlordInfo.fullName}
                            <span style={{ fontSize:'11px', color:'#9ca3af', marginLeft:'6px' }}>(Landlord)</span>
                          </button>
                        )}
                        {/* Customer Advance Order — opens New Customer Advance Order modal */}
                        <div
                          className="cj-desc-dropdown-item"
                          style={{ borderTop:'1px solid var(--border, #e5e7eb)', marginTop:'2px', paddingTop:'8px' }}
                          onMouseDown={e => {
                            e.preventDefault();
                            setShowNameDrop(false);
                            setShowCreateAdvanceModal(true);
                          }}
                        >
                          Customer Advance Order
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Being For (reason dropdown) */}
                <div className="cj-modal-field" style={{ position:'relative', opacity: cr_seq_reason ? 1 : 0.4, pointerEvents: cr_seq_reason ? 'auto' : 'none' }} data-dropdown-field>
                  <label>Being For</label>
                  <button
                    className={`cj-desc-trigger${cashInReasonKey ? ' has-value' : ''}`}
                    disabled={!cr_seq_reason}
                    onClick={() => { if(cr_seq_reason) setShowCashInReasonDrop(o => !o); }}
                  >
                    <span className="cj-desc-trigger-text">
                      {cashInReasonKey === '__advance_order__' && selectedAdvanceOrder
                        ? `Advance Order ref: ${selectedAdvanceOrder.invoiceRef || '—'}`
                        : cashInReasonKey
                          ? (activeCashInReasons.find(r => r.key === cashInReasonKey)?.label || CASH_IN_REASONS.find(r => r.key === cashInReasonKey)?.label)
                          : 'Select reason…'}
                    </span>
                    <span className="cj-desc-chevron">{showCashInReasonDrop ? '▲' : '▼'}</span>
                  </button>
                  {showCashInReasonDrop && (
                    <div className="cj-desc-dropdown" style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:300 }}>
                      {activeCashInReasons.map(r => (
                        <button key={r.key} className={`cj-desc-dropdown-item${cashInReasonKey === r.key ? ' selected' : ''}`}
                          onMouseDown={() => { setCashInReasonKey(r.key); setShowCashInReasonDrop(false); setSelectedAdvanceOrder(null); }}>
                          {r.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Amount */}
                <div className="cj-modal-field" style={{opacity: cr_seq_amount ? 1 : 0.4, pointerEvents: cr_seq_amount ? 'auto' : 'none'}}>
                  <label>Amount</label>
                  <input type="number" className="cj-modal-input" placeholder="0.00"
                    disabled={!cr_seq_amount}
                    value={newAmount} onChange={e => { if(cr_seq_amount) setNewAmount(e.target.value); }} min="0.01" step="0.01"
                  />
                </div>

                {/* Ref Number */}
                <div className="cj-modal-field" style={{opacity: cr_seq_ref ? 1 : 0.4, pointerEvents: cr_seq_ref ? 'auto' : 'none'}}>
                  <label>Reference Number <span style={{ fontWeight:400, color:'#9ca3af' }}>(optional)</span></label>
                  <input className="cj-modal-input" value={refNumber}
                    disabled={!cr_seq_ref}
                    onChange={e => { if(cr_seq_ref) setRefNumber(e.target.value); }}
                    placeholder="Invoice / receipt ref…" />
                </div>
              </>
            )}

            <div className="cj-modal-buttons">
              <button className="cj-modal-cancel" onClick={closeAddModal}>Cancel</button>
              <button className="cj-modal-save" onClick={handleSaveEntry}
                disabled={isProcessing || !canSave()}>
                {isProcessing ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Cash Entry Modal ── */}
      {editEntry && (
        <CashEditModal
          entry={editEntry}
          fmt={fmt}
          onSave={async () => { setEditEntry(null); await loadEntries(); }}
          onDeleted={async () => { setEditEntry(null); await loadEntries(); }}
          onClose={() => setEditEntry(null)}
        />
      )}

      {/* ── Create New Customer Advanced Order Modal ── */}
      {showCreateAdvanceModal && (
        <CreateNewCustomerAdvanceOrderModal
          advanceOrdersList={advanceOrdersList}
          onSave={(newOrder) => {
            const name = newOrder.name || newOrder.customerName || '';
            const ref = newOrder.invoiceRef || '';
            const total = newOrder.totalDue || 0;
            // Set Cash From to the customer name
            setPersonName(name);
            setPersonSearch('');
            setIsOthersMode(false);
            // Set Being For to advance order reference
            setSelectedAdvanceOrder({ name, invoiceRef: ref });
            setCashInReasonKey('__advance_order__');
            // Set Amount to total value of goods ordered
            setNewAmount(String(total));
            setShowCreateAdvanceModal(false);
            // Reload advance orders list
            dataService.getAdvanceOrders().then(orders => setAdvanceOrdersList(orders || []));
          }}
          onClose={() => setShowCreateAdvanceModal(false)}
        />
      )}

      {/* ── Advance Order Card ── */}
      {advanceOrderCardData && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:3500, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}>
          <div style={{ background:'var(--surface, white)', color:'var(--text-primary, #111)', borderRadius:'14px', width:'100%', maxWidth:'400px', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 12px 48px rgba(0,0,0,0.3)' }}>
            {/* Header */}
            <div style={{ background:'linear-gradient(135deg,#667eea,#764ba2)', color:'white', padding:'16px 20px', borderRadius:'14px 14px 0 0', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <div style={{ fontSize:'11px', fontWeight:600, opacity:0.8, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'2px' }}>Advance Order</div>
                <div style={{ fontSize:'17px', fontWeight:800 }}>{advanceOrderCardData.customerName || advanceOrderCardData.name}</div>
              </div>
              <button
                onClick={() => setAdvanceOrderCardData(null)}
                style={{ background:'rgba(255,255,255,0.2)', border:'none', color:'white', width:'32px', height:'32px', borderRadius:'50%', cursor:'pointer', fontSize:'16px', display:'flex', alignItems:'center', justifyContent:'center' }}
              >✕</button>
            </div>

            {/* Body */}
            <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:'10px' }}>
              {/* Ref + Date */}
              <div style={{ display:'flex', gap:'10px' }}>
                {advanceOrderCardData.invoiceRef && (
                  <div style={{ flex:1, background:'#f3f4f6', borderRadius:'8px', padding:'10px 12px' }}>
                    <div style={{ fontSize:'10px', color:'#6b7280', fontWeight:700, textTransform:'uppercase', marginBottom:'2px' }}>Ref</div>
                    <div style={{ fontSize:'13px', fontWeight:700 }}>{advanceOrderCardData.invoiceRef}</div>
                  </div>
                )}
                {advanceOrderCardData.orderDate && (
                  <div style={{ flex:1, background:'#f3f4f6', borderRadius:'8px', padding:'10px 12px' }}>
                    <div style={{ fontSize:'10px', color:'#6b7280', fontWeight:700, textTransform:'uppercase', marginBottom:'2px' }}>Order Date</div>
                    <div style={{ fontSize:'13px', fontWeight:700 }}>{new Date(advanceOrderCardData.orderDate).toLocaleDateString('en-GB')}</div>
                  </div>
                )}
              </div>

              {/* Total Due + Balance */}
              <div style={{ display:'flex', gap:'10px' }}>
                <div style={{ flex:1, background:'#fef3c7', border:'1px solid #fcd34d', borderRadius:'8px', padding:'10px 12px' }}>
                  <div style={{ fontSize:'10px', color:'#92400e', fontWeight:700, textTransform:'uppercase', marginBottom:'2px' }}>Total Due</div>
                  <div style={{ fontSize:'15px', fontWeight:800, color:'#92400e' }}>{fmt(advanceOrderCardData.totalDue || 0)}</div>
                </div>
                <div style={{ flex:1, background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:'8px', padding:'10px 12px' }}>
                  <div style={{ fontSize:'10px', color:'#991b1b', fontWeight:700, textTransform:'uppercase', marginBottom:'2px' }}>Balance Owed</div>
                  <div style={{ fontSize:'15px', fontWeight:800, color:'#991b1b' }}>{fmt(advanceOrderCardData.balance || advanceOrderCardData.totalDue || 0)}</div>
                </div>
              </div>

              {/* Items table */}
              {advanceOrderCardData.items && advanceOrderCardData.items.length > 0 && (
                <div>
                  <div style={{ fontSize:'11px', fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'6px' }}>Items Ordered</div>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
                    <thead>
                      <tr style={{ background:'#f3f4f6' }}>
                        <th style={{ padding:'6px 8px', textAlign:'left', fontSize:'11px', color:'#6b7280', fontWeight:700, textTransform:'uppercase' }}>Product</th>
                        <th style={{ padding:'6px 8px', textAlign:'center', fontSize:'11px', color:'#6b7280', fontWeight:700, textTransform:'uppercase', width:'50px' }}>Qty</th>
                        <th style={{ padding:'6px 8px', textAlign:'right', fontSize:'11px', color:'#6b7280', fontWeight:700, textTransform:'uppercase', width:'70px' }}>Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {advanceOrderCardData.items.map((item, i) => (
                        <tr key={i} style={{ borderBottom:'1px solid #f3f4f6' }}>
                          <td style={{ padding:'6px 8px' }}>{item.name || 'N/A'}</td>
                          <td style={{ padding:'6px 8px', textAlign:'center' }}>{item.qty || item.quantity || 0}</td>
                          <td style={{ padding:'6px 8px', textAlign:'right' }}>{fmt(item.sellingPrice || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Phone */}
              {(advanceOrderCardData.phone || advanceOrderCardData.customerPhone) && (
                <div style={{ fontSize:'13px', color:'#6b7280' }}>
                  📞 {advanceOrderCardData.phone || advanceOrderCardData.customerPhone}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding:'12px 20px', borderTop:'1px solid var(--border, #e5e7eb)' }}>
              <button
                onClick={() => setAdvanceOrderCardData(null)}
                style={{ width:'100%', padding:'11px', borderRadius:'8px', border:'none', background:'#667eea', color:'white', fontWeight:700, fontSize:'14px', cursor:'pointer' }}
              >
                ✓ Got it — Continue Entry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CashRecord;
