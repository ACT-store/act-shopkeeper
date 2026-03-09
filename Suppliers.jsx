import React, { useState, useEffect, useRef } from 'react';
import { useValidation, ValidationNote, errorBorder } from '../utils/validation.jsx';
import { X, DollarSign, Calendar, Camera, Phone, Mail, MapPin, Edit2, MessageSquare, ArrowUpDown } from 'lucide-react';
import dataService from '../services/dataService';
import { useCurrency } from '../hooks/useCurrency';
import './Suppliers.css';

// ── Shared 2-hour edit window helper ──────────────────────────────────────
function isWithin2Hours(entry) {
  const ts = entry.createdAt || entry.date || entry.timestamp;
  if (!ts) return false;
  return (new Date() - new Date(ts)) / (1000 * 60 * 60) <= 2;
}

// ── Purchase Edit Modal ────────────────────────────────────────────────────
function PurchaseEditModal({ purchase, onSave, onClose, onDeleted, fmt }) {
  const [supplierName, setSupplierName] = useState(purchase.supplierName || '');
  const [notes, setNotes] = useState(purchase.notes || '');
  const [invoiceRef, setInvoiceRef] = useState(purchase.invoiceRef || '');
  const [rows, setRows] = useState((purchase.items || []).map((it, i) => ({ id: i+1, ...it })));
  const nextId = React.useRef((purchase.items||[]).length + 1);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const updateRow = (id, field, val) => setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r));
  const itemTotal = rows.reduce((sum, r) => sum + (parseFloat(r.qty)||0) * (parseFloat(r.costPrice)||0), 0);

  const handleSave = async () => {
    setSaving(true);
    try {
      const items = rows.filter(r => r.description?.trim()).map(r => ({
        qty: parseFloat(r.qty)||0, description: r.description?.trim()||'',
        costPrice: parseFloat(r.costPrice)||0, packSize: r.packSize||'',
        subtotal: (parseFloat(r.qty)||0)*(parseFloat(r.costPrice)||0),
      }));
      await dataService.updatePurchase(purchase.id, {
        supplierName: supplierName.trim(), notes: notes.trim(),
        invoiceRef: invoiceRef.trim(), items, total: itemTotal,
      });
      onSave();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this purchase record? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await dataService.deletePurchase(purchase.id);
      onDeleted();
    } catch (e) { alert(e.message); }
    finally { setDeleting(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:5000, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px', overflowY:'auto' }}>
      <div style={{ background:'var(--surface)', color:'var(--text-primary)', borderRadius:'12px', padding:'20px', width:'100%', maxWidth:'420px', maxHeight:'90vh', overflowY:'auto' }}>
        <h3 style={{ margin:'0 0 16px', color:'#1a1a2e', fontSize:'16px' }}>✏️ Edit Purchase Entry</h3>

        <div style={{ marginBottom:'12px' }}>
          <label style={{ display:'block', fontWeight:600, fontSize:'13px', marginBottom:'4px' }}>Supplier</label>
          <input value={supplierName} onChange={e => setSupplierName(e.target.value)}
            style={{ width:'100%', padding:'8px 10px', border:'1.5px solid #d1d5db', borderRadius:'6px', fontSize:'14px', boxSizing:'border-box' }} />
        </div>

        <div style={{ marginBottom:'12px' }}>
          <label style={{ display:'block', fontWeight:600, fontSize:'13px', marginBottom:'6px' }}>Products</label>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px', minWidth:'280px' }}>
              <thead>
                <tr style={{ background:'#f3f4f6' }}>
                  <th style={{ padding:'6px 8px', textAlign:'center', fontWeight:600, fontSize:'11px', color:'#6b7280', textTransform:'uppercase', width:'52px' }}>Qty</th>
                  <th style={{ padding:'6px 8px', textAlign:'left', fontWeight:600, fontSize:'11px', color:'#6b7280', textTransform:'uppercase' }}>Description</th>
                  <th style={{ padding:'6px 8px', textAlign:'right', fontWeight:600, fontSize:'11px', color:'#6b7280', textTransform:'uppercase', width:'72px' }}>Cost</th>
                  <th style={{ padding:'6px 8px', textAlign:'right', fontWeight:600, fontSize:'11px', color:'#6b7280', textTransform:'uppercase', width:'72px' }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id}>
                    <td style={{ padding:'4px 8px' }}>
                      <input type="number" value={row.qty||''} onChange={e => updateRow(row.id,'qty',e.target.value)} placeholder="0"
                        style={{ width:'100%', padding:'5px 6px', border:'1.5px solid #d1d5db', borderRadius:'5px', fontSize:'13px', textAlign:'center', boxSizing:'border-box' }} />
                    </td>
                    <td style={{ padding:'4px 8px' }}>
                      <input value={row.description||''} onChange={e => updateRow(row.id,'description',e.target.value)} placeholder="Description"
                        style={{ width:'100%', padding:'5px 6px', border:'1.5px solid #d1d5db', borderRadius:'5px', fontSize:'13px', boxSizing:'border-box' }} />
                    </td>
                    <td style={{ padding:'4px 8px' }}>
                      <input type="number" value={row.costPrice||''} onChange={e => updateRow(row.id,'costPrice',e.target.value)} placeholder="0.00"
                        style={{ width:'100%', padding:'5px 6px', border:'1.5px solid #d1d5db', borderRadius:'5px', fontSize:'13px', textAlign:'right', boxSizing:'border-box' }} />
                    </td>
                    <td style={{ padding:'4px 8px', textAlign:'right', fontSize:'13px', fontWeight:500 }}>
                      {fmt((parseFloat(row.qty)||0)*(parseFloat(row.costPrice)||0))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ textAlign:'right', fontWeight:700, fontSize:'14px', color:'#667eea', marginTop:'8px' }}>Total: {fmt(itemTotal)}</div>
        </div>

        <div style={{ marginBottom:'12px' }}>
          <label style={{ display:'block', fontWeight:600, fontSize:'13px', marginBottom:'4px' }}>Invoice Ref</label>
          <input value={invoiceRef} onChange={e => setInvoiceRef(e.target.value)} placeholder="Invoice ref…"
            style={{ width:'100%', padding:'8px 10px', border:'1.5px solid #d1d5db', borderRadius:'6px', fontSize:'14px', boxSizing:'border-box' }} />
        </div>

        <div style={{ marginBottom:'16px' }}>
          <label style={{ display:'block', fontWeight:600, fontSize:'13px', marginBottom:'4px' }}>Notes</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes…"
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

function Suppliers() {
  const { fmt } = useCurrency();
  const { fieldErrors: addErrors, showError: showAddError, clearFieldError: clearAddError } = useValidation();
  const { fieldErrors: editErrors, showError: showEditError, clearFieldError: clearEditError } = useValidation();
  const { fieldErrors: payErrors, showError: showPayError, clearFieldError: clearPayError } = useValidation();
  const [suppliers, setSuppliers]           = useState([]);
  const [searchTerm, setSearchTerm]     = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [supplierSales, setSupplierSales]   = useState([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [editPurchase, setEditPurchase] = useState(null);
  const [paymentPhoto, setPaymentPhoto] = useState(null);
  const [loading, setLoading]           = useState(true);
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);
  const [newSupplier, setNewSupplier]       = useState({ fullName:'', gender:'', phone:'', whatsapp:'', email:'', address:'' });
  const [isEditMode, setIsEditMode]     = useState(false);
  const [editedSupplier, setEditedSupplier] = useState(null);
  const [activeTab, setActiveTab]       = useState('details');
  const [sortOrder, setSortOrder]       = useState(null);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortMenuRef                     = useRef(null);

  useEffect(() => { loadSuppliers(); }, []);

  // Close sort menu when clicking outside
  useEffect(() => {
    const handler = (e) => { if (sortMenuRef.current && !sortMenuRef.current.contains(e.target)) setShowSortMenu(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadSuppliers = async () => {
    try {
      setLoading(true);
      const data = await dataService.getSuppliers();
      setSuppliers(data || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  // ── Smart search ──────────────────────────────────────────────────────────
  const smartSearch = (items, term) => {
    if (!term.trim()) return items;
    const t = term.toLowerCase();
    const firstMatches = [], secondMatches = [];
    for (const d of items) {
      const words = (d.name || d.customerName || '').toLowerCase().split(/\s+/);
      if (words[0] && words[0].startsWith(t)) firstMatches.push(d);
      else if (words.length > 1 && words[1] && words[1].startsWith(t)) secondMatches.push(d);
    }
    const sortBy2nd = (arr, wi) => [...arr].sort((a, b) => {
      const wa = ((a.name||a.customerName||'').toLowerCase().split(/\s+/)[wi]||'');
      const wb = ((b.name||b.customerName||'').toLowerCase().split(/\s+/)[wi]||'');
      return (wa[1]||'').localeCompare(wb[1]||'');
    });
    return [...sortBy2nd(firstMatches, 0), ...sortBy2nd(secondMatches, 1)];
  };

  // ── Sort ──────────────────────────────────────────────────────────────────
  const SORT_OPTIONS = [
    { key: 'balance_desc', label: 'Balance: High to Low' },
    { key: 'balance_asc',  label: 'Balance: Low to High' },
    { key: 'modified_desc', label: 'Recently Modified' },
    { key: 'modified_asc',  label: 'Oldest Modified' },
    { key: 'due_asc',  label: 'Due Date: Soonest First' },
    { key: 'due_desc', label: 'Due Date: Latest First' },
  ];

  const applySortAndSearch = (items) => {
    let result = smartSearch(items, searchTerm);
    if (!sortOrder) return result;
    return [...result].sort((a, b) => {
      const balA = a.balance || a.totalDue || 0;
      const balB = b.balance || b.totalDue || 0;
      const modA = new Date(a.updatedAt || a.lastSale || a.createdAt || 0);
      const modB = new Date(b.updatedAt || b.lastSale || b.createdAt || 0);
      const dueA = a.repaymentDate ? new Date(a.repaymentDate) : new Date('9999-12-31');
      const dueB = b.repaymentDate ? new Date(b.repaymentDate) : new Date('9999-12-31');
      switch (sortOrder) {
        case 'balance_desc': return balB - balA;
        case 'balance_asc':  return balA - balB;
        case 'modified_desc': return modB - modA;
        case 'modified_asc':  return modA - modB;
        case 'due_asc':  return dueA - dueB;
        case 'due_desc': return dueB - dueA;
        default: return 0;
      }
    });
  };

  const filteredSuppliers = applySortAndSearch(suppliers);

  const handleSupplierClick = async (supplier) => {
    setSelectedSupplier(supplier);
    setEditedSupplier({...supplier});
    setIsEditMode(false);
    setActiveTab('details');
    try {
      const allPurchases = await dataService.getPurchases();
      setSupplierSales(allPurchases.filter(p =>
        supplier.purchaseIds?.includes(p.id) ||
        p.supplierId === supplier.id
      ));
    } catch (e) { setSupplierSales([]); }
  };

  const closeSupplierModal = () => {
    setSelectedSupplier(null); setSupplierSales([]);
    setIsEditMode(false); setEditedSupplier(null); setActiveTab('details');
  };

  const openAddSupplierModal = () => {
    setShowAddSupplierModal(true);
    setNewSupplier({ fullName:'', gender:'', phone:'', whatsapp:'', email:'', address:'' });
  };
  const closeAddSupplierModal = () => {
    setShowAddSupplierModal(false);
    setNewSupplier({ fullName:'', gender:'', phone:'', whatsapp:'', email:'', address:'' });
  };

  const handleAddSupplier = async (e) => {
    e.preventDefault();
    if (!newSupplier.fullName) return showAddError('add_fullName', 'Full Name is required');
    if (!newSupplier.phone) return showAddError('add_phone', 'Phone is required');
    if (!newSupplier.whatsapp && !newSupplier.email) return showAddError('add_whatsapp', 'Provide at least WhatsApp or Email');
    if (newSupplier.email && !newSupplier.email.includes('@')) return showAddError('add_email', 'Email must contain @');
    if (!newSupplier.address) return showAddError('add_address', 'Address is required');
    try {
      const supplierData = {
        id: dataService.generateId(), customerName: newSupplier.fullName, name: newSupplier.fullName,
        phone: newSupplier.phone, customerPhone: newSupplier.phone, gender: '',
        whatsapp: newSupplier.whatsapp, email: newSupplier.email, address: newSupplier.address,
        totalDue: 0, totalPaid: 0, balance: 0, purchaseIds: [], deposits: [],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastSale: null
      };
      const current = await dataService.getSuppliers();
      current.push(supplierData);
      await dataService.setSuppliers(current);
      alert('Supplier added successfully!');
      closeAddSupplierModal();
      await loadSuppliers();
    } catch (e) { console.error(e); alert('Failed to add supplier.'); }
  };

  const enableEditMode  = () => setIsEditMode(true);
  const cancelEditMode  = () => { setIsEditMode(false); setEditedSupplier({...selectedSupplier}); };

  const saveSupplierEdits = async () => {
    if (!editedSupplier.name) return showEditError('edit_name', 'Full Name is required');
    if (!editedSupplier.gender) return showEditError('edit_gender', 'Please select a gender');
    if (!editedSupplier.phone) return showEditError('edit_phone', 'Phone is required');
    if (!editedSupplier.whatsapp && !editedSupplier.email) return showEditError('edit_whatsapp', 'Provide at least WhatsApp or Email');
    if (editedSupplier.email && !editedSupplier.email.includes('@')) return showEditError('edit_email', 'Email must contain @');
    if (!editedSupplier.address) return showEditError('edit_address', 'Address is required');
    try {
      const current = await dataService.getSuppliers();
      const idx = current.findIndex(d => d.id === editedSupplier.id);
      if (idx !== -1) {
        current[idx] = { ...current[idx], name: editedSupplier.name, customerName: editedSupplier.name,
          phone: editedSupplier.phone, customerPhone: editedSupplier.phone, gender: editedSupplier.gender,
          whatsapp: editedSupplier.whatsapp, email: editedSupplier.email, address: editedSupplier.address };
        await dataService.setSuppliers(current);
        setSelectedSupplier(current[idx]); setIsEditMode(false);
        await loadSuppliers(); alert('Supplier updated!');
      }
    } catch (e) { console.error(e); alert('Failed to update supplier.'); }
  };

  // ── Build smart notification message based on due date status ──────────────
  const buildNotifyMessage = () => {
    const supplier  = selectedSupplier;
    const name    = supplier.name || supplier.customerName || 'Valued Customer';
    const gender  = supplier.gender || '';
    const prefix  = gender === 'Male' ? 'Mr.' : gender === 'Female' ? 'Ms.' : '';
    const salutation = prefix ? `${prefix} ${name}` : name;
    const balance = historyRows.length > 0
      ? historyRows[0].runningBalance
      : (supplier.balance || supplier.totalDue || 0);
    const balanceStr = `${fmt(Math.abs(balance))}`;

    const repaymentDate = supplier.repaymentDate || '';
    const today  = new Date(); today.setHours(0,0,0,0);
    const dueDate = repaymentDate ? new Date(repaymentDate) : null;
    if (dueDate) dueDate.setHours(0,0,0,0);

    const daysDiff = dueDate ? Math.round((dueDate - today) / (1000 * 60 * 60 * 24)) : null;

    // Format due date as readable string e.g. "15 March 2026"
    const dueDateStr = dueDate
      ? dueDate.toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })
      : 'the agreed date';

    let subject, body;

    if (daysDiff === null || daysDiff > 0) {
      // ── Due date is still to come ──────────────────────────────────────────
      let duePhrasing;
      if (daysDiff === 1) {
        duePhrasing = 'tomorrow is the due date of your debt';
      } else if (daysDiff !== null) {
        duePhrasing = `you have ${daysDiff} day${daysDiff !== 1 ? 's' : ''} before your debt is due`;
      } else {
        duePhrasing = `the due date is ${dueDateStr}`;
      }
      const dueDateDisplay = daysDiff === 1 ? 'tomorrow' : dueDateStr;

      subject = 'Friendly Reminder: Outstanding Debt Due ' + (daysDiff === 1 ? 'Tomorrow' : `on ${dueDateStr}`);
      body =
`Dear ${salutation},

This is a polite reminder from A.C.T Services. You have an outstanding balance of ${balanceStr}.

Please find attached a PDF of the statement with full details of your debt for your reference.

We kindly remind you that ${duePhrasing}, as you had promised to pay by. We appreciate if you could settle it not later than ${dueDateDisplay}.

Thank you for your attention and prompt payment.

Best regards,
A.C.T Services`;

    } else {
      // ── Due date has passed ────────────────────────────────────────────────
      const daysOverdue = Math.abs(daysDiff);
      subject = `Polite Reminder: Overdue Debt of ${balanceStr}`;
      body =
`Dear ${salutation},

This is a polite reminder from A.C.T Services. You have an outstanding balance of ${balanceStr}.

Please find attached a PDF of the statement with full details of your debt for your reference.

We kindly remind you that the due date was ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} ago, as you had promised to pay by.

We appreciate if you could settle it as soon as possible. Thank you for your attention and prompt payment.

Best regards,
A.C.T Services`;
    }

    return { subject, body };
  };


  const handleNotify = (method) => {
    const supplier = selectedSupplier;
    const { subject, body } = buildNotifyMessage();
    if (method === 'whatsapp') {
      const phone = supplier.whatsapp || supplier.phone || supplier.customerPhone;
      if (!phone) { alert('No WhatsApp number available'); return; }
      window.open(`https://wa.me/${phone.replace(/\D/g,'')}?text=${encodeURIComponent(body)}`, '_blank');
    } else if (method === 'email') {
      if (!supplier.email) { alert('No email available'); return; }
      window.location.href = `mailto:${supplier.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    } else if (method === 'sms') {
      const phone = supplier.phone || supplier.customerPhone;
      if (!phone) { alert('No phone number available'); return; }
      window.location.href = `sms:${phone}?body=${encodeURIComponent(body)}`;
    }
    setShowNotifyModal(false);
  };

  const handleTakePhoto = async () => {
    try {
      const { Camera } = await import('@capacitor/camera');
      const { CameraResultType, CameraSource } = await import('@capacitor/camera');
      const image = await Camera.getPhoto({ quality:90, allowEditing:false, resultType:CameraResultType.DataUrl, source:CameraSource.Camera });
      setPaymentPhoto(image.dataUrl);
    } catch (e) { console.error(e); alert('Failed to take photo'); }
  };

  const handleRecordPayment = async () => {
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) return showPayError('pay_amount', 'Enter a valid payment amount');
    try {
      await dataService.recordSupplierPayment(selectedSupplier.id, parseFloat(paymentAmount), paymentPhoto || null);
      alert(`Payment of ${fmt(parseFloat(paymentAmount))} recorded`);
      await loadSuppliers();
      const updated = (await dataService.getSuppliers()).find(d => d.id === selectedSupplier.id);
      if (updated) {
        setSelectedSupplier(updated);
        // Refresh purchase history to show new deposit row
        const allPurchases = await dataService.getPurchases();
        setSupplierSales(allPurchases.filter(p => updated.purchaseIds?.includes(p.id) || p.supplierId === updated.id));
      }
      setShowPaymentModal(false); setPaymentAmount(''); setPaymentPhoto(null);
    } catch (e) { console.error(e); alert('Failed to record payment'); }
  };

  const formatDate = (ts) => {
    if (!ts) return 'N/A';
    const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    return isNaN(d) ? 'Invalid' : d.toLocaleDateString('en-GB', { day:'2-digit', month:'2-digit', year:'numeric' });
  };
  // formatTime: pass the full sale/deposit object so we can check isUnrecorded
  const formatTime = (ts, record) => {
    if (record?.isUnrecorded) return 'UNRECORDED';
    if (!ts) return 'N/A';
    const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    return isNaN(d) ? 'Invalid' : d.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12:true });
  };

  // ── Build merged history rows: interleave sales + deposit rows, then compute
  //    running balance after each event. Sorted oldest → newest.
  const buildHistoryRows = () => {
    if (!selectedSupplier) return [];

    // Sales events
    const saleEvents = supplierSales.map(sale => ({
      kind: 'sale',
      date: new Date(sale.date || sale.timestamp || sale.createdAt || 0),
      sale,
    }));

    // Deposit events
    const depositEvents = (selectedSupplier.deposits || []).map(dep => ({
      kind: 'deposit',
      date: new Date(dep.date || 0),
      deposit: dep,
    }));

    const all = [...saleEvents, ...depositEvents].sort((a, b) => a.date - b.date);

    // Compute running balance after each event
    let balance = 0;
    return all.map(event => {
      if (event.kind === 'sale') {
        balance += parseFloat(event.sale.total || event.sale.total_amount || 0);
      } else {
        balance -= parseFloat(event.deposit.amount || 0);
      }
      return { ...event, runningBalance: balance };
    }).reverse(); // newest first for display
  };

  if (loading) return <div className="d-screen"><div className="d-loading">Loading suppliers...</div></div>;

  const historyRows = selectedSupplier ? buildHistoryRows() : [];

  return (
    <div className="d-screen">

      {/* ── Header ── */}
      <div className="d-header">
        <input type="text" className="d-search" placeholder="Search supplier name…"
          value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        <div className="d-sort-wrapper" ref={sortMenuRef}>
          <button className={`d-sort-btn${sortOrder ? ' d-sort-active' : ''}`} onClick={() => setShowSortMenu(v => !v)} title="Sort">
            <ArrowUpDown size={16} />
          </button>
          {showSortMenu && (
            <div className="d-sort-menu">
              {SORT_OPTIONS.map(opt => (
                <button key={opt.key}
                  className={`d-sort-option${sortOrder === opt.key ? ' d-sort-option-active' : ''}`}
                  onClick={() => { setSortOrder(sortOrder === opt.key ? null : opt.key); setShowSortMenu(false); }}>
                  {opt.label}
                </button>
              ))}
              {sortOrder && (
                <button className="d-sort-option d-sort-clear" onClick={() => { setSortOrder(null); setShowSortMenu(false); }}>
                  ✕ Clear Sort
                </button>
              )}
            </div>
          )}
        </div>
        <button className="d-add-btn" onClick={openAddSupplierModal}>+ Add Supplier</button>
      </div>

      {/* ── Supplier cards ── */}
      <div className="d-grid">
        {filteredSuppliers.length === 0 ? (
          <div className="d-empty">
            {searchTerm ? 'No suppliers match your search.' : 'No suppliers yet. Click "+ Add Supplier" to get started.'}
          </div>
        ) : (
          filteredSuppliers.map(supplier => (
            <div key={supplier.id} className="d-card" onClick={() => handleSupplierClick(supplier)}>
              <div className="d-card-name">{supplier.name || supplier.customerName}</div>
              <div className="d-card-balance">{fmt((supplier.balance || supplier.totalDue || 0))}</div>
            </div>
          ))
        )}
      </div>

      {/* ── Supplier detail modal ── */}
      {selectedSupplier && (
        <div className="d-overlay" onClick={closeSupplierModal}>
          <div className="d-modal" onClick={e => e.stopPropagation()}>

            <div className="d-modal-header">
              <h2 className="d-modal-title">{selectedSupplier.name || selectedSupplier.customerName}</h2>
              <div className="d-modal-actions">
                {activeTab === 'details' && !isEditMode && (
                  <button className="d-edit-btn" onClick={enableEditMode} title="Edit"><Edit2 size={18} /></button>
                )}
                <button className="d-close-btn" onClick={closeSupplierModal}><X size={22} /></button>
              </div>
            </div>

            <div className="d-tabs">
              <button className={`d-tab${activeTab==='details'?' d-tab-active':''}`} onClick={() => setActiveTab('details')}>Details</button>
              <button className={`d-tab${activeTab==='history'?' d-tab-active':''}`} onClick={() => setActiveTab('history')}>Purchase History</button>
            </div>

            {/* ── Details tab ── */}
            {activeTab === 'details' && (
              <div className="d-tab-body">
                {isEditMode ? (
                  <div className="d-edit-form">
                    {[['Full Name *','text',editedSupplier?.name||'','name','edit_name'],['Phone *','tel',editedSupplier?.phone||'','phone','edit_phone'],
                      ['WhatsApp','tel',editedSupplier?.whatsapp||'','whatsapp','edit_whatsapp'],['Email','email',editedSupplier?.email||'','email','edit_email']].map(([lbl,type,val,field,errKey]) => (
                      <div className="d-form-group" key={field}>
                        <label>{lbl}</label>
                        <input type={type} value={val} data-field={errKey}
                          style={errorBorder(errKey, editErrors)}
                          onChange={e => { setEditedSupplier({...editedSupplier,[field]:e.target.value}); clearEditError(errKey); }} />
                        <ValidationNote field={errKey} errors={editErrors} />
                      </div>
                    ))}
                    <div className="d-form-group">
                      <label>Gender *</label>
                      <div className="d-gender" data-field="edit_gender" style={editErrors['edit_gender'] ? {border:'1.5px solid #f59e0b',borderRadius:'6px',padding:'4px',boxShadow:'0 0 0 2px rgba(245,158,11,0.2)'} : {}}>
                        {['Male','Female'].map(g => (
                          <label key={g} className="d-gender-option">
                            <input type="radio" name="edit-gender" checked={editedSupplier?.gender===g} onChange={() => { setEditedSupplier({...editedSupplier,gender:g}); clearEditError('edit_gender'); }} />{g}
                          </label>
                        ))}
                      </div>
                      <ValidationNote field="edit_gender" errors={editErrors} />
                    </div>
                    <div className="d-form-group">
                      <label>Address *</label>
                      <textarea rows="2" value={editedSupplier?.address||''} data-field="edit_address"
                        style={errorBorder('edit_address', editErrors)}
                        onChange={e => { setEditedSupplier({...editedSupplier,address:e.target.value}); clearEditError('edit_address'); }} />
                      <ValidationNote field="edit_address" errors={editErrors} />
                    </div>
                    <div className="d-form-actions">
                      <button className="d-btn-cancel" onClick={cancelEditMode}>Cancel</button>
                      <button className="d-btn-save" onClick={saveSupplierEdits}>Save</button>
                    </div>
                  </div>
                ) : (
                  <div className="d-details-view">
                    {[
                      ['Name', selectedSupplier.name || selectedSupplier.customerName],
                      ['Gender', selectedSupplier.gender],
                      ['Phone', selectedSupplier.phone || selectedSupplier.customerPhone],
                      ['WhatsApp', selectedSupplier.whatsapp],
                      ['Email', selectedSupplier.email],
                      ['Address', selectedSupplier.address],
                    ].map(([lbl, val]) => (
                      <div className="d-detail-row" key={lbl}>
                        <span className="d-detail-label">{lbl}</span>
                        <span className="d-detail-value">{val || 'N/A'}</span>
                      </div>
                    ))}
                    <div className="d-debt-summary">
                      <span className="d-detail-label">Outstanding Balance</span>
                      <span className="d-debt-amount">{fmt((historyRows.length > 0 ? historyRows[0].runningBalance : (selectedSupplier.balance || selectedSupplier.totalDue || 0)))}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Purchase History tab ── */}
            {activeTab === 'history' && (
              <div className="d-history-wrapper">
                <div className="d-history-scroll">
                  <table className="d-history-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Supplier</th>
                        <th>QTY</th>
                        <th>PACKSIZE</th>
                        <th>Products</th>
                        <th>Pay</th>
                        <th>Total</th>
                        <th>Ref</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyRows.length === 0 ? (
                        <tr><td colSpan="10" className="d-empty-cell">No purchases yet</td></tr>
                      ) : (
                        historyRows.map((row, rowIdx) => {
                          if (row.kind === 'deposit') {
                            // ── Deposit row ─────────────────────────────────
                            const dep = row.deposit;
                            return (
                              <tr key={`dep-${dep.id}`} className="d-deposit-row">
                                <td className="d-merged">{formatDate(dep.date)}</td>
                                <td className="d-merged">{formatTime(dep.date, dep)}</td>
                                <td colSpan="5" className="d-deposit-merged-cell">
                                  D&nbsp;e&nbsp;p&nbsp;o&nbsp;s&nbsp;i&nbsp;t&nbsp;e&nbsp;d&nbsp;&nbsp;&nbsp;
                                  C&nbsp;a&nbsp;s&nbsp;h&nbsp;&nbsp;&nbsp;t&nbsp;o&nbsp;&nbsp;&nbsp;
                                  r&nbsp;e&nbsp;p&nbsp;a&nbsp;y&nbsp;&nbsp;&nbsp;
                                  D&nbsp;e&nbsp;b&nbsp;t
                                </td>
                                <td className="d-deposited-amount">{fmt(parseFloat(dep.amount))}</td>
                                <td className={`d-balance-cell ${row.runningBalance < 0 ? 'd-balance-neg' : ''}`}>
                                  {fmt(Math.abs(row.runningBalance))}
                                </td>
                                <td></td>
                              </tr>
                            );
                          }

                          // ── Purchase / Sale row(s) ──────────────────────
                          const sale  = row.sale;
                          const items = sale.items && sale.items.length > 0 ? sale.items : [null];
                          const rowSpan = items.length;
                          const rawTs = sale.date || sale.timestamp || sale.createdAt;
                          const supplierName = selectedSupplier?.name || selectedSupplier?.customerName || '—';
                          const payLabel = sale.paymentType === 'credit' ? 'Credit' : sale.paymentType === 'cash' ? 'Cash' : (sale.paymentType || '—');

                          return items.map((item, idx) => (
                            <tr key={`${sale.id}-${idx}`} className={idx > 0 ? 'd-hist-cont' : 'd-hist-first'}>
                              {idx === 0 && <td rowSpan={rowSpan} className="d-merged">{formatDate(rawTs)}</td>}
                              {idx === 0 && <td rowSpan={rowSpan} className="d-merged">{formatTime(rawTs, sale)}</td>}
                              {idx === 0 && <td rowSpan={rowSpan} className="d-merged">{supplierName}</td>}
                              <td className="d-qty">{item?.qty || item?.quantity || '—'}</td>
                              <td>{item?.packSize || '—'}</td>
                              <td>{item ? (item.description || item.name || 'N/A') : 'N/A'}</td>
                              {idx === 0 && <td rowSpan={rowSpan} className="d-merged">{payLabel}</td>}
                              {idx === 0 && <td rowSpan={rowSpan} className="d-merged d-sale-total">{fmt(sale.total || sale.total_amount || 0)}</td>}
                              {idx === 0 && <td rowSpan={rowSpan} className="d-merged">{sale.invoiceRef || sale.notes || '—'}</td>}
                              {idx === 0 && (
                                <td rowSpan={rowSpan} className="d-merged" style={{ textAlign:'center' }}>
                                  {isWithin2Hours(sale) ? (
                                    <button onClick={() => setEditPurchase(sale)}
                                      style={{ background:'none', border:'none', cursor:'pointer', color:'#667eea', padding:'4px', borderRadius:'4px', display:'inline-flex', alignItems:'center' }}
                                      title="Edit purchase"><Edit2 size={15} /></button>
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
            )}
          </div>
        </div>
      )}

      {/* ── Add Supplier Modal ── */}
      {showAddSupplierModal && (
        <div className="d-overlay" onClick={closeAddSupplierModal}>
          <div className="d-modal d-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="d-modal-header">
              <h2 className="d-modal-title">Add New Supplier</h2>
              <button className="d-close-btn" onClick={closeAddSupplierModal}><X size={22} /></button>
            </div>
            <form className="d-add-form" onSubmit={handleAddSupplier}>
              {[['Full Name *','text','fullName','add_fullName','Enter full name'],['Phone *','tel','phone','add_phone','Phone number'],
                ['WhatsApp','tel','whatsapp','add_whatsapp','WhatsApp number (optional)'],['Email','email','email','add_email','Email (optional)']].map(([lbl,type,field,errKey,ph]) => (
                <div className="d-form-group" key={field}>
                  <label>{lbl}</label>
                  <input type={type} value={newSupplier[field]} placeholder={ph} data-field={errKey}
                    style={errorBorder(errKey, addErrors)}
                    onChange={e => { setNewSupplier({...newSupplier,[field]:e.target.value}); clearAddError(errKey); }} />
                  <ValidationNote field={errKey} errors={addErrors} />
                </div>
              ))}
              <div className="d-form-group">
                <label>Address *</label>
                <textarea rows="2" value={newSupplier.address} placeholder="Enter address" data-field="add_address"
                  style={errorBorder('add_address', addErrors)}
                  onChange={e => { setNewSupplier({...newSupplier,address:e.target.value}); clearAddError('add_address'); }} />
                <ValidationNote field="add_address" errors={addErrors} />
              </div>
              <p className="d-form-note">* Required · At least WhatsApp or Email required</p>
              <div className="d-form-actions">
                <button type="button" className="d-btn-cancel" onClick={closeAddSupplierModal}>Cancel</button>
                <button type="submit" className="d-btn-save" onClick={handleAddSupplier}>Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Payment / Deposit Modal ── */}
      {showPaymentModal && (
        <div className="d-overlay" onClick={() => setShowPaymentModal(false)}>
          <div className="d-modal d-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="d-modal-header">
              <h2 className="d-modal-title">Record Deposit</h2>
              <button className="d-close-btn" onClick={() => setShowPaymentModal(false)}><X size={22} /></button>
            </div>
            <div className="d-payment-form">
              <div className="d-form-group">
                <label>Deposit Amount</label>
                <input type="number" step="0.01" value={paymentAmount} placeholder="0.00" data-field="pay_amount"
                  style={errorBorder('pay_amount', payErrors)}
                  onChange={e => { setPaymentAmount(e.target.value); clearPayError('pay_amount'); }} className="d-payment-input" />
                <ValidationNote field="pay_amount" errors={payErrors} />
              </div>
              <button className="d-camera-btn" onClick={handleTakePhoto}>
                <Camera size={18} /> {paymentPhoto ? 'Retake Photo' : 'Take Receipt Photo'}
              </button>
              {paymentPhoto && <img className="d-photo-preview" src={paymentPhoto} alt="Receipt" />}
              <div className="d-form-actions">
                <button className="d-btn-cancel" onClick={() => setShowPaymentModal(false)}>Cancel</button>
                <button className="d-btn-save" onClick={handleRecordPayment}>Confirm</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Notify Modal ── */}
      {showNotifyModal && (
        <div className="d-overlay" onClick={() => setShowNotifyModal(false)}>
          <div className="d-modal d-modal-sm d-notify-modal" onClick={e => e.stopPropagation()}>
            <div className="d-modal-header" style={{ flexShrink: 0 }}>
              <h2 className="d-modal-title">Notify via</h2>
              <button className="d-close-btn" onClick={() => setShowNotifyModal(false)}><X size={22} /></button>
            </div>
            <div className="d-notify-options" style={{ flexShrink: 0 }}>
              <button className="d-notify-opt d-notify-wa"  onClick={() => handleNotify('whatsapp')}>
                <MessageSquare size={20}/> WhatsApp
              </button>
              <button className="d-notify-opt d-notify-em"  onClick={() => handleNotify('email')}>
                <Mail size={20}/> Email
              </button>
              <button className="d-notify-opt d-notify-sms" onClick={() => handleNotify('sms')}>
                <Phone size={20}/> SMS
              </button>
            </div>
            <div className="d-notify-preview d-notify-preview-scroll" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              <p className="d-notify-preview-label">Message Preview</p>
              <pre className="d-notify-preview-text" style={{whiteSpace:'pre-wrap',fontFamily:'inherit',fontSize:'inherit',margin:0}}>
                {selectedSupplier ? buildNotifyMessage().body : ''}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Purchase Modal (2-hour window) ── */}
      {editPurchase && (
        <PurchaseEditModal
          purchase={editPurchase}
          fmt={fmt}
          onSave={async () => {
            setEditPurchase(null);
            const all = await dataService.getPurchases();
            setSupplierSales(all.filter(p => p.supplierId === selectedSupplier?.id || p.supplierName === (selectedSupplier?.name || selectedSupplier?.customerName)));
          }}
          onDeleted={async () => {
            setEditPurchase(null);
            const all = await dataService.getPurchases();
            setSupplierSales(all.filter(p => p.supplierId === selectedSupplier?.id || p.supplierName === (selectedSupplier?.name || selectedSupplier?.customerName)));
          }}
          onClose={() => setEditPurchase(null)}
        />
      )}
    </div>
  );
}

export default Suppliers;
