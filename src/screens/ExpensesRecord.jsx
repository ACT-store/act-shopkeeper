import { APP_NAME } from '../utils/appConfig';
import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { useValidation, ValidationNote, errorBorder } from '../utils/validation.jsx';
import dataService from '../services/dataService';
import { logAction } from '../services/activityLogger';
import { useCurrency } from '../hooks/useCurrency';
import { formatDate, formatTime, toSortKey } from '../utils/formatDateTime';
import './ExpensesRecord.css';

// ── Category definitions ───────────────────────────────────────────────────────
const SYSTEM_FEE_CAT = `${APP_NAME} System's weekly fee`;

// KPA supplier name (auto-created when Kiribati Ports Authority category is selected)
const KPA_SUPPLIER_NAME = 'Kiribati Ports Authority (KPA)';

// Item name suggestions shown when Kiribati Ports Authority category is selected
const KPA_ITEM_SUGGESTIONS = [
  'Wharfage Dues',
  'Port Cargo Handling Services',
  'Lighterage',
  'Delivery Charges',
  'Collection Charges',
  'Trailer Detention',
  'Express Release',
  'Storage Charges',
];

const CATEGORY_GROUPS = [
  {
    group: 'Purchases & Inventory',
    items: ['Purchase', 'TT Purchase', 'Koil'],
  },
  {
    group: 'Transport & Logistics',
    items: ['Freight', 'Handling', 'Toll Fare', 'Hire', 'Transport Expense', 'Fuel', 'Fare', 'Charter'],
  },
  {
    group: 'Government & Regulatory',
    items: ['Customs', 'Licence', 'KLTA', 'KPF', 'Kiribati Ports Authority', 'Tax'],
  },
  {
    group: 'Utilities & Communications',
    items: ['Utilities', 'Internet', 'Vodafone', 'Ocean Link', 'PUB'],
  },
  {
    group: 'Staff & Labour',
    items: ['Wages', 'Contractor\'s Payment', 'Staff Salaries'],
  },
  {
    group: 'Professional & Administrative',
    items: [SYSTEM_FEE_CAT, 'Sinita POS Hub (SPOSH)', 'Accounts', 'Stationery', 'Bank Charges'],
  },
  {
    group: 'Property',
    items: ['Rent'],
  },
  {
    group: 'Construction',
    items: ['Constructions', 'Local Charge'],
  },
  {
    group: 'Community & Social',
    items: ['Community Support', 'Donations'],
  },
  {
    group: 'Owner',
    items: ['Owner Drawings'],
  },
  {
    group: 'Finance',
    items: ['Loan Installment'],
  },
  {
    group: 'Miscellaneous',
    items: ['Maintenance', 'Supplies', 'OTH'],
  },
];

const ALL_CATEGORIES = CATEGORY_GROUPS.flatMap(g => g.items); // eslint-disable-line no-unused-vars
const QUICK_CATS = ['Wages', 'Owner Drawings', 'Purchase', 'Fuel'];

const PAYMENT_METHODS = [
  { value: 'cash',          label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'mpaisa',        label: 'MPAiSA' },
  { value: 'check',         label: 'Cheque' },
  { value: 'on_credit',     label: 'On Credit' },
];

// Payment methods allowed when category is Owner Drawings
const OWNER_DRAWINGS_PAYMENT_METHODS = [
  { value: 'cash',      label: 'Cash' },
  { value: 'check',     label: 'Cheque' },
  { value: 'on_credit', label: 'On Credit' },
];

function methodBadgeClass(m) {
  if (m === 'cash')          return 'er-method-badge er-method-cash';
  if (m === 'bank_transfer') return 'er-method-badge er-method-bank';
  if (m === 'mpaisa')        return 'er-method-badge er-method-mobile';
  if (m === 'mobile_money')  return 'er-method-badge er-method-mobile'; // legacy
  if (m === 'check')         return 'er-method-badge er-method-check';
  if (m === 'on_credit')     return 'er-method-badge er-method-other';
  return 'er-method-badge er-method-other';
}
function methodLabel(m) {
  if (m === 'mobile_money') return 'MPAiSA';
  if (m === 'on_credit')    return 'On Credit';
  return PAYMENT_METHODS.find(p => p.value === m)?.label || m || 'Cash';
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ── Category picker modal ──────────────────────────────────────────────────────
function CategoryModal({ selected, onSelect, onClose }) {
  const [search, setSearch] = useState('');
  const filtered = search.trim()
    ? CATEGORY_GROUPS.map(g => ({ ...g, items: g.items.filter(i => i.toLowerCase().includes(search.toLowerCase())) })).filter(g => g.items.length > 0)
    : CATEGORY_GROUPS;
  return (
    <div className="er-cat-modal-overlay" onClick={onClose}>
      <div className="er-cat-modal" onClick={e => e.stopPropagation()}>
        <div className="er-modal-header" style={{ borderRadius: '20px 20px 0 0' }}>
          <h2>Select Category</h2>
          <button className="er-modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <input className="er-cat-search" placeholder="Search category…" value={search} onChange={e => setSearch(e.target.value)} autoFocus />
        <div className="er-cat-list">
          {filtered.map(g => (
            <div key={g.group}>
              <div className="er-cat-group-label">{g.group}</div>
              {g.items.map(item => (
                <button key={item} className={`er-cat-item${selected === item ? ' selected' : ''}`} onClick={() => { onSelect(item); onClose(); }}>{item}</button>
              ))}
            </div>
          ))}
        </div>
        {selected && <button className="er-cat-clear" onClick={() => { onSelect(''); onClose(); }}>✕ Clear Category Filter</button>}
      </div>
    </div>
  );
}

// ── New Supplier Modal (migrated from CashRecord) ──────────────────────────────
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
  const [comments, setComments]     = useState('');
  const [date, setDate] = useState(todayStr);
  const nextId = useRef(2);
  const [items, setItems] = useState([{ id: 1, name: '', qty: '', costPrice: '' }]);
  const [saving, setSaving] = useState(false);

  const filteredSuppliers = suppliersList.filter(s =>
    (s.name || s.customerName || '').toLowerCase().includes(supplierSearchText.toLowerCase())
  );
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
    setDetailsError(''); setActiveTab('purchase');
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
        const qty = parseFloat(it.qty)||0, costPrice = parseFloat(it.costPrice)||0, subtotal = qty*costPrice;
        await dataService.addOperationalAsset({ name: it.name.trim(), qty, costPrice, subtotal, supplierName, supplierId, invoiceRef: invoiceRef.trim(), paymentType, date: dateISO, source: 'purchase' });
        savedItems.push({ name: it.name.trim(), qty, costPrice, subtotal });
      }
      const total = savedItems.reduce((s, it) => s + it.subtotal, 0);
      if (paymentType === 'cash' && total > 0) {
        await dataService.addCashEntry({ type: 'out', amount: total, note: `Paid ${supplierName} for ref: ${invoiceRef.trim()}`, date: dateISO, source: 'purchase', business_date: date, invoiceRef: invoiceRef.trim() });
      }
      onSave({ supplierName, supplierId, paymentType, total, invoiceRef: invoiceRef.trim(), itemsSummary: savedItems.map(i => i.name).join(', '), items: savedItems });
    } catch (e) { console.error(e); showError('ns_items', 'Failed to save. Please try again.'); }
    finally { setSaving(false); }
  };

  const ls = { display:'block', fontWeight:600, fontSize:'13px', marginBottom:'6px', color:'var(--text-primary, #374151)' };
  const fs = { width:'100%', padding:'10px 12px', border:'1.5px solid var(--border, #e5e7eb)', borderRadius:'8px', fontSize:'14px', background:'var(--surface, white)', color:'var(--text-primary, #111)', boxSizing:'border-box' };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', zIndex:5000, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}>
      <div style={{ background:'var(--surface, white)', color:'var(--text-primary, #111)', borderRadius:'14px', width:'100%', maxWidth:'480px', maxHeight:'92vh', display:'flex', flexDirection:'column', boxShadow:'0 12px 48px rgba(0,0,0,0.3)', overflow:'hidden' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 20px', borderBottom:'1px solid var(--border, #e5e7eb)', flexShrink:0 }}>
          <h2 style={{ margin:0, fontSize:'16px', fontWeight:700 }}>🏭 New Supplier + Purchase</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-secondary, #6b7280)', padding:'4px' }}><X size={20}/></button>
        </div>
        <div style={{ display:'flex', borderBottom:'1px solid var(--border, #e5e7eb)', flexShrink:0 }}>
          {[['details','Supplier Details'],['purchase','Purchase']].map(([tab,lbl]) => (
            <button key={tab} onClick={() => { if (tab==='purchase') { const e=validateDetails(); if (e) { setDetailsError(e.msg); nsScrollToField(e.field); return; } setDetailsError(''); } setActiveTab(tab); }}
              style={{ flex:1, padding:'12px', border:'none', background:'none', fontSize:'13px', fontWeight:activeTab===tab?700:400, color:activeTab===tab?'#667eea':'var(--text-secondary, #6b7280)', borderBottom:activeTab===tab?'2px solid #667eea':'2px solid transparent', cursor:'pointer' }}>
              {lbl}
            </button>
          ))}
        </div>
        <div style={{ overflowY:'auto', padding:'20px', flex:1, display:'flex', flexDirection:'column', gap:'16px' }}>
          {detailsError && activeTab==='details' && (
            <div ref={detailsErrorRef} style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:'8px', padding:'10px 12px', fontSize:'13px', color:'#b91c1c' }}>{detailsError}</div>
          )}
          {activeTab==='details' && (<>
            <div>
              <label style={ls}>Supplier Name *</label>
              <div style={{ display:'flex', gap:'8px', position:'relative' }}>
                <div style={{ flex:1, position:'relative' }}>
                  {supplierMode==='search' ? (
                    <>
                      <input style={{ ...fs, paddingRight: selectedExistingSupplier?'32px':'12px', ...errorBorder('ns_fullName', fieldErrors) }} data-field="ns_fullName"
                        value={supplierSearchText} placeholder="Search existing suppliers…"
                        onChange={e => { setSupplierSearchText(e.target.value); setShowSupplierDrop(true); setSelectedExistingSupplier(null); clearFieldError('ns_fullName'); }}
                        onFocus={() => setShowSupplierDrop(true)} onBlur={() => setTimeout(() => setShowSupplierDrop(false), 180)} />
                      {selectedExistingSupplier && (
                        <button onClick={() => { setSelectedExistingSupplier(null); setSupplierSearchText(''); setFullName(''); setPhone(''); setWhatsapp(''); setEmail(''); setAddress(''); }}
                          style={{ position:'absolute', right:'8px', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#9ca3af', fontSize:'16px', padding:'2px 4px' }}>✕</button>
                      )}
                      {showSupplierDrop && filteredSuppliers.length>0 && (
                        <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:600, background:'var(--surface, white)', border:'1px solid var(--border, #e5e7eb)', borderRadius:'8px', boxShadow:'0 4px 16px rgba(0,0,0,0.12)', maxHeight:'160px', overflowY:'auto' }}>
                          {filteredSuppliers.map(s => { const n=s.name||s.customerName||''; return (
                            <button key={s.id} onMouseDown={() => { setSelectedExistingSupplier(s); setSupplierSearchText(n); setFullName(n); setPhone(s.phone||s.customerPhone||''); setWhatsapp(s.whatsapp||''); setEmail(s.email||''); setAddress(s.address||''); setShowSupplierDrop(false); clearFieldError('ns_fullName'); }}
                              style={{ display:'block', width:'100%', textAlign:'left', padding:'10px 14px', background:'none', border:'none', cursor:'pointer', fontSize:'14px', color:'var(--text-primary, #111)' }}>{n}</button>
                          ); })}
                        </div>
                      )}
                    </>
                  ) : (
                    <input ref={nsFieldRefs.fullName} data-field="ns_fullName" style={{ ...fs, ...errorBorder('ns_fullName', fieldErrors) }} value={fullName} placeholder="Enter new supplier name" onChange={e => { setFullName(e.target.value); clearFieldError('ns_fullName'); }} />
                  )}
                </div>
                <button onClick={() => { if (supplierMode==='search') { setSupplierMode('new'); setSelectedExistingSupplier(null); setSupplierSearchText(''); setFullName(''); setPhone(''); setWhatsapp(''); setEmail(''); setAddress(''); } else { setSupplierMode('search'); setFullName(''); setPhone(''); setWhatsapp(''); setEmail(''); setAddress(''); setSupplierSearchText(''); } }}
                  style={{ padding:'10px 12px', borderRadius:'8px', fontSize:'12px', fontWeight:600, border:supplierMode==='new'?'2px solid #16a34a':'2px solid #667eea', background:supplierMode==='new'?'#f0fdf4':'#eef2ff', color:supplierMode==='new'?'#16a34a':'#667eea', cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 }}>
                  {supplierMode==='new'?'🔍 Search':'+ New'}
                </button>
              </div>
              <ValidationNote field="ns_fullName" errors={fieldErrors} />
            </div>
            <div ref={nsFieldRefs.phone}><label style={ls}>Phone *</label><input data-field="ns_phone" style={{ ...fs, ...errorBorder('ns_phone', fieldErrors) }} value={phone} placeholder="Phone number" readOnly={supplierMode==='search' && !!selectedExistingSupplier} onChange={e => { setPhone(e.target.value); clearFieldError('ns_phone'); }} /><ValidationNote field="ns_phone" errors={fieldErrors} /></div>
            <div ref={nsFieldRefs.whatsapp}><label style={ls}>WhatsApp</label><input style={fs} value={whatsapp} placeholder="WhatsApp number" readOnly={supplierMode==='search' && !!selectedExistingSupplier} onChange={e => setWhatsapp(e.target.value)} /></div>
            <div><label style={ls}>Email</label><input style={fs} value={email} placeholder="email@example.com" readOnly={supplierMode==='search' && !!selectedExistingSupplier} onChange={e => setEmail(e.target.value)} /></div>
            <div ref={nsFieldRefs.address}><label style={ls}>Address *</label><input data-field="ns_address" style={{ ...fs, ...errorBorder('ns_address', fieldErrors) }} value={address} placeholder="Supplier address" readOnly={supplierMode==='search' && !!selectedExistingSupplier} onChange={e => { setAddress(e.target.value); clearFieldError('ns_address'); }} /><ValidationNote field="ns_address" errors={fieldErrors} /></div>
          </>)}
          {activeTab==='purchase' && (<>
            <div><label style={ls}>Payment Type</label>
              <div style={{ display:'flex', gap:'8px' }}>
                {[['cash','💵 Cash'],['credit','📋 Credit']].map(([pt,lbl]) => (
                  <button key={pt} onClick={() => setPaymentType(pt)} style={{ flex:1, padding:'9px', borderRadius:'8px', border:'2px solid', borderColor:paymentType===pt?(pt==='cash'?'#16a34a':'#4f46e5'):'var(--border, #d1d5db)', background:paymentType===pt?(pt==='cash'?'#f0fdf4':'#eef2ff'):'var(--surface, white)', fontWeight:paymentType===pt?700:400, cursor:'pointer', fontSize:'13px', color:'var(--text-primary, #111)' }}>{lbl}</button>
                ))}
              </div>
            </div>
            <div><label style={ls}>Invoice / Ref *</label><input data-field="ns_invoiceRef" style={{ ...fs, ...errorBorder('ns_invoiceRef', fieldErrors) }} value={invoiceRef} placeholder="Receipt or invoice number…" onChange={e => { setInvoiceRef(e.target.value); clearFieldError('ns_invoiceRef'); }} /><ValidationNote field="ns_invoiceRef" errors={fieldErrors} /></div>
            <div><label style={ls}>Date *</label><input type="date" data-field="ns_date" style={{ ...fs, ...errorBorder('ns_date', fieldErrors) }} value={date} max={todayStr()} onChange={e => { setDate(e.target.value); clearFieldError('ns_date'); }} /><ValidationNote field="ns_date" errors={fieldErrors} /></div>
            <div>
              <label style={{ display:'block', fontWeight:600, fontSize:'13px', marginBottom:'8px', color:'var(--text-primary, #374151)' }}>Items *</label>
              <div data-field="ns_items" style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                {items.map((it,idx) => { const sub=(parseFloat(it.qty)||0)*(parseFloat(it.costPrice)||0); return (
                  <div key={it.id} style={{ border:'1.5px solid var(--border, #e5e7eb)', borderRadius:'10px', padding:'12px', background:'var(--background, #f9fafb)', display:'flex', flexDirection:'column', gap:'10px' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <span style={{ fontSize:'12px', fontWeight:700, color:'#667eea' }}>Item {idx+1}</span>
                      {items.length>1 && <button onClick={() => removeItem(it.id)} style={{ background:'#fee2e2', border:'none', borderRadius:'6px', padding:'4px 8px', cursor:'pointer', color:'#dc2626', display:'flex', alignItems:'center', gap:'4px', fontSize:'12px' }}><Trash2 size={12}/> Remove</button>}
                    </div>
                    <div><label style={{ display:'block', fontSize:'12px', fontWeight:600, color:'var(--text-secondary, #6b7280)', marginBottom:'4px' }}>Asset Name *</label>
                      <input style={{ width:'100%', padding:'8px 10px', border:'1.5px solid var(--border, #e5e7eb)', borderRadius:'7px', fontSize:'13px', background:'var(--surface, white)', color:'var(--text-primary, #111)', boxSizing:'border-box' }} value={it.name} placeholder="e.g. Generator, Office Chair…" onChange={e => updateItem(it.id,'name',e.target.value)} /></div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                      <div><label style={{ display:'block', fontSize:'12px', fontWeight:600, color:'var(--text-secondary, #6b7280)', marginBottom:'4px' }}>Quantity *</label>
                        <input type="number" min="0" step="1" style={{ width:'100%', padding:'8px 10px', border:'1.5px solid var(--border, #e5e7eb)', borderRadius:'7px', fontSize:'13px', background:'var(--surface, white)', color:'var(--text-primary, #111)', boxSizing:'border-box' }} value={it.qty} placeholder="0" onChange={e => updateItem(it.id,'qty',e.target.value)} /></div>
                      <div><label style={{ display:'block', fontSize:'12px', fontWeight:600, color:'var(--text-secondary, #6b7280)', marginBottom:'4px' }}>Unit Cost</label>
                        <input type="number" min="0" step="0.01" style={{ width:'100%', padding:'8px 10px', border:'1.5px solid var(--border, #e5e7eb)', borderRadius:'7px', fontSize:'13px', background:'var(--surface, white)', color:'var(--text-primary, #111)', boxSizing:'border-box' }} value={it.costPrice} placeholder="0.00" onChange={e => updateItem(it.id,'costPrice',e.target.value)} /></div>
                    </div>
                    {sub>0 && <div style={{ padding:'6px 10px', background:'#f0f4ff', border:'1px solid #c7d2fe', borderRadius:'7px', fontSize:'12px', color:'#4338ca', fontWeight:600 }}>Subtotal: {sub.toFixed(2)}</div>}
                  </div>
                ); })}
              </div>
              <ValidationNote field="ns_items" errors={fieldErrors} />
              <button onClick={addItem} disabled={!lastItemComplete()} style={{ marginTop:'10px', width:'100%', padding:'10px', border:'1.5px dashed var(--border, #d1d5db)', borderRadius:'8px', background:lastItemComplete()?'var(--surface, white)':'var(--background, #f9fafb)', color:lastItemComplete()?'#667eea':'#9ca3af', cursor:lastItemComplete()?'pointer':'not-allowed', fontSize:'13px', fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center', gap:'6px' }}><Plus size={14}/> Add Another Item</button>
            </div>
            {grandTotal>0 && <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:'#f0f4ff', border:'1.5px solid #c7d2fe', borderRadius:'10px' }}><span style={{ fontWeight:700, fontSize:'14px', color:'#4338ca' }}>Grand Total</span><span style={{ fontWeight:800, fontSize:'15px', color:'#3730a3' }}>{grandTotal.toFixed(2)}</span></div>}
          </>)}
        </div>
        <div style={{ display:'flex', gap:'10px', padding:'16px 20px', borderTop:'1px solid var(--border, #e5e7eb)', flexShrink:0 }}>
          <button onClick={onClose} style={{ flex:1, padding:'12px', borderRadius:'8px', border:'1.5px solid var(--border, #e5e7eb)', background:'var(--surface, white)', color:'var(--text-primary, #111)', cursor:'pointer', fontWeight:600, fontSize:'14px' }}>Cancel</button>
          {activeTab==='details'
            ? <button onClick={handleNextToPurchase} style={{ flex:1, padding:'12px', borderRadius:'8px', border:'none', background:'#667eea', color:'white', cursor:'pointer', fontWeight:700, fontSize:'14px' }}>Next: Purchase →</button>
            : <button onClick={handleSave} disabled={saving} style={{ flex:1, padding:'12px', borderRadius:'8px', border:'none', background:saving?'#9ca3af':'#f59e0b', color:'white', cursor:saving?'not-allowed':'pointer', fontWeight:700, fontSize:'14px' }}>{saving?'Saving…':'Save Purchase'}</button>
          }
        </div>
      </div>
    </div>
  );
}

// ── Simple Add New Supplier Modal (used from Buy Operational Assets) ───────────
function SimpleAddSupplierModal({ onSave, onClose }) {
  const { fieldErrors, showError, clearFieldError } = useValidation();
  const [fullName, setFullName]   = useState('');
  const [phone, setPhone]         = useState('');
  const [whatsapp, setWhatsapp]   = useState('');
  const [email, setEmail]         = useState('');
  const [address, setAddress]     = useState('');
  const [saving, setSaving]       = useState(false);

  const ls = { display:'block', fontWeight:600, fontSize:'13px', marginBottom:'6px', color:'var(--text-primary, #374151)' };
  const fs = { width:'100%', padding:'10px 12px', border:'1.5px solid var(--border, #e5e7eb)', borderRadius:'8px', fontSize:'14px', background:'var(--surface, white)', color:'var(--text-primary, #111)', boxSizing:'border-box' };

  const handleSave = async (e) => {
    e && e.preventDefault();
    if (!fullName.trim())  return showError('sas_name',    'Full Name is required');
    if (!phone.trim())     return showError('sas_phone',   'Phone is required');
    if (!whatsapp.trim() && !email.trim()) return showError('sas_whatsapp', 'Provide at least WhatsApp or Email');
    if (email.trim() && !email.includes('@')) return showError('sas_email', 'Email must contain @');
    if (!address.trim())   return showError('sas_address', 'Address is required');
    setSaving(true);
    try {
      const supplierData = {
        id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        customerName: fullName.trim(), name: fullName.trim(),
        phone: phone.trim(), customerPhone: phone.trim(), gender: '',
        whatsapp: whatsapp.trim(), email: email.trim(), address: address.trim(),
        totalDue: 0, totalPaid: 0, balance: 0, purchaseIds: [], deposits: [],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastSale: null,
      };
      const current = await dataService.getSuppliers() || [];
      current.push(supplierData);
      await dataService.setSuppliers(current);
      onSave(supplierData);
    } catch (err) { console.error(err); showError('sas_name', 'Failed to save. Please try again.'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', zIndex:5500, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}>
      <div style={{ background:'var(--surface, white)', color:'var(--text-primary, #111)', borderRadius:'14px', width:'100%', maxWidth:'420px', maxHeight:'92vh', display:'flex', flexDirection:'column', boxShadow:'0 12px 48px rgba(0,0,0,0.3)', overflow:'hidden' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 20px', borderBottom:'1px solid var(--border, #e5e7eb)', flexShrink:0 }}>
          <h2 style={{ margin:0, fontSize:'16px', fontWeight:700 }}>Add New Supplier</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-secondary, #6b7280)', padding:'4px' }}><X size={20}/></button>
        </div>
        <div style={{ overflowY:'auto', padding:'20px', flex:1, display:'flex', flexDirection:'column', gap:'14px' }}>
          <div>
            <label style={ls}>Full Name *</label>
            <input data-field="sas_name" style={{ ...fs, ...errorBorder('sas_name', fieldErrors) }}
              value={fullName} placeholder="Enter full name"
              onChange={e => { setFullName(e.target.value); clearFieldError('sas_name'); }} />
            <ValidationNote field="sas_name" errors={fieldErrors} />
          </div>
          <div>
            <label style={ls}>Phone *</label>
            <input data-field="sas_phone" style={{ ...fs, ...errorBorder('sas_phone', fieldErrors) }}
              value={phone} placeholder="Phone number"
              onChange={e => { setPhone(e.target.value); clearFieldError('sas_phone'); }} />
            <ValidationNote field="sas_phone" errors={fieldErrors} />
          </div>
          <div>
            <label style={ls}>WhatsApp</label>
            <input data-field="sas_whatsapp" style={{ ...fs, ...errorBorder('sas_whatsapp', fieldErrors) }}
              value={whatsapp} placeholder="WhatsApp number (optional)"
              onChange={e => { setWhatsapp(e.target.value); clearFieldError('sas_whatsapp'); }} />
            <ValidationNote field="sas_whatsapp" errors={fieldErrors} />
          </div>
          <div>
            <label style={ls}>Email</label>
            <input data-field="sas_email" style={{ ...fs, ...errorBorder('sas_email', fieldErrors) }}
              value={email} placeholder="email@example.com"
              onChange={e => { setEmail(e.target.value); clearFieldError('sas_email'); }} />
            <ValidationNote field="sas_email" errors={fieldErrors} />
          </div>
          <div>
            <label style={ls}>Address *</label>
            <textarea data-field="sas_address" rows={2} style={{ ...fs, ...errorBorder('sas_address', fieldErrors), resize:'vertical' }}
              value={address} placeholder="Enter address"
              onChange={e => { setAddress(e.target.value); clearFieldError('sas_address'); }} />
            <ValidationNote field="sas_address" errors={fieldErrors} />
          </div>
          <p style={{ fontSize:'12px', color:'#9ca3af', margin:0 }}>* Required · At least WhatsApp or Email required</p>
        </div>
        <div style={{ display:'flex', gap:'10px', padding:'16px 20px', borderTop:'1px solid var(--border, #e5e7eb)', flexShrink:0 }}>
          <button onClick={onClose} style={{ flex:1, padding:'12px', borderRadius:'8px', border:'1.5px solid var(--border, #e5e7eb)', background:'var(--surface, white)', color:'var(--text-primary, #111)', cursor:'pointer', fontWeight:600, fontSize:'14px' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ flex:1, padding:'12px', borderRadius:'8px', border:'none', background:saving?'#9ca3af':'#667eea', color:'white', cursor:saving?'not-allowed':'pointer', fontWeight:700, fontSize:'14px' }}>{saving?'Saving…':'Save'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Build description string from expense fields ──────────────────────────────
function buildExpenseDescription(category, payee, note, gender) {
  const sysFee = SYSTEM_FEE_CAT;
  if (category === 'Wages') {
    const pronoun = gender === 'Female' ? 'her' : 'his';
    return `Paid ${payee || '—'} ${pronoun} wages`;
  }
  if (category === sysFee) return 'Paid Sinita POS System for weekly fee';
  if (category === 'Owner Drawings') return `${payee || '—'} withdraws cash`;
  if (category === 'Donations') return `Donated CASH to ${payee || '—'}`;
  if (category === 'Community Support') return `Contribution to support ${payee || '—'}`;
  return `Paid ${payee || note || '—'} for ${category || 'expense'}`;
}



// ── Add Expense Modal ──────────────────────────────────────────────────────────
function AddExpenseModal({ onSave, onClose }) {
  const { fmt } = useCurrency();
  const { fieldErrors, showError, clearFieldError } = useValidation();

  const [date, setDate]                   = useState(todayStr());
  const [category, setCategory]           = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showSupplierDrop, setShowSupplierDrop] = useState(false);
  const [resolvedSupplierId, setResolvedSupplierId] = useState(null);
  const [note, setNote]                   = useState('');
  const [saving, setSaving]               = useState(false);

  const nextItemId = useRef(2);
  const [items, setItems]                 = useState([{ id:1, name:'', qty:'', costPrice:'' }]);

  const [showCatModal, setShowCatModal]               = useState(false);
  const [showSimpleSupplierModal, setShowSimpleSupplierModal] = useState(false);
  const [suppliersList, setSuppliersList] = useState([]);
  const [users, setUsers]                 = useState([]);
  const [cashBalance, setCashBalance]     = useState(null);

  useEffect(() => {
    dataService.getSuppliers().then(s => setSuppliersList(s || []));
    dataService.getCashEntries().then(entries => {
      const bal = (entries||[]).reduce((s,e) => s+(e.type==='in'?(e.amount||0):-(e.amount||0)),0);
      setCashBalance(bal);
    });
    dataService.getUsers().then(async (us) => {
      const landlord = await dataService.getLandlord();
      setUsers(landlord ? [...us, landlord] : us);
    });
  }, []);

  useEffect(() => {
    // Reset fields on category change
    setSupplierSearch('');
    setResolvedSupplierId(null);
    setPaymentMethod('cash');
    setItems([{ id:1, name:'', qty:'', costPrice:'' }]);
    nextItemId.current = 2;

    // Auto-fill Paid To with KPA supplier when Kiribati Ports Authority is selected
    if (category === 'Kiribati Ports Authority') {
      (async () => {
        let suppliers = suppliersList.length > 0 ? suppliersList : (await dataService.getSuppliers() || []);
        const existing = suppliers.find(s =>
          (s.name||s.customerName||'').toLowerCase() === KPA_SUPPLIER_NAME.toLowerCase()
        );
        if (existing) {
          setSupplierSearch(existing.name || existing.customerName);
          setResolvedSupplierId(existing.id);
        } else {
          // Auto-create KPA supplier
          const newKpa = {
            id: Date.now() + '-kpa',
            customerName: KPA_SUPPLIER_NAME, name: KPA_SUPPLIER_NAME,
            phone: '', customerPhone: '', gender: '',
            whatsapp: '', email: '', address: 'Betio, Tarawa',
            totalDue: 0, totalPaid: 0, balance: 0, purchaseIds: [], deposits: [],
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastSale: null,
          };
          const updated = [...suppliers, newKpa];
          await dataService.setSuppliers(updated);
          setSuppliersList(updated);
          setSupplierSearch(KPA_SUPPLIER_NAME);
          setResolvedSupplierId(newKpa.id);
        }
        // Pre-fill first item suggestion
        setItems([{ id:1, name: KPA_ITEM_SUGGESTIONS[0], qty:'', costPrice:'' }]);
      })();
    }
  }, [category]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sequential unlock
  const seq_cat   = !!date;
  const seq_payee = seq_cat && !!category;
  const seq_items = seq_payee && !!supplierSearch.trim();
  const seq_note  = seq_items && items.some(it => it.name.trim() && parseFloat(it.qty) > 0);

  const filteredSuppliers = suppliersList.filter(s =>
    (s.name||s.customerName||'').toLowerCase().includes(supplierSearch.toLowerCase())
  );

  const updateItem = (id,field,val) => setItems(prev => prev.map(it => it.id===id?{...it,[field]:val}:it));
  const addItem    = () => setItems(prev => [...prev, { id:nextItemId.current++, name:'', qty:'', costPrice:'' }]);
  const removeItem = id => setItems(prev => prev.filter(it => it.id!==id));
  const grandTotal = items.reduce((sum,it) => sum+(parseFloat(it.qty)||0)*(parseFloat(it.costPrice)||0), 0);
  const lastItemComplete = () => { const last=items[items.length-1]; return last && last.name.trim() && parseFloat(last.qty)>0; };

  const handleSave = async () => {
    if (!date)                  return showError('ex_date',  'Date is required');
    if (!category)              return showError('ex_cat',   'Category is required');
    if (!supplierSearch.trim()) return showError('ex_payee', 'Paid To is required');
    const validItems = items.filter(it => it.name.trim() && parseFloat(it.qty)>0);
    if (validItems.length===0)  return showError('ex_items', 'Add at least one item');
    const badItems = items.filter(it => it.name.trim() && !(parseFloat(it.qty)>0));
    if (badItems.length>0) { badItems.forEach(it => showError('ex_qty_'+it.id,'Enter a quantity')); return; }
    if (paymentMethod==='cash' && cashBalance!==null && grandTotal>cashBalance)
      return showError('ex_items', `Total exceeds Cash Balance. Available: ${fmt(cashBalance)}`);

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const supplierName = supplierSearch.trim();
      const itemsSummary = validItems.map(it => it.name.trim()).join(', ');
      const payeeUser = users.find(u => (u.fullName||u.name||'').toLowerCase() === supplierName.toLowerCase());
      const payeeGender = payeeUser?.gender || '';

      if (category === 'Supplier Purchase') {
        const dateISO = new Date(date+'T12:00:00').toISOString();
        for (const it of validItems) {
          const qty=parseFloat(it.qty)||0, costPrice=parseFloat(it.costPrice)||0, subtotal=qty*costPrice;
          await dataService.addOperationalAsset({ name:it.name.trim(), qty, costPrice, subtotal, supplierName, supplierId:resolvedSupplierId||null, paymentType:paymentMethod==='on_credit'?'credit':'cash', date:dateISO, source:'purchase' });
        }
      }
      await dataService.addExpense({ date, amount:grandTotal, category, paymentMethod, payee:supplierName, note:note.trim()||itemsSummary, gender:payeeGender, createdAt:now, updatedAt:now });
      await logAction('EXPENSE_ADDED', `Expense: ${category} — $${grandTotal.toFixed(2)} paid to ${supplierName}`).catch(() => {});
      onSave();
    } catch (e) { console.error(e); showError('ex_date', 'Failed to save. Please try again.'); }
    finally { setSaving(false); }
  };

  const inFs = { width:'100%', padding:'10px 12px', border:'2px solid var(--border, #e5e7eb)', borderRadius:'8px', fontSize:'14px', background:'var(--surface, white)', color:'var(--text-primary, #111)', boxSizing:'border-box' };
  const inLs = { display:'block', fontWeight:600, fontSize:'13px', marginBottom:'6px', color:'var(--text-primary, #374151)' };

  return (
    <div className="er-modal-overlay">
      <div className="er-modal-content">
        <div className="er-modal-header">
          <h2>💸 Add Expense</h2>
          <button className="er-modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="er-modal-body">

          {/* Date */}
          <div className="er-field">
            <label className="er-label">Date *</label>
            <input type="date" className="er-input" data-field="ex_date"
              style={errorBorder('ex_date', fieldErrors)} value={date} max={todayStr()}
              onChange={e => { setDate(e.target.value); clearFieldError('ex_date'); }} />
            <ValidationNote field="ex_date" errors={fieldErrors} />
          </div>

          {/* Category */}
          <div className="er-field">
            <label className="er-label">Category *</label>
            <button data-field="ex_cat"
              style={{ width:'100%', ...errorBorder('ex_cat', fieldErrors), textAlign:'left', padding:'10px 12px', borderRadius:'8px', border:'1.5px solid var(--border,#e5e7eb)', background:'var(--surface,white)', fontSize:'14px', cursor:seq_cat?'pointer':'not-allowed', color:category?'var(--text-primary,#111)':'#9ca3af', opacity:seq_cat?1:0.4 }}
              disabled={!seq_cat}
              onClick={() => { if(seq_cat){ setShowCatModal(true); clearFieldError('ex_cat'); } }}>
              {category || 'Select category…'}
            </button>
            <ValidationNote field="ex_cat" errors={fieldErrors} />
          </div>

          {/* Payment Method */}
          <div className="er-field" style={{ opacity:seq_payee?1:0.4, pointerEvents:seq_payee?'auto':'none' }}>
            <label className="er-label">Payment Method</label>
            <select className="er-input er-select" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} disabled={!seq_payee}>
              <option value="">Select payment method</option>
              {(category === 'Owner Drawings' ? OWNER_DRAWINGS_PAYMENT_METHODS : PAYMENT_METHODS).map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Paid To — supplier search style */}
          <div style={{ opacity:seq_payee?1:0.4, pointerEvents:seq_payee?'auto':'none' }}>
            <div style={{ position:'relative' }}>
              <label style={inLs}>Paid To *</label>
              <div style={{ display:'flex', gap:'8px', alignItems:'flex-start' }}>
                <div style={{ flex:1, position:'relative' }}>
                  <input
                    data-field="ex_payee"
                    style={{ ...inFs, ...errorBorder('ex_payee', fieldErrors) }}
                    value={supplierSearch}
                    placeholder="Search or type name…"
                    disabled={!seq_payee}
                    onChange={e => { setSupplierSearch(e.target.value); setShowSupplierDrop(true); setResolvedSupplierId(null); clearFieldError('ex_payee'); }}
                    onFocus={() => setShowSupplierDrop(true)}
                    onBlur={() => setTimeout(() => setShowSupplierDrop(false), 180)}
                  />
                  {showSupplierDrop && filteredSuppliers.length>0 && (
                    <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:500, background:'var(--surface, white)', border:'1px solid var(--border, #e5e7eb)', borderRadius:'8px', boxShadow:'0 4px 16px rgba(0,0,0,0.12)', maxHeight:'160px', overflowY:'auto' }}>
                      {filteredSuppliers.map(s => { const n=s.name||s.customerName||''; return (
                        <button key={s.id} onMouseDown={() => { setSupplierSearch(n); setResolvedSupplierId(s.id); setShowSupplierDrop(false); clearFieldError('ex_payee'); }}
                          style={{ display:'block', width:'100%', textAlign:'left', padding:'10px 14px', background:'none', border:'none', cursor:'pointer', fontSize:'14px', color:'var(--text-primary, #111)' }}>{n}</button>
                      ); })}
                    </div>
                  )}
                </div>
                <button onClick={() => setShowSimpleSupplierModal(true)} disabled={!seq_payee}
                  style={{ padding:'10px 12px', borderRadius:'8px', fontSize:'12px', fontWeight:600, border:'2px solid #667eea', background:'#eef2ff', color:'#667eea', cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 }}>
                  + New Supplier
                </button>
              </div>
              <ValidationNote field="ex_payee" errors={fieldErrors} />
            </div>
          </div>

          {/* Items */}
          <div style={{ opacity:seq_items?1:0.4, pointerEvents:seq_items?'auto':'none' }}>
            <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:'8px' }}>
              <label style={inLs}>Items *</label>
              {category === 'Kiribati Ports Authority' && (
                <span style={{ fontSize:'11px', color:'#667eea', fontStyle:'italic' }}>KPA charge types below</span>
              )}
            </div>
            {category === 'Kiribati Ports Authority' && (
              <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', marginBottom:'10px' }}>
                {KPA_ITEM_SUGGESTIONS.map(s => (
                  <button key={s} onMouseDown={e => {
                    e.preventDefault();
                    setItems(prev => {
                      const last = prev[prev.length - 1];
                      if (last && !last.name.trim()) {
                        // fill the last blank item
                        return prev.map((it, i) => i === prev.length - 1 ? { ...it, name: s } : it);
                      } else {
                        // add a new item with this name
                        const newId = nextItemId.current++;
                        return [...prev, { id: newId, name: s, qty: '', costPrice: '' }];
                      }
                    });
                  }}
                    style={{ padding:'4px 10px', borderRadius:'20px', border:'1.5px solid #667eea', background:'#eef2ff', color:'#4f46e5', fontSize:'11px', fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>
                    + {s}
                  </button>
                ))}
              </div>
            )}
            <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
              {items.map((it,idx) => { const sub=(parseFloat(it.qty)||0)*(parseFloat(it.costPrice)||0); return (
                <div key={it.id} style={{ border:'1.5px solid var(--border, #e5e7eb)', borderRadius:'10px', padding:'12px', background:'var(--background, #f9fafb)', display:'flex', flexDirection:'column', gap:'10px' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <span style={{ fontSize:'12px', fontWeight:700, color:'#667eea' }}>Item {idx+1}</span>
                    {items.length>1 && <button onClick={() => removeItem(it.id)} style={{ background:'#fee2e2', border:'none', borderRadius:'6px', padding:'4px 8px', cursor:'pointer', color:'#dc2626', display:'flex', alignItems:'center', gap:'4px', fontSize:'12px' }}><Trash2 size={12}/> Remove</button>}
                  </div>
                  <div>
                    <label style={{ display:'block', fontSize:'12px', fontWeight:600, color:'var(--text-secondary, #6b7280)', marginBottom:'4px' }}>Item Name *</label>
                    <input style={{ width:'100%', padding:'8px 10px', border:'1.5px solid var(--border, #e5e7eb)', borderRadius:'7px', fontSize:'13px', background:'var(--surface, white)', color:'var(--text-primary, #111)', boxSizing:'border-box' }}
                      value={it.name} placeholder="e.g. Electricity bill, Rice, Wages…" disabled={!seq_items}
                      onChange={e => updateItem(it.id,'name',e.target.value)} />
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                    <div>
                      <label style={{ display:'block', fontSize:'12px', fontWeight:600, color:'var(--text-secondary, #6b7280)', marginBottom:'4px' }}>Quantity *</label>
                      <input type="number" min="0" step="1"
                        style={{ width:'100%', padding:'8px 10px', border:'1.5px solid var(--border, #e5e7eb)', borderRadius:'7px', fontSize:'13px', background:'var(--surface, white)', color:'var(--text-primary, #111)', boxSizing:'border-box' }}
                        value={it.qty} placeholder="0" disabled={!seq_items}
                        onChange={e => updateItem(it.id,'qty',e.target.value)} />
                      <ValidationNote field={`ex_qty_${it.id}`} errors={fieldErrors} />
                    </div>
                    <div>
                      <label style={{ display:'block', fontSize:'12px', fontWeight:600, color:'var(--text-secondary, #6b7280)', marginBottom:'4px' }}>Unit Cost</label>
                      <input type="number" min="0" step="0.01"
                        style={{ width:'100%', padding:'8px 10px', border:'1.5px solid var(--border, #e5e7eb)', borderRadius:'7px', fontSize:'13px', background:'var(--surface, white)', color:'var(--text-primary, #111)', boxSizing:'border-box' }}
                        value={it.costPrice} placeholder="0.00" disabled={!seq_items}
                        onChange={e => updateItem(it.id,'costPrice',e.target.value)} />
                    </div>
                  </div>
                  {sub>0 && <div style={{ padding:'6px 10px', background:'#f0f4ff', border:'1px solid #c7d2fe', borderRadius:'7px', fontSize:'12px', color:'#4338ca', fontWeight:600 }}>Subtotal: {fmt(sub)}</div>}
                </div>
              ); })}
            </div>
            <ValidationNote field="ex_items" errors={fieldErrors} />
            <button onClick={addItem} disabled={!lastItemComplete() || !seq_items}
              style={{ marginTop:'10px', width:'100%', padding:'10px', border:'1.5px dashed var(--border, #d1d5db)', borderRadius:'8px', background:(lastItemComplete()&&seq_items)?'var(--surface, white)':'var(--background, #f9fafb)', color:(lastItemComplete()&&seq_items)?'#667eea':'#9ca3af', cursor:(lastItemComplete()&&seq_items)?'pointer':'not-allowed', fontSize:'13px', fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center', gap:'6px' }}>
              <Plus size={14}/> Add Another Item
            </button>
            {grandTotal>0 && (
              <div style={{ marginTop:'10px', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:'#f0f4ff', border:'1.5px solid #c7d2fe', borderRadius:'10px' }}>
                <span style={{ fontWeight:700, fontSize:'14px', color:'#4338ca' }}>Grand Total</span>
                <span style={{ fontWeight:800, fontSize:'15px', color:'#3730a3' }}>{fmt(grandTotal)}</span>
              </div>
            )}
            {paymentMethod==='cash' && cashBalance!==null && grandTotal>cashBalance && grandTotal>0 && (
              <div style={{ marginTop:'6px', background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:'8px', padding:'10px 12px', fontSize:'12px', color:'#b91c1c' }}>
                ⚠️ Total ({fmt(grandTotal)}) exceeds Cash Balance ({fmt(cashBalance)}).
              </div>
            )}
          </div>

          {/* Note */}
          <div className="er-field" style={{ opacity:seq_note?1:0.4, pointerEvents:seq_note?'auto':'none' }}>
            <label className="er-label">Note (optional)</label>
            <textarea className="er-input er-textarea" data-field="ex_note"
              style={errorBorder('ex_note', fieldErrors)} placeholder="Description or reason…"
              value={note} onChange={e => { setNote(e.target.value); clearFieldError('ex_note'); }} />
            <ValidationNote field="ex_note" errors={fieldErrors} />
          </div>

          {paymentMethod==='cash' && grandTotal>0 && (
            <p style={{ fontSize:'12px', color:'#667eea', margin:'4px 0 0', fontStyle:'italic' }}>
              💰 A Cash OUT entry will be created automatically in Cash at Shop.
            </p>
          )}
          {category==='Owner Drawings' && (
            <p style={{ fontSize:'12px', color:'#8b5cf6', margin:'4px 0 0', fontStyle:'italic' }}>
              📤 This will also be recorded in Owner's Withdrawals.
            </p>
          )}

        </div>
        <div className="er-modal-footer">
          <button className="er-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="er-btn-save" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Expense'}</button>
        </div>
      </div>

      {showCatModal && (
        <CategoryModal selected={category} onSelect={cat => { setCategory(cat); clearFieldError('ex_cat'); }} onClose={() => setShowCatModal(false)} />
      )}
      {showSimpleSupplierModal && (
        <SimpleAddSupplierModal
          onSave={async (newSupplier) => {
            await dataService.getSuppliers().then(s => setSuppliersList(s || []));
            setSupplierSearch(newSupplier.name);
            setResolvedSupplierId(newSupplier.id);
            setShowSimpleSupplierModal(false);
          }}
          onClose={() => setShowSimpleSupplierModal(false)}
        />
      )}
    </div>
  );
}


// ── Expense Detail / Edit Modal ────────────────────────────────────────────────
function ExpenseDetailModal({ expense, onClose, onSaved, onDeleted }) {
  const { fmt } = useCurrency();
  const editable = (() => {
    const ts = expense.createdAt || expense.date;
    if (!ts) return false;
    return (new Date() - new Date(ts)) / (1000 * 60) <= 30;
  })();

  const [date, setDate]                   = useState(expense.date || todayStr());
  const [category, setCategory]           = useState(expense.category || '');
  const [amount, setAmount]               = useState(String(expense.amount || ''));
  const [paymentMethod, setPaymentMethod] = useState(expense.paymentMethod || 'cash');
  const [payee, setPayee]                 = useState(expense.payee || '');
  const [note, setNote]                   = useState(expense.note || '');
  const [saving, setSaving]               = useState(false);
  const [deleting, setDeleting]           = useState(false);
  const [showCatModal, setShowCatModal]   = useState(false);

  const handleDelete = async () => {
    if (!window.confirm('Delete this expense? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await dataService.deleteExpense(expense.id);
      await logAction('EXPENSE_DELETED', `Deleted expense: ${expense.category} — $${parseFloat(expense.amount||0).toFixed(2)}`).catch(() => {});
      onDeleted();
    }
    catch (e) { alert(e.message); } finally { setDeleting(false); }
  };

  const handleSave = async () => {
    if (!date)   { alert('Date is required'); return; }
    if (!category) { alert('Category is required'); return; }
    if (!amount || parseFloat(amount)<=0) { alert('Enter a valid amount'); return; }
    if (category==='Other' && !note.trim()) { alert('Note is required when category is "Other"'); return; }
    setSaving(true);
    try {
      await dataService.updateExpense(expense.id, { date, category, amount:parseFloat(amount), paymentMethod, payee:payee.trim(), note:note.trim() });
      onSaved();
    } catch (e) { alert(e.message); } finally { setSaving(false); }
  };

  const dateStr = formatDate(expense.date || expense.createdAt);

  return (
    <div className="er-modal-overlay">
      <div className="er-modal-content">
        <div className="er-modal-header">
          <h2>{editable ? '✏️ Edit Expense' : 'Expense Details'}</h2>
          <button className="er-modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="er-modal-body">
          {!editable ? (<>
            <div className="er-detail-row"><span>Date</span><span>{dateStr}</span></div>
            <div className="er-detail-row"><span>Category</span><span>{expense.category}</span></div>
            <div className="er-detail-row"><span>Amount</span><span className="er-detail-amount">{fmt(expense.amount||0)}</span></div>
            <div className="er-detail-row"><span>Method</span><span><span className={methodBadgeClass(expense.paymentMethod)}>{methodLabel(expense.paymentMethod)}</span></span></div>
            {expense.payee && <div className="er-detail-row"><span>Paid To</span><span>{expense.payee}</span></div>}
            {expense.note && <div className="er-detail-row"><span>Note</span><span>{expense.note}</span></div>}
          </>) : (<>
            <div className="er-field"><label className="er-label">Date *</label><input type="date" className="er-input" value={date} max={todayStr()} onChange={e => setDate(e.target.value)} /></div>
            <div className="er-field"><label className="er-label">Category *</label>
              <button style={{ textAlign:'left', padding:'10px 12px', borderRadius:'8px', border:'1.5px solid var(--border,#e5e7eb)', background:'var(--surface,white)', fontSize:'14px', cursor:'pointer', color:category?'var(--text-primary,#111)':'#9ca3af' }} onClick={() => setShowCatModal(true)}>{category || 'Select category…'}</button>
            </div>
            <div className="er-field"><label className="er-label">Amount *</label><input type="number" className="er-input" placeholder="0.00" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></div>
            <div className="er-field"><label className="er-label">Payment Method</label>
              <select className="er-input er-select" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div className="er-field"><label className="er-label">Paid To</label><input type="text" className="er-input" placeholder="Who was paid?" value={payee} onChange={e => setPayee(e.target.value)} /></div>
            <div className="er-field"><label className="er-label">Note {category==='Other'?'*':'(optional)'}</label><textarea className="er-input er-textarea" placeholder="Description…" value={note} onChange={e => setNote(e.target.value)} /></div>
          </>)}
        </div>
        <div className="er-modal-footer" style={{ flexDirection:'column', gap:'8px' }}>
          {editable ? (<>
            <div style={{ display:'flex', gap:'10px', width:'100%' }}>
              <button className="er-btn-cancel" onClick={onClose}>Cancel</button>
              <button className="er-btn-save" onClick={handleSave} disabled={saving}>{saving?'Saving…':'Update'}</button>
            </div>
            <button className="er-btn-delete" onClick={handleDelete} disabled={deleting}>{deleting?'Deleting…':'Delete Expense'}</button>
          </>) : (
            <button className="er-btn-save" onClick={onClose}>Close</button>
          )}
        </div>
      </div>
      {showCatModal && <CategoryModal selected={category} onSelect={setCategory} onClose={() => setShowCatModal(false)} />}
    </div>
  );
}

// ── Main ExpensesRecord Screen ─────────────────────────────────────────────────
function ExpensesRecord() {
  const { fmt } = useCurrency();

  const [expenses, setExpenses]           = useState([]);
  const [filtered, setFiltered]           = useState([]);
  const [showFilters, setShowFilters]     = useState(false);
  const [showAddModal, setShowAddModal]   = useState(false);
  const [viewExpense, setViewExpense]     = useState(null);
  const [showMoreCats, setShowMoreCats]   = useState(false);

  const [catFilter, setCatFilter]         = useState('all');
  const [dateFilter, setDateFilter]       = useState('today');
  const [selectedDate, setSelectedDate]   = useState('');
  const [startDate, setStartDate]         = useState('');
  const [endDate, setEndDate]             = useState('');
  const [appliedCat, setAppliedCat]       = useState('all');
  const [appliedDate, setAppliedDate]     = useState('today');
  const [appliedSelDate, setAppliedSelDate] = useState('');
  const [appliedStart, setAppliedStart]   = useState('');
  const [appliedEnd, setAppliedEnd]       = useState('');
  const [payFilter, setPayFilter]         = useState('all');
  const [appliedPay, setAppliedPay]       = useState('all');

  useEffect(() => { loadExpenses(); }, []);
  useEffect(() => {
    const handleVisibility = () => { if (!document.hidden) loadExpenses(); };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);
  useEffect(() => { applyFilters(); }, // eslint-disable-line react-hooks/exhaustive-deps
    [expenses, appliedCat, appliedDate, appliedSelDate, appliedStart, appliedEnd, appliedPay]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadExpenses = async () => {
    const data = await dataService.getExpenses();
    const sorted = (data||[]).sort((a,b) => toSortKey(b.date||b.createdAt) - toSortKey(a.date||a.createdAt));
    setExpenses(sorted);
  };

  const resolveDate = (e) => {
    const raw = e.date || e.createdAt;
    if (!raw) return null;
    if (typeof raw==='object' && raw.seconds) return new Date(raw.seconds*1000);
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  };
  const toMidnight = d => { const c=new Date(d); c.setHours(0,0,0,0); return c; };

  const applyFilters = () => {
    let f = [...expenses];
    if (appliedCat!=='all') f = f.filter(e => e.category===appliedCat);
    if (appliedPay==='cash')     f = f.filter(e => (e.paymentMethod||'cash')==='cash');
    if (appliedPay==='non_cash') f = f.filter(e => (e.paymentMethod||'cash')!=='cash');
    const today=toMidnight(new Date()), tomorrow=new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
    if (appliedDate==='today')      f = f.filter(e => { const d=resolveDate(e); return d && d>=today && d<tomorrow; });
    if (appliedDate==='single' && appliedSelDate) {
      const s=toMidnight(new Date(appliedSelDate)), e2=new Date(s); e2.setDate(e2.getDate()+1);
      f = f.filter(e => { const d=resolveDate(e); return d && d>=s && d<e2; });
    }
    if (appliedDate==='range' && appliedStart && appliedEnd) {
      const s=toMidnight(new Date(appliedStart)), e2=new Date(toMidnight(new Date(appliedEnd))); e2.setDate(e2.getDate()+1);
      f = f.filter(e => { const d=resolveDate(e); return d && d>=s && d<e2; });
    }
    setFiltered(f);
  };

  const handleApplyFilters = () => {
    setAppliedCat(catFilter); setAppliedDate(dateFilter); setAppliedSelDate(selectedDate);
    setAppliedStart(startDate); setAppliedEnd(endDate); setAppliedPay(payFilter);
    setShowFilters(false);
  };

  const formatDisplayDate = ds => new Date(ds).toLocaleDateString('en-GB', { day:'2-digit', month:'2-digit', year:'numeric' });
  const isYesterday = ds => { if (!ds) return false; const y=new Date(); y.setDate(y.getDate()-1); return toMidnight(new Date(ds)).getTime()===toMidnight(y).getTime(); };
  const getTableTitle = () => {
    if (appliedDate==='today') return 'Expenses Today';
    if (appliedDate==='single' && appliedSelDate) { if (isYesterday(appliedSelDate)) return 'Expenses Yesterday'; return `Expenses on ${formatDisplayDate(appliedSelDate)}`; }
    if (appliedDate==='range' && appliedStart && appliedEnd) return `Expenses from ${formatDisplayDate(appliedStart)} to ${formatDisplayDate(appliedEnd)}`;
    return 'Expenses Today';
  };
  const formatEntryDate = e => formatDate(e.date || e.createdAt);

  const totalRecords = filtered.length;
  const cashSpent    = filtered.filter(e=>(e.paymentMethod||'cash')==='cash').reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
  const nonCash      = filtered.filter(e=>(e.paymentMethod||'cash')!=='cash').reduce((s,e)=>s+(parseFloat(e.amount)||0),0);

  return (
    <div className="er-record">
      <div className="er-sticky-bar">
        <div className="er-top-row">
          <button className="er-filter-action-btn er-filter-toggle-btn" onClick={() => setShowFilters(v=>!v)}>{showFilters?'Close Filter ▲':'Filter ▼'}</button>
          <button className="er-filter-action-btn er-add-btn" onClick={() => setShowAddModal(true)}>
            <Plus size={14} style={{ marginRight:4, verticalAlign:'middle' }} />Add Expense
          </button>
        </div>

        {showFilters && (
          <div className="filter-modal-overlay" onClick={() => setShowFilters(false)}>
            <div className="filter-modal-sheet" onClick={e => e.stopPropagation()}>
              <div className="filter-modal-handle"/>
              <div className="filter-modal-title">Filter Expenses</div>
            <div className="er-filter-group">
              <label>CATEGORY FILTER</label>
              <div className="er-filter-buttons">
                <button className={`er-filter-btn${catFilter==='all'?' active':''}`} onClick={() => setCatFilter('all')}>All Expenses</button>
                {QUICK_CATS.map(cat => (
                  <button key={cat} className={`er-filter-btn${catFilter===cat?' active':''}`} onClick={() => setCatFilter(cat)}>{cat}</button>
                ))}
                <button className={`er-filter-btn${!['all',...QUICK_CATS].includes(catFilter)?' more-active':''}`} onClick={() => setShowMoreCats(true)}>
                  {!['all',...QUICK_CATS].includes(catFilter) ? catFilter : 'More…'}
                </button>
              </div>
            </div>
            <div className="er-filter-group">
              <label>DATE FILTER</label>
              <div className="er-filter-buttons">
                {[['today','Today'],['single','Single Date'],['range','Date Range']].map(([val,lbl]) => (
                  <button key={val} className={`er-filter-btn${dateFilter===val?' active':''}`} onClick={() => setDateFilter(val)}>{lbl}</button>
                ))}
              </div>
              {dateFilter==='single' && <input type="date" className="er-date-input" value={selectedDate} max={todayStr()} onChange={e => setSelectedDate(e.target.value)} />}
              {dateFilter==='range' && (
                <div className="er-date-range-inputs">
                  <div className="er-date-range-field"><span className="er-date-range-label">From</span><input type="date" className="er-date-input" value={startDate} max={todayStr()} onChange={e => setStartDate(e.target.value)} /></div>
                  <div className="er-date-range-field"><span className="er-date-range-label">To</span><input type="date" className="er-date-input" value={endDate} max={todayStr()} onChange={e => setEndDate(e.target.value)} /></div>
                </div>
              )}
            </div>
            <div className="er-filter-group">
              <label>PAYMENT METHOD</label>
              <div className="er-filter-buttons">
                {[['all','All'],['cash','Cash'],['non_cash','Non-Cash']].map(([val,lbl]) => (
                  <button key={val} className={`er-filter-btn${payFilter===val?' active':''}`} onClick={() => setPayFilter(val)}>{lbl}</button>
                ))}
              </div>
            </div>
              <div className="filter-modal-actions">
                <button className="filter-modal-cancel" onClick={() => setShowFilters(false)}>Cancel</button>
                <button className="filter-modal-apply" onClick={handleApplyFilters}>Apply Filter</button>
              </div>
            </div>
          </div>
        )}

        <div className="er-summary-cards">
          <div className="er-summary-card"><div className="er-summary-label">Total Records</div><div className="er-summary-value">{totalRecords}</div></div>
          <div className="er-summary-card"><div className="er-summary-label">Cash Spent</div><div className="er-summary-value cash">{fmt(cashSpent)}</div></div>
          <div className="er-summary-card"><div className="er-summary-label">Non-Cash</div><div className="er-summary-value noncash">{fmt(nonCash)}</div></div>
        </div>
      </div>

      <div className="er-table-section">
        <div className="er-table-title">{getTableTitle()}</div>
        {filtered.length===0 ? (
          <div className="er-empty">No expenses found for this filter.</div>
        ) : (
          <div className="er-table-wrap">
            <table className="er-table">
              <thead>
                <tr><th>Date</th><th>DESCRIPTION</th><th className="right">Amount</th></tr>
              </thead>
              <tbody>
                {filtered.map(e => (
                  <tr key={e.id} onClick={() => setViewExpense(e)}>
                    <td style={{ whiteSpace:'nowrap', fontSize:'12px' }}>{formatEntryDate(e)}</td>
                    <td className="er-td-cat">{buildExpenseDescription(e.category, e.payee, e.note, e.gender)}</td>
                    <td className="er-td-amount">{fmt(e.amount||0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAddModal && <AddExpenseModal onSave={() => { setShowAddModal(false); loadExpenses(); }} onClose={() => setShowAddModal(false)} />}
      {viewExpense && <ExpenseDetailModal expense={viewExpense} onClose={() => setViewExpense(null)} onSaved={() => { setViewExpense(null); loadExpenses(); }} onDeleted={() => { setViewExpense(null); loadExpenses(); }} />}
      {showMoreCats && <CategoryModal selected={catFilter} onSelect={cat => setCatFilter(cat||'all')} onClose={() => setShowMoreCats(false)} />}
    </div>
  );
}

export default ExpensesRecord;
