import React, { useState, useEffect, useRef } from 'react';
import { useValidation, ValidationNote, errorBorder } from '../utils/validation.jsx';
import { Calculator } from 'lucide-react';

import { Capacitor } from '@capacitor/core';

import dataService from '../services/dataService';
import { logAction } from '../services/activityLogger';
import { useCurrency } from '../hooks/useCurrency';
import './Checkout.css';
import { NativeSettings, AndroidSettings } from 'capacitor-native-settings';

// ── Barcode beep (Web Audio API — no file needed) ──────────────────────────
// Re-use a single AudioContext across beeps — Android WebView suspends new
// contexts until a user gesture; resuming is more reliable than creating fresh.
let _beepCtx = null;
function playBeep() {
  try {
    if (!_beepCtx) _beepCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _beepCtx;
    const resume = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
    resume.then(() => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046, ctx.currentTime); // C6
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    });
  } catch (_) {}
}

function Checkout() {
  const { fmt } = useCurrency();
  const { fieldErrors: creditErrors, showError: showCreditError, clearFieldError: clearCreditError } = useValidation();
  const [goods, setGoods] = useState([]);
  const [catalogue, setCatalogue] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [repaymentDate, setRepaymentDate] = useState('');
  const [showPaymentMethodModal, setShowPaymentMethodModal] = useState(false);
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState({ cash: true, ib: false, mpaisa: false });
  const [showIbRefModal, setShowIbRefModal] = useState(false);
  const [showMpaisaRefModal, setShowMpaisaRefModal] = useState(false);
  const [transferRef, setTransferRef] = useState('');
  const [showCashPopup, setShowCashPopup] = useState(false);
  const [showChangeCalc, setShowChangeCalc] = useState(false);  // child modal inside cash confirm
  const [customerMoney, setCustomerMoney] = useState('');       // raw input from customer
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Debtor search states
  const [existingDebtors, setExistingDebtors] = useState([]);
  const [showDebtorSuggestions, setShowDebtorSuggestions] = useState(false);
  const [filteredDebtors, setFilteredDebtors] = useState([]);
  const [selectedDebtorId, setSelectedDebtorId] = useState(null);
  const [selectedDebtorObj, setSelectedDebtorObj] = useState(null);
  const [overdueModal, setOverdueModal] = useState(null); // { name, gender, daysOverdue, dueDate }

  // Quantity modal states
  const [showQuantityModal, setShowQuantityModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [quantityToAdd, setQuantityToAdd] = useState('');

  // ── Barcode scanner states ─────────────────────────────────────────────
  const [scannerActive, setScannerActive]   = useState(false);
  const [scannerError, setScannerError]     = useState('');
  const [lastScanned, setLastScanned]       = useState(null);
  const videoRef       = useRef(null);  // <video> element
  const streamRef      = useRef(null);  // MediaStream (camera feed)
  const rafRef         = useRef(null);  // requestAnimationFrame handle
  const canvasRef      = useRef(null);  // off-screen canvas for frame capture
  const detectorRef    = useRef(null);  // BarcodeDetector instance (native API)
  const zxingRef       = useRef(null);  // ZXing reader (fallback)
  const lastScanRef    = useRef({ code: null, ts: 0 }); // debounce duplicate scans
  // Always hold latest goods so scan callbacks never use stale closure
  const goodsRef = useRef(goods);
  useEffect(() => { goodsRef.current = goods; }, [goods]);

  useEffect(() => {
    loadGoods();
    loadDebtors();
    return () => stopScanner();
  }, []);

  // ── Subscribe to real-time goods changes from Firebase listener ────────
  useEffect(() => {
    const unsubscribe = dataService.onGoodsChange((updatedGoods) => {
      setGoods(updatedGoods || []);
    });
    return () => unsubscribe();
  }, []);

  const loadGoods = async () => {
    const goodsData = await dataService.getGoods();
    setGoods(goodsData);
  };
  const loadDebtors = async () => {
    const debtorsData = await dataService.getDebtors();
    setExistingDebtors(debtorsData || []);
  };

  // ── Repayment date helpers ─────────────────────────────────────────────
  const dateStr = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const getTomorrowStr = () => { const d = new Date(); d.setDate(d.getDate() + 1); return dateStr(d); };
  const getMax14DaysStr = () => { const d = new Date(); d.setDate(d.getDate() + 14); return dateStr(d); };

  // Returns { blocked: bool, daysOverdue: number, existingDueDate: string } for selected debtor
  const getDebtorStatus = () => {
    if (!selectedDebtorObj) return { blocked: false, daysOverdue: 0, existingDueDate: null };
    const balance = selectedDebtorObj.balance || selectedDebtorObj.totalDue || 0;
    const repDate = selectedDebtorObj.repaymentDate;
    if (!repDate || balance <= 0) return { blocked: false, daysOverdue: 0, existingDueDate: repDate || null };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const due = new Date(repDate); due.setHours(0, 0, 0, 0);
    const daysOverdue = Math.floor((today - due) / (1000 * 60 * 60 * 24));
    return { blocked: daysOverdue > 0, daysOverdue, existingDueDate: repDate };
  };

  // Repayment date picker max:
  // - If debtor has unpaid debt with a due date → locked to that exact due date (min=tomorrow, max=due date)
  // - Otherwise → up to 14 days from today
  const getRepaymentMaxStr = () => {
    const { blocked, existingDueDate } = getDebtorStatus();
    const balance = selectedDebtorObj ? (selectedDebtorObj.balance || selectedDebtorObj.totalDue || 0) : 0;
    if (!blocked && existingDueDate && balance > 0) {
      return existingDueDate; // unpaid but not yet overdue — lock to existing due date
    }
    return getMax14DaysStr();
  };

  // ── Debtor search ──────────────────────────────────────────────────────
  // Debtor field is DROPDOWN-ONLY — no typing allowed.
  // Opening the field shows all debtors; typing is blocked.
  const openDebtorDropdown = () => {
    if (!selectedDebtorId) {
      setFilteredDebtors(existingDebtors);
      setShowDebtorSuggestions(existingDebtors.length > 0);
    }
  };

  const selectDebtor = (debtor) => {
    setShowDebtorSuggestions(false);

    const balance   = debtor.balance || debtor.totalDue || 0;
    const repDate   = debtor.repaymentDate;

    // Check if debt is overdue
    if (repDate && balance > 0) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const due   = new Date(repDate); due.setHours(0, 0, 0, 0);
      const daysOverdue = Math.floor((today - due) / (1000 * 60 * 60 * 24));

      if (daysOverdue > 0) {
        // Show blocking modal — do NOT select the debtor
        setOverdueModal({
          name: debtor.name || debtor.customerName || 'Customer',
          gender: debtor.gender || '',
          daysOverdue,
          dueDate: repDate,
          balance,
        });
        return;
      }
    }

    // Safe to select
    setCustomerName(debtor.name || debtor.customerName || '');
    setCustomerPhone(debtor.phone || debtor.customerPhone || '');
    setSelectedDebtorId(debtor.id);
    setSelectedDebtorObj(debtor);
    setRepaymentDate(''); // reset so user picks within allowed range
  };

  const clearDebtorSelection = () => {
    setCustomerName(''); setCustomerPhone(''); setSelectedDebtorId(null);
    setSelectedDebtorObj(null); setRepaymentDate(''); setShowDebtorSuggestions(false);
  };

  // ── Catalogue ──────────────────────────────────────────────────────────
  // Smart search: first-word matches first (sorted by 2nd letter),
  // then second-word matches (sorted by 2nd letter of 2nd word)
  const smartSearchGoods = (items, term) => {
    if (!term.trim()) return [];
    const t = term.toLowerCase();
    const firstMatches = [], secondMatches = [], thirdMatches = [];
    for (const item of items) {
      const words = (item.name || '').toLowerCase().split(/\s+/);
      if (words[0] && words[0].startsWith(t)) firstMatches.push(item);
      else if (words.length > 1 && words[1] && words[1].startsWith(t)) secondMatches.push(item);
      else if (words.length > 2 && words[2] && words[2].startsWith(t)) thirdMatches.push(item);
    }
    const sortBy = (arr, wi) => [...arr].sort((a, b) => {
      const wa = ((a.name||'').toLowerCase().split(/\s+/)[wi]||'');
      const wb = ((b.name||'').toLowerCase().split(/\s+/)[wi]||'');
      return (wa[1]||'').localeCompare(wb[1]||'');
    });
    return [...sortBy(firstMatches, 0), ...sortBy(secondMatches, 1), ...sortBy(thirdMatches, 2)].slice(0, 8);
  };
  const filteredGoods = smartSearchGoods(goods, searchTerm);

  const addToCart = (good, qty = 1) => {
    const existing = catalogue.find(item => item.id === good.id);
    if (existing) {
      setCatalogue(prev => prev.map(item =>
        item.id === good.id ? { ...item, qty: item.qty + qty } : item
      ));
    } else {
      setCatalogue(prev => [...prev, { ...good, qty }]);
    }
  };

  const handleItemClick = (good) => {
    setSelectedItem(good);
    setQuantityToAdd('');
    setShowQuantityModal(true);
    setSearchTerm('');
    setShowResults(false);
  };

  const confirmAddItem = () => {
    const qty = parseInt(quantityToAdd, 10);
    if (isNaN(qty) || qty < 1) { alert('Please enter a valid quantity (minimum 1)'); return; }
    const stockQty = typeof selectedItem?.stock_quantity === 'number' ? selectedItem.stock_quantity : Infinity;
    if (stockQty !== Infinity && qty > stockQty) { alert(`Only ${stockQty} available in stock.`); return; }
    addToCart(selectedItem, qty);
    setShowQuantityModal(false);
    setSelectedItem(null);
    setQuantityToAdd('');
  };

  const updateQuantity = (id, newQty) => {
    if (newQty === '') {
      setCatalogue(catalogue.map(item => item.id === id ? { ...item, qty: '' } : item));
      return;
    }
    const qty = parseInt(newQty, 10);
    if (isNaN(qty) || qty < 1) return;
    setCatalogue(catalogue.map(item => item.id === id ? { ...item, qty } : item));
  };
  const removeFromCatalogue = (id) => setCatalogue(catalogue.filter(item => item.id !== id));
  const calculateTotal = () =>
    catalogue.reduce((sum, item) => {
      const qty = typeof item.qty === 'number' ? item.qty : (parseInt(item.qty, 10) || 0);
      return sum + (item.price * qty);
    }, 0);

  // ── Barcode scanner ────────────────────────────────────────────────────
  // Strategy:
  //   1. Try native BarcodeDetector API (built into Android WebView / Chrome 83+)
  //      — fastest, most reliable on-device, no library needed
  //   2. Fall back to @zxing/browser using canvas frame-polling (NOT decodeFromConstraints
  //      which is unreliable on Android WebView)
  //
  // Both paths share the same camera stream (getUserMedia) so the video element
  // always shows a live feed regardless of which decoder is active.

  const stopScanner = () => {
    // Cancel any pending animation frame
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    // Stop ZXing reader if active
    if (zxingRef.current) {
      try { zxingRef.current.reset(); } catch (_) {}
      zxingRef.current = null;
    }
    // Stop camera stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) { videoRef.current.srcObject = null; }
    setScannerActive(false);
  };

  const handleBarcodeDetected = (code) => {
    const now = Date.now();
    // Debounce — ignore same barcode within 500ms to prevent a single physical
    // scan firing twice from the camera, while still allowing intentional rescans.
    if (code === lastScanRef.current.code && now - lastScanRef.current.ts < 500) return;
    lastScanRef.current = { code, ts: now };

    const match = goodsRef.current.find(g =>
      g.barcode && String(g.barcode).trim() === String(code).trim()
    );

    if (!match) {
      // Unknown barcode — show error but keep scanner open so user can try again
      setLastScanned({ code, matched: false });
      return;
    }

    // Match found — beep, add to cart, keep scanner open for next item
    playBeep();
    addToCart(match, 1);
    setLastScanned({ code, matched: true, name: match.name });
  };

  // ── Path 1: native BarcodeDetector (Android WebView / Chrome) ─────────
  const startNativeDetector = (videoEl) => {
    const detector = new window.BarcodeDetector({
      formats: [
        'ean_13','ean_8','upc_a','upc_e',
        'code_39','code_93','code_128',
        'qr_code','data_matrix','itf',
      ],
    });
    detectorRef.current = detector;

    const tick = async () => {
      if (!videoEl || videoEl.readyState < 2) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      try {
        const barcodes = await detector.detect(videoEl);
        if (barcodes.length > 0) {
          handleBarcodeDetected(barcodes[0].rawValue);
        }
      } catch (_) {}
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  // ── Path 2: ZXing canvas frame-polling fallback ────────────────────────
  const startZxingFallback = async (videoEl) => {
    const { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType } =
      await import('@zxing/browser');

    // Give ZXing hints for common barcode formats to improve decode rate
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,  BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_39, BarcodeFormat.CODE_93, BarcodeFormat.CODE_128,
      BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX, BarcodeFormat.ITF,
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);

    const reader = new BrowserMultiFormatReader(hints);
    zxingRef.current = reader;

    // Off-screen canvas to capture frames from the video element
    if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
    const canvas  = canvasRef.current;
    const ctx2d   = canvas.getContext('2d');

    const tick = () => {
      if (!videoEl || videoEl.readyState < 2 || videoEl.videoWidth === 0) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      canvas.width  = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      ctx2d.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      try {
        const result = reader.decodeFromCanvas(canvas);
        if (result) handleBarcodeDetected(result.getText());
      } catch (_) {
        // NotFoundException is thrown on every frame with no barcode — expected, ignore
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  // ── Main startScanner entry point ──────────────────────────────────────
  const startScanner = async () => {
    setScannerError('');
    setLastScanned(null);
    lastScanRef.current = { code: null, ts: 0 };

    // 1. Request camera stream
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' }, // rear camera
          width:  { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
    } catch (err) {
      const msg = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
        ? 'Camera access denied. Please allow camera permission in your device settings and try again.'
        : `Camera error: ${err.message}`;
      setScannerError(msg);
      return;
    }

    streamRef.current = stream;
    setScannerActive(true);

    // 2. Wait for the video element to mount (it renders after setScannerActive(true))
    await new Promise(r => setTimeout(r, 80));
    if (!videoRef.current) { stopScanner(); return; }

    // 3. Attach stream to video element and wait for it to be playing
    const videoEl = videoRef.current;
    videoEl.srcObject = stream;
    videoEl.setAttribute('playsinline', 'true');
    videoEl.muted = true;
    await videoEl.play().catch(() => {});

    // Wait until video has actual dimensions (camera feed is live)
    await new Promise(resolve => {
      const check = () => {
        if (videoEl.videoWidth > 0) { resolve(); return; }
        setTimeout(check, 50);
      };
      check();
    });

    // 4. Choose decoder: native BarcodeDetector first, ZXing canvas fallback second
    if (window.BarcodeDetector) {
      startNativeDetector(videoEl);
    } else {
      await startZxingFallback(videoEl);
    }
  };

  // ── Cash payment ───────────────────────────────────────────────────────
  const handlePayCash = () => {
    if (catalogue.length === 0) { alert('Cart is empty.'); return; }
    // Step 1: show payment method selector
    setSelectedPaymentMethods({ cash: true, ib: false, mpaisa: false });
    setShowPaymentMethodModal(true);
  };

  const confirmPaymentMethod = () => {
    const { cash, ib, mpaisa } = selectedPaymentMethods;
    if (!cash && !ib && !mpaisa) { alert('Please select at least one payment method.'); return; }
    setShowPaymentMethodModal(false);
    setTransferRef('');
    if (ib) {
      setShowIbRefModal(true);
    } else if (mpaisa) {
      setShowMpaisaRefModal(true);
    } else {
      // cash — open the cash confirm popup
      setShowCashPopup(true);
    }
  };

  // Build the paymentType string from selections e.g. 'cash', 'ib', 'cash+ib+mpaisa'
  const buildPaymentType = () => {
    const { cash, ib, mpaisa } = selectedPaymentMethods;
    return [cash && 'cash', ib && 'ib', mpaisa && 'mpaisa'].filter(Boolean).join('+') || 'cash';
  };

  const confirmCashPayment = async () => {
    setIsProcessing(true);
    setShowCashPopup(false);
    setShowChangeCalc(false);
    setCustomerMoney('');
    try {
      const total = calculateTotal();
      const paymentType = buildPaymentType();
      const items = catalogue.map(item => ({
        id: item.id, name: item.name, price: item.price,
        quantity: item.qty, subtotal: item.price * item.qty,
      }));
      await dataService.addSale({
        items, total, paymentType,
        customerName: '', customerPhone: '', photoUrl: null, repaymentDate: '', isDebt: false,
      });
      const itemSummary = items.map(i => `${i.name} x${i.quantity}`).join(', ');
      await logAction('SALE', `Cash sale $${total.toFixed(2)} — ${itemSummary}`);
      alert(`Payment confirmed. Total: ${fmt(total)}`);
      setCatalogue([]);
    } catch (error) {
      console.error('Payment error:', error);
      alert('Payment failed. Please try again.');
    } finally { setIsProcessing(false); }
  };

  const confirmIbPayment = async () => {
    const ref = transferRef.trim();
    if (!ref) { alert('Please enter the Bank Transfer Reference.'); return; }
    setIsProcessing(true);
    setShowIbRefModal(false);
    try {
      const total = calculateTotal();
      const description = `Sales payment via Internet Banking ref: ${ref}`;
      const now = new Date().toISOString();
      const items = catalogue.map(item => ({
        id: item.id, name: item.name, price: item.price,
        quantity: item.qty, subtotal: item.price * item.qty,
      }));
      const newSale = await dataService.addSale({
        items, total, paymentType: 'ib', description,
        customerName: '', customerPhone: '', photoUrl: null, repaymentDate: '', isDebt: false,
      });
      await dataService.addBankTransfer({
        amount: total,
        description,
        reference: ref,
        source: 'sale',
        saleId: newSale.id,
        date: now,
      });
      const itemSummary = items.map(i => `${i.name} x${i.quantity}`).join(', ');
      await logAction('SALE', `Internet Banking sale $${total.toFixed(2)} ref:${ref} — ${itemSummary}`);
      alert(`Payment confirmed. Total: ${fmt(total)}`);
      setCatalogue([]);
    } catch (error) {
      console.error('IB payment error:', error);
      alert('Payment failed. Please try again.');
    } finally { setIsProcessing(false); setTransferRef(''); }
  };

  const confirmMpaisaPayment = async () => {
    const ref = transferRef.trim();
    if (!ref) { alert('Please enter the MPAiSA Transfer ID.'); return; }
    setIsProcessing(true);
    setShowMpaisaRefModal(false);
    try {
      const total = calculateTotal();
      const description = `Sales payment via MPAISA ref: ${ref}`;
      const now = new Date().toISOString();
      const items = catalogue.map(item => ({
        id: item.id, name: item.name, price: item.price,
        quantity: item.qty, subtotal: item.price * item.qty,
      }));
      const newSale = await dataService.addSale({
        items, total, paymentType: 'mpaisa', description,
        customerName: '', customerPhone: '', photoUrl: null, repaymentDate: '', isDebt: false,
      });
      await dataService.addMpaisaTransfer({
        amount: total,
        description,
        reference: ref,
        source: 'sale',
        saleId: newSale.id,
        date: now,
      });
      const itemSummary = items.map(i => `${i.name} x${i.quantity}`).join(', ');
      await logAction('SALE', `MPaisa sale $${total.toFixed(2)} ref:${ref} — ${itemSummary}`);
      alert(`Payment confirmed. Total: ${fmt(total)}`);
      setCatalogue([]);
    } catch (error) {
      console.error('MPAiSA payment error:', error);
      alert('Payment failed. Please try again.');
    } finally { setIsProcessing(false); setTransferRef(''); }
  };

  // ── Credit payment ─────────────────────────────────────────────────────
  const handlePayCredit = () => {
    if (catalogue.length === 0) { alert('Cart is empty.'); return; }
    loadDebtors();
    setShowCreditModal(true);
  };
  const closeCreditModal = () => {
    setShowCreditModal(false);
    clearDebtorSelection();
    setRepaymentDate('');
    setCapturedPhoto(null);
  };
  const takeCreditPhoto = async () => {
    if (!Capacitor.isNativePlatform()) {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*'; input.capture = 'camera';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => { setCapturedPhoto(ev.target.result); };
          reader.readAsDataURL(file);
        }
      };
      input.click();
    } else {
      try {
        const { Camera: CapCamera } = await import('@capacitor/camera');
        const image = await CapCamera.getPhoto({ quality: 70, allowEditing: false, resultType: 'dataUrl' });
        setCapturedPhoto(image.dataUrl);
      } catch { alert('Could not capture photo. Please try again.'); }
    }
  };
  const confirmCreditSale = async (e) => {
    e.preventDefault();
    if (!selectedDebtorId) return showCreditError('credit_debtor', 'Please select a registered debtor');
    const { existingDueDate } = getDebtorStatus();
    const balance = selectedDebtorObj ? (selectedDebtorObj.balance || selectedDebtorObj.totalDue || 0) : 0;
    const isLocked = !!existingDueDate && balance > 0;
    const finalRepaymentDate = isLocked ? existingDueDate : repaymentDate;
    if (!finalRepaymentDate) return showCreditError('credit_date', 'Please select a repayment date');
    // Photo is optional — skip validation
    setIsProcessing(true);
    try {
      const total = calculateTotal();
      const items = catalogue.map(item => ({
        id: item.id, name: item.name, price: item.price,
        quantity: item.qty, subtotal: item.price * item.qty,
      }));
      let photoUrl = null;
      if (capturedPhoto) {
        try { photoUrl = await dataService.savePhoto(capturedPhoto, Date.now().toString()); }
        catch (err) { console.error('Photo save error:', err); }
      }
      await dataService.addSale({
        items, total, paymentType: 'credit',
        customerName, customerPhone, debtorId: selectedDebtorId,
        photoUrl, repaymentDate: finalRepaymentDate, isDebt: true,
      });
      const itemSummary = items.map(i => `${i.name} x${i.quantity}`).join(', ');
      await logAction('SALE_CREDIT', `Credit sale $${total.toFixed(2)} to ${customerName} — ${itemSummary}`);
      alert(`Credit sale saved.\nDebtor: ${customerName}\nRepayment Date: ${repaymentDate}`);
      setCatalogue([]);
      closeCreditModal();
    } catch (error) {
      console.error('Credit sale error:', error);
      alert('Failed to record credit sale. Please try again.');
    } finally { setIsProcessing(false); }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="sr-container">

      {/* Catalogue table */}
      <div className="sr-catalogue-area">
        <div className="sr-catalogue-wrapper" style={{position:'relative'}}>
          <table className="sr-catalogue-table">
            <thead>
              <tr><th>Qty</th><th>Item</th><th>Selling Price</th><th>Total</th><th>Edit</th></tr>
            </thead>
            <tbody>
              {catalogue.length === 0 ? (
                <tr><td colSpan="5" className="sr-catalogue-empty">Catalogue is empty</td></tr>
              ) : (
                catalogue.map(item => (
                  <tr key={item.id}>
                    <td className="sr-qty-cell">
                      <input type="number" value={item.qty}
                        onChange={(e) => updateQuantity(item.id, e.target.value)} min="1" />
                    </td>
                    <td>{item.name}</td>
                    <td className="sr-price-cell">{fmt(item.price)}</td>
                    <td className="sr-total-cell">{fmt(item.price * (parseInt(item.qty, 10) || 0))}</td>
                    <td className="sr-edit-cell">
                      <button onClick={() => removeFromCatalogue(item.id)}>×</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="sr-bottom-section">
        <div className="sr-cart-total">
          <span>Total:</span>
          <span className="sr-total-amount">{fmt(calculateTotal())}</span>
        </div>

        {/* Three-button row: Credit | Scanner | Cash */}
        <div className="sr-payment-buttons">
          <button className="sr-btn-credit" onClick={handlePayCredit} disabled={isProcessing}>
            Buy on Credit
          </button>

          <button
            className="sr-btn-scan"
            onClick={scannerActive ? stopScanner : startScanner}
            disabled={isProcessing}
            title="Scan barcode"
          >
            {/* Barcode scanner SVG icon */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7V5a2 2 0 0 1 2-2h2"/>
              <path d="M17 3h2a2 2 0 0 1 2 2v2"/>
              <path d="M21 17v2a2 2 0 0 1-2 2h-2"/>
              <path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
              <line x1="7" y1="7" x2="7" y2="17"/>
              <line x1="10" y1="7" x2="10" y2="17"/>
              <line x1="13" y1="7" x2="13" y2="17"/>
              <line x1="16" y1="7" x2="16" y2="17"/>
            </svg>
          </button>

          <button className="sr-btn-cash" onClick={handlePayCash} disabled={isProcessing}>
            Pay with
          </button>
        </div>

        <div className="sr-search-section">
          <input type="text" className="sr-search-input" placeholder="Type to search goods..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setShowResults(e.target.value.trim().length > 0); }}
            onFocus={() => setShowResults(searchTerm.trim().length > 0)}
            onBlur={() => setTimeout(() => setShowResults(false), 200)}
          />
          {showResults && filteredGoods.length > 0 && (
            <div className="sr-search-results">
              {filteredGoods.map(good => (
                <div key={good.id} className="sr-search-result-item"
                  onMouseDown={(e) => { e.preventDefault(); handleItemClick(good); }}>
                  <span className="sr-item-name">{good.name}{good.size ? <span className="sr-item-size"> · {good.size}</span> : null}</span>
                  <span className="sr-item-price">{fmt(good.price)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Barcode scanner overlay ── */}
      {scannerActive && (
        <div className="sr-scanner-overlay">
          <div className="sr-scanner-modal">
            <div className="sr-scanner-header">
              <span className="sr-scanner-title">Scan Barcode</span>
              <button className="sr-scanner-close" onClick={stopScanner}>✕</button>
            </div>

            <div className="sr-scanner-viewport">
              <video ref={videoRef} className="sr-scanner-video" playsInline muted />
              {/* Targeting reticle */}
              <div className="sr-scanner-reticle">
                <div className="sr-reticle-corner sr-reticle-tl" />
                <div className="sr-reticle-corner sr-reticle-tr" />
                <div className="sr-reticle-corner sr-reticle-bl" />
                <div className="sr-reticle-corner sr-reticle-br" />
                <div className="sr-reticle-line" />
              </div>
            </div>

            <div className="sr-scanner-hint">
              {lastScanned ? (
                lastScanned.matched ? (
                  <span className="sr-scan-success">✓ Added: {lastScanned.name} — scan again for another item</span>
                ) : (
                  <span className="sr-scan-fail">⚠ No product for barcode "{lastScanned.code}" — try again</span>
                )
              ) : (
                <span>Point camera at a barcode</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Scanner error (no BarcodeDetector support or camera permission denied) */}
      {scannerError && !scannerActive && (
        <div className="sr-scanner-overlay">
          <div className="sr-scanner-modal sr-scanner-modal-sm">
            <div className="sr-scanner-header">
              <span className="sr-scanner-title">Scanner Unavailable</span>
              <button className="sr-scanner-close" onClick={() => setScannerError('')}>✕</button>
            </div>
            <div className="sr-scanner-error-body">
              <div className="sr-scanner-error-icon">⚠️</div>
              <p className="sr-scanner-error-msg">{scannerError}</p>
            </div>
            <div className="sr-scanner-error-actions">
              {(scannerError.includes('denied') || scannerError.includes('permission')) && Capacitor.isNativePlatform() && (
                <button
                  className="sr-scanner-settings-btn"
                  onClick={() => {
                    NativeSettings.openAndroid({
                      option: AndroidSettings.ApplicationDetails,
                    });
                  }}
                >Open App Settings</button>
              )}
              <button className="sr-scanner-ok-btn" onClick={() => setScannerError('')}>OK</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Overdue Debt Blocking Modal ── */}
      {overdueModal && (() => {
        const { name, gender, daysOverdue, balance } = overdueModal;
        const prefix = gender === 'Male' ? 'Mr.' : gender === 'Female' ? 'Ms.' : '';
        const salutation = prefix ? `${prefix} ${name}` : name;
        const pronoun = gender === 'Male' ? 'his' : gender === 'Female' ? 'her' : 'their';
        return (
          <div className="sr-modal-overlay">
            <div className="sr-modal-content" style={{ textAlign:'center', position:'relative' }}>
              <button onClick={() => setOverdueModal(null)} style={{position:'absolute',top:'8px',right:'8px',background:'#dc2626',color:'white',border:'none',borderRadius:'50%',width:'22px',height:'22px',cursor:'pointer',fontSize:'13px',lineHeight:'22px',padding:0}}>✕</button>
              <div style={{ fontSize:'40px', marginBottom:'12px' }}>⛔</div>
              <h2 style={{ color:'#dc2626', marginBottom:'12px' }}>Debt Overdue</h2>
              <p style={{ fontSize:'14px', lineHeight:'1.6', color:'#374151', marginBottom:'20px' }}>
                <strong>{salutation}</strong> still needs to pay {pronoun} outstanding debt of{' '}
                <strong style={{ color:'#dc2626' }}>{fmt(balance)}</strong> which has been due{' '}
                <strong style={{ color:'#dc2626' }}>{daysOverdue} day{daysOverdue !== 1 ? 's' : ''}</strong> ago.
                <br/><br/>
                No new credit can be given until the outstanding debt is settled.
              </p>
              <button
                onClick={() => setOverdueModal(null)}
                style={{
                  padding:'10px 28px', background:'#dc2626', color:'white',
                  border:'none', borderRadius:'8px', fontSize:'15px',
                  fontWeight:600, cursor:'pointer',
                }}>
                OK
              </button>
            </div>
          </div>
        );
      })()}
      {showQuantityModal && selectedItem && (() => {
        const stockQty = typeof selectedItem.stock_quantity === 'number' ? selectedItem.stock_quantity : Infinity;
        const isOutOfStock = stockQty === 0;
        return (
          <div className="sr-modal-overlay">
            <div className="sr-modal-content">
              <h2>Add to Cart</h2>
              <p><strong>{selectedItem.name}</strong></p>
              <p className="sr-item-price-display">Price: {fmt(selectedItem.price)}</p>
              {isOutOfStock ? (
                <p style={{color:'#dc2626',fontWeight:700,fontSize:'15px',margin:'12px 0',textAlign:'center'}}>Out of Stock</p>
              ) : (
                <div className="sr-quantity-input-section">
                  <label htmlFor="quantity-input">Quantity:</label>
                  <input type="number" id="quantity-input" className="sr-quantity-input"
                    value={quantityToAdd} onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') { setQuantityToAdd(''); return; }
                      const n = parseInt(val, 10);
                      if (!isNaN(n) && n > stockQty) {
                        setQuantityToAdd(String(stockQty));
                        alert(`Only ${stockQty} available in stock.`);
                      } else {
                        setQuantityToAdd(val);
                      }
                    }}
                    placeholder={`Max ${stockQty}`} min="1" max={stockQty} autoFocus />
                  {stockQty !== Infinity && <p style={{fontSize:'12px',color:'#6b7280',margin:'4px 0 0'}}>Available: {stockQty}</p>}
                </div>
              )}
              <div className="sr-modal-buttons">
                <button className="sr-btn-cancel" onClick={() => { setShowQuantityModal(false); setSelectedItem(null); setQuantityToAdd(''); }}>Cancel</button>
                {!isOutOfStock && <button className="sr-btn-confirm" onClick={confirmAddItem}>Add to Cart</button>}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Payment Method modal ── */}
      {showPaymentMethodModal && (() => {
        const select = (key) => setSelectedPaymentMethods({ cash: false, ib: false, mpaisa: false, [key]: true });
        return (
          <div className="sr-modal-overlay">
            <div className="sr-modal-content" style={{ maxWidth: '320px' }}>
              <h2 style={{ marginBottom: '6px' }}>Payment Method</h2>
              <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '18px' }}>Select one:</p>
              {[['cash', '💵 Cash'], ['ib', '🏦 IB'], ['mpaisa', '📱 MPAiSA']].map(([key, label]) => {
                const isSelected = selectedPaymentMethods[key];
                return (
                  <div key={key} onClick={() => select(key)} style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '12px 14px', marginBottom: '8px', borderRadius: '10px', cursor: 'pointer',
                    border: `2px solid ${isSelected ? '#667eea' : '#e5e7eb'}`,
                    background: isSelected ? '#eef2ff' : 'var(--surface)',
                    transition: 'all 0.15s',
                    userSelect: 'none',
                  }}>
                    {/* Custom tick box */}
                    <div style={{
                      width: '22px', height: '22px', borderRadius: '6px', flexShrink: 0,
                      border: `2px solid ${isSelected ? '#667eea' : '#d1d5db'}`,
                      background: isSelected ? '#667eea' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s',
                    }}>
                      {isSelected && (
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                          <polyline points="2,7 5,10 11,3" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <span style={{ fontSize: '15px', fontWeight: 600, color: isSelected ? '#4338ca' : '#374151' }}>
                      {label}
                    </span>
                  </div>
                );
              })}
              <div className="sr-modal-buttons" style={{ marginTop: '20px' }}>
                <button className="sr-btn-cancel" onClick={() => setShowPaymentMethodModal(false)}>Cancel</button>
                <button className="sr-btn-confirm" onClick={confirmPaymentMethod}>OK</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Bank Transfer ID modal (IB) ── */}
      {showIbRefModal && (
        <div className="sr-modal-overlay">
          <div className="sr-modal-content" style={{ maxWidth: '320px' }}>
            <h2 style={{ marginBottom: '6px' }}>Bank Transfer ID</h2>
            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
              Enter the reference for this internet banking transfer.
            </p>
            <input
              className="sr-ref-input"
              type="text"
              placeholder="Enter Transfer Ref here"
              value={transferRef}
              onChange={e => setTransferRef(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirmIbPayment()}
              autoFocus
              style={{
                width: '100%', padding: '11px 13px', fontSize: '15px',
                border: '1.5px solid #d1d5db', borderRadius: '9px',
                outline: 'none', boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />
            <div className="sr-modal-buttons" style={{ marginTop: '20px' }}>
              <button className="sr-btn-cancel" onClick={() => { setShowIbRefModal(false); setTransferRef(''); }}>Cancel</button>
              <button className="sr-btn-confirm" onClick={confirmIbPayment}>OK</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MPAiSA Transfer ID modal ── */}
      {showMpaisaRefModal && (
        <div className="sr-modal-overlay">
          <div className="sr-modal-content" style={{ maxWidth: '320px' }}>
            <h2 style={{ marginBottom: '6px' }}>MPAiSA Transfer ID</h2>
            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
              Enter the ID for this MPAiSA transfer.
            </p>
            <input
              className="sr-ref-input"
              type="text"
              placeholder="Enter Transfer ID here"
              value={transferRef}
              onChange={e => setTransferRef(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirmMpaisaPayment()}
              autoFocus
              style={{
                width: '100%', padding: '11px 13px', fontSize: '15px',
                border: '1.5px solid #d1d5db', borderRadius: '9px',
                outline: 'none', boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />
            <div className="sr-modal-buttons" style={{ marginTop: '20px' }}>
              <button className="sr-btn-cancel" onClick={() => { setShowMpaisaRefModal(false); setTransferRef(''); }}>Cancel</button>
              <button className="sr-btn-confirm" onClick={confirmMpaisaPayment}>OK</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cash confirm popup ── */}
      {showCashPopup && (() => {
        const total = calculateTotal();
        const given = parseFloat(customerMoney) || 0;
        const change = given - total;
        const changeValid = given > 0;

        return (
          <div className="sr-modal-overlay">
            <div className="sr-modal-content sr-cash-confirm-modal">

              {/* Calculator icon button — opens change calculator */}
              <div className="sr-calc-icon-row">
                <button
                  className="sr-calc-icon-btn"
                  onClick={() => { setShowChangeCalc(true); setCustomerMoney(''); }}
                  title="Open change calculator"
                >
                  <Calculator size={32} strokeWidth={1.5} />
                </button>
                <span className="sr-calc-icon-hint">Tap to calculate change</span>
              </div>

              <h2>Confirm Payment</h2>
              <p>Are you sure you want to proceed with this cash payment?</p>
              <p className="sr-confirm-total">Total: <strong>{fmt(total)}</strong></p>

              <div className="sr-modal-buttons">
                <button className="sr-btn-cancel" onClick={() => {
                  setShowCashPopup(false);
                  setShowChangeCalc(false);
                  setCustomerMoney('');
                }}>Cancel</button>
                <button className="sr-btn-confirm" onClick={confirmCashPayment}>Confirm</button>
              </div>

              {/* ── Change Calculator child modal ── */}
              {showChangeCalc && (
                <div className="sr-change-overlay">
                  <div className="sr-change-modal">

                    {/* Change to give — displayed at top, auto-computed */}
                    <div className="sr-change-result">
                      <span className="sr-change-label">Change to give customer</span>
                      <span className={`sr-change-amount ${changeValid ? (change < 0 ? 'sr-change-short' : 'sr-change-ok') : 'sr-change-empty'}`}>
                        {changeValid
                          ? (change < 0
                              ? `–$${Math.abs(change).toFixed(2)} (short)`
                              : `$${change.toFixed(2)}`)
                          : '—'}
                      </span>
                    </div>

                    {/* Customer's Money input */}
                    <div className="sr-change-field">
                      <label className="sr-change-field-label">Customer's Money</label>
                      <input
                        type="number"
                        className="sr-change-input"
                        placeholder={`e.g. ${(Math.ceil(total / 5) * 5).toFixed(2)}`}
                        value={customerMoney}
                        min="0"
                        step="0.01"
                        onChange={e => setCustomerMoney(e.target.value)}
                        onFocus={e => e.target.select()}
                        autoFocus
                      />
                    </div>

                    {/* Cart total reminder */}
                    <div className="sr-change-total-row">
                      <span>Cart Total</span>
                      <span className="sr-change-total-val">{fmt(total)}</span>
                    </div>

                    {/* Close button — bottom right */}
                    <div className="sr-change-footer">
                      <button className="sr-change-close-btn" onClick={() => {
                        setShowChangeCalc(false);
                        setCustomerMoney('');
                      }}>Close</button>
                    </div>

                  </div>
                </div>
              )}

            </div>
          </div>
        );
      })()}

      {/* ── Buy on Credit modal ── */}
      {showCreditModal && (() => {
        const { existingDueDate } = getDebtorStatus();
        const balance = selectedDebtorObj ? (selectedDebtorObj.balance || selectedDebtorObj.totalDue || 0) : 0;
        const isLocked = !!existingDueDate && balance > 0;
        const totalAmount = calculateTotal();

        // Ordinal suffix helper
        const ordinal = (n) => {
          const s = ['th','st','nd','rd'], v = n % 100;
          return n + (s[(v-20)%10] || s[v] || s[0]);
        };
        const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

        // Build the bold repayment note
        const buildNote = () => {
          const finalDate = isLocked ? existingDueDate : repaymentDate;
          if (!finalDate || !selectedDebtorObj) return null;
          const prefix = selectedDebtorObj.gender === 'Male' ? 'Mr.' : selectedDebtorObj.gender === 'Female' ? 'Ms.' : '';
          const dName = selectedDebtorObj.name || selectedDebtorObj.customerName || '';
          const salutation = prefix ? `${prefix} ${dName}` : dName;
          const totalOwed = balance + totalAmount;
          const today = new Date(); today.setHours(0,0,0,0);
          const due = new Date(finalDate); due.setHours(0,0,0,0);
          const daysUntil = Math.ceil((due - today) / (1000*60*60*24));
          const formatted = `${ordinal(due.getDate())} ${MONTHS[due.getMonth()]} ${due.getFullYear()}`;
          return `If this debt entry is saved then ${salutation} must pay ${fmt(totalOwed)} within ${daysUntil} day${daysUntil !== 1 ? 's' : ''} or not later than ${formatted}`;
        };
        const repaymentNote = buildNote();

        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

        return (
          <div className="sr-modal-overlay">
            <div className="sr-modal-content">
              <h2>Buy on Credit</h2>
              <form className="sr-credit-form" onSubmit={confirmCreditSale}>

                {/* ── Debtor Name — searchable, only list values selectable ── */}
                <div style={{ position:'relative', marginBottom:'12px' }}>
                  <label style={{ display:'block', marginBottom:'4px', fontWeight:600 }}>Debtor Name:</label>
                  <div style={{ position:'relative' }}>
                    <input
                      type="text"
                      placeholder={selectedDebtorId ? '' : 'Search and select debtor'}
                      value={selectedDebtorId ? customerName : customerName}
                      readOnly={!!selectedDebtorId}
                      onChange={(e) => {
                        if (selectedDebtorId) return;
                        const val = e.target.value;
                        setCustomerName(val);
                        const f = existingDebtors.filter(d =>
                          (d.name || d.customerName || '').toLowerCase().includes(val.toLowerCase())
                        );
                        setFilteredDebtors(f);
                        setShowDebtorSuggestions(f.length > 0);
                      }}
                      onFocus={() => {
                        if (!selectedDebtorId) {
                          setFilteredDebtors(existingDebtors);
                          setShowDebtorSuggestions(existingDebtors.length > 0);
                          setCustomerName('');
                        }
                      }}
                      style={{
                        width:'100%', padding:'8px 36px 8px 10px', boxSizing:'border-box',
                        border:`1.5px solid ${selectedDebtorId ? '#667eea' : (creditErrors['credit_debtor'] ? '#f59e0b' : '#ccc')}`,
                        borderRadius:'6px', fontSize:'14px', color:'#1f2937',
                        backgroundColor: selectedDebtorId ? '#f0f7ff' : 'var(--surface)',
                        cursor: selectedDebtorId ? 'default' : 'text',
                        ...(creditErrors['credit_debtor'] && !selectedDebtorId ? {boxShadow:'0 0 0 2px rgba(245,158,11,0.2)'} : {}),
                      }}
                      data-field="credit_debtor"
                    />
                    {selectedDebtorId ? (
                      <button type="button" onClick={clearDebtorSelection}
                        style={{ position:'absolute', right:'8px', top:'50%', transform:'translateY(-50%)',
                          background:'none', border:'none', cursor:'pointer', fontSize:'18px', color:'#999', lineHeight:1 }}>×</button>
                    ) : (
                      <span style={{ position:'absolute', right:'10px', top:'50%', transform:'translateY(-50%)',
                        color:'#9ca3af', pointerEvents:'none', fontSize:'12px' }}>▼</span>
                    )}
                  </div>

                  {showDebtorSuggestions && filteredDebtors.length > 0 && (
                    <div style={{
                      position:'absolute', top:'100%', left:0, right:0, zIndex:1000,
                      background:'var(--surface)', color:'var(--text-primary)', border:'1px solid var(--border)', borderRadius:'6px',
                      maxHeight:'200px', overflowY:'auto', boxShadow:'0 4px 12px rgba(0,0,0,0.15)',
                    }}>
                      {filteredDebtors.map((debtor) => {
                        const bal = debtor.balance || debtor.totalDue || 0;
                        const rep = debtor.repaymentDate;
                        let isOverdue = false, daysOD = 0;
                        if (rep && bal > 0) {
                          const t = new Date(); t.setHours(0,0,0,0);
                          const d = new Date(rep); d.setHours(0,0,0,0);
                          daysOD = Math.floor((t - d) / 86400000);
                          isOverdue = daysOD > 0;
                        }
                        return (
                          <div key={debtor.id}
                            onMouseDown={(e) => { e.preventDefault(); selectDebtor(debtor); }}
                            style={{ padding:'10px 12px', cursor:'pointer', borderBottom:'1px solid #eee',
                              backgroundColor: isOverdue ? '#fff5f5' : 'var(--surface)' }}
                            onMouseEnter={e => e.currentTarget.style.background = isOverdue ? '#ffe8e8' : '#f5f5f5'}
                            onMouseLeave={e => e.currentTarget.style.background = isOverdue ? '#fff5f5' : 'var(--surface)'}
                          >
                            <div style={{ fontWeight:600, color: isOverdue ? '#dc2626' : 'var(--text-primary)' }}>
                              {debtor.name || debtor.customerName}
                              {isOverdue && <span style={{ fontSize:'11px', marginLeft:'6px', fontWeight:400 }}>⚠️ overdue</span>}
                            </div>
                            <div style={{ fontSize:'12px', color:'#888' }}>
                              Balance: {fmt(bal)}{rep && <span style={{ marginLeft:'8px' }}>· Due: {rep}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {showDebtorSuggestions && (
                    <div style={{ position:'fixed', inset:0, zIndex:999 }}
                      onClick={() => setShowDebtorSuggestions(false)} />
                  )}
                  {existingDebtors.length === 0 && (
                    <p style={{ fontSize:'12px', color:'#c00', marginTop:'4px' }}>
                      No registered debtors found. Add one in the Debtors section first.
                    </p>
                  )}
                  <ValidationNote field="credit_debtor" errors={creditErrors} />
                </div>

                {/* ── Repayment Date ── */}
                <div style={{ marginBottom:'12px' }}>
                  <label htmlFor="repayment-date" style={{ display:'block', marginBottom:'4px', fontWeight:600 }}>
                    Repayment Date:
                  </label>
                  <input
                    type="date"
                    id="repayment-date"
                    value={isLocked ? existingDueDate : repaymentDate}
                    min={todayStr}
                    max={getRepaymentMaxStr()}
                    onChange={(e) => { if (!isLocked) { setRepaymentDate(e.target.value); clearCreditError('credit_date'); } }}
                    disabled={!selectedDebtorId || isLocked}
                    required
                    data-field="credit_date"
                    style={{
                      width:'100%', padding:'8px 10px', boxSizing:'border-box',
                      border: creditErrors['credit_date'] ? '1.5px solid #f59e0b' : '1.5px solid #ccc',
                      borderRadius:'6px',
                      backgroundColor: (!selectedDebtorId || isLocked) ? '#f3f4f6' : 'var(--surface)',
                      cursor: (!selectedDebtorId || isLocked) ? 'not-allowed' : 'pointer',
                      ...(creditErrors['credit_date'] ? {boxShadow:'0 0 0 2px rgba(245,158,11,0.2)'} : {}),
                    }}
                  />
                  <ValidationNote field="credit_date" errors={creditErrors} />
                  {!selectedDebtorId && (
                    <p style={{ fontSize:'11px', color:'#9ca3af', marginTop:'3px' }}>Select a debtor first.</p>
                  )}
                  {selectedDebtorId && isLocked && (
                    <p style={{ fontSize:'11px', color:'#c00', marginTop:'3px' }}>
                      ⚠️ Locked to existing due date: {existingDueDate}. Debt must be fully cleared before a new date can be set.
                    </p>
                  )}
                  {selectedDebtorId && !isLocked && (
                    <p style={{ fontSize:'11px', color:'#888', marginTop:'3px' }}>
                      {balance === 0 ? 'Select any date within 14 days from today.' : 'Select a date up to 14 days from today.'}
                    </p>
                  )}
                  {repaymentNote && (
                    <p style={{ fontSize:'12px', fontWeight:700, color:'#1e3a8a', marginTop:'8px', lineHeight:1.55,
                      padding:'8px 10px', background:'#eff6ff', borderRadius:'6px', border:'1px solid #bfdbfe' }}>
                      {repaymentNote}
                    </p>
                  )}
                </div>

                <div className="sr-photo-section">
                  <label>Photo of Credit Book <span style={{color:'#888',fontWeight:400,fontSize:'12px'}}>(optional)</span></label>
                  <button type="button" className="sr-btn-photo" onClick={takeCreditPhoto}>
                    {capturedPhoto ? '📷 Retake Photo' : '📷 Take Photo'}
                  </button>
                  {capturedPhoto && <img src={capturedPhoto} alt="Credit book" className="sr-photo-preview" />}
                </div>

                <div className="sr-modal-buttons">
                  <button type="button" className="sr-btn-cancel" onClick={closeCreditModal}>Cancel</button>
                  <button type="submit" className="sr-btn-confirm" disabled={isProcessing || !selectedDebtorId}>Save</button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default Checkout;