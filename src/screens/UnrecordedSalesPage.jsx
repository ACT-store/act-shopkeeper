
/**
 * UnrecordedSalesPage.jsx
 * A full-page checkout screen for entering past (unrecorded) sales.
 * Colour theme: teal/green  vs the main checkout's purple/indigo.
 *
 * Props:
 *   onClose   – called when user confirms return
 *   onSaved   – called after successful save
 */
import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import dataService from '../services/dataService';
import { useCurrency } from '../hooks/useCurrency';

import { Capacitor } from '@capacitor/core';
import ImageViewer from '../components/ImageViewer';
import './UnrecordedSalesPage.css';

// Utility: date string YYYY-MM-DD
const dateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const todayStr  = () => dateStr(new Date());
const tomorrowStr = () => { const d=new Date(); d.setDate(d.getDate()+1); return dateStr(d); };
const max14Str    = () => { const d=new Date(); d.setDate(d.getDate()+14); return dateStr(d); };

export default function UnrecordedSalesPage({ onClose, onSaved }) {
  const { fmt } = useCurrency();

  // ── State ──────────────────────────────────────────────────────────────────
  const [goods, setGoods]             = useState([]);
  const [debtors, setDebtors]         = useState([]);
  const [catalogue, setCatalogue]     = useState([]);  // items in cart
  const [qtyInputs, setQtyInputs]     = useState({});
  const [searchTerm, setSearchTerm]   = useState('');
  const [showResults, setShowResults] = useState(false);

  // Payment
  const [payType, setPayType]         = useState('cash'); // 'cash' | 'credit'

  // Cash confirmation popup
  const [showCashPopup, setShowCashPopup] = useState(false);
  const [customerMoney, setCustomerMoney] = useState('');

  // Credit fields
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [customerName, setCustomerName]       = useState('');
  const [customerPhone, setCustomerPhone]     = useState('');
  const [selectedDebtorId, setSelectedDebtorId] = useState(null);
  const [selectedDebtorObj, setSelectedDebtorObj] = useState(null);
  const [showDebtorSuggestions, setShowDebtorSuggestions] = useState(false);
  const [filteredDebtors, setFilteredDebtors] = useState([]);
  const [repaymentDate, setRepaymentDate]     = useState('');
  const [capturedPhoto, setCapturedPhoto]     = useState(null);
  const [viewImg, setViewImg]                 = useState(null);

  // Quantity modal
  const [showQuantityModal, setShowQuantityModal] = useState(false);
  const [selectedItem, setSelectedItem]           = useState(null);
  const [quantityToAdd, setQuantityToAdd]         = useState('');

  // Sale date (manually entered — key difference from main checkout)
  const [saleDate, setSaleDate]   = useState(todayStr());
  const [isProcessing, setIsProcessing] = useState(false);

  // ── Load data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    dataService.getGoods().then(g => setGoods(g || []));
    dataService.getDebtors().then(d => setDebtors(d || []));

    // Subscribe to real-time goods changes from Firebase listener
    const unsubscribe = dataService.onGoodsChange((updatedGoods) => {
      setGoods(updatedGoods || []);
    });
    return () => unsubscribe();
  }, []);

  // ── Search / filter goods ──────────────────────────────────────────────────
  const filteredGoods = (() => {
    if (!searchTerm.trim()) return [];
    const t = searchTerm.toLowerCase();
    return goods.filter(g => {
      const w = (g.name||'').toLowerCase().split(/\s+/);
      return w[0]?.startsWith(t) || (w[1] && w[1].startsWith(t)) || (w[2] && w[2].startsWith(t));
    }).slice(0, 8);
  })();

  // ── Cart helpers ───────────────────────────────────────────────────────────
  const addToCart = (good, qty = 1) => {
    const existing = catalogue.find(i => i.id === good.id);
    if (existing) {
      const newQty = (typeof existing.qty==='number' ? existing.qty : parseInt(existing.qty,10)||0) + qty;
      setQtyInputs(q => ({...q, [good.id]: String(newQty)}));
      setCatalogue(prev => prev.map(i => i.id===good.id ? {...i, qty:newQty} : i));
    } else {
      setQtyInputs(q => ({...q, [good.id]: String(qty)}));
      setCatalogue(prev => [...prev, {...good, qty}]);
    }
    setSearchTerm(''); setShowResults(false);
  };

  const updateQuantity = (id, newQty) => {
    if (newQty === '') { setCatalogue(prev => prev.map(i => i.id===id ? {...i, qty:''} : i)); return; }
    const q = parseInt(newQty, 10);
    if (isNaN(q) || q < 1) return;
    setCatalogue(prev => prev.map(i => i.id===id ? {...i, qty:q} : i));
  };
  const removeFromCatalogue = (id) => {
    setCatalogue(prev => prev.filter(i => i.id!==id));
    setQtyInputs(q => { const n={...q}; delete n[id]; return n; });
  };

  const calculateTotal = () =>
    catalogue.reduce((sum, item) => {
      const qty = typeof item.qty==='number' ? item.qty : (parseInt(item.qty,10)||0);
      return sum + (item.price||0) * qty;
    }, 0);

  const hasCartItems = catalogue.length > 0;

  // ── Return / back handling ─────────────────────────────────────────────────
  const handleReturn = () => {
    if (hasCartItems) {
      const ok = window.confirm('You have unfinished entries. Return to Unrecorded Sales without saving?');
      if (!ok) return;
    }
    onClose();
  };

  // ── Debtor search (for credit) ─────────────────────────────────────────────
  const handleDebtorNameChange = (val) => {
    setCustomerName(val);
    setSelectedDebtorId(null); setSelectedDebtorObj(null);
    if (!val.trim()) { setFilteredDebtors([]); setShowDebtorSuggestions(false); return; }
    const t = val.toLowerCase();
    const matches = debtors.filter(d => {
      const w = (d.name||d.customerName||'').toLowerCase().split(/\s+/);
      return w[0]?.startsWith(t) || (w[1] && w[1].startsWith(t));
    });
    setFilteredDebtors(matches); setShowDebtorSuggestions(matches.length > 0);
  };

  const selectDebtor = (d) => {
    setCustomerName(d.name||d.customerName||'');
    setCustomerPhone(d.phone||d.customerPhone||'');
    setSelectedDebtorId(d.id); setSelectedDebtorObj(d);
    setFilteredDebtors([]); setShowDebtorSuggestions(false);
  };

  // ── Repayment date bounds ──────────────────────────────────────────────────
  const repayMin = saleDate || todayStr();
  const repayMax = (() => {
    if (!saleDate) return max14Str();
    const d = new Date(saleDate + 'T12:00:00'); d.setDate(d.getDate()+14); return dateStr(d);
  })();

  // ── Build sale payload ─────────────────────────────────────────────────────
  const buildSalePayload = (extras = {}) => {
    const items = catalogue.map(item => ({
      id: item.id, name: item.name, price: item.price,
      quantity: typeof item.qty==='number' ? item.qty : (parseInt(item.qty,10)||0),
      subtotal: item.price * (typeof item.qty==='number' ? item.qty : (parseInt(item.qty,10)||0)),
    }));
    const localDate = new Date(saleDate + 'T12:00:00');
    return {
      items, total: calculateTotal(),
      paymentType: payType,
      date: localDate.toISOString(),
      isUnrecorded: true,
      ...extras,
    };
  };

  // ── Confirm cash sale ──────────────────────────────────────────────────────
  const handlePayCash = () => {
    if (catalogue.length === 0) { alert('Cart is empty.'); return; }
    if (!saleDate) { alert('Please enter the sale date.'); return; }
    setShowCashPopup(true);
  };

  const confirmCashSale = async () => {
    setIsProcessing(true);
    try {
      await dataService.addSale(buildSalePayload({ paymentType:'cash' }));
      setShowCashPopup(false); setCustomerMoney('');
      setCatalogue([]); setQtyInputs({});
      alert('Unrecorded cash sale saved!');
      onSaved();
    } catch (e) { console.error(e); alert('Failed to save sale.'); }
    finally { setIsProcessing(false); }
  };

  // ── Confirm credit sale ────────────────────────────────────────────────────
  const handlePayCredit = () => {
    if (catalogue.length === 0) { alert('Cart is empty.'); return; }
    if (!saleDate) { alert('Please enter the sale date.'); return; }
    setShowCreditModal(true);
    setCustomerName(''); setCustomerPhone(''); setSelectedDebtorId(null); setSelectedDebtorObj(null);
    setRepaymentDate(''); setCapturedPhoto(null);
  };

  const confirmCreditSale = async () => {
    if (!customerName.trim()) { alert('Please enter a customer name.'); return; }
    if (!repaymentDate) { alert('Please enter a repayment date.'); return; }
    if (!capturedPhoto) { alert('Please take a photo of the credit book.'); return; }
    setIsProcessing(true);
    try {
      const debtor = selectedDebtorObj;
      await dataService.addSale(buildSalePayload({
        paymentType: 'credit', isDebt: true,
        customerName: customerName.trim(), customerPhone: customerPhone.trim(),
        debtorId: selectedDebtorId || null,
        repaymentDate, photoUrl: capturedPhoto,
      }));
      setShowCreditModal(false);
      setCatalogue([]); setQtyInputs({});
      alert('Unrecorded credit sale saved!');
      onSaved();
    } catch (e) { console.error(e); alert('Failed to save credit sale.'); }
    finally { setIsProcessing(false); }
  };

  const handleTakePhoto = async () => {
    try {
      const { Camera: CapCamera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      const image = await CapCamera.getPhoto({ quality:90, allowEditing:false, resultType:CameraResultType.DataUrl, source:CameraSource.Camera });
      setCapturedPhoto(image.dataUrl);
    } catch(e) { console.error(e); }
  };

  // ── Quantity modal ─────────────────────────────────────────────────────────
  const openQuantityModal = (good) => {
    setSelectedItem(good); setQuantityToAdd(''); setShowQuantityModal(true);
    setSearchTerm(''); setShowResults(false);
  };

  const confirmAddItem = () => {
    const qty = parseInt(quantityToAdd, 10);
    if (isNaN(qty) || qty < 1) { alert('Please enter a valid quantity (minimum 1)'); return; }
    const stockQty = typeof selectedItem?.stock_quantity==='number' ? selectedItem.stock_quantity : Infinity;
    if (stockQty !== Infinity && qty > stockQty) { alert(`Only ${stockQty} available in stock.`); return; }
    addToCart(selectedItem, qty);
    setShowQuantityModal(false); setSelectedItem(null); setQuantityToAdd('');
  };

  const total = calculateTotal();
  const given = parseFloat(customerMoney) || 0;
  const change = given - total;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="us-container">

      {/* Page header */}
      <div className="us-header">
        <button className="us-back-btn" onClick={handleReturn} title="Return to Settings">
          <ArrowLeft size={22} />
        </button>
        <h2 className="us-title">UNRECORDED SALES</h2>
        {/* Date picker replaces Help button */}
        <input
          type="date"
          className="us-date-input"
          value={saleDate}
          max={todayStr()}
          onChange={e => setSaleDate(e.target.value)}
          title="Date of sale"
        />
      </div>

      {/* Catalogue */}
      <div className="us-catalogue-area">
        <div className="us-catalogue-wrapper">
          <table className="us-catalogue-table">
            <thead>
              <tr><th>Qty</th><th>Item</th><th>Selling Price</th><th>Total</th><th></th></tr>
            </thead>
            <tbody>
              {catalogue.length === 0 ? (
                <tr><td colSpan="5" className="us-catalogue-empty">Cart is empty — search to add items</td></tr>
              ) : (
                catalogue.map(item => {
                  const qty = typeof item.qty==='number' ? item.qty : (parseInt(item.qty,10)||0);
                  return (
                    <tr key={item.id}>
                      <td className="us-qty-cell">
                        <input type="number" value={item.qty}
                          onChange={e => updateQuantity(item.id, e.target.value)} min="1" />
                      </td>
                      <td>{item.name}</td>
                      <td className="us-price-cell">{fmt(item.price)}</td>
                      <td className="us-total-cell">{fmt(item.price * qty)}</td>
                      <td className="us-edit-cell">
                        <button onClick={() => removeFromCatalogue(item.id)}>×</button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom */}
      <div className="us-bottom-section">
        <div className="us-cart-total">
          <span>Total:</span>
          <span className="us-total-amount">{fmt(total)}</span>
        </div>

        <div className="us-payment-buttons">
          <button className="us-btn-credit" onClick={handlePayCredit} disabled={isProcessing}>
            Bought on Credit
          </button>
          <button className="us-btn-cash" onClick={handlePayCash} disabled={isProcessing}>
            Bought with Cash
          </button>
        </div>

        <div className="us-search-section">
          <input type="text" className="us-search-input" placeholder="Type to search goods..."
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setShowResults(e.target.value.trim().length>0); }}
            onFocus={() => setShowResults(searchTerm.trim().length>0)}
            onBlur={() => setTimeout(() => setShowResults(false), 200)}
          />
          {showResults && filteredGoods.length > 0 && (
            <div className="us-search-results">
              {filteredGoods.map(good => (
                <div key={good.id} className="us-search-item" onMouseDown={() => openQuantityModal(good)}>
                  <span className="us-search-name">{good.name}{good.size ? <span className="us-search-size"> · {good.size}</span> : null}</span>
                  <span className="us-search-price">{fmt(good.price)}</span>
                  {typeof good.stock_quantity === 'number' && (
                    <span className={`us-search-stock ${good.stock_quantity === 0 ? 'us-search-stock-out' : ''}`}>
                      {good.stock_quantity === 0 ? 'Out of stock' : `Avail: ${good.stock_quantity}`}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Quantity modal ── */}
      {showQuantityModal && selectedItem && (() => {
        const stockQty = typeof selectedItem.stock_quantity==='number' ? selectedItem.stock_quantity : Infinity;
        const isOut = stockQty === 0;
        return (
          <div className="us-modal-overlay">
            <div className="us-modal-content">
              <h2>Add to Cart</h2>
              <p><strong>{selectedItem.name}</strong></p>
              <p className="us-item-price">Price: {fmt(selectedItem.price)}</p>
              {isOut ? (
                <p style={{color:'#dc2626',fontWeight:700,fontSize:'15px',textAlign:'center',margin:'12px 0'}}>Out of Stock</p>
              ) : (
                <div className="us-qty-section">
                  <label>Quantity:</label>
                  <input type="number" value={quantityToAdd}
                    onChange={e => {
                      const v = e.target.value;
                      if (v === '') { setQuantityToAdd(''); return; }
                      const n = parseInt(v,10);
                      if (!isNaN(n) && stockQty!==Infinity && n>stockQty) { setQuantityToAdd(String(stockQty)); alert(`Only ${stockQty} available.`); }
                      else setQuantityToAdd(v);
                    }}
                    placeholder={stockQty!==Infinity ? `Max ${stockQty}` : 'Enter qty'} min="1" max={stockQty!==Infinity ? stockQty : undefined} autoFocus />
                  {stockQty!==Infinity && <p style={{fontSize:'12px',color:'#6b7280',margin:'4px 0 0'}}>Available: {stockQty}</p>}
                </div>
              )}
              <div className="us-modal-buttons">
                <button className="us-btn-cancel" onClick={() => { setShowQuantityModal(false); setSelectedItem(null); setQuantityToAdd(''); }}>Cancel</button>
                {!isOut && <button className="us-btn-confirm" onClick={confirmAddItem}>Add to Cart</button>}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Cash confirm popup ── */}
      {showCashPopup && (
        <div className="us-modal-overlay">
          <div className="us-modal-content us-cash-confirm">
            <h2>Confirm Cash Sale</h2>
            <p>Sale date: <strong>{saleDate}</strong></p>
            <p className="us-confirm-total">Total: <strong>{fmt(total)}</strong></p>
            <div className="us-qty-section">
              <label>Cash Received (optional):</label>
              <input type="number" value={customerMoney}
                onChange={e => setCustomerMoney(e.target.value)}
                placeholder="0.00" min="0" />
              {given > 0 && <p style={{marginTop:'6px',fontSize:'13px'}}>Change: <strong>{fmt(Math.max(0, change))}</strong></p>}
            </div>
            <div className="us-modal-buttons">
              <button className="us-btn-cancel" onClick={() => { setShowCashPopup(false); setCustomerMoney(''); }}>Cancel</button>
              <button className="us-btn-confirm" onClick={confirmCashSale} disabled={isProcessing}>
                {isProcessing ? 'Saving…' : 'Confirm Sale'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Credit modal ── */}
      {showCreditModal && (
        <div className="us-modal-overlay">
          <div className="us-modal-content us-credit-modal">
            <h2>Bought on Credit</h2>
            <p style={{fontSize:'12px',color:'#6b7280',marginBottom:'12px'}}>Sale date: {saleDate}</p>

            <div className="us-qty-section" style={{position:'relative'}}>
              <label>Customer Name *</label>
              <input type="text" value={customerName}
                onChange={e => handleDebtorNameChange(e.target.value)}
                onFocus={() => customerName.trim() && setShowDebtorSuggestions(filteredDebtors.length>0)}
                placeholder="Type name..." />
              {showDebtorSuggestions && filteredDebtors.length > 0 && (
                <div className="us-debtor-suggestions">
                  {filteredDebtors.map(d => (
                    <div key={d.id} className="us-debtor-item" onMouseDown={() => selectDebtor(d)}>
                      <strong>{d.name||d.customerName}</strong>
                      {(d.phone||d.customerPhone) && <span style={{fontSize:'11px',color:'#6b7280',marginLeft:8}}>{d.phone||d.customerPhone}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="us-qty-section">
              <label>Phone</label>
              <input type="tel" value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)} placeholder="Phone number" />
            </div>

            <div className="us-qty-section">
              <label>Repayment Date *</label>
              <input type="date" value={repaymentDate}
                min={repayMin} max={repayMax}
                onChange={e => setRepaymentDate(e.target.value)} />
              <p style={{fontSize:'11px',color:'#6b7280',margin:'3px 0 0'}}>Sale date + up to 14 days ({repayMin} → {repayMax})</p>
            </div>

            <div className="us-qty-section">
              <label>Photo of Credit Book *</label>
              <button className="us-camera-btn" type="button" onClick={handleTakePhoto}>
                📷 {capturedPhoto ? 'Retake Photo' : 'Take Photo'}
              </button>
              {capturedPhoto && <img src={capturedPhoto} alt="Credit book" style={{width:'100%',maxHeight:'120px',objectFit:'cover',borderRadius:'8px',marginTop:'8px',cursor:'zoom-in'}} onClick={() => setViewImg(capturedPhoto)} title="Tap to view full screen" />}
            </div>

            <p className="us-confirm-total">Total: <strong>{fmt(total)}</strong></p>

            <div className="us-modal-buttons">
              <button className="us-btn-cancel" onClick={() => setShowCreditModal(false)}>Cancel</button>
              <button className="us-btn-confirm" onClick={confirmCreditSale} disabled={isProcessing}>
                {isProcessing ? 'Saving…' : 'Confirm Credit Sale'}
              </button>
            </div>
          </div>
        </div>
      )}
      {viewImg && <ImageViewer src={viewImg} onClose={() => setViewImg(null)} alt="Credit book photo" />}
    </div>
  );
}
