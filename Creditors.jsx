import React, { useState, useEffect, useRef } from 'react';
import { useValidation, ValidationNote, errorBorder } from '../utils/validation.jsx';
import { X, DollarSign, Calendar, Camera, Phone, Mail, MapPin, Edit2, MessageSquare, ArrowUpDown, FileText, Plus } from 'lucide-react';
import dataService from '../services/dataService';
import { useCurrency } from '../hooks/useCurrency';
import PdfTableButton from '../components/PdfTableButton';
import './Creditors.css';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// ── Shared 30-minute edit window helper ──────────────────────────────────
function isWithin30Mins(entry) {
  const ts = entry.createdAt || entry.date || entry.timestamp;
  if (!ts) return false;
  return (new Date() - new Date(ts)) / (1000 * 60) <= 30;
}

function isDepositEditable(dep) {
  const ts = dep.createdAt || dep.date;
  if (!ts) return false;
  return (new Date() - new Date(ts)) / (1000 * 60) <= 30;
}

// ── Sale Edit Modal ────────────────────────────────────────────────────────
function SaleEditModal({ sale, onSave, onClose, onDeleted, fmt }) {
  const [items, setItems] = useState((sale.items || []).map(i => ({ ...i })));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const updateItem = (idx, field, val) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it));

  const total = items.reduce((sum, it) => {
    const qty = parseFloat(it.quantity ?? it.qty ?? 0);
    const price = parseFloat(it.price ?? 0);
    return sum + qty * price;
  }, 0);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updatedItems = items.map(it => ({
        ...it,
        quantity: parseFloat(it.quantity ?? it.qty ?? 0),
        qty: parseFloat(it.quantity ?? it.qty ?? 0),
        subtotal: parseFloat(it.quantity ?? it.qty ?? 0) * parseFloat(it.price ?? 0),
      }));
      await dataService.updatePurchase(sale.id, { items: updatedItems, total_amount: total, total });
      onSave();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this purchase record? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await dataService.deletePurchase(sale.id);
      onDeleted();
    } catch (e) { alert(e.message); }
    finally { setDeleting(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:5000, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px', overflowY:'auto' }}>
      <div style={{ background:'var(--surface)', color:'var(--text-primary)', borderRadius:'12px', padding:'20px', width:'100%', maxWidth:'420px', maxHeight:'90vh', overflowY:'auto' }}>
        <h3 style={{ margin:'0 0 16px', color:'#1a1a2e', fontSize:'16px' }}>✏️ Edit Purchase Entry</h3>
        <div style={{ marginBottom:'12px' }}>
          <label style={{ display:'block', fontWeight:600, fontSize:'13px', marginBottom:'6px' }}>Products</label>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px', minWidth:'280px' }}>
              <thead>
                <tr style={{ background:'#f3f4f6' }}>
                  <th style={{ padding:'6px 8px', textAlign:'left', fontWeight:600, fontSize:'11px', color:'#6b7280', textTransform:'uppercase' }}>Product Name</th>
                  <th style={{ padding:'6px 8px', textAlign:'center', fontWeight:600, fontSize:'11px', color:'#6b7280', textTransform:'uppercase', width:'60px' }}>Qty</th>
                  <th style={{ padding:'6px 8px', textAlign:'right', fontWeight:600, fontSize:'11px', color:'#6b7280', textTransform:'uppercase', width:'70px' }}>Selling Price</th>
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
        <div style={{ textAlign:'right', fontWeight:700, fontSize:'15px', marginBottom:'16px', color:'#667eea' }}>Total: {fmt(total)}</div>
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

function Creditors() {
  const { fmt } = useCurrency();
  const { fieldErrors: editErrors, showError: showEditError, clearFieldError: clearEditError } = useValidation();
  const { fieldErrors: payErrors, showError: showPayError, clearFieldError: clearPayError } = useValidation();
  const { fieldErrors: addErrors, showError: showAddError, clearFieldError: clearAddError } = useValidation();
  const [creditors, setCreditors]           = useState([]);
  const [searchTerm, setSearchTerm]     = useState('');
  const [selectedCreditor, setSelectedCreditor] = useState(null);
  const [creditorSales, setCreditorSales]   = useState([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [editDepositModal, setEditDepositModal] = useState(null);
  const [editDepositAmount, setEditDepositAmount] = useState('');
  const [editDepositReceipt, setEditDepositReceipt] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [editSale, setEditSale] = useState(null);
  const [paymentPhoto, setPaymentPhoto] = useState(null);
  const [receiptNumber, setReceiptNumber] = useState('');
  const [loading, setLoading]           = useState(true);
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const [supplierList, setSupplierList]     = useState([]);
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ fullName:'', gender:'', phone:'', whatsapp:'', email:'', address:'' });
  const [isEditMode, setIsEditMode]     = useState(false);
  const [editedCreditor, setEditedCreditor] = useState(null);
  const [activeTab, setActiveTab]       = useState('details');
  const [sortOrder, setSortOrder]       = useState(null);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortMenuRef                     = useRef(null);
  const historyRef                      = useRef(null);  // ref for debt history section → PDF
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [pdfSharing, setPdfSharing] = useState(false);

  useEffect(() => { loadCreditors(); }, []);

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
      await loadCreditors();
    } catch (e) { console.error(e); alert('Failed to add supplier.'); }
  };

  // Close sort menu when clicking outside
  useEffect(() => {
    const handler = (e) => { if (sortMenuRef.current && !sortMenuRef.current.contains(e.target)) setShowSortMenu(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadCreditors = async () => {
    try {
      setLoading(true);
      const [data, suppData] = await Promise.all([
        dataService.getCreditors(),
        dataService.getSuppliers(),
      ]);
      setCreditors(data || []);
      setSupplierList(suppData || []);
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

  const filteredCreditors = applySortAndSearch(creditors);

  const handleCreditorClick = async (creditor) => {
    setSelectedCreditor(creditor);
    setEditedCreditor({...creditor});
    setIsEditMode(false);
    setActiveTab('details');
    try {
      const allPurchases = await dataService.getPurchases();
      setCreditorSales(allPurchases.filter(p =>
        creditor.purchaseIds?.includes(p.id) ||
        p.creditorId === creditor.id ||
        p.supplierId === creditor.id
      ));
    } catch (e) { setCreditorSales([]); }
  };

  const closeCreditorModal = () => {
    setSelectedCreditor(null); setCreditorSales([]);
    setIsEditMode(false); setEditedCreditor(null); setActiveTab('details');
  };


  const handleAddCreditor = async (e) => {
    e.preventDefault();
    if (!newCreditor.fullName) { alert('Name of Creditor is required'); return; }
    if (!newCreditor.phone) { alert('Phone is required'); return; }
    if (!newCreditor.whatsapp && !newCreditor.email) { alert('Please provide at least WhatsApp or Email'); return; }
    if (newCreditor.email && !newCreditor.email.includes("@")) { alert("Email address must contain @"); return; }
    if (!newCreditor.address) { alert('Please provide an address'); return; }
    try {
      const creditorData = {
        id: dataService.generateId(), customerName: newCreditor.fullName, name: newCreditor.fullName,
        phone: newCreditor.phone, customerPhone: newCreditor.phone, gender: newCreditor.gender || '',
        whatsapp: newCreditor.whatsapp, email: newCreditor.email, address: newCreditor.address,
        totalDue: 0, totalPaid: 0, balance: 0, purchaseIds: [], deposits: [],
        createdAt: new Date().toISOString(), lastSale: null
      };
      const current = await dataService.getCreditors();
      current.push(creditorData);
      await dataService.setCreditors(current);
      alert('Creditor added successfully!');
      closeAddCreditorModal();
      await loadCreditors();
    } catch (e) { console.error(e); alert('Failed to add creditor.'); }
  };

  const enableEditMode  = () => setIsEditMode(true);
  const cancelEditMode  = () => { setIsEditMode(false); setEditedCreditor({...selectedCreditor}); };

  const saveCreditorEdits = async () => {
    if (!editedCreditor.name) return showEditError('edit_name', 'Full Name is required');
    if (!editedCreditor.gender) return showEditError('edit_gender', 'Please select a gender');
    if (!editedCreditor.phone) return showEditError('edit_phone', 'Phone is required');
    if (!editedCreditor.whatsapp && !editedCreditor.email) return showEditError('edit_whatsapp', 'Provide at least WhatsApp or Email');
    if (editedCreditor.email && !editedCreditor.email.includes('@')) return showEditError('edit_email', 'Email must contain @');
    if (!editedCreditor.address) return showEditError('edit_address', 'Address is required');
    try {
      const current = await dataService.getCreditors();
      const idx = current.findIndex(d => d.id === editedCreditor.id);
      if (idx !== -1) {
        current[idx] = { ...current[idx], name: editedCreditor.name, customerName: editedCreditor.name,
          phone: editedCreditor.phone, customerPhone: editedCreditor.phone, gender: editedCreditor.gender,
          whatsapp: editedCreditor.whatsapp, email: editedCreditor.email, address: editedCreditor.address };
        await dataService.setCreditors(current);
        setSelectedCreditor(current[idx]); setIsEditMode(false);
        await loadCreditors(); alert('Creditor updated!');
      }
    } catch (e) { console.error(e); alert('Failed to update creditor.'); }
  };

  // ── Build smart notification message based on due date status ──────────────
  const buildNotifyMessage = () => {
    const creditor  = selectedCreditor;
    const name    = creditor.name || creditor.customerName || 'Valued Customer';
    const gender  = creditor.gender || '';
    const prefix  = gender === 'Male' ? 'Mr.' : gender === 'Female' ? 'Ms.' : '';
    const salutation = prefix ? `${prefix} ${name}` : name;
    const balance = historyRows.length > 0
      ? historyRows[0].runningBalance
      : (creditor.balance || creditor.totalDue || 0);
    const balanceStr = `${fmt(Math.abs(balance))}`;

    const repaymentDate = creditor.repaymentDate || '';
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

  // ── Generate A4 PDF of the debt statement ────────────────────────────────
  // The PDF is A4 portrait, with the business logo at the top, creditor info,
  // then the full debt history table rendered at full width.
  const generateA4PDF = async () => {
    const el = historyRef.current;
    if (!el) return null;

    try {
      // 1. Capture the history section as a high-res canvas
      const canvas = await html2canvas(el, {
        backgroundColor: 'var(--surface)',
        scale: 3,          // high DPI so text is sharp in the PDF
        useCORS: true,
        logging: false,
        // Expand to full scrollWidth so the wide table is not clipped
        windowWidth: el.scrollWidth,
        width: el.scrollWidth,
      });

            
      // A4 dimensions in mm
      const pageW = 210;
      const pageH = 297;
      const margin = 12;
      const contentW = pageW - margin * 2;

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      // ── Header: purple bar with business name ──────────────────────────
      pdf.setFillColor(102, 126, 234);          // brand purple
      pdf.rect(0, 0, pageW, 22, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('A.C.T Services', margin, 10);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.text('Debt Statement', margin, 16);

      // Date generated (right side of header)
      const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
      pdf.setFontSize(8);
      pdf.text(`Generated: ${today}`, pageW - margin, 14, { align: 'right' });

      // ── Creditor info block ──────────────────────────────────────────────
      let y = 30;
      const creditor = selectedCreditor;
      const creditorName = creditor.name || creditor.customerName || 'N/A';
      const gender  = creditor.gender || '';
      const prefix  = gender === 'Male' ? 'Mr.' : gender === 'Female' ? 'Ms.' : '';
      const balance = historyRows.length > 0
        ? historyRows[0].runningBalance
        : (creditor.balance || creditor.totalDue || 0);

      pdf.setTextColor(30, 30, 30);
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${prefix ? prefix + ' ' : ''}${creditorName}`, margin, y);

      y += 6;
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(80, 80, 80);
      if (creditor.phone || creditor.customerPhone) pdf.text(`Phone: ${creditor.phone || creditor.customerPhone}`, margin, y); y += 5;
      if (creditor.whatsapp) { pdf.text(`WhatsApp: ${creditor.whatsapp}`, margin, y); y += 5; }
      if (creditor.email)    { pdf.text(`Email: ${creditor.email}`, margin, y); y += 5; }
      if (creditor.repaymentDate) { pdf.text(`Due Date: ${creditor.repaymentDate}`, margin, y); y += 5; }

      // Outstanding balance box
      pdf.setFillColor(balance > 0 ? 255 : 220, balance > 0 ? 235 : 252, balance > 0 ? 220 : 231);
      pdf.roundedRect(pageW - margin - 55, 28, 55, 18, 2, 2, 'F');
      pdf.setTextColor(balance > 0 ? 22 : 3, balance > 0 ? 101 : 105, balance > 0 ? 52 : 81);
      pdf.setFontSize(7);
      pdf.text('OUTSTANDING BALANCE', pageW - margin - 27.5, 34, { align: 'center' });
      pdf.setFontSize(13);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${fmt(Math.abs(balance))}`, pageW - margin - 27.5, 42, { align: 'center' });

      // Divider
      y = Math.max(y, 50) + 4;
      pdf.setDrawColor(200, 200, 200);
      pdf.line(margin, y, pageW - margin, y);
      y += 5;

      // ── Debt History table (rendered via html2canvas → image) ─────────
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(50, 50, 50);
      pdf.text('Debt History', margin, y);
      y += 4;

      // Convert canvas to PNG data URL and embed as image
      const imgData  = canvas.toDataURL('image/png');
      const imgW     = contentW;
      const imgH     = (canvas.height / canvas.width) * imgW;

      // If the table is taller than what fits on one page, scale it
      const maxH = pageH - y - margin;
      const finalH = imgH > maxH ? maxH : imgH;

      pdf.addImage(imgData, 'PNG', margin, y, imgW, finalH);

      // ── Footer ────────────────────────────────────────────────────────
      const footerY = pageH - 8;
      pdf.setFontSize(7);
      pdf.setTextColor(150, 150, 150);
      pdf.setFont('helvetica', 'normal');
      pdf.text('A.C.T Services — Confidential Debt Statement', pageW / 2, footerY, { align: 'center' });

      return pdf;
    } catch (err) {
      console.error('PDF generation error:', err);
      return null;
    }
  };

  // ── Save PDF and return a Blob URL or Capacitor URI ───────────────────────
  const savePDFAndGetURI = async (pdf, creditorName) => {
    const fileName = `statement_${creditorName.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
    const pdfBlob  = pdf.output('blob');

    // On native Android, write to cache directory via Capacitor Filesystem
    const isNative = window.Capacitor?.isNativePlatform?.();
    if (isNative) {
      try {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const reader = new FileReader();
        const base64 = await new Promise((res, rej) => {
          reader.onload  = () => res(reader.result.split(',')[1]);
          reader.onerror = rej;
          reader.readAsDataURL(pdfBlob);
        });
        await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache });
        const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
        return { uri, fileName, blob: pdfBlob };
      } catch (err) {
        console.error('Capacitor Filesystem error:', err);
      }
    }

    // On web: create an object URL so we can trigger a download
    const blobUrl = URL.createObjectURL(pdfBlob);
    return { uri: blobUrl, fileName, blob: pdfBlob, isWeb: true };
  };

  // ── Share PDF directly (native share sheet or web download) ──────────────
  const handleSharePDF = async () => {
    if (!selectedCreditor) return;
    setPdfSharing(true);
    try {
      const pdf = await generateA4PDF();
      if (!pdf) { alert('Could not generate PDF'); return; }
      const creditorName = selectedCreditor.name || selectedCreditor.customerName || 'creditor';
      const pdfInfo = await savePDFAndGetURI(pdf, creditorName);
      if (!pdfInfo) { alert('Could not save PDF'); return; }
      const isNative = window.Capacitor?.isNativePlatform?.();
      if (isNative && pdfInfo.uri) {
        const { Share } = await import('@capacitor/share');
        await Share.share({ title: `Credit Statement — ${creditorName}`, url: pdfInfo.uri, dialogTitle: 'Share Credit Statement' });
      } else {
        const link = document.createElement('a');
        link.href = pdfInfo.uri;
        link.download = pdfInfo.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(pdfInfo.uri), 10000);
      }
    } catch (err) {
      console.error('PDF share error:', err);
      alert('Failed to share PDF');
    } finally {
      setPdfSharing(false);
    }
  };

  const handleNotify = async (method) => {
    const creditor = selectedCreditor;
    const { subject, body } = buildNotifyMessage();
    const creditorName = creditor.name || creditor.customerName || 'creditor';

    // ── Step 1: Generate A4 PDF ───────────────────────────────────────────
    setPdfGenerating(true);
    let pdfInfo = null;
    try {
      const pdf = await generateA4PDF();
      if (pdf) {
        pdfInfo = await savePDFAndGetURI(pdf, creditorName);
        // On web, also trigger a download so the user has the PDF to attach manually
        if (pdfInfo?.isWeb) {
          const link = document.createElement('a');
          link.href = pdfInfo.uri;
          link.download = pdfInfo.fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          // Don't revoke immediately — let the download complete
          setTimeout(() => URL.revokeObjectURL(pdfInfo.uri), 10000);
        }
      }
    } catch (err) {
      console.error('PDF error:', err);
    } finally {
      setPdfGenerating(false);
    }

    // ── Step 2: Open messaging app (with PDF attached if native) ──────────
    const isNative = window.Capacitor?.isNativePlatform?.();

    if (method === 'whatsapp') {
      const phone = creditor.whatsapp || creditor.phone || creditor.customerPhone;
      if (!phone) { alert('No WhatsApp number available'); return; }
      if (isNative && pdfInfo?.uri) {
        try {
          const { Share } = await import('@capacitor/share');
          await Share.share({ title: subject, text: body, url: pdfInfo.uri, dialogTitle: `Send to ${creditorName}` });
          setShowNotifyModal(false);
          return;
        } catch (err) { console.error('Share error:', err); }
      }
      window.open(`https://wa.me/${phone.replace(/\D/g,'')}?text=${encodeURIComponent(body)}`, '_blank');

    } else if (method === 'email') {
      if (!creditor.email) { alert('No email available'); return; }
      if (isNative && pdfInfo?.uri) {
        try {
          const { Share } = await import('@capacitor/share');
          await Share.share({ title: subject, text: body, url: pdfInfo.uri, dialogTitle: `Email to ${creditorName}` });
          setShowNotifyModal(false);
          return;
        } catch (err) { console.error('Share error:', err); }
      }
      window.location.href = `mailto:${creditor.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    } else if (method === 'sms') {
      const phone = creditor.phone || creditor.customerPhone;
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

  const handleSaveDepositEdit = async () => {
    if (!editDepositModal) return;
    const newAmt = parseFloat(editDepositAmount);
    if (!newAmt || newAmt <= 0) { alert('Please enter a valid amount'); return; }
    try {
      const creditors = await dataService.getCreditors();
      const creditor = creditors.find(c => c.id === editDepositModal.creditorId);
      if (!creditor) return;
      const dep = (creditor.deposits || []).find(d => d.id === editDepositModal.deposit.id);
      if (!dep) return;
      const oldAmt = parseFloat(dep.amount) || 0;
      dep.amount = newAmt;
      if (editDepositReceipt.trim()) dep.receiptNumber = editDepositReceipt.trim();
      creditor.totalPaid = (creditor.totalPaid || 0) - oldAmt + newAmt;
      creditor.balance = Math.max(0, (creditor.totalDue || 0) - creditor.totalPaid);
      creditor.updatedAt = new Date().toISOString();
      await dataService.setCreditors(creditors);
      await loadCreditors();
      const updated = creditors.find(d => d.id === editDepositModal.creditorId);
      if (updated) {
        setSelectedCreditor(updated);
        const allPurchases2 = await dataService.getPurchases();
        setCreditorSales(allPurchases2.filter(p =>
          updated.purchaseIds?.includes(p.id) ||
          p.creditorId === updated.id ||
          p.supplierId === updated.id
        ));
      }
      setEditDepositModal(null); setEditDepositAmount(''); setEditDepositReceipt('');
    } catch (e) { console.error(e); alert('Failed to update payment'); }
  };

  const handleRecordPayment = async () => {
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) return showPayError('pay_amount', 'Enter a valid payment amount');
    if (!receiptNumber.trim()) return showPayError('pay_receipt', 'Receipt Number is required');
    try {
      // Use recordCreditorPayment which correctly creates a Cash OUT entry
      await dataService.recordCreditorPayment(selectedCreditor.id, parseFloat(paymentAmount), paymentPhoto || null, receiptNumber || '');
      alert(`Payment of ${fmt(parseFloat(paymentAmount))} recorded as Cash OUT`);
      await loadCreditors();
      const updated = (await dataService.getCreditors()).find(d => d.id === selectedCreditor.id);
      if (updated) {
        setSelectedCreditor(updated);
        // Refresh purchase history to show new deposit row
        const allPurchases2 = await dataService.getPurchases();
        setCreditorSales(allPurchases2.filter(p =>
          updated.purchaseIds?.includes(p.id) ||
          p.creditorId === updated.id ||
          p.supplierId === updated.id
        ));
      }
      setShowPaymentModal(false); setPaymentAmount(''); setPaymentPhoto(null); setReceiptNumber('');
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
    if (!selectedCreditor) return [];

    // Purchase events (credit purchases we owe money for)
    const saleEvents = creditorSales.map(purchase => ({
      kind: 'sale',
      date: new Date(purchase.date || purchase.createdAt || 0),
      sale: {
        ...purchase,
        // Normalise purchase item fields to match sale item field names
        items: (purchase.items || []).map(it => ({
          name: it.description || it.name || '',
          quantity: it.qty || it.quantity || 0,
          qty: it.qty || it.quantity || 0,
          price: it.costPrice || it.price || 0,
          subtotal: (it.qty || it.quantity || 0) * (it.costPrice || it.price || 0),
        })),
        total: purchase.total || 0,
        total_amount: purchase.total || 0,
        invoiceRef: purchase.invoiceRef || purchase.notes || '',
      },
    }));

    // Deposit events
    const depositEvents = (selectedCreditor.deposits || []).map(dep => ({
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

  if (loading) return <div className="d-screen"><div className="d-loading">Loading creditors...</div></div>;

  const historyRows = selectedCreditor ? buildHistoryRows() : [];

  return (
    <div className="d-screen">

      {/* ── Header ── */}
      <div className="d-header">
        <input type="text" className="d-search d-search-narrow" placeholder="Search name…"
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
        <button className="d-add-btn" onClick={openAddSupplierModal}>
          <Plus size={14} style={{display:'inline',verticalAlign:'middle',marginRight:'3px'}}/>Supplier
        </button>
      </div>

      {/* ── Creditor cards ── */}
      <div className="d-grid">
        {filteredCreditors.length === 0 ? (
          <div className="d-empty">
            {searchTerm ? 'No creditors match your search.' : 'No creditors yet.'}
          </div>
        ) : (
          filteredCreditors.map(creditor => (
            <div key={creditor.id} className="d-card" onClick={() => handleCreditorClick(creditor)}>
              <div className="d-card-name">{creditor.name || creditor.customerName}</div>
              <div className="d-card-balance">{fmt((creditor.balance || creditor.totalDue || 0))}</div>
            </div>
          ))
        )}
      </div>

      {/* ── Creditor detail modal ── */}
      {selectedCreditor && (
        <div className="d-overlay" onClick={closeCreditorModal}>
          <div className="d-modal" onClick={e => e.stopPropagation()}>

            <div className="d-modal-header">
              <h2 className="d-modal-title">{selectedCreditor.name || selectedCreditor.customerName}</h2>
              <div className="d-modal-actions">
                {activeTab === 'details' && !isEditMode && (
                  <button className="d-edit-btn" onClick={enableEditMode} title="Edit"><Edit2 size={18} /></button>
                )}
                <button className="d-close-btn" onClick={closeCreditorModal}><X size={22} /></button>
              </div>
            </div>

            <div className="d-tabs">
              <button className={`d-tab${activeTab==='details'?' d-tab-active':''}`} onClick={() => setActiveTab('details')}>Details</button>
              <button className={`d-tab${activeTab==='history'?' d-tab-active':''}`} onClick={() => setActiveTab('history')}>Credit History</button>
            </div>

            {/* ── Details tab ── */}
            {activeTab === 'details' && (
              <div className="d-tab-body">
                {isEditMode ? (
                  <div className="d-edit-form">
                    {[['Full Name *','text',editedCreditor?.name||'','name','edit_name'],['Phone *','tel',editedCreditor?.phone||'','phone','edit_phone'],
                      ['WhatsApp','tel',editedCreditor?.whatsapp||'','whatsapp','edit_whatsapp'],['Email','email',editedCreditor?.email||'','email','edit_email']].map(([lbl,type,val,field,errKey]) => (
                      <div className="d-form-group" key={field}>
                        <label>{lbl}</label>
                        <input type={type} value={val} data-field={errKey}
                          style={errorBorder(errKey, editErrors)}
                          onChange={e => { setEditedCreditor({...editedCreditor,[field]:e.target.value}); clearEditError(errKey); }} />
                        <ValidationNote field={errKey} errors={editErrors} />
                      </div>
                    ))}
                    <div className="d-form-group">
                      <label>Gender *</label>
                      <div className="d-gender" data-field="edit_gender" style={editErrors['edit_gender'] ? {border:'1.5px solid #f59e0b',borderRadius:'6px',padding:'4px',boxShadow:'0 0 0 2px rgba(245,158,11,0.2)'} : {}}>
                        {['Male','Female'].map(g => (
                          <label key={g} className="d-gender-option">
                            <input type="radio" name="edit-gender" checked={editedCreditor?.gender===g} onChange={() => { setEditedCreditor({...editedCreditor,gender:g}); clearEditError('edit_gender'); }} />{g}
                          </label>
                        ))}
                      </div>
                      <ValidationNote field="edit_gender" errors={editErrors} />
                    </div>
                    <div className="d-form-group">
                      <label>Address *</label>
                      <textarea rows="2" value={editedCreditor?.address||''} data-field="edit_address"
                        style={errorBorder('edit_address', editErrors)}
                        onChange={e => { setEditedCreditor({...editedCreditor,address:e.target.value}); clearEditError('edit_address'); }} />
                      <ValidationNote field="edit_address" errors={editErrors} />
                    </div>
                    <div className="d-form-actions">
                      <button className="d-btn-cancel" onClick={cancelEditMode}>Cancel</button>
                      <button className="d-btn-save" onClick={saveCreditorEdits}>Save</button>
                    </div>
                  </div>
                ) : (
                  <div className="d-details-view">
                    {(() => {
                      const sup = supplierList.find(s => s.id === selectedCreditor.id) || {};
                      return [
                        ['Name', selectedCreditor.name || selectedCreditor.customerName || sup.name || sup.customerName],
                        ['Gender', selectedCreditor.gender || sup.gender],
                        ['Phone', selectedCreditor.phone || selectedCreditor.customerPhone || sup.phone || sup.customerPhone],
                        ['WhatsApp', selectedCreditor.whatsapp || sup.whatsapp],
                        ['Email', selectedCreditor.email || sup.email],
                        ['Address', selectedCreditor.address || sup.address],
                      ];
                    })().map(([lbl, val]) => (
                      <div className="d-detail-row" key={lbl}>
                        <span className="d-detail-label">{lbl}</span>
                        <span className="d-detail-value">{val || 'N/A'}</span>
                      </div>
                    ))}
                    <div className="d-debt-summary">
                      <span className="d-detail-label">Outstanding Balance</span>
                      <span className="d-debt-amount">{fmt((historyRows.length > 0 ? historyRows[0].runningBalance : (selectedCreditor.balance || selectedCreditor.totalDue || 0)))}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Credit History tab ── */}
            {activeTab === 'history' && (
              <div className="d-history-wrapper" ref={historyRef} style={{position:'relative'}}>

                {/* Action bar — PDF left, Record Payment right */}
                <div className="d-history-actions">
                  <button className="d-pdf-btn" onClick={handleSharePDF} disabled={pdfSharing}>
                    <FileText size={16} /> {pdfSharing ? 'Generating…' : 'PDF'}
                  </button>
                  <button className="d-deposit-btn" onClick={() => setShowPaymentModal(true)}>
                    <DollarSign size={16} /> Record Payment Made
                  </button>
                </div>

                {/* ── Edit Payment Modal ── */}
                {editDepositModal && (
                  <div className="d-overlay" style={{zIndex:4000}} onClick={() => setEditDepositModal(null)}>
                    <div className="d-modal d-modal-sm" onClick={e => e.stopPropagation()} style={{maxWidth:'320px'}}>
                      <div className="d-modal-header">
                        <h2 className="d-modal-title">Edit Payment</h2>
                        <button className="d-close-btn" onClick={() => setEditDepositModal(null)}><X size={22}/></button>
                      </div>
                      <div style={{padding:'16px 20px',display:'flex',flexDirection:'column',gap:'12px'}}>
                        <label style={{fontWeight:600,fontSize:'13px'}}>Amount Paid</label>
                        <input type="number" min="0.01" step="0.01"
                          value={editDepositAmount}
                          onChange={e => setEditDepositAmount(e.target.value)}
                          style={{padding:'10px',border:'1.5px solid #ccc',borderRadius:'8px',fontSize:'14px'}} />
                        <label style={{fontWeight:600,fontSize:'13px'}}>Receipt Number</label>
                        <input type="text"
                          value={editDepositReceipt}
                          onChange={e => setEditDepositReceipt(e.target.value)}
                          placeholder="Receipt number…"
                          style={{padding:'10px',border:'1.5px solid #ccc',borderRadius:'8px',fontSize:'14px'}} />
                      </div>
                      <div className="d-form-actions" style={{padding:'0 20px 20px',display:'flex',gap:'10px'}}>
                        <button className="d-btn-cancel" onClick={() => setEditDepositModal(null)}>Cancel</button>
                        <button className="d-btn-save" onClick={handleSaveDepositEdit}>Save</button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="d-history-scroll">
                  <table className="d-history-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Ref</th>
                        <th>Due Date</th>
                        <th>QTY</th>
                        <th>PACKSIZE</th>
                        <th>Products</th>
                        <th>Cost</th>
                        <th>Debit</th>
                        <th>Credit</th>
                        <th>Balance</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyRows.length === 0 ? (
                        <tr><td colSpan="10" className="d-empty-cell">No credit purchases yet</td></tr>
                      ) : (
                        historyRows.map((row, rowIdx) => {
                          if (row.kind === 'deposit') {
                            // ── Payment row ─────────────────────────────────
                            const dep = row.deposit;
                            return (
                              <tr key={`dep-${dep.id}`} className="d-deposit-row">
                                <td className="d-merged">{formatDate(dep.date)}</td>
                                <td className="d-merged">{dep.receiptNumber || dep.invoiceRef || '—'}</td>
                                <td colSpan="6" className="d-deposit-merged-cell">
                                  P&nbsp;a&nbsp;y&nbsp;m&nbsp;e&nbsp;n&nbsp;t&nbsp;&nbsp;&nbsp;M&nbsp;a&nbsp;d&nbsp;e
                                </td>
                                <td className="d-deposited-amount">{fmt(parseFloat(dep.amount))}</td>
                                <td className={`d-balance-cell ${row.runningBalance < 0 ? 'd-balance-neg' : ''}`}>
                                  {fmt(Math.abs(row.runningBalance))}
                                </td>
                                <td style={{textAlign:'center'}}>
                                  {isDepositEditable(dep) && (
                                    <button
                                      onClick={() => { setEditDepositModal({creditorId:selectedCreditor.id, deposit:dep}); setEditDepositAmount(String(dep.amount)); setEditDepositReceipt(dep.receiptNumber || ''); }}
                                      style={{background:'none',border:'none',cursor:'pointer',color:'#22c55e',padding:'4px',borderRadius:'4px',display:'inline-flex',alignItems:'center',fontSize:'16px'}}
                                      title="Edit payment">✔</button>
                                  )}
                                </td>
                              </tr>
                            );
                          }

                          // ── Purchase row(s) ──────────────────────────────────
                          const sale = row.sale;
                          const items = sale.items && sale.items.length > 0 ? sale.items : [null];
                          const rowSpan = items.length;
                          const rawTs = sale.date || sale.createdAt;
                          const packDisplay = (item) => item ? (item.packDisplay || (item.packUnit ? `${item.packUnit}×${item.packSize||'?'}` : (item.packSize || '—'))) : '—';

                          return items.map((item, idx) => (
                            <tr key={`${sale.id}-${idx}`} className={idx > 0 ? 'd-hist-cont' : 'd-hist-first'}>
                              {idx === 0 && <td rowSpan={rowSpan} className="d-merged" style={{verticalAlign:'middle',textAlign:'left'}}>{formatDate(rawTs)}</td>}
                              {idx === 0 && <td rowSpan={rowSpan} className="d-merged" style={{verticalAlign:'middle',textAlign:'left',whiteSpace:'nowrap'}}>{sale.invoiceRef || sale.notes || '—'}</td>}
                              {idx === 0 && <td rowSpan={rowSpan} className="d-merged" style={{verticalAlign:'middle',textAlign:'left',whiteSpace:'nowrap',color: sale.dueDate ? '#dc2626' : '#9ca3af'}}>{sale.dueDate ? sale.dueDate : '—'}</td>}
                              <td className="d-qty">{item ? (item.qty || item.quantity || '—') : '—'}</td>
                              <td>{item ? packDisplay(item) : '—'}</td>
                              <td style={{whiteSpace:'nowrap'}}>{item ? (item.name || 'N/A') : 'N/A'}</td>
                              <td>{item ? fmt(item.price || item.costPrice || 0) : '—'}</td>
                              {idx === 0 && <td rowSpan={rowSpan} className="d-merged d-sale-total" style={{verticalAlign:'middle',textAlign:'left'}}>{fmt(sale.total || 0)}</td>}
                              {idx === 0 && <td rowSpan={rowSpan} className="d-merged" style={{verticalAlign:'middle',textAlign:'left',color:'#9ca3af'}}>—</td>}
                              {idx === 0 && (
                                <td rowSpan={rowSpan} className={`d-merged d-balance-cell ${row.runningBalance < 0 ? 'd-balance-neg' : ''}`} style={{verticalAlign:'middle'}}>
                                  {fmt(Math.abs(row.runningBalance))}
                                </td>
                              )}
                              {idx === 0 && (
                                <td rowSpan={rowSpan} className="d-merged" style={{ textAlign:'center' }}>
                                  {isWithin30Mins(sale) ? (
                                    <button onClick={() => setEditSale(sale)}
                                      style={{ background:'none', border:'none', cursor:'pointer', color:'#22c55e', padding:'4px', borderRadius:'4px', display:'inline-flex', alignItems:'center', fontSize:'16px' }}
                                      title="Edit sale">✔</button>
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


      {/* ── Payment / Deposit Modal ── */}
      {showPaymentModal && (
        <div className="d-overlay" onClick={() => setShowPaymentModal(false)}>
          <div className="d-modal d-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="d-modal-header">
              <h2 className="d-modal-title">Record Payment Made to Creditor</h2>
              <button className="d-close-btn" onClick={() => setShowPaymentModal(false)}><X size={22} /></button>
            </div>
            <div className="d-payment-form">
              <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:'8px',padding:'10px 14px',marginBottom:'12px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:'13px',color:'#6b7280',fontWeight:500}}>Outstanding Balance</span>
                <span style={{fontSize:'16px',fontWeight:700,color:'#dc2626'}}>{fmt(selectedCreditor?.balance || selectedCreditor?.totalDue || 0)}</span>
              </div>
              <div className="d-form-group">
                <label>Amount Paid to Creditor (Cash OUT)</label>
                <input type="number" step="0.01" value={paymentAmount} placeholder="0.00" data-field="pay_amount"
                  style={errorBorder('pay_amount', payErrors)}
                  onChange={e => { setPaymentAmount(e.target.value); clearPayError('pay_amount'); }} className="d-payment-input" />
                <ValidationNote field="pay_amount" errors={payErrors} />
              </div>
              <div className="d-form-group">
                <label>Receipt Number *</label>
                <input type="text" value={receiptNumber} placeholder="Enter receipt number" data-field="pay_receipt"
                  style={errorBorder('pay_receipt', payErrors)}
                  onChange={e => { setReceiptNumber(e.target.value); clearPayError('pay_receipt'); }} className="d-payment-input" />
                <ValidationNote field="pay_receipt" errors={payErrors} />
              </div>
              <button className="d-camera-btn" onClick={handleTakePhoto}>
                <Camera size={18} /> {paymentPhoto ? 'Retake Photo' : 'Take Receipt Photo'}
              </button>
              {paymentPhoto && <img className="d-photo-preview" src={paymentPhoto} alt="Receipt" />}
              <div className="d-form-actions">
                <button className="d-btn-cancel" onClick={() => { setShowPaymentModal(false); setReceiptNumber(''); }}>Cancel</button>
                <button className="d-btn-save" onClick={handleRecordPayment}>Confirm</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Notify Modal ── */}
      {showNotifyModal && (
        <div className="d-overlay" onClick={() => !pdfGenerating && setShowNotifyModal(false)}>
          <div className="d-modal d-modal-sm d-notify-modal" onClick={e => e.stopPropagation()}>
            <div className="d-modal-header" style={{ flexShrink: 0 }}>
              <h2 className="d-modal-title">Notify via</h2>
              <button className="d-close-btn" onClick={() => !pdfGenerating && setShowNotifyModal(false)}><X size={22} /></button>
            </div>
            {pdfGenerating && (
              <div style={{ padding: '10px 16px', background: '#fef3c7', borderRadius: '8px', margin: '0 16px 8px',
                fontSize: '13px', color: '#92400e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>⏳</span>
                Generating statement image, please wait…
              </div>
            )}
            <div className="d-notify-options" style={{ flexShrink: 0 }}>
              <button className="d-notify-opt d-notify-wa"  onClick={() => handleNotify('whatsapp')} disabled={pdfGenerating}>
                <MessageSquare size={20}/> {pdfGenerating ? '…' : 'WhatsApp'}
              </button>
              <button className="d-notify-opt d-notify-em"  onClick={() => handleNotify('email')} disabled={pdfGenerating}>
                <Mail size={20}/> {pdfGenerating ? '…' : 'Email'}
              </button>
              <button className="d-notify-opt d-notify-sms" onClick={() => handleNotify('sms')} disabled={pdfGenerating}>
                <Phone size={20}/> {pdfGenerating ? '…' : 'SMS'}
              </button>
            </div>
            <div className="d-notify-preview d-notify-preview-scroll" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              <p className="d-notify-preview-label">Message Preview</p>
              <pre className="d-notify-preview-text" style={{whiteSpace:'pre-wrap',fontFamily:'inherit',fontSize:'inherit',margin:0}}>
                {selectedCreditor ? buildNotifyMessage().body : ''}
              </pre>
            </div>
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

      {editSale && (
        <SaleEditModal
          sale={editSale}
          fmt={fmt}
          onSave={async () => {
            setEditSale(null);
            const sales = await dataService.getSales();
            setCreditorSales(sales.filter(s => (s.customer_name||s.customerName) === (selectedCreditor?.name||selectedCreditor?.customerName)));
          }}
          onDeleted={async () => {
            setEditSale(null);
            const sales = await dataService.getSales();
            setCreditorSales(sales.filter(s => (s.customer_name||s.customerName) === (selectedCreditor?.name||selectedCreditor?.customerName)));
          }}
          onClose={() => setEditSale(null)}
        />
      )}
    </div>
  );
}

export default Creditors;
