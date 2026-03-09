import React, { useState, useEffect, useRef } from 'react';
import { X, Phone, Mail, Edit2, MessageSquare, ArrowUpDown, FileText, Truck } from 'lucide-react';
import dataService from '../services/dataService';
import { useCurrency } from '../hooks/useCurrency';
import kadaeleLogo from '../assets/kadaeleLogo.js';
import './AdvanceOrders.css';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// ── Deliver Modal ─────────────────────────────────────────────────────────
function DeliverModal({ order, onSave, onClose, fmt }) {
  const allItems = order.items || [];

  // Compute previously delivered qty per item
  const prevDelivered = {};
  (order.deliveries || []).forEach(del => {
    (del.items || []).forEach(it => {
      prevDelivered[it.name] = (prevDelivered[it.name] || 0) + (parseFloat(it.deliveredQty) || 0);
    });
  });

  const [rows, setRows] = useState(() =>
    allItems.map(it => ({
      name: it.name || 'N/A',
      owedQty: parseFloat(it.qty || it.quantity || 0),
      deliveredQty: '',
    }))
  );
  const [saving, setSaving] = useState(false);
  const [deliveryRef, setDeliveryRef] = useState('');
  const [deliveryNote, setDeliveryNote] = useState('');

  const updateDelivered = (idx, val) =>
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, deliveredQty: val } : r));

  const remainingQty = (name, owedQty) => {
    const prev = prevDelivered[name] || 0;
    return Math.max(0, owedQty - prev);
  };

  const handleSave = async () => {
    const hasAny = rows.some(r => parseFloat(r.deliveredQty) > 0);
    if (!hasAny) { alert('Please enter delivered quantity for at least one item.'); return; }

    const deliveryItems = rows
      .filter(r => parseFloat(r.deliveredQty) > 0)
      .map(r => ({ name: r.name, owedQty: r.owedQty, deliveredQty: parseFloat(r.deliveredQty) }));

    setSaving(true);
    try {
      const existing = order.deliveries || [];
      const newDelivery = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        ref: deliveryRef.trim() || null,
        note: deliveryNote.trim() || null,
        items: deliveryItems,
      };
      const updatedOrder = await dataService.updateAdvanceOrder(order.id, {
        deliveries: [...existing, newDelivery],
      });
      onSave(updatedOrder);
    } catch (e) {
      console.error(e);
      alert('Failed to record delivery. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const fieldStyle = {
    width: '100%', padding: '8px 10px',
    border: '1.5px solid var(--border, #e5e7eb)', borderRadius: '7px',
    fontSize: '13px', background: 'var(--surface, white)',
    color: 'var(--text-primary, #111)', boxSizing: 'border-box',
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:5000, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}>
      <div style={{ background:'var(--surface, white)', color:'var(--text-primary, #111)', borderRadius:'14px', width:'100%', maxWidth:'500px', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 12px 48px rgba(0,0,0,0.3)', overflow:'hidden' }}>

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:'1px solid var(--border, #e5e7eb)', flexShrink:0 }}>
          <h2 style={{ margin:0, fontSize:'16px', fontWeight:700 }}>🚚 Record Delivery</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-secondary, #6b7280)', padding:'4px', display:'flex', alignItems:'center' }}><X size={20}/></button>
        </div>

        <div style={{ overflowY:'auto', padding:'16px 20px', flex:1, display:'flex', flexDirection:'column', gap:'14px' }}>

          <div style={{ background:'#f0f4ff', border:'1px solid #c7d2fe', borderRadius:'8px', padding:'10px 14px', fontSize:'13px' }}>
            <strong>{order.customerName || order.name || 'Customer'}</strong>
            {order.invoiceRef && <span style={{ marginLeft:8, color:'#6b7280' }}>Ref: {order.invoiceRef}</span>}
          </div>

          <div>
            <div style={{ fontWeight:700, fontSize:'12px', marginBottom:'8px', color:'var(--text-secondary, #6b7280)', textTransform:'uppercase', letterSpacing:'0.05em' }}>
              Goods Owed to Customer
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
                <thead>
                  <tr style={{ background:'#f3f4f6' }}>
                    <th style={{ padding:'8px 10px', textAlign:'left', fontWeight:700, fontSize:'11px', color:'#6b7280', textTransform:'uppercase' }}>Product Name</th>
                    <th style={{ padding:'8px 10px', textAlign:'center', fontWeight:700, fontSize:'11px', color:'#6b7280', textTransform:'uppercase', width:'80px' }}>Owed Qty</th>
                    <th style={{ padding:'8px 10px', textAlign:'center', fontWeight:700, fontSize:'11px', color:'#4f46e5', textTransform:'uppercase', width:'110px' }}>Delivered Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan="3" style={{ padding:'16px', textAlign:'center', color:'#9ca3af', fontStyle:'italic' }}>No items on this order</td></tr>
                  ) : (
                    rows.map((row, idx) => {
                      const remaining = remainingQty(row.name, row.owedQty);
                      return (
                        <tr key={idx} style={{ borderBottom:'1px solid #f3f4f6' }}>
                          <td style={{ padding:'8px 10px', fontWeight:500 }}>{row.name}</td>
                          <td style={{ padding:'8px 10px', textAlign:'center', color: remaining === 0 ? '#10b981' : '#374151', fontWeight:600 }}>
                            {row.owedQty}
                            {remaining < row.owedQty && (
                              <div style={{ fontSize:'10px', color:'#10b981', fontWeight:500 }}>
                                {remaining === 0 ? '✓ Fully delivered' : `${row.owedQty - remaining} prev. delivered`}
                              </div>
                            )}
                          </td>
                          <td style={{ padding:'8px 10px', textAlign:'center' }}>
                            <input
                              type="number"
                              min="0"
                              max={remaining}
                              step="1"
                              value={row.deliveredQty}
                              onChange={e => updateDelivered(idx, e.target.value)}
                              placeholder="0"
                              disabled={remaining === 0}
                              style={{ width:'72px', padding:'6px 8px', border:'1.5px solid #667eea', borderRadius:'6px', fontSize:'13px', textAlign:'center', boxSizing:'border-box', background: remaining === 0 ? '#f9fafb' : 'white' }}
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <label style={{ display:'block', fontWeight:600, fontSize:'13px', marginBottom:'5px' }}>Delivery Ref <span style={{ fontWeight:400, color:'#9ca3af' }}>(optional)</span></label>
            <input style={fieldStyle} value={deliveryRef} placeholder="Delivery reference number…" onChange={e => setDeliveryRef(e.target.value)} />
          </div>

          <div>
            <label style={{ display:'block', fontWeight:600, fontSize:'13px', marginBottom:'5px' }}>Note <span style={{ fontWeight:400, color:'#9ca3af' }}>(optional)</span></label>
            <input style={fieldStyle} value={deliveryNote} placeholder="Any note about this delivery…" onChange={e => setDeliveryNote(e.target.value)} />
          </div>
        </div>

        <div style={{ display:'flex', gap:'10px', padding:'14px 20px', borderTop:'1px solid var(--border, #e5e7eb)', flexShrink:0 }}>
          <button onClick={onClose} style={{ flex:1, padding:'11px', borderRadius:'8px', border:'1.5px solid var(--border, #e5e7eb)', background:'var(--surface, white)', color:'var(--text-primary, #111)', cursor:'pointer', fontWeight:600, fontSize:'14px' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} style={{ flex:1, padding:'11px', borderRadius:'8px', border:'none', background: saving ? '#9ca3af' : '#10b981', color:'white', cursor: saving ? 'not-allowed' : 'pointer', fontWeight:700, fontSize:'14px' }}>
            {saving ? 'Saving…' : '✅ Record Delivery'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AdvanceOrders() {
  const { fmt } = useCurrency();
  const [debtors, setDebtors]           = useState([]);
  const [searchTerm, setSearchTerm]     = useState('');
  const [selectedDebtor, setSelectedDebtor] = useState(null);
  const [showDeliverModal, setShowDeliverModal] = useState(false);
  const [loading, setLoading]           = useState(true);
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [isEditMode, setIsEditMode]     = useState(false);
  const [editedDebtor, setEditedDebtor] = useState(null);
  const [activeTab, setActiveTab]       = useState('details');
  const [sortOrder, setSortOrder]       = useState(null);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortMenuRef                     = useRef(null);
  const historyRef                      = useRef(null);
  const [pdfSharing, setPdfSharing]     = useState(false);
  const [enlargedPhoto, setEnlargedPhoto] = useState(null);

  useEffect(() => { loadDebtors(); }, []);

  useEffect(() => {
    const handler = (e) => { if (sortMenuRef.current && !sortMenuRef.current.contains(e.target)) setShowSortMenu(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadDebtors = async () => {
    try {
      setLoading(true);
      const data = await dataService.getAdvanceOrders();
      setDebtors(data || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

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
      const modA = new Date(a.updatedAt || a.createdAt || 0);
      const modB = new Date(b.updatedAt || b.createdAt || 0);
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

  const filteredDebtors = applySortAndSearch(debtors);

  const handleDebtorClick = (debtor) => {
    setSelectedDebtor(debtor);
    setEditedDebtor({...debtor});
    setIsEditMode(false);
    setActiveTab('details');
  };

  const closeDebtorModal = () => {
    setSelectedDebtor(null);
    setIsEditMode(false); setEditedDebtor(null); setActiveTab('details');
  };

  const enableEditMode  = () => setIsEditMode(true);
  const cancelEditMode  = () => { setIsEditMode(false); setEditedDebtor({...selectedDebtor}); };

  const saveDebtorEdits = async () => {
    if (!editedDebtor.name || !editedDebtor.gender || !editedDebtor.phone) { alert('Full Name, Gender and Phone are required'); return; }
    if (!editedDebtor.whatsapp && !editedDebtor.email) { alert('Please provide at least WhatsApp or Email'); return; }
    if (editedDebtor.email && !editedDebtor.email.includes('@')) { alert('Email address must contain "@"'); return; }
    if (!editedDebtor.address) { alert('Please provide an address'); return; }
    try {
      const updated = await dataService.updateAdvanceOrder(editedDebtor.id, {
        name: editedDebtor.name, customerName: editedDebtor.name,
        phone: editedDebtor.phone, customerPhone: editedDebtor.phone,
        gender: editedDebtor.gender, whatsapp: editedDebtor.whatsapp,
        email: editedDebtor.email, address: editedDebtor.address,
      });
      setSelectedDebtor(updated); setIsEditMode(false);
      await loadDebtors(); alert('Customer updated!');
    } catch (e) { console.error(e); alert('Failed to update customer.'); }
  };

  const buildNotifyMessage = () => {
    const debtor = selectedDebtor;
    const name = debtor.name || debtor.customerName || 'Valued Customer';
    const gender = debtor.gender || '';
    const prefix = gender === 'Male' ? 'Mr' : gender === 'Female' ? 'Ms' : '';
    const salutation = prefix ? `${prefix} ${name}` : name;

    // Collect all ordered items and subtract delivered quantities
    const orderedItems = debtor.items || [];
    const deliveries = debtor.deliveries || [];

    // Build a map of total delivered qty per item name
    const deliveredMap = {};
    deliveries.forEach(del => {
      (del.items || []).forEach(di => {
        deliveredMap[di.name] = (deliveredMap[di.name] || 0) + (parseFloat(di.deliveredQty) || 0);
      });
    });

    // Find items not yet fully collected
    const uncollected = orderedItems
      .map(item => {
        const ordered = parseFloat(item.qty || item.quantity || 0);
        const delivered = deliveredMap[item.name] || 0;
        const remaining = ordered - delivered;
        return { name: item.name, remaining };
      })
      .filter(item => item.remaining > 0);

    const itemLines = uncollected.length > 0
      ? uncollected.map(i => `  - ${i.remaining} x ${i.name}`).join('\n')
      : '  - (all items collected)';

    const subject = `Advance Order Reminder — ${name}`;
    const body = `Dear ${salutation},\n\nThis is a polite reminder from Kadaele Services regarding your advance order.\n\nYou still haven't collected the following items of yours that you have already paid:\n${itemLines}\n\nPlease contact us to arrange your collection.\n\nThank you.\n\nBest regards,\nKadaele Services`;
    return { subject, body };
  };

  const generateA4PDF = async () => {
    try {
                  const pageW = 210, pageH = 297, margin = 12;
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      let logoLoaded = false;
      pdf.setFillColor(102, 126, 234);
      pdf.rect(0, 0, pageW, 26, 'F');
      try { if (kadaeleLogo) { pdf.addImage(kadaeleLogo, 'PNG', margin, 2, 22, 22); logoLoaded = true; } } catch (_) {}

      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(11); pdf.setFont('helvetica', 'bold');
      pdf.text('Kadaele Services', logoLoaded ? margin + 26 : margin, 11);
      pdf.setFontSize(7); pdf.setFont('helvetica', 'normal');
      pdf.text('Ph: 73057613  |  ritiamti102016@gmail.com', logoLoaded ? margin + 26 : margin, 17);
      pdf.setFontSize(9); pdf.setFont('helvetica', 'bold');
      pdf.text('ADVANCE ORDER STATEMENT', pageW / 2, 11, { align: 'center' });
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7);
      const today = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' });
      pdf.text(`Generated: ${today}`, pageW - margin, 22, { align: 'right' });

      let y = 34;
      const debtor = selectedDebtor;
      const debtorName = debtor.name || debtor.customerName || 'N/A';
      const gender = debtor.gender || '';
      const prefix = gender === 'Male' ? 'Mr.' : gender === 'Female' ? 'Ms.' : '';
      const balance = historyRows.length > 0 ? historyRows[0].runningBalance : (debtor.balance || debtor.totalDue || 0);

      pdf.setTextColor(20, 20, 20); pdf.setFontSize(11); pdf.setFont('helvetica', 'bold');
      pdf.text(`${prefix ? prefix + ' ' : ''}${debtorName}`, margin, y); y += 5;
      pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(70, 70, 70);
      const infoLines = [];
      if (debtor.phone || debtor.customerPhone) infoLines.push(`Phone: ${debtor.phone || debtor.customerPhone}`);
      if (debtor.whatsapp) infoLines.push(`WhatsApp: ${debtor.whatsapp}`);
      if (debtor.email) infoLines.push(`Email: ${debtor.email}`);
      if (debtor.address) infoLines.push(`Address: ${debtor.address}`);
      if (debtor.invoiceRef) infoLines.push(`Order Ref: ${debtor.invoiceRef}`);
      infoLines.forEach(line => { pdf.text(line, margin, y); y += 4.5; });

      const boxX = pageW - margin - 52, boxY = 30;
      const isOwed = balance > 0;
      pdf.setFillColor(isOwed ? 254 : 220, isOwed ? 226 : 252, isOwed ? 226 : 231);
      pdf.roundedRect(boxX, boxY, 52, 20, 2, 2, 'F');
      pdf.setFontSize(6.5); pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(isOwed ? 153 : 3, isOwed ? 27 : 105, isOwed ? 27 : 81);
      pdf.text('OUTSTANDING BALANCE', boxX + 26, boxY + 6, { align: 'center' });
      pdf.setFontSize(13); pdf.setFont('helvetica', 'bold');
      pdf.text(fmt(Math.abs(balance)), boxX + 26, boxY + 15, { align: 'center' });

      y = Math.max(y, boxY + 24) + 3;
      pdf.setDrawColor(200, 200, 200);
      pdf.line(margin, y, pageW - margin, y); y += 4;
      pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(50, 50, 50);
      pdf.text('Advance Order History', margin, y); y += 3;

      const tableHead = [[
        { content: 'Date', styles: { halign: 'center' } },
        { content: 'Ref', styles: { halign: 'center' } },
        { content: 'Product', styles: { halign: 'left' } },
        { content: 'Qty', styles: { halign: 'center' } },
        { content: 'Price', styles: { halign: 'center' } },
        { content: 'Subtotal', styles: { halign: 'center' } },
        { content: 'Total Due', styles: { halign: 'center' } },
        { content: 'Balance', styles: { halign: 'center' } },
      ]];
      const tableBody = [];

      historyRows.forEach(row => {
        if (row.kind === 'delivery') {
          const del = row.delivery;
          const dDate = new Date(del.date);
          tableBody.push([
            dDate.toLocaleDateString('en-GB'),
            del.ref || '—',
            { content: `Delivery: ${(del.items||[]).map(i => `${i.deliveredQty} x ${i.name}`).join(', ')}`, colSpan: 5, styles: { fillColor: [220,252,231], fontStyle:'italic', halign:'center', textColor:[22,101,52] } },
            fmt(Math.abs(row.runningBalance)),
          ]);
        } else {
          const order = row.order;
          const items = order.items && order.items.length > 0 ? order.items : [null];
          const dDate = new Date(order.orderDate || order.createdAt || 0);
          items.forEach((item, idx) => {
            if (idx === 0) {
              tableBody.push([
                dDate.toLocaleDateString('en-GB'),
                order.invoiceRef || '—',
                item ? (item.name || 'N/A') : 'N/A',
                item ? String(item.qty || item.quantity || 0) : '—',
                item ? fmt(item.sellingPrice || 0) : '—',
                item ? fmt(item.subtotal || 0) : '—',
                fmt(order.totalDue || 0),
                fmt(Math.abs(row.runningBalance)),
              ]);
            } else {
              tableBody.push(['', '', item ? (item.name||'N/A') : 'N/A',
                item ? String(item.qty||item.quantity||0) : '—',
                item ? fmt(item.sellingPrice||0) : '—',
                item ? fmt(item.subtotal||0) : '—', '', '']);
            }
          });
        }
      });

      if (tableBody.length === 0) {
        tableBody.push([{ content: 'No history yet', colSpan: 8, styles: { halign: 'center', textColor: [150,150,150] } }]);
      }

      pdf.autoTable({
        startY: y, head: tableHead, body: tableBody,
        margin: { left: margin, right: margin },
        styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak', valign: 'middle' },
        headStyles: { fillColor: [102, 126, 234], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7, halign: 'center' },
        alternateRowStyles: { fillColor: [248, 248, 252] },
        columnStyles: {
          0: { cellWidth: 20, halign: 'center' },
          1: { cellWidth: 18, halign: 'center' },
          2: { cellWidth: 46, halign: 'left' },
          3: { cellWidth: 10, halign: 'center' },
          4: { cellWidth: 20, halign: 'center' },
          5: { cellWidth: 22, halign: 'center' },
          6: { cellWidth: 22, halign: 'center' },
          7: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
        },
      });

      pdf.setFontSize(6.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(160, 160, 160);
      pdf.text('Kadaele Services — Advance Order Statement', pageW / 2, pageH - 6, { align: 'center' });
      return pdf;
    } catch (err) { console.error('PDF error:', err); return null; }
  };

  const handleSharePDF = async () => {
    if (!selectedDebtor) return;
    const debtorName = selectedDebtor.name || selectedDebtor.customerName || 'customer';
    setPdfSharing(true);
    try {
      const pdf = await generateA4PDF();
      if (!pdf) throw new Error('PDF generation failed');
      const fileName = `advance_order_${debtorName.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
      const isNative = window.Capacitor?.isNativePlatform?.();
      if (isNative) {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const { Share } = await import('@capacitor/share');
        const base64 = await new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result.split(',')[1]);
          reader.onerror = rej;
          reader.readAsDataURL(pdf.output('blob'));
        });
        await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache });
        const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
        await Share.share({ title: `${debtorName} – Advance Order`, url: uri, dialogTitle: `Share with ${debtorName}` });
      } else {
        const blob = pdf.output('blob');
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl; link.download = fileName;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      }
    } catch (err) {
      console.error('PDF share error:', err);
      alert('Failed to generate or share PDF.');
    } finally { setPdfSharing(false); }
  };

  const handleNotify = async (method) => {
    const debtor = selectedDebtor;
    const { subject, body } = buildNotifyMessage();
    setShowNotifyModal(false);
    if (method === 'whatsapp') {
      const phone = debtor.whatsapp || debtor.phone || debtor.customerPhone;
      if (!phone) { alert('No WhatsApp number available'); return; }
      window.open(`https://wa.me/${phone.replace(/\D/g,'')}?text=${encodeURIComponent(body)}`, '_blank');
    } else if (method === 'email') {
      if (!debtor.email) { alert('No email address available'); return; }
      window.location.href = `mailto:${encodeURIComponent(debtor.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    } else if (method === 'sms') {
      const phone = debtor.phone || debtor.customerPhone;
      if (!phone) { alert('No phone number available'); return; }
      const sep = /iphone|ipad|ipod/i.test(navigator.userAgent) ? '&' : '?';
      window.location.href = `sms:${phone}${sep}body=${encodeURIComponent(body)}`;
    }
  };

  const formatDate = (ts) => {
    if (!ts) return 'N/A';
    const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    return isNaN(d) ? 'Invalid' : d.toLocaleDateString('en-GB', { day:'2-digit', month:'2-digit', year:'numeric' });
  };

  // ── Build history rows: the advance order itself + each delivery ──────────
  const buildHistoryRows = () => {
    if (!selectedDebtor) return [];

    const orderEvent = {
      kind: 'order',
      date: new Date(selectedDebtor.orderDate || selectedDebtor.createdAt || 0),
      order: selectedDebtor,
    };

    const deliveryEvents = (selectedDebtor.deliveries || []).map(del => ({
      kind: 'delivery',
      date: new Date(del.date || 0),
      delivery: del,
    }));

    const all = [orderEvent, ...deliveryEvents].sort((a, b) => a.date - b.date);

    let balance = 0;
    return all.map(event => {
      if (event.kind === 'order') {
        balance += parseFloat(event.order.totalDue || 0);
      } else {
        // Delivery reduces balance by value of delivered items
        const deliveredValue = (event.delivery.items || []).reduce((sum, it) => {
          const orig = (selectedDebtor.items || []).find(oi => oi.name === it.name);
          const price = parseFloat(orig?.sellingPrice || 0);
          return sum + (parseFloat(it.deliveredQty) || 0) * price;
        }, 0);
        balance -= deliveredValue;
      }
      return { ...event, runningBalance: balance };
    }).reverse();
  };

  if (loading) return <div className="d-screen"><div className="d-loading">Loading advance orders...</div></div>;

  const historyRows = selectedDebtor ? buildHistoryRows() : [];

  return (
    <div className="d-screen">

      {/* ── Header ── */}
      <div className="d-header">
        <input type="text" className="d-search" placeholder="Search advance orders…"
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
                <button className="d-sort-option d-sort-clear" onClick={() => { setSortOrder(null); setShowSortMenu(false); }}>✕ Clear Sort</button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Customer cards ── */}
      <div className="d-grid">
        {filteredDebtors.length === 0 ? (
          <div className="d-empty">
            {searchTerm ? 'No advance orders match your search.' : 'No advance orders yet. Create one from the Cash Record section.'}
          </div>
        ) : (
          filteredDebtors.map(debtor => (
            <div key={debtor.id} className="d-card" onClick={() => handleDebtorClick(debtor)}>
              <div className="d-card-name">{debtor.name || debtor.customerName}</div>
              <div className="d-card-balance">{fmt(debtor.balance || debtor.totalDue || 0)}</div>
            </div>
          ))
        )}
      </div>

      {/* ── Customer detail modal ── */}
      {selectedDebtor && (
        <div className="d-overlay" onClick={closeDebtorModal}>
          <div className="d-modal" onClick={e => e.stopPropagation()}>

            <div className="d-modal-header">
              <h2 className="d-modal-title">{selectedDebtor.name || selectedDebtor.customerName}</h2>
              <div className="d-modal-actions">
                {activeTab === 'details' && !isEditMode && (
                  <button className="d-edit-btn" onClick={enableEditMode} title="Edit"><Edit2 size={18} /></button>
                )}
                <button className="d-close-btn" onClick={closeDebtorModal}><X size={22} /></button>
              </div>
            </div>

            {/* Tabs — "Advance Order History" instead of "Debt History" */}
            <div className="d-tabs">
              <button className={`d-tab${activeTab==='details'?' d-tab-active':''}`} onClick={() => setActiveTab('details')}>Details</button>
              <button className={`d-tab${activeTab==='history'?' d-tab-active':''}`} onClick={() => setActiveTab('history')}>Advance Order History</button>
            </div>

            {/* ── Details tab ── */}
            {activeTab === 'details' && (
              <div className="d-tab-body">
                {isEditMode ? (
                  <div className="d-edit-form">
                    {[['Full Name *','text',editedDebtor?.name||'','name'],['Phone *','tel',editedDebtor?.phone||'','phone'],
                      ['WhatsApp','tel',editedDebtor?.whatsapp||'','whatsapp'],['Email','email',editedDebtor?.email||'','email']].map(([lbl,type,val,field]) => (
                      <div className="d-form-group" key={field}>
                        <label>{lbl}</label>
                        <input type={type} value={val} onChange={e => setEditedDebtor({...editedDebtor,[field]:e.target.value})} />
                      </div>
                    ))}
                    <div className="d-form-group">
                      <label>Gender *</label>
                      <div className="d-gender">
                        {['Male','Female'].map(g => (
                          <label key={g} className="d-gender-option">
                            <input type="radio" name="edit-gender" checked={editedDebtor?.gender===g} onChange={() => setEditedDebtor({...editedDebtor,gender:g})} />{g}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="d-form-group">
                      <label>Address *</label>
                      <textarea rows="2" value={editedDebtor?.address||''} onChange={e => setEditedDebtor({...editedDebtor,address:e.target.value})} />
                    </div>
                    <div className="d-form-actions">
                      <button className="d-btn-cancel" onClick={cancelEditMode}>Cancel</button>
                      <button className="d-btn-save" onClick={saveDebtorEdits}>Save</button>
                    </div>
                  </div>
                ) : (
                  <div className="d-details-view">
                    {[
                      ['Name', selectedDebtor.name || selectedDebtor.customerName],
                      ['Gender', selectedDebtor.gender],
                      ['Phone', selectedDebtor.phone || selectedDebtor.customerPhone],
                      ['WhatsApp', selectedDebtor.whatsapp],
                      ['Email', selectedDebtor.email],
                      ['Address', selectedDebtor.address],
                      ['Order Ref', selectedDebtor.invoiceRef],
                      ['Order Date', selectedDebtor.orderDate ? new Date(selectedDebtor.orderDate).toLocaleDateString('en-GB') : null],
                    ].map(([lbl, val]) => val ? (
                      <div className="d-detail-row" key={lbl}>
                        <span className="d-detail-label">{lbl}</span>
                        <span className="d-detail-value">{val}</span>
                      </div>
                    ) : null)}
                    <div className="d-debt-summary">
                      <span className="d-detail-label">Total Due</span>
                      <span className="d-debt-amount">{fmt(selectedDebtor.totalDue || 0)}</span>
                    </div>
                    <div className="d-debt-summary" style={{ marginTop:6 }}>
                      <span className="d-detail-label">Outstanding Balance</span>
                      <span className="d-debt-amount">{fmt(Math.abs(historyRows.length > 0 ? historyRows[0].runningBalance : (selectedDebtor.balance || selectedDebtor.totalDue || 0)))}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Advance Order History tab ── */}
            {activeTab === 'history' && (
              <div className="d-history-wrapper" ref={historyRef} style={{position:'relative'}}>
                <div className="d-history-actions">
                  <button className="d-notify-btn" onClick={() => setShowNotifyModal(true)}>
                    <MessageSquare size={16} /> Notify
                  </button>
                  <button className="d-pdf-btn" onClick={handleSharePDF} disabled={pdfSharing}>
                    <FileText size={16} /> {pdfSharing ? 'Generating…' : 'PDF'}
                  </button>
                  {/* Deliver button — green */}
                  <button
                    className="d-deposit-btn"
                    onClick={() => setShowDeliverModal(true)}
                    style={{ background:'linear-gradient(135deg,#10b981,#059669)', display:'flex', alignItems:'center', gap:'6px' }}
                  >
                    <Truck size={16} /> Deliver
                  </button>
                </div>

                {/* History table — columns from Create New Advance Order modal */}
                <div className="d-history-scroll">
                  <table className="d-history-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Invoice / Ref</th>
                        <th>Product Name</th>
                        <th>Qty</th>
                        <th>Selling Price</th>
                        <th>Subtotal</th>
                        <th>Total Due</th>
                        <th>Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyRows.length === 0 ? (
                        <tr><td colSpan="8" className="d-empty-cell">No history yet</td></tr>
                      ) : (
                        historyRows.map((row, rowIdx) => {
                          if (row.kind === 'delivery') {
                            const del = row.delivery;
                            const deliveredSummary = (del.items || []).map(i => `${i.deliveredQty} x ${i.name}`).join(', ');
                            return (
                              <tr key={`del-${del.id}`} style={{ background:'#f0fdf4' }}>
                                <td style={{ fontSize:'11px', color:'#166534', fontWeight:600 }}>{formatDate(del.date)}</td>
                                <td style={{ fontSize:'11px', color:'#166534' }}>{del.ref || '—'}</td>
                                <td colSpan="4" style={{ fontSize:'11px', color:'#166534', fontStyle:'italic' }}>
                                  🚚 Delivery: {deliveredSummary}
                                  {del.note && <span style={{ marginLeft:8, color:'#4b7a64' }}>· {del.note}</span>}
                                </td>
                                <td style={{ color:'#166534' }}>—</td>
                                <td className={`d-balance-cell ${row.runningBalance < 0 ? 'd-balance-neg' : ''}`}>
                                  {fmt(Math.abs(row.runningBalance))}
                                </td>
                              </tr>
                            );
                          }

                          // Order row(s)
                          const order = row.order;
                          const items = order.items && order.items.length > 0 ? order.items : [null];
                          const rowSpan = items.length;
                          const orderDate = order.orderDate || order.createdAt;

                          return items.map((item, idx) => (
                            <tr key={`ord-${order.id || 'main'}-${idx}`} className={idx > 0 ? 'd-hist-cont' : 'd-hist-first'}>
                              {idx === 0 && <td rowSpan={rowSpan} className="d-merged">{formatDate(orderDate)}</td>}
                              {idx === 0 && <td rowSpan={rowSpan} className="d-merged">{order.invoiceRef || '—'}</td>}
                              <td>{item ? (item.name || 'N/A') : 'N/A'}</td>
                              <td className="d-qty">{item ? (item.qty || item.quantity || 0) : '—'}</td>
                              <td>{item ? fmt(item.sellingPrice || 0) : '—'}</td>
                              <td>{item ? fmt(item.subtotal || 0) : '—'}</td>
                              {idx === 0 && <td rowSpan={rowSpan} className="d-merged d-sale-total">{fmt(order.totalDue || 0)}</td>}
                              {idx === 0 && (
                                <td rowSpan={rowSpan} className={`d-merged d-balance-cell ${row.runningBalance < 0 ? 'd-balance-neg' : ''}`}>
                                  {fmt(Math.abs(row.runningBalance))}
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

      {/* ── Deliver Modal ── */}
      {showDeliverModal && selectedDebtor && (
        <DeliverModal
          order={selectedDebtor}
          fmt={fmt}
          onSave={async (updatedOrder) => {
            setShowDeliverModal(false);
            setSelectedDebtor(updatedOrder);
            await loadDebtors();
          }}
          onClose={() => setShowDeliverModal(false)}
        />
      )}

      {/* ── Notify Modal ── */}
      {showNotifyModal && (
        <div className="d-overlay" onClick={() => setShowNotifyModal(false)}>
          <div className="d-modal d-modal-sm d-notify-modal" onClick={e => e.stopPropagation()}>
            <div className="d-modal-header" style={{ flexShrink:0 }}>
              <h2 className="d-modal-title">Notify via</h2>
              <button className="d-close-btn" onClick={() => setShowNotifyModal(false)}><X size={22} /></button>
            </div>
            <div className="d-notify-options" style={{ flexShrink:0 }}>
              <button className="d-notify-opt d-notify-wa"  onClick={() => handleNotify('whatsapp')}><MessageSquare size={20}/> WhatsApp</button>
              <button className="d-notify-opt d-notify-em"  onClick={() => handleNotify('email')}><Mail size={20}/> Email</button>
              <button className="d-notify-opt d-notify-sms" onClick={() => handleNotify('sms')}><Phone size={20}/> SMS</button>
            </div>
            <div className="d-notify-preview d-notify-preview-scroll" style={{ flex:1, overflowY:'auto', minHeight:0 }}>
              <p className="d-notify-preview-label">Message Preview</p>
              <pre className="d-notify-preview-text" style={{whiteSpace:'pre-wrap',fontFamily:'inherit',fontSize:'inherit',margin:0}}>
                {selectedDebtor ? buildNotifyMessage().body : ''}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* ── Enlarged Photo Modal ── */}
      {enlargedPhoto && (
        <div className="d-overlay" onClick={() => setEnlargedPhoto(null)} style={{zIndex:5000}}>
          <div style={{maxWidth:'95vw',maxHeight:'90vh',display:'flex',flexDirection:'column',alignItems:'center',gap:'12px'}}>
            <img src={enlargedPhoto} alt="Receipt" style={{maxWidth:'100%',maxHeight:'80vh',borderRadius:'8px',objectFit:'contain'}} />
            <button onClick={() => setEnlargedPhoto(null)} style={{padding:'10px 24px',background:'var(--surface)',color:'var(--text-primary)',border:'1px solid var(--border)',borderRadius:'8px',fontWeight:700,cursor:'pointer',fontSize:'15px'}}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdvanceOrders;
