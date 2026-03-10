import React, { useState, useEffect, useRef } from 'react';
import { Edit2, X, ChevronDown, ChevronUp } from 'lucide-react';
import dataService from '../services/dataService';
import { useCurrency } from '../hooks/useCurrency';
import PdfTableButton from '../components/PdfTableButton';
import './SalesRecord.css';

// ── Shared 30-minute edit window helper ──────────────────────────────────────
function isWithin30Mins(entry) {
  const ts = entry.createdAt || entry.date || entry.timestamp;
  if (!ts) return false;
  const created = new Date(ts);
  return (new Date() - created) / (1000 * 60) <= 30;
}

// ── Helper: find linked cash entry for a sale ────────────────────────────────
async function findSaleCashEntry(saleId) {
  try {
    const entries = await dataService.getCashEntries?.() || [];
    return entries.find(e => e.source === 'sale' && e.saleId === saleId) || null;
  } catch {
    return null;
  }
}

// ── Helper: handle cash posting when a sale is updated ─────────────────────
async function handleCashPostingOnUpdate(oldSale, newPaymentType, newTotal, newCashReceived) {
  const oldPayType = oldSale.paymentType || oldSale.payment_type || '';
  const hadCash = oldPayType === 'cash' || oldPayType === 'mixed';
  const hasCash = newPaymentType === 'cash' || newPaymentType === 'mixed';

  const linkedEntry = hadCash ? await findSaleCashEntry(oldSale.id) : null;

  if (hadCash && hasCash) {
    // A) Cash remains — update amount
    const newAmount = newPaymentType === 'mixed'
      ? parseFloat(newCashReceived || 0)
      : parseFloat(newTotal || 0);
    if (linkedEntry && linkedEntry.id) {
      await dataService.updateCashEntry(linkedEntry.id, { amount: newAmount });
    }
  } else if (hadCash && !hasCash) {
    // B) Cash → credit: delete linked entry
    if (linkedEntry && linkedEntry.id) {
      try { await dataService.deleteCashEntry(linkedEntry.id); } catch { /* best effort */ }
    }
  } else if (!hadCash && hasCash) {
    // C) Credit → cash: create new entry
    const newAmount = newPaymentType === 'mixed'
      ? parseFloat(newCashReceived || 0)
      : parseFloat(newTotal || 0);
    await dataService.addCashEntry({
      type: 'in',
      source: 'sale',
      amount: newAmount,
      saleId: oldSale.id,
      note: newPaymentType === 'mixed' ? 'Partial sale payment' : 'Sale payment',
      date: oldSale.date || oldSale.createdAt,
    });
  }
  // D) Credit → credit: nothing to do
}

// ── Helper: delete linked cash entry when sale is deleted ───────────────────
async function deleteSaleCashEntry(saleId) {
  const linked = await findSaleCashEntry(saleId);
  if (linked && linked.id) {
    try { await dataService.deleteCashEntry(linked.id); } catch { /* best effort */ }
  }
}

// ── Sale Detail Modal ─────────────────────────────────────────────────────────
function SaleDetailModal({ sale, onClose, onEdit, canEdit, fmt }) {
  const payType = sale.paymentType || sale.payment_type || '';
  const customer = sale.customerName || sale.customer_name || '';
  const subtotal = parseFloat(sale.subtotal || sale.total_amount || sale.total || 0);
  const discount = parseFloat(sale.discount || 0);
  const total = parseFloat(sale.total_amount || sale.total || 0);
  const cashReceived = parseFloat(sale.cashReceived || 0);
  const changeGiven = parseFloat(sale.changeGiven || 0);

  const resolveSaleDate = (s) => {
    const raw = s.date || s.timestamp || s.createdAt;
    if (!raw) return null;
    if (raw && typeof raw === 'object' && raw.seconds) return new Date(raw.seconds * 1000);
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  };

  const d = resolveSaleDate(sale);
  const dateStr = d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A';
  const timeStr = d ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'N/A';

  const payBadgeStyle = {
    cash:   { background: '#d1fae5', color: '#065f46' },
    credit: { background: '#fee2e2', color: '#991b1b' },
    mixed:  { background: '#fef3c7', color: '#92400e' },
  }[payType] || { background: '#f3f4f6', color: '#374151' };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:3000, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px', overflowY:'auto' }}>
      <div style={{ background:'var(--surface)', color:'var(--text-primary)', borderRadius:'14px', padding:'22px', width:'100%', maxWidth:'440px', maxHeight:'92vh', overflowY:'auto', position:'relative' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' }}>
          <h3 style={{ margin:0, fontSize:'16px', fontWeight:700, color:'#1a1a2e' }}>🧾 Sale Details</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#6b7280', padding:'4px', borderRadius:'6px', display:'flex', alignItems:'center' }}>
            <X size={18} />
          </button>
        </div>

        {/* Status badge */}
        {sale.status && sale.status !== 'active' && (
          <div style={{ marginBottom:'12px' }}>
            <span style={{ fontSize:'12px', fontWeight:700, padding:'3px 10px', borderRadius:'5px',
              background: sale.status === 'voided' ? '#fee2e2' : '#fef3c7',
              color: sale.status === 'voided' ? '#dc2626' : '#d97706' }}>
              {sale.status.toUpperCase()}
            </span>
          </div>
        )}

        {/* Date / Time */}
        <div style={{ display:'flex', gap:'12px', marginBottom:'12px' }}>
          <div style={{ flex:1, background:'#f9fafb', borderRadius:'8px', padding:'10px 12px' }}>
            <div style={{ fontSize:'11px', color:'#9ca3af', fontWeight:600, textTransform:'uppercase', marginBottom:'2px' }}>Date</div>
            <div style={{ fontSize:'14px', fontWeight:600 }}>{dateStr}</div>
          </div>
          <div style={{ flex:1, background:'#f9fafb', borderRadius:'8px', padding:'10px 12px' }}>
            <div style={{ fontSize:'11px', color:'#9ca3af', fontWeight:600, textTransform:'uppercase', marginBottom:'2px' }}>Time</div>
            <div style={{ fontSize:'14px', fontWeight:600 }}>{sale.isUnrecorded ? 'UNRECORDED' : timeStr}</div>
          </div>
        </div>

        {/* Items */}
        <div style={{ marginBottom:'12px' }}>
          <div style={{ fontSize:'12px', fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:'6px' }}>Items</div>
          <div style={{ border:'1px solid #e5e7eb', borderRadius:'8px', overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
              <thead>
                <tr style={{ background:'#f3f4f6' }}>
                  <th style={{ padding:'7px 10px', textAlign:'left', fontWeight:600, fontSize:'11px', color:'#6b7280', textTransform:'uppercase' }}>Product</th>
                  <th style={{ padding:'7px 10px', textAlign:'center', fontWeight:600, fontSize:'11px', color:'#6b7280', textTransform:'uppercase', width:'50px' }}>Qty</th>
                  <th style={{ padding:'7px 10px', textAlign:'right', fontWeight:600, fontSize:'11px', color:'#6b7280', textTransform:'uppercase', width:'80px' }}>Price</th>
                  <th style={{ padding:'7px 10px', textAlign:'right', fontWeight:600, fontSize:'11px', color:'#6b7280', textTransform:'uppercase', width:'80px' }}>Line</th>
                </tr>
              </thead>
              <tbody>
                {(sale.items || []).map((item, idx) => {
                  const qty = parseFloat(item.quantity ?? item.qty ?? 0);
                  const price = parseFloat(item.price ?? 0);
                  return (
                    <tr key={idx} style={{ borderTop: idx > 0 ? '1px solid #f3f4f6' : 'none' }}>
                      <td style={{ padding:'7px 10px' }}>{item.name || '—'}</td>
                      <td style={{ padding:'7px 10px', textAlign:'center' }}>{qty}</td>
                      <td style={{ padding:'7px 10px', textAlign:'right' }}>{fmt(price)}</td>
                      <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:600 }}>{fmt(qty * price)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Totals breakdown */}
        <div style={{ background:'#f9fafb', borderRadius:'8px', padding:'12px', marginBottom:'12px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'13px', marginBottom:'6px', color:'#6b7280' }}>
            <span>Subtotal</span>
            <span>{fmt(discount > 0 ? subtotal + discount : subtotal)}</span>
          </div>
          {discount > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'13px', marginBottom:'6px', color:'#059669' }}>
              <span>Discount</span>
              <span>- {fmt(discount)}</span>
            </div>
          )}
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'15px', fontWeight:700, paddingTop:'6px', borderTop:'1px solid #e5e7eb' }}>
            <span>Total</span>
            <span style={{ color:'#667eea' }}>{fmt(total)}</span>
          </div>
        </div>

        {/* Payment info */}
        <div style={{ marginBottom:'12px' }}>
          <div style={{ fontSize:'12px', fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:'6px' }}>Payment</div>
          <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
            <span style={{ ...payBadgeStyle, padding:'4px 12px', borderRadius:'6px', fontSize:'13px', fontWeight:700 }}>
              {payType ? payType.toUpperCase() : 'N/A'}
            </span>
          </div>
          {(payType === 'cash' || payType === 'mixed') && cashReceived > 0 && (
            <div style={{ marginTop:'8px', display:'flex', flexDirection:'column', gap:'4px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:'13px', color:'#374151' }}>
                <span>Cash Received</span>
                <span style={{ fontWeight:600 }}>{fmt(cashReceived)}</span>
              </div>
              {changeGiven > 0 && (
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:'13px', color:'#374151' }}>
                  <span>Change Given</span>
                  <span style={{ fontWeight:600 }}>{fmt(changeGiven)}</span>
                </div>
              )}
              {payType === 'mixed' && (
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:'13px', color:'#374151' }}>
                  <span>Credit Portion</span>
                  <span style={{ fontWeight:600, color:'#dc2626' }}>{fmt(Math.max(0, total - cashReceived))}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Debtor info */}
        {(payType === 'credit' || payType === 'mixed') && (customer || sale.debtorId) && (
          <div style={{ background:'#fef3c7', borderRadius:'8px', padding:'10px 12px', marginBottom:'12px' }}>
            <div style={{ fontSize:'11px', fontWeight:700, color:'#92400e', textTransform:'uppercase', marginBottom:'3px' }}>Debtor</div>
            <div style={{ fontSize:'14px', fontWeight:600, color:'#78350f' }}>{customer || '—'}</div>
            {sale.debtorId && (
              <div style={{ fontSize:'11px', color:'#a16207', marginTop:'2px' }}>ID: {sale.debtorId}</div>
            )}
          </div>
        )}

        {/* Staff */}
        {(sale.staffId || sale.staffName) && (
          <div style={{ marginBottom:'12px' }}>
            <div style={{ fontSize:'12px', fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:'4px' }}>Staff</div>
            <div style={{ fontSize:'13px' }}>{sale.staffName || sale.staffId}</div>
          </div>
        )}

        {/* Receipt photo */}
        {sale.receiptPhoto || sale.photoUrl ? (
          <div style={{ marginBottom:'12px' }}>
            <div style={{ fontSize:'12px', fontWeight:700, color:'#6b7280', textTransform:'uppercase', marginBottom:'6px' }}>Receipt Photo</div>
            <img
              src={sale.receiptPhoto || sale.photoUrl}
              alt="Receipt"
              style={{ width:'100%', borderRadius:'8px', border:'1px solid #e5e7eb', objectFit:'contain', maxHeight:'200px' }}
              onError={e => { e.currentTarget.style.display = 'none'; }}
            />
          </div>
        ) : null}

        {/* Actions */}
        <div style={{ display:'flex', gap:'8px', marginTop:'4px' }}>
          <button onClick={onClose} style={{ flex:1, padding:'10px', borderRadius:'8px', border:'1.5px solid var(--border)', background:'var(--surface)', color:'var(--text-primary)', cursor:'pointer', fontWeight:600, fontSize:'14px' }}>
            Close
          </button>
          {canEdit && (
            <button onClick={onEdit} style={{ flex:1, padding:'10px', borderRadius:'8px', border:'none', background:'#667eea', color:'white', cursor:'pointer', fontWeight:700, fontSize:'14px' }}>
              ✏️ Edit Sale
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sale Edit Modal ────────────────────────────────────────────────────────
function SaleEditModal({ sale, onSave, onClose, onDeleted, fmt }) {
  const [paymentType, setPaymentType] = useState(sale.paymentMethod || sale.payment_type || sale.paymentType || 'cash');
  const [customerName, setCustomerName] = useState(sale.customer_name || sale.customerName || '');
  const [debtorId, setDebtorId] = useState(sale.debtorId || '');
  const [items, setItems] = useState((sale.items || []).map(i => ({ ...i })));
  const [discount, setDiscount] = useState(parseFloat(sale.discount || 0));
  const [cashReceived, setCashReceived] = useState(parseFloat(sale.cashReceived || 0));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const subtotal = items.reduce((sum, it) => {
    const qty = parseFloat(it.quantity ?? it.qty ?? 0);
    const price = parseFloat(it.price ?? 0);
    return sum + qty * price;
  }, 0);
  const total = Math.max(0, subtotal - discount);
  const changeGiven = paymentType === 'cash' ? Math.max(0, cashReceived - total) : 0;

  const updateItem = (idx, field, val) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updatedItems = items.map(it => ({
        ...it,
        quantity: parseFloat(it.quantity ?? it.qty ?? 0),
        qty: parseFloat(it.quantity ?? it.qty ?? 0),
        subtotal: parseFloat(it.quantity ?? it.qty ?? 0) * parseFloat(it.price ?? 0),
      }));

      const updates = {
        items: updatedItems,
        subtotal,
        discount,
        total_amount: total,
        total,
        paymentMethod: paymentType,
        paymentType,
        payment_type: paymentType,
        customer_name: customerName,
        customerName,
        debtorId: (paymentType === 'credit' || paymentType === 'mixed') ? (debtorId || null) : null,
        cashReceived: (paymentType === 'cash' || paymentType === 'mixed') ? cashReceived : 0,
        changeGiven: paymentType === 'cash' ? changeGiven : 0,
        updatedAt: new Date().toISOString(),
      };

      // Handle cash posting before saving
      await handleCashPostingOnUpdate(sale, paymentType, total, cashReceived);

      await dataService.updateSale(sale.id, updates);
      onSave();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this sale record? This cannot be undone.')) return;
    setDeleting(true);
    try {
      // Delete linked cash entry before deleting sale
      await deleteSaleCashEntry(sale.id);
      await dataService.deleteSale(sale.id);
      onDeleted();
    } catch (e) { alert(e.message); }
    finally { setDeleting(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:3500, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px', overflowY:'auto' }}>
      <div style={{ background:'var(--surface)', color:'var(--text-primary)', borderRadius:'12px', padding:'20px', width:'100%', maxWidth:'420px', maxHeight:'90vh', overflowY:'auto' }}>
        <h3 style={{ margin:'0 0 16px', color:'#1a1a2e', fontSize:'16px' }}>✏️ Edit Sale</h3>

        {/* Payment Type */}
        <div style={{ marginBottom:'12px' }}>
          <label style={{ display:'block', fontWeight:600, fontSize:'13px', marginBottom:'4px' }}>Payment Type</label>
          <div style={{ display:'flex', gap:'8px' }}>
            {['cash', 'credit', 'mixed'].map(pt => (
              <button key={pt} onClick={() => setPaymentType(pt)} style={{
                flex:1, padding:'8px', borderRadius:'7px', border:'2px solid',
                borderColor: paymentType === pt ? '#667eea' : '#d1d5db',
                background: paymentType === pt ? '#eef2ff' : 'var(--surface)',
                fontWeight: paymentType === pt ? 700 : 400, cursor:'pointer', fontSize:'12px', textTransform:'uppercase',
              }}>{pt}</button>
            ))}
          </div>
        </div>

        {/* Customer / Debtor for credit or mixed */}
        {(paymentType === 'credit' || paymentType === 'mixed') && (
          <>
            <div style={{ marginBottom:'10px' }}>
              <label style={{ display:'block', fontWeight:600, fontSize:'13px', marginBottom:'4px' }}>Customer Name</label>
              <input value={customerName} onChange={e => setCustomerName(e.target.value)}
                style={{ width:'100%', padding:'8px 10px', border:'1.5px solid #d1d5db', borderRadius:'6px', fontSize:'14px', boxSizing:'border-box' }} />
            </div>
            <div style={{ marginBottom:'12px' }}>
              <label style={{ display:'block', fontWeight:600, fontSize:'13px', marginBottom:'4px' }}>Debtor ID (if registered)</label>
              <input value={debtorId} onChange={e => setDebtorId(e.target.value)} placeholder="Leave blank if not a registered debtor"
                style={{ width:'100%', padding:'8px 10px', border:'1.5px solid #d1d5db', borderRadius:'6px', fontSize:'14px', boxSizing:'border-box' }} />
            </div>
          </>
        )}

        {/* Cash received for cash or mixed */}
        {(paymentType === 'cash' || paymentType === 'mixed') && (
          <div style={{ marginBottom:'12px' }}>
            <label style={{ display:'block', fontWeight:600, fontSize:'13px', marginBottom:'4px' }}>
              {paymentType === 'mixed' ? 'Cash Portion Received' : 'Cash Received'}
            </label>
            <input type="number" value={cashReceived} onChange={e => setCashReceived(parseFloat(e.target.value) || 0)}
              style={{ width:'100%', padding:'8px 10px', border:'1.5px solid #d1d5db', borderRadius:'6px', fontSize:'14px', boxSizing:'border-box' }} />
            {paymentType === 'cash' && cashReceived > 0 && changeGiven > 0 && (
              <div style={{ fontSize:'12px', color:'#059669', marginTop:'4px' }}>Change: {fmt(changeGiven)}</div>
            )}
            {paymentType === 'mixed' && cashReceived > 0 && (
              <div style={{ fontSize:'12px', color:'#d97706', marginTop:'4px' }}>
                Credit portion: {fmt(Math.max(0, total - cashReceived))}
              </div>
            )}
          </div>
        )}

        {/* Products */}
        <div style={{ marginBottom:'12px' }}>
          <label style={{ display:'block', fontWeight:600, fontSize:'13px', marginBottom:'6px' }}>Products</label>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px', minWidth:'280px' }}>
              <thead>
                <tr style={{ background:'#f3f4f6' }}>
                  <th style={{ padding:'6px 8px', textAlign:'left', fontWeight:600, fontSize:'11px', color:'#6b7280', textTransform:'uppercase' }}>Product Name</th>
                  <th style={{ padding:'6px 8px', textAlign:'center', fontWeight:600, fontSize:'11px', color:'#6b7280', textTransform:'uppercase', width:'60px' }}>Qty</th>
                  <th style={{ padding:'6px 8px', textAlign:'right', fontWeight:600, fontSize:'11px', color:'#6b7280', textTransform:'uppercase', width:'70px' }}>Price</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={idx}>
                    <td style={{ padding:'4px 8px' }}>
                      <input value={it.name || ''} onChange={e => updateItem(idx, 'name', e.target.value)} placeholder="Item name"
                        style={{ width:'100%', padding:'5px 6px', border:'1.5px solid #d1d5db', borderRadius:'5px', fontSize:'13px', boxSizing:'border-box' }} />
                    </td>
                    <td style={{ padding:'4px 8px' }}>
                      <input type="number" value={it.quantity ?? it.qty ?? ''} onChange={e => updateItem(idx, 'quantity', e.target.value)} placeholder="0"
                        style={{ width:'100%', padding:'5px 6px', border:'1.5px solid #d1d5db', borderRadius:'5px', fontSize:'13px', textAlign:'center', boxSizing:'border-box' }} />
                    </td>
                    <td style={{ padding:'4px 8px' }}>
                      <input type="number" value={it.price ?? ''} onChange={e => updateItem(idx, 'price', e.target.value)} placeholder="0.00"
                        style={{ width:'100%', padding:'5px 6px', border:'1.5px solid #d1d5db', borderRadius:'5px', fontSize:'13px', textAlign:'right', boxSizing:'border-box' }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Discount */}
        <div style={{ marginBottom:'12px' }}>
          <label style={{ display:'block', fontWeight:600, fontSize:'13px', marginBottom:'4px' }}>Discount (optional)</label>
          <input type="number" value={discount || ''} onChange={e => setDiscount(parseFloat(e.target.value) || 0)} placeholder="0.00" min="0"
            style={{ width:'100%', padding:'8px 10px', border:'1.5px solid #d1d5db', borderRadius:'6px', fontSize:'14px', boxSizing:'border-box' }} />
        </div>

        {/* Total summary */}
        <div style={{ background:'#f9fafb', borderRadius:'8px', padding:'10px 12px', marginBottom:'16px' }}>
          {discount > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'13px', color:'#6b7280', marginBottom:'4px' }}>
              <span>Subtotal</span><span>{fmt(subtotal)}</span>
            </div>
          )}
          {discount > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'13px', color:'#059669', marginBottom:'4px' }}>
              <span>Discount</span><span>- {fmt(discount)}</span>
            </div>
          )}
          <div style={{ display:'flex', justifyContent:'space-between', fontWeight:700, fontSize:'15px', color:'#667eea' }}>
            <span>Total</span><span>{fmt(total)}</span>
          </div>
        </div>

        {/* Buttons */}
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

function SalesRecord() {
  const { fmt } = useCurrency();
  const [sales, setSales] = useState([]);
  const [filteredSales, setFilteredSales] = useState([]);
  const [editSale, setEditSale] = useState(null);
  const [detailSale, setDetailSale] = useState(null);

  // Void / Refund modal state
  const [voidSale, setVoidSale] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [refundSale, setRefundSale] = useState(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [actionProcessing, setActionProcessing] = useState(false);

  const [paymentFilter, setPaymentFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('today');
  const [selectedDate, setSelectedDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [appliedPaymentFilter, setAppliedPaymentFilter] = useState('all');
  const [appliedDateFilter, setAppliedDateFilter] = useState('today');
  const [appliedSelectedDate, setAppliedSelectedDate] = useState('');
  const [appliedStartDate, setAppliedStartDate] = useState('');
  const [appliedEndDate, setAppliedEndDate] = useState('');

  const [showFilters, setShowFilters] = useState(false);

  // ── Data ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadSales();
    // Reload whenever the screen becomes visible again (e.g. returning from Checkout)
    const handleVisibility = () => { if (!document.hidden) loadSales(); };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-render whenever another device records a sale (including credit sales)
  useEffect(() => {
    const unsubscribe = dataService.onSalesChange((updatedSales) => {
      const sorted = (updatedSales || []).sort((a, b) => {
        const dateA = new Date(a.date || a.createdAt || a.timestamp || 0);
        const dateB = new Date(b.date || b.createdAt || b.timestamp || 0);
        return dateB - dateA;
      });
      setSales(sorted);
    });
    return () => unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { applyFilters(); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sales, appliedPaymentFilter, appliedDateFilter, appliedSelectedDate, appliedStartDate, appliedEndDate]);

  const loadSales = async () => {
    const data = await dataService.getSales();
    const sorted = (data || []).sort((a, b) => {
      const dateA = new Date(a.date || a.createdAt || a.timestamp || 0);
      const dateB = new Date(b.date || b.createdAt || b.timestamp || 0);
      return dateB - dateA;
    });
    setSales(sorted);
  };

  const resolveSaleDate = (sale) => {
    const raw = sale.date || sale.timestamp || sale.createdAt;
    if (!raw) return null;
    if (raw && typeof raw === 'object' && raw.seconds) return new Date(raw.seconds * 1000);
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  };

  const toMidnight = (d) => { const c = new Date(d); c.setHours(0, 0, 0, 0); return c; };

  const applyFilters = () => {
    let filtered = [...sales];
    if (appliedPaymentFilter !== 'all')
      filtered = filtered.filter(s =>
        s.payment_type === appliedPaymentFilter ||
        s.paymentType === appliedPaymentFilter ||
        s.paymentMethod === appliedPaymentFilter
      );
    const today    = toMidnight(new Date());
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    if (appliedDateFilter === 'today')
      filtered = filtered.filter(s => { const d = resolveSaleDate(s); return d && d >= today && d < tomorrow; });
    if (appliedDateFilter === 'single' && appliedSelectedDate) {
      const s = toMidnight(new Date(appliedSelectedDate)), e = new Date(s); e.setDate(e.getDate() + 1);
      filtered = filtered.filter(sale => { const d = resolveSaleDate(sale); return d && d >= s && d < e; });
    }
    if (appliedDateFilter === 'range' && appliedStartDate && appliedEndDate) {
      const s = toMidnight(new Date(appliedStartDate));
      const e = new Date(toMidnight(new Date(appliedEndDate))); e.setDate(e.getDate() + 1);
      filtered = filtered.filter(sale => { const d = resolveSaleDate(sale); return d && d >= s && d < e; });
    }
    setFilteredSales(filtered);
  };

  // ── Filter controls ───────────────────────────────────────────────────────
  const isFilterComplete = () => {
    if (dateFilter === 'today')  return true;
    if (dateFilter === 'single') return !!selectedDate;
    if (dateFilter === 'range')  return !!(startDate && endDate);
    return false;
  };
  const hasChanged = () =>
    paymentFilter !== appliedPaymentFilter || dateFilter !== appliedDateFilter ||
    selectedDate  !== appliedSelectedDate  || startDate  !== appliedStartDate  || endDate !== appliedEndDate;
  const showApply = isFilterComplete() && hasChanged();

  const handleClose = () => {
    setPaymentFilter(appliedPaymentFilter); setDateFilter(appliedDateFilter);
    setSelectedDate(appliedSelectedDate);  setStartDate(appliedStartDate); setEndDate(appliedEndDate);
    setShowFilters(false);
  };
  const handleApply = () => {
    setAppliedPaymentFilter(paymentFilter); setAppliedDateFilter(dateFilter);
    setAppliedSelectedDate(selectedDate);  setAppliedStartDate(startDate); setAppliedEndDate(endDate);
    setShowFilters(false);
  };
  const handleFilterButtonClick = () => {
    if (!showFilters)    setShowFilters(true);
    else if (showApply)  handleApply();
    else                 handleClose();
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getTodayStr = () => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  };
  const formatDisplayDate = (dateStr) =>
    new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const isYesterday = (dateStr) => {
    if (!dateStr) return false;
    const y = new Date(); y.setDate(y.getDate() - 1);
    return toMidnight(new Date(dateStr)).getTime() === toMidnight(y).getTime();
  };

  const getTableTitle = () => {
    const payMap = { all: 'All Sales', cash: 'Cash Sales', credit: 'Credit Sales', mixed: 'Mixed Sales' };
    const label  = payMap[appliedPaymentFilter] || 'All Sales';
    if (appliedDateFilter === 'today') return `${label} Today`;
    if (appliedDateFilter === 'single' && appliedSelectedDate) {
      if (isYesterday(appliedSelectedDate)) return `${label} Yesterday`;
      return `${label} on ${formatDisplayDate(appliedSelectedDate)}`;
    }
    if (appliedDateFilter === 'range' && appliedStartDate && appliedEndDate)
      return `${label} from ${formatDisplayDate(appliedStartDate)} to ${formatDisplayDate(appliedEndDate)}`;
    return `${label} Today`;
  };

  const formatDateTime = (sale) => {
    const d = resolveSaleDate(sale);
    if (!d) return { date: 'N/A', time: 'N/A' };
    return {
      date: d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      time: sale.isUnrecorded ? 'UNRECORDED' : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
    };
  };

  const getItemQty      = (item) => item.quantity ?? item.qty ?? 0;
  const getItemName     = (item) => item.name || '—';
  const getSaleTotal    = (sale) => parseFloat(sale.total_amount ?? sale.total ?? 0);
  const getSalePayType  = (sale) => sale.paymentMethod || sale.payment_type || sale.paymentType || '';
  const getSaleCustomer = (sale) => sale.customer_name || sale.customerName || '';

  const totalRecords = filteredSales.length;
  const grandTotal   = filteredSales.reduce((sum, s) => sum + getSaleTotal(s), 0);
  const btnLabel     = !showFilters ? 'Filter Sales' : showApply ? 'Apply Filter' : 'Close Filter';

  const HEADERS = ['Date', 'Time', 'Product', 'Qty', 'Sale Total', 'Payment', 'Customer'];

  // ── Reload helper ──────────────────────────────────────────────────────────
  const reloadSales = async () => {
    const data = await dataService.getSales();
    setSales((data || []).sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0)));
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="sales-record">

      {/* ── placeholder — filter panel moved inside sticky bar below ── */}
      {false && (
        <div className="filters-section">
          <div className="filter-group">
            <label>Payment Type</label>
            <div className="filter-buttons">
              {[['all', 'All Sales'], ['cash', 'Cash Only'], ['credit', 'Credit Only'], ['mixed', 'Mixed']].map(([val, lbl]) => (
                <button key={val} className={`filter-btn${paymentFilter === val ? ' active' : ''}`}
                  onClick={() => setPaymentFilter(val)}>{lbl}</button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <label>Date Filter</label>
            <div className="filter-buttons">
              {[['today', 'Today'], ['single', 'Single Date'], ['range', 'Date Range']].map(([val, lbl]) => (
                <button key={val} className={`filter-btn${dateFilter === val ? ' active' : ''}`}
                  onClick={() => { setDateFilter(val); setSelectedDate(''); setStartDate(''); setEndDate(''); }}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>
          {dateFilter === 'single' && (
              <div className="filter-group">
              <label>Select Date</label>
              <input type="date" value={selectedDate} max={getTodayStr()}
                onChange={e => setSelectedDate(e.target.value)} className="date-input" />
            </div>
          )}
          {dateFilter === 'range' && (
              <div className="filter-group">
              <label>Date Range</label>
              <div className="date-range-inputs">
                <div className="date-range-field">
                  <label className="date-range-label">From:</label>
                  <input type="date" value={startDate} max={getTodayStr()}
                    onChange={e => { setStartDate(e.target.value); if (endDate && endDate < e.target.value) setEndDate(''); }}
                    className="date-input" />
                </div>
                <div className="date-range-field">
                  <label className="date-range-label">To:</label>
                  <input type="date" value={endDate} min={startDate || undefined} max={getTodayStr()}
                    disabled={!startDate} onChange={e => setEndDate(e.target.value)}
                    className={`date-input${!startDate ? ' date-input-disabled' : ''}`} />
                </div>
              </div>
              {!startDate && <span className="date-range-hint">Select a "From" date first</span>}
            </div>
          )}
        </div>
      )}

      {/* ── Sticky bar — contains filter panel, button, title and cards ── */}
      <div className="sj-sticky-bar">
        {/* Filter panel — inside sticky bar so it scrolls with the bar */}
        {showFilters && (
          <div className="filter-modal-overlay" onClick={handleClose}>
            <div className="filter-modal-sheet" onClick={e => e.stopPropagation()}>
              <div className="filter-modal-handle"/>
              <div className="filter-modal-title">Filter Sales</div>
              <div className="filter-group">
                <label>Payment Type</label>
                <div className="filter-buttons">
                {[['all', 'All Sales'], ['cash', 'Cash Only'], ['credit', 'Credit Only'], ['mixed', 'Mixed']].map(([val, lbl]) => (
                    <button key={val} className={`filter-btn${paymentFilter === val ? ' active' : ''}`}
                    onClick={() => setPaymentFilter(val)}>{lbl}</button>
                ))}
              </div>
            </div>
              <div className="filter-group">
                <label>Date Filter</label>
                <div className="filter-buttons">
                {[['today', 'Today'], ['single', 'Single Date'], ['range', 'Date Range']].map(([val, lbl]) => (
                    <button key={val} className={`filter-btn${dateFilter === val ? ' active' : ''}`}
                    onClick={() => { setDateFilter(val); setSelectedDate(''); setStartDate(''); setEndDate(''); }}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
              {dateFilter === 'single' && (
                <div className="filter-group">
                <label>Select Date</label>
                <input type="date" value={selectedDate} max={getTodayStr()}
                  onChange={e => setSelectedDate(e.target.value)} className="date-input" />
              </div>
            )}
              {dateFilter === 'range' && (
                <div className="filter-group">
                <label>Date Range</label>
                <div className="date-range-inputs">
                  <div className="date-range-field">
                    <label className="date-range-label">From:</label>
                    <input type="date" value={startDate} max={getTodayStr()}
                      onChange={e => { setStartDate(e.target.value); if (endDate && endDate < e.target.value) setEndDate(''); }}
                      className="date-input" />
                  </div>
                  <div className="date-range-field">
                    <label className="date-range-label">To:</label>
                    <input type="date" value={endDate} min={startDate || undefined} max={getTodayStr()}
                      disabled={!startDate} onChange={e => setEndDate(e.target.value)}
                      className={`date-input${!startDate ? ' date-input-disabled' : ''}`} />
                  </div>
                </div>
                {!startDate && <span className="date-range-hint">Select a "From" date first</span>}
              </div>
            )}
              <div className="filter-modal-actions">
                <button className="filter-modal-cancel" onClick={handleClose}>Cancel</button>
                <button className="filter-modal-apply" onClick={handleApply}>Apply Filter</button>
              </div>
            </div>
          </div>
        )}
        <div className="filter-btn-wrapper">
          <button
            className={`sales-filter-action-btn${!showFilters ? ' sfab-open' : showApply ? ' sfab-apply' : ' sfab-close'}`}
            onClick={handleFilterButtonClick}>{btnLabel}</button>
        </div>
        <h3 className="table-title">{getTableTitle()}</h3>
        <div className="stats-boxes">
          <div className="stat-box stat-box-purple">
            <div className="stat-label">Total Records</div>
            <div className="stat-value">{totalRecords}</div>
          </div>
          <div className="stat-box stat-box-green">
            <div className="stat-label">Grand Total</div>
            <div className="stat-value">{fmt(grandTotal)}</div>
          </div>
        </div>
      </div>

      {/* ── Scroll body — the ONLY scroll container; thead sticks at top:0 inside it ── */}
      <div className="sj-scroll-body">
        <div className="table-wrapper" style={{position:'relative'}}>
          <PdfTableButton
            title="Sales Journal"
            columns={[
              {header:'Date',key:'date'},{header:'Time',key:'time'},{header:'Product',key:'product'},
              {header:'Qty',key:'qty'},{header:'Sale Total',key:'total'},
              {header:'Payment',key:'payment'},{header:'Customer',key:'customer'}
            ]}
            rows={filteredSales.flatMap(sale => {
              const {date, time} = formatDateTime(sale);
              const total = getSaleTotal(sale); const payment = getSalePayType(sale); const customer = getSaleCustomer(sale);
              const items = sale.items && sale.items.length > 0 ? sale.items : [null];
              return items.map((item, idx) => ({
                date: idx===0 ? date:'', time: idx===0 ? time:'',
                product: item ? (item.name||'N/A') : 'N/A',
                qty: item ? String(item.quantity||item.qty||0) : '—',
                total: idx===0 ? fmt(total) : '',
                payment: idx===0 ? payment : '', customer: idx===0 ? customer : '',
              }));
            })}
            summary={[{label:'Grand Total', value: fmt(grandTotal)}, {label:'Total Records', value: String(totalRecords)}]}
          />
          <table className="sales-table">

            <thead className="sj-thead">
              <tr>
                {HEADERS.map((h, i) => (
                  <th key={i} className={h === 'Qty' ? 'col-qty' : ''}>{h}</th>
                ))}
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {filteredSales.length === 0 ? (
                <tr><td colSpan="8" className="empty-cell">No sales records found</td></tr>
              ) : (
                filteredSales.map(sale => {
                  const { date, time } = formatDateTime(sale);
                  const total    = getSaleTotal(sale);
                  const payType  = getSalePayType(sale);
                  const customer = getSaleCustomer(sale);
                  const items    = sale.items && sale.items.length > 0 ? sale.items : [null];
                  const rowSpan  = items.length;
                  const isActive = !sale.status || sale.status === 'active';
                  const canEdit = isActive && isWithin30Mins(sale);

                  return items.map((item, idx) => (
                    <tr key={`${sale.id}-${idx}`} className={idx > 0 ? 'sale-continuation-row' : 'sale-first-row'}
                      style={{ opacity: !isActive ? 0.55 : 1, cursor:'pointer' }}
                      onClick={() => setDetailSale(sale)}>
                      {idx === 0 && <td rowSpan={rowSpan} className="merged-cell">{date}</td>}
                      {idx === 0 && <td rowSpan={rowSpan} className="merged-cell">{time}</td>}
                      <td className="items-cell">{item ? getItemName(item) : 'N/A'}</td>
                      <td className="col-qty">{item ? getItemQty(item) : '—'}</td>
                      {idx === 0 && <td rowSpan={rowSpan} className="merged-cell">{fmt(total)}</td>}
                      {idx === 0 && (
                        <td rowSpan={rowSpan} className="merged-cell">
                          {sale.status === 'voided' ? (
                            <span style={{ fontSize:'11px', background:'#fee2e2', color:'#dc2626', padding:'2px 6px', borderRadius:'4px', fontWeight:700 }}>VOID</span>
                          ) : sale.status === 'refunded' ? (
                            <span style={{ fontSize:'11px', background:'#fef3c7', color:'#d97706', padding:'2px 6px', borderRadius:'4px', fontWeight:700 }}>REFUND</span>
                          ) : (
                            <span className={`payment-badge payment-${payType}`}>
                              {payType ? payType.toUpperCase() : 'N/A'}
                            </span>
                          )}
                        </td>
                      )}
                      {idx === 0 && <td rowSpan={rowSpan} className="merged-cell">{customer || '—'}</td>}
                      {idx === 0 && (
                        <td rowSpan={rowSpan} className="merged-cell" style={{ textAlign:'center' }}>
                          {canEdit ? (
                            <button
                              onClick={e => { e.stopPropagation(); setEditSale(sale); }}
                              style={{ background:'none', border:'none', cursor:'pointer', color:'#667eea', padding:'4px', borderRadius:'4px', display:'inline-flex', alignItems:'center' }}
                              title="Edit sale">
                              <Edit2 size={15} />
                            </button>
                          ) : null}
                        </td>
                      )}
                    </tr>
                  ));
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Sale Detail Modal ── */}
      {detailSale && (
        <SaleDetailModal
          sale={detailSale}
          fmt={fmt}
          canEdit={(!detailSale.status || detailSale.status === 'active') && isWithin30Mins(detailSale)}
          onClose={() => setDetailSale(null)}
          onEdit={() => { setEditSale(detailSale); setDetailSale(null); }}
        />
      )}

      {/* ── Void Sale Modal ── */}
      {voidSale && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}>
          <div style={{ background:'var(--surface)', color:'var(--text-primary)', borderRadius:'12px', padding:'24px', width:'100%', maxWidth:'360px' }}>
            <h3 style={{ margin:'0 0 12px', color:'#dc2626' }}>⛔ Void Sale</h3>
            <p style={{ fontSize:'13px', color:'#6b7280', marginBottom:'12px' }}>
              Voiding a sale marks it as cancelled. Total: <strong>{fmt(getSaleTotal(voidSale))}</strong>
            </p>
            <div style={{ marginBottom:'16px' }}>
              <label style={{ display:'block', fontWeight:600, fontSize:'13px', marginBottom:'4px' }}>Reason for voiding *</label>
              <input
                type="text"
                value={voidReason}
                onChange={e => setVoidReason(e.target.value)}
                placeholder="e.g. Customer cancelled, wrong item…"
                style={{ width:'100%', padding:'8px 10px', border:'1.5px solid #d1d5db', borderRadius:'6px', fontSize:'14px', boxSizing:'border-box' }}
              />
            </div>
            <div style={{ display:'flex', gap:'8px' }}>
              <button onClick={() => setVoidSale(null)}
                style={{ flex:1, padding:'10px', borderRadius:'8px', border:'1.5px solid var(--border)', background:'var(--surface)', color:'var(--text-primary)', cursor:'pointer', fontWeight:600 }}>
                Cancel
              </button>
              <button disabled={actionProcessing || !voidReason.trim()}
                onClick={async () => {
                  if (!voidReason.trim()) return;
                  setActionProcessing(true);
                  try {
                    await dataService.voidSale(voidSale.id, voidReason.trim());
                    setVoidSale(null);
                    await reloadSales();
                  } catch(e) { alert('Failed to void sale: ' + e.message); }
                  finally { setActionProcessing(false); }
                }}
                style={{ flex:1, padding:'10px', borderRadius:'8px', border:'none', background:'#dc2626', color:'white', cursor:'pointer', fontWeight:700 }}>
                {actionProcessing ? '…' : 'Confirm Void'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Refund Sale Modal ── */}
      {refundSale && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}>
          <div style={{ background:'var(--surface)', color:'var(--text-primary)', borderRadius:'12px', padding:'24px', width:'100%', maxWidth:'360px' }}>
            <h3 style={{ margin:'0 0 12px', color:'#d97706' }}>↩ Refund Sale</h3>
            <p style={{ fontSize:'13px', color:'#6b7280', marginBottom:'12px' }}>
              Sale Total: <strong>{fmt(getSaleTotal(refundSale))}</strong>
            </p>
            <div style={{ marginBottom:'12px' }}>
              <label style={{ display:'block', fontWeight:600, fontSize:'13px', marginBottom:'4px' }}>Refund Amount *</label>
              <input
                type="number"
                value={refundAmount}
                onChange={e => setRefundAmount(e.target.value)}
                min="0.01" step="0.01"
                style={{ width:'100%', padding:'8px 10px', border:'1.5px solid #d1d5db', borderRadius:'6px', fontSize:'14px', boxSizing:'border-box' }}
              />
            </div>
            <div style={{ marginBottom:'16px' }}>
              <label style={{ display:'block', fontWeight:600, fontSize:'13px', marginBottom:'4px' }}>Reason *</label>
              <input
                type="text"
                value={refundReason}
                onChange={e => setRefundReason(e.target.value)}
                placeholder="e.g. Defective product, wrong size…"
                style={{ width:'100%', padding:'8px 10px', border:'1.5px solid #d1d5db', borderRadius:'6px', fontSize:'14px', boxSizing:'border-box' }}
              />
            </div>
            <div style={{ display:'flex', gap:'8px' }}>
              <button onClick={() => setRefundSale(null)}
                style={{ flex:1, padding:'10px', borderRadius:'8px', border:'1.5px solid var(--border)', background:'var(--surface)', color:'var(--text-primary)', cursor:'pointer', fontWeight:600 }}>
                Cancel
              </button>
              <button disabled={actionProcessing || !refundReason.trim() || !refundAmount}
                onClick={async () => {
                  if (!refundReason.trim() || !refundAmount) return;
                  setActionProcessing(true);
                  try {
                    await dataService.refundSale(refundSale.id, parseFloat(refundAmount), refundReason.trim());
                    setRefundSale(null);
                    await reloadSales();
                  } catch(e) { alert('Failed to refund sale: ' + e.message); }
                  finally { setActionProcessing(false); }
                }}
                style={{ flex:1, padding:'10px', borderRadius:'8px', border:'none', background:'#d97706', color:'white', cursor:'pointer', fontWeight:700 }}>
                {actionProcessing ? '…' : 'Confirm Refund'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Sale Modal (30-minute window) ── */}
      {editSale && (
        <SaleEditModal
          sale={editSale}
          fmt={fmt}
          onSave={async () => {
            setEditSale(null);
            await reloadSales();
          }}
          onDeleted={async () => {
            setEditSale(null);
            await reloadSales();
          }}
          onClose={() => setEditSale(null)}
        />
      )}

    </div>
  );
}

export default SalesRecord;
