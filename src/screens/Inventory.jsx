import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, ZoomIn, Camera, Upload, Check, Crop, RotateCcw, Save, Pencil, FileText } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import dataService from '../services/dataService';
import { logAction } from '../services/activityLogger';
import { useCurrency } from '../hooks/useCurrency';
import './Inventory.css';

/* ─────────────────────────────────────────────────────────────
   Portal
───────────────────────────────────────────────────────────── */
function Portal({ children }) {
  return createPortal(children, document.body);
}

/* ─────────────────────────────────────────────────────────────
   Overlay — dismiss on outside click/tap
───────────────────────────────────────────────────────────── */
function Overlay({ className, onDismiss, children }) {
  const handlePointerDown = (e) => { if (e.target === e.currentTarget) onDismiss(); };
  const handleClick       = (e) => { if (e.target === e.currentTarget) onDismiss(); };
  return (
    <div className={className} onPointerDown={handlePointerDown} onClick={handleClick}>
      {children}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Image Cropper
───────────────────────────────────────────────────────────── */
function ImageCropper({ src, onCrop, onCancel }) {
  const imgRef = useRef(null);
  const containerRef = useRef(null);
  const [crop, setCrop] = useState({ x: 20, y: 20, w: 60, h: 60 });
  const [dragging, setDragging] = useState(null);
  const [startPos, setStartPos] = useState(null);
  const [startCrop, setStartCrop] = useState(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  const getRelativePos = (e, el) => {
    const rect = el.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  };

  const onMouseDown = (e, action) => {
    e.preventDefault();
    setDragging(action);
    setStartPos(getRelativePos(e, containerRef.current));
    setStartCrop({ ...crop });
  };

  const onMouseMove = (e) => {
    if (!dragging || !startPos) return;
    const pos = getRelativePos(e, containerRef.current);
    const dx = pos.x - startPos.x;
    const dy = pos.y - startPos.y;
    setCrop(() => {
      let { x, y, w, h } = startCrop;
      if (dragging === 'move') {
        x = clamp(x + dx, 0, 100 - w); y = clamp(y + dy, 0, 100 - h);
      } else if (dragging === 'resize-se') {
        w = clamp(w + dx, 10, 100 - x); h = clamp(h + dy, 10, 100 - y);
      } else if (dragging === 'resize-sw') {
        const nx = clamp(x + dx, 0, x + w - 10);
        w = clamp(w - dx, 10, 100); x = nx; h = clamp(h + dy, 10, 100 - y);
      } else if (dragging === 'resize-ne') {
        const ny = clamp(y + dy, 0, y + h - 10);
        h = clamp(h - dy, 10, 100); y = ny; w = clamp(w + dx, 10, 100 - x);
      } else if (dragging === 'resize-nw') {
        const nx = clamp(x + dx, 0, x + w - 10);
        const ny = clamp(y + dy, 0, y + h - 10);
        w = clamp(w - dx, 10, 100); h = clamp(h - dy, 10, 100); x = nx; y = ny;
      }
      return { x, y, w, h };
    });
  };

  const onMouseUp = () => { setDragging(null); setStartPos(null); };

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('touchmove', onMouseMove, { passive: false });
      window.addEventListener('touchend', onMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onMouseMove);
      window.removeEventListener('touchend', onMouseUp);
    };
  }, [dragging]);

  const applyCrop = () => {
    const img = imgRef.current; if (!img) return;
    const canvas = document.createElement('canvas');
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const sx = (crop.x / 100) * iw, sy = (crop.y / 100) * ih;
    const sw = (crop.w / 100) * iw, sh = (crop.h / 100) * ih;
    canvas.width = sw; canvas.height = sh;
    canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    onCrop(canvas.toDataURL('image/jpeg', 0.92));
  };

  return (
    <Portal>
      <Overlay className="cropper-overlay" onDismiss={onCancel}>
        <div className="cropper-dialog">
          <div className="cropper-header">
            <h3><Crop size={18} /> Crop Image</h3>
            <button className="cropper-close" onClick={onCancel}><X size={20} /></button>
          </div>
          <p className="cropper-hint">Drag the box to reposition. Drag corners to resize.</p>
          <div className="cropper-container" ref={containerRef} style={{ userSelect: 'none' }}>
            <img ref={imgRef} src={src} alt="crop" className="cropper-img"
              onLoad={() => setImgLoaded(true)} draggable={false} />
            {imgLoaded && (
              <>
                <div className="cropper-mask cropper-mask-top" style={{ height: `${crop.y}%` }} />
                <div className="cropper-mask cropper-mask-bottom" style={{ top: `${crop.y + crop.h}%`, height: `${100 - crop.y - crop.h}%` }} />
                <div className="cropper-mask cropper-mask-left" style={{ top: `${crop.y}%`, height: `${crop.h}%`, width: `${crop.x}%` }} />
                <div className="cropper-mask cropper-mask-right" style={{ top: `${crop.y}%`, height: `${crop.h}%`, left: `${crop.x + crop.w}%`, width: `${100 - crop.x - crop.w}%` }} />
                <div className="cropper-box"
                  style={{ left: `${crop.x}%`, top: `${crop.y}%`, width: `${crop.w}%`, height: `${crop.h}%` }}
                  onMouseDown={(e) => onMouseDown(e, 'move')}
                  onTouchStart={(e) => onMouseDown(e, 'move')}>
                  {['nw', 'ne', 'sw', 'se'].map(c => (
                    <div key={c} className={`cropper-handle cropper-handle-${c}`}
                      onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, `resize-${c}`); }}
                      onTouchStart={(e) => { e.stopPropagation(); onMouseDown(e, `resize-${c}`); }} />
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="cropper-actions">
            <button className="cropper-btn cropper-btn-cancel" onClick={onCancel}><RotateCcw size={16} /> Cancel</button>
            <button className="cropper-btn cropper-btn-apply" onClick={applyCrop}><Check size={16} /> Apply Crop</button>
          </div>
        </div>
      </Overlay>
    </Portal>
  );
}

/* ─────────────────────────────────────────────────────────────
   Category Select
───────────────────────────────────────────────────────────── */
const DEFAULT_CATEGORIES = [
  'Baked Goods', 'Batteries', 'Beverages', 'Canned Food',
  'Cleaning Supplies', 'Clothes', 'Dairy', 'Fresh Meats',
  'Hardware', 'Personal Care', 'Pet Supplies', 'Produce',
  'Sewing Supplies', 'Snacks', 'Spices', 'Tobacco', 'Toiletries',
];

const DEFAULT_STORAGE_AREAS = [
  { key: 'container',     label: 'Container',     emoji: '📦', pcsOnly: false },
  { key: 'storeroom',     label: 'Storeroom',     emoji: '🗄️', pcsOnly: false },
  { key: 'tent',          label: 'Tent',          emoji: '⛺', pcsOnly: true  },
  { key: 'tent_in_store', label: 'Tent in Store', emoji: '🧺', pcsOnly: true  },
];

function CategorySelect({ value, onChange, categories }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef(null);
  const filtered = (categories || DEFAULT_CATEGORIES).filter(c => c.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false); setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (cat) => { onChange(cat); setOpen(false); setSearch(''); };

  return (
    <div className="cat-select-wrapper" ref={wrapperRef}>
      <input
        className="inv-input"
        placeholder="Select Category"
        value={open ? search : value}
        onFocus={() => { setOpen(true); setSearch(''); }}
        onChange={e => setSearch(e.target.value)}
        autoComplete="off"
      />
      {value && !open && (
        <button className="cat-clear-btn" onClick={() => { onChange(''); setSearch(''); }} type="button">
          <X size={14} />
        </button>
      )}
      {open && (
        <ul className="cat-dropdown">
          {filtered.length === 0 ? (
            <li className="cat-option cat-no-match">No match</li>
          ) : (
            filtered.map(cat => (
              <li key={cat}
                className={`cat-option${value === cat ? ' cat-option-active' : ''}`}
                onMouseDown={() => select(cat)}>
                {cat}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   StockWarningModal
───────────────────────────────────────────────────────────── */
function StockWarningModal({ onContinue, onCancel }) {
  return (
    <Portal>
      <Overlay className="inv-modal-overlay inv-confirm-overlay" onDismiss={onCancel}>
        <div className="inv-confirm-dialog inv-stock-warning-dialog" onPointerDown={e => e.stopPropagation()}>
          <p className="inv-stock-warning-title">⚠ WARNING</p>
          <p className="inv-stock-warning-body">
            This field is only best edited <strong>during the first time the business uses the system</strong>.
            Editing it afterwards may cause <strong>imbalanced records</strong> — some records might no longer make sense
            across inventory counts, sales history, and purchase reconciliations.
          </p>
          <p className="inv-stock-warning-sub">Would you still like to proceed?</p>
          <div className="inv-confirm-actions">
            <button className="inv-confirm-yes" onClick={onContinue}>Yes, Proceed</button>
            <button className="inv-confirm-no" onClick={onCancel}>No, Cancel</button>
          </div>
        </div>
      </Overlay>
    </Portal>
  );
}

/* ─────────────────────────────────────────────────────────────
   Shared barcode capture helpers (used by both modals)
───────────────────────────────────────────────────────────── */
async function captureImage(source = 'camera') {
  if (!Capacitor.isNativePlatform()) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*';
      input.onchange = (e) => {
        const file = e.target.files[0]; if (!file) return resolve(null);
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target.result);
        reader.readAsDataURL(file);
      };
      input.click();
    });
  } else {
    try {
      const { Camera: CapCamera } = await import('@capacitor/camera');
      const image = await CapCamera.getPhoto({
        quality: 90, allowEditing: false, resultType: 'dataUrl',
        ...(source === 'gallery' ? { source: 'PHOTOS' } : {}),
      });
      return image.dataUrl;
    } catch { return null; }
  }
}

/* ─────────────────────────────────────────────────────────────
   Edit Product Modal
───────────────────────────────────────────────────────────── */
function EditProductModal({ good, onUpdate, onDelete, onCancel, categories }) {
  const [form, setForm] = useState({
    name:           good.name           || '',
    size:           good.size           || '',
    category:       good.category       || '',
    price:          good.price          !== undefined ? good.price : '',
    cost_price:     good.cost_price     !== undefined ? good.cost_price : '',
    stock_quantity: good.stock_quantity !== undefined ? good.stock_quantity : '',
    barcodeImage:   good.barcodeImage   || good.barcode_image || good.barcodeUrl || good.barcode_url || null,
  });
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cropSrc,  setCropSrc]  = useState(null);
  const [showStockWarning, setShowStockWarning] = useState(false);
  const [stockFieldUnlocked, setStockFieldUnlocked] = useState(false);
  const stockInputRef = useRef(null);

  const handleUpdate = async () => {
    if (!(form.name || '').trim()) { alert('Product Name is required'); return; }
    if (!(form.size || '').trim()) { alert('Size is required'); return; }
    if (form.price === '' || form.price === null || form.price === undefined) { alert('Selling price is required'); return; }
    if (!form.category || !form.category.trim()) { alert('Category is required'); return; }
    setSaving(true);
    try {
      await onUpdate(good.id, {
        name:           (form.name || '').trim(),
        size:           (form.size || '').trim(),
        category:       form.category,
        price:          parseFloat(form.price) || 0,
        cost_price:     form.cost_price !== '' ? parseFloat(form.cost_price) : null,
        stock_quantity: parseInt(form.stock_quantity) || 0,
        barcodeImage:   form.barcodeImage || null,
      });
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${good.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try { await onDelete(good.id); } finally { setDeleting(false); }
  };

  const busy = saving || deleting;

  return (
    <>
      {cropSrc && (
        <ImageCropper
          src={cropSrc}
          onCrop={(url) => { setForm(p => ({ ...p, barcodeImage: url })); setCropSrc(null); }}
          onCancel={() => setCropSrc(null)}
        />
      )}
      {showStockWarning && (
        <StockWarningModal
          onContinue={() => {
            setShowStockWarning(false); setStockFieldUnlocked(true);
            setTimeout(() => { if (stockInputRef.current) stockInputRef.current.focus(); }, 100);
          }}
          onCancel={() => setShowStockWarning(false)}
        />
      )}
      <Portal>
        <Overlay className="inv-modal-overlay" onDismiss={onCancel}>
          <div className="inv-modal-content" onPointerDown={e => e.stopPropagation()}>
            <div className="inv-modal-header">
              <h2>Edit Product</h2>
              <button className="inv-modal-close" onClick={onCancel}><X size={20} /></button>
            </div>
            <div className="inv-modal-body">
              <div className="inv-edit-form">

                <div className="inv-form-group">
                  <label>Product Name *</label>
                  <input className="inv-input" value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="Full product name" />
                </div>

                <div className="inv-form-group">
                  <label>Size * <span className="inv-label-hint">(e.g. 1kg, 300g, 1L, 500ml)</span></label>
                  <input className="inv-input" value={form.size}
                    onChange={e => setForm(p => ({ ...p, size: e.target.value }))}
                    placeholder="e.g. 1kg, 300g, 1L" />
                </div>

                <div className="inv-form-group">
                  <label>Category *</label>
                  <CategorySelect value={form.category} onChange={val => setForm(p => ({ ...p, category: val }))} categories={categories} />
                </div>

                <div className="inv-form-row">
                  <div className="inv-form-group">
                    <label>Selling Price *</label>
                    <input className="inv-input" type="number" min="0" step="0.01"
                      value={form.price ?? ''} placeholder="0.00"
                      onChange={e => setForm(p => ({ ...p, price: e.target.value }))} />
                  </div>
                  <div className="inv-form-group">
                    <label>Cost Price <span className="inv-label-hint">(optional)</span></label>
                    <input className="inv-input" type="number" min="0" step="0.01"
                      value={form.cost_price ?? ''} placeholder="0.00"
                      onChange={e => setForm(p => ({ ...p, cost_price: e.target.value }))} />
                  </div>
                </div>
                <div className="inv-form-row">
                  <div className="inv-form-group" style={{flex:1}}>
                    <label>Stock Qty</label>
                    <input className="inv-input" type="number" min="0"
                      value={form.stock_quantity ?? ''} placeholder="0"
                      ref={stockInputRef}
                      onPointerDown={() => { if (!stockFieldUnlocked) setShowStockWarning(true); }}
                      onChange={e => setForm(p => ({ ...p, stock_quantity: e.target.value }))} />
                  </div>
                </div>

                <div className="inv-form-group">
                  <label>Barcode Image <span className="inv-label-hint">(optional)</span></label>
                  <div className="inv-barcode-actions">
                    <button className="inv-barcode-btn" type="button"
                      onClick={async () => { const src = await captureImage('camera'); if (src) setCropSrc(src); }}>
                      <Camera size={16} /> Camera
                    </button>
                    <button className="inv-barcode-btn inv-barcode-btn-secondary" type="button"
                      onClick={async () => { const src = await captureImage('gallery'); if (src) setCropSrc(src); }}>
                      <Upload size={16} /> Gallery
                    </button>
                  </div>
                  {form.barcodeImage && (
                    <div className="inv-barcode-preview">
                      <img src={form.barcodeImage} alt="Barcode preview" />
                      <div className="inv-barcode-preview-actions">
                        <button className="inv-barcode-crop-btn" type="button" onClick={() => setCropSrc(form.barcodeImage)}>
                          <Crop size={14} /> Crop
                        </button>
                        <button className="inv-barcode-remove" type="button" onClick={() => setForm(p => ({ ...p, barcodeImage: null }))}>
                          <X size={14} /> Remove
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3 inline action buttons */}
                <div className="inv-edit-actions-row">
                  <button className="inv-edit-cancel-btn" type="button" onClick={onCancel} disabled={busy}>
                    Cancel
                  </button>
                  <button className="inv-edit-delete-btn" type="button" onClick={handleDelete} disabled={busy}>
                    {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                  <button className="inv-edit-update-btn" type="button" onClick={handleUpdate} disabled={busy}>
                    <Save size={15} /> {saving ? 'Saving…' : 'Update'}
                  </button>
                </div>

              </div>
            </div>
          </div>
        </Overlay>
      </Portal>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   Search / filter logic
───────────────────────────────────────────────────────────── */
function filterAndSort(goods, term) {
  if (!term) return goods;
  const q = term.toLowerCase().trim();
  if (!q) return goods;
  const tier1 = [], tier2 = [], tier3 = [];
  for (const g of goods) {
    const name  = (g.name || '').toLowerCase();
    const words = name.split(/\s+/);
    if (name.startsWith(q))                               tier1.push(g);
    else if (words.length >= 2 && words[1].startsWith(q)) tier2.push(g);
    else if (words.length >= 3 && words[2].startsWith(q)) tier3.push(g);
  }
  const alpha = (a, b) => (a.name || '').localeCompare(b.name || '');
  return [...tier1.sort(alpha), ...tier2.sort(alpha), ...tier3.sort(alpha)];
}

function filterAssets(assets, term) {
  if (!term) return assets;
  const q = term.toLowerCase().trim();
  if (!q) return assets;
  return assets.filter(a => (a.name || '').toLowerCase().includes(q));
}

/* ─────────────────────────────────────────────────────────────
   Main Inventory Component
───────────────────────────────────────────────────────────── */
function Inventory() {
  const { fmt } = useCurrency();

  const [activeTab, setActiveTab] = useState('goods');

  const [goods, setGoods] = useState([]);
  const [goodsLoading, setGoodsLoading] = useState(true);
  const [goodsLastSynced, setGoodsLastSynced] = useState(null);
  const [editingGood, setEditingGood] = useState(null);

  const [assets, setAssets] = useState([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsLastSynced, setAssetsLastSynced] = useState(null);

  // Commission state
  const [commissionGoods, setCommissionGoods] = useState([]);
  const [commissionLoading, setCommissionLoading] = useState(false);
  const [showCommissionModal, setShowCommissionModal] = useState(false);
  const [editCommission, setEditCommission] = useState(null);
  const [commissionForm, setCommissionForm] = useState({ name: '', sellingPrice: '', commissionRate: '', ownerName: '', stock: '', notes: '' });

  // Asset detail modal
  const [assetDetailItem, setAssetDetailItem] = useState(null);

  // ── Catalogue settings (categories + storage areas from Firestore) ──────────
  const [catalogueCategories, setCatalogueCategories] = useState(DEFAULT_CATEGORIES);
  const [catalogueAreas,      setCatalogueAreas]      = useState(DEFAULT_STORAGE_AREAS);

  useEffect(() => {
    dataService.getCatalogueSettings().then(cs => {
      if (!cs) return;
      if (Array.isArray(cs.categories)   && cs.categories.length)   setCatalogueCategories(cs.categories);
      if (Array.isArray(cs.storageAreas) && cs.storageAreas.length) setCatalogueAreas(cs.storageAreas);
    });
  }, []);

  // ── Storage-area tabs: driven by catalogue settings ───────────────────────
  // 'singles' is a shopkeeper-only special tab — always appended
  const AREA_TABS = [...catalogueAreas.map(a => a.key), 'singles'];
  const [areaItems,   setAreaItems]   = useState({});
  const [areaLoading, setAreaLoading] = useState({});
  const [areaLastSynced, setAreaLastSynced] = useState({});
  const [showAreaAddModal,  setShowAreaAddModal]  = useState(false);
  const [editingAreaItem,   setEditingAreaItem]   = useState(null);
  const AREA_FORM_BLANK = { name:'', barcode:'', quantity:'', pcs:'', size:'', price:'', notes:'', unitsPerPack:'' };
  const [areaForm, setAreaForm] = useState(AREA_FORM_BLANK);
  const [areaSaving, setAreaSaving] = useState(false);

  // ── Move Stock modal ─────────────────────────────────────────────────────
  const [showMoveModal,  setShowMoveModal]  = useState(false);
  const [moveSourceTab,  setMoveSourceTab]  = useState(null);
  const [moveItem,       setMoveItem]       = useState(null);   // selected item to move
  const [moveSearchTerm, setMoveSearchTerm] = useState('');
  const [moveQty,        setMoveQty]        = useState('');
  const [moveDestTab,    setMoveDestTab]    = useState('');
  const [moveUnitName,   setMoveUnitName]   = useState('');     // unit label for Singles (e.g. "roll")
  const [moveSellWhole,  setMoveSellWhole]  = useState(false);  // true = sell bag as-is; false = break into units
  const [moveSaving,     setMoveSaving]     = useState(false);

  // Extract a singular unit name from a size/pack string e.g. "25 rolls" → "roll"
  const parseUnitName = (sizeStr) => {
    if (!sizeStr) return '';
    const s = sizeStr.trim();
    const match = s.match(/\d+\s*(rolls?|cans?|bottles?|pcs?|pieces?|units?|tabs?|tablets?|capsules?|bags?|packs?|sticks?|bars?|sachets?|pouches?|tins?|jars?|boxes?)/i);
    if (match) {
      let unit = match[1].toLowerCase();
      if (unit.length > 2 && unit.endsWith('s')) unit = unit.slice(0, -1); // crude singularise
      return unit;
    }
    return '';
  };

  const AREA_LABELS = {
    goods:         '🏪 Front Store',
    container:     '📦 Container',
    storeroom:     '🗄️ Storeroom',
    tent:          '⛺ Tent',
    tent_in_store: '🧺 Tent in Store',
    singles:       '🔢 Singles',
  };

  // Returns the number of individual units in one bag/carton.
  // Priority: explicit unitsPerPack field on the item → parse size string → 1
  const parsePackSize = (sizeStr, item) => {
    if (item && item.unitsPerPack) {
      const n = parseInt(item.unitsPerPack, 10);
      if (!isNaN(n) && n > 0) return n;
    }
    if (!sizeStr) return 1;
    const s = (sizeStr + '').trim();
    // "12pcs", "12 pcs", "24ct", "6 pieces", "30 pkts", "15 bags"
    const pcsMatch = s.match(/^(\d+)\s*(pcs?|pieces?|pkt?s?|bags?|pack|units?|ct|count)/i);
    if (pcsMatch) return Math.max(1, parseInt(pcsMatch[1], 10));
    // "50 x 1kg", "24 x 300g", "6 x 1L", "12 x 330ml"
    const xMatch = s.match(/^(\d+)\s*(?:\w+\s+)?x/i);
    if (xMatch) return Math.max(1, parseInt(xMatch[1], 10));
    // bare number with no unit (e.g. "24")
    const numOnly = s.match(/^(\d+)$/);
    if (numOnly) return Math.max(1, parseInt(numOnly[1], 10));
    // bare weight/volume like "25kg", "500g", "1L" — single unit descriptor, not a count
    return 1;
  };

  const openMoveModal = (tab) => {
    setMoveSourceTab(tab);
    setMoveItem(null);
    setMoveSearchTerm('');
    setMoveQty('');
    setMoveDestTab('');
    setMoveUnitName('');
    setMoveSellWhole(false);
    setShowMoveModal(true);
  };

  const handleMoveStock = async () => {
    if (!moveItem)        { alert('Please select an item to move.');      return; }
    if (!moveDestTab)     { alert('Please select a destination storage.'); return; }
    const qty = parseInt(moveQty, 10);
    if (!qty || qty <= 0) { alert('Please enter a valid quantity.');       return; }

    const isGoodsSource = moveSourceTab === 'goods';

    if (isGoodsSource) {
      // ── Moving FROM Front Store (goods) ──────────────────────────────────
      const good = moveItem;
      const currentStock = typeof good.stock_quantity === 'number' ? good.stock_quantity : 0;
      if (qty > currentStock) {
        alert(`Not enough stock. Current Front Store stock: ${currentStock}`);
        return;
      }
      setMoveSaving(true);
      try {
        await dataService.updateGood(good.id, { stock_quantity: Math.max(0, currentStock - qty) });
        await loadGoods();

        if (moveDestTab === 'singles') {
          // Expand packs → individual units
          const packSize = parsePackSize(good.size, good);
          const totalSingles = packSize * qty;
          const unitPrice = packSize > 1
            ? parseFloat((parseFloat(good.price || 0) / packSize).toFixed(2))
            : parseFloat(good.price || 0);
          const existingSingles = await dataService.getAreaItems('singles');
          const match = (existingSingles || []).find(
            s => (s.name || '').toLowerCase().trim() === (good.name || '').toLowerCase().trim()
          );
          if (match) {
            await dataService.updateAreaItem('singles', match.id, {
              ...match, stock: parseInt(match.stock || 0, 10) + totalSingles,
            });
          } else {
            await dataService.addAreaItem('singles', {
              name: good.name || '', category: good.category || '',
              price: unitPrice, stock: totalSingles, packSize, goodId: good.id,
              unitName: moveUnitName || parseUnitName(good.size) || 'pc',
            });
          }
          await loadAreaItems('singles');
        } else {
          const destUsesPcs = catalogueAreas.find(a => a.key === moveDestTab)?.pcsOnly ?? false;
          const destField   = destUsesPcs ? 'pcs' : 'quantity';
          const destItems   = await dataService.getAreaItems(moveDestTab);
          const match = (destItems || []).find(
            d => (d.name || '').toLowerCase().trim() === (good.name || '').toLowerCase().trim()
          );
          if (match) {
            await dataService.updateAreaItem(moveDestTab, match.id, {
              ...match, [destField]: parseInt(match[destField] || 0, 10) + qty,
            });
          } else {
            await dataService.addAreaItem(moveDestTab, {
              name: good.name || '', barcode: good.barcode || '',
              size: good.size || '', price: good.price || '',
              quantity: destUsesPcs ? '' : String(qty),
              pcs: destUsesPcs ? String(qty) : '',
            });
          }
          if (areaItems[moveDestTab]) await loadAreaItems(moveDestTab);
        }
        await logAction('STOCK_MOVE', `Moved ${qty} x ${good.name} from Front Store → ${AREA_LABELS[moveDestTab] || moveDestTab}`);
        setShowMoveModal(false);
      } catch (err) {
        console.error('Move stock error (goods):', err);
        alert('Failed to move stock. Please try again.');
      } finally { setMoveSaving(false); }
      return;
    }

    // ── Moving FROM a storage area ────────────────────────────────────────
    const srcUsesPcs  = catalogueAreas.find(a => a.key === moveSourceTab)?.pcsOnly ?? false;
    const destUsesPcs = catalogueAreas.find(a => a.key === moveDestTab)?.pcsOnly ?? false;
    const srcField    = srcUsesPcs  ? 'pcs' : 'quantity';
    const destField   = destUsesPcs ? 'pcs' : 'quantity';
    const currentSrc  = parseInt(moveItem[srcField] || 0, 10);
    if (qty > currentSrc) {
      alert(`Not enough stock. Current ${srcField} in ${AREA_LABELS[moveSourceTab]}: ${currentSrc}`);
      return;
    }
    setMoveSaving(true);
    try {
      await dataService.updateAreaItem(moveSourceTab, moveItem.id, {
        ...moveItem, [srcField]: currentSrc - qty,
      });

      if (moveDestTab === 'goods') {
        // ── Moving TO Front Store ─────────────────────────────────────────
        // moveSellWhole=true  → sell the bag/carton as-is (+qty units of this item)
        // moveSellWhole=false → break into individual units (+qty × unitsPerPack)
        const packSize   = parsePackSize(moveItem.size, moveItem);
        const stockToAdd = moveSellWhole ? qty : qty * packSize;
        const existingGoods = await dataService.getGoods();
        const match = (existingGoods || []).find(
          g => (g.name || '').toLowerCase().trim() === (moveItem.name || '').toLowerCase().trim()
        );
        if (match) {
          const currentStock = typeof match.stock_quantity === 'number' ? match.stock_quantity : parseInt(match.stock_quantity || 0, 10);
          await dataService.updateGood(match.id, { stock_quantity: currentStock + stockToAdd });
        } else {
          // No matching Front Store product — create one
          await dataService.addGood({
            name:           moveItem.name     || '',
            size:           moveItem.size     || '',
            price:          parseFloat(moveItem.price || 0),
            category:       moveItem.notes    || moveItem.category || 'General',
            barcode:        moveItem.barcode  || '',
            stock_quantity: stockToAdd,
          });
        }
        await loadGoods();
      } else if (moveDestTab === 'singles') {
        const packSize = parsePackSize(moveItem.size, moveItem);
        const totalSingles = packSize * qty;
        const unitPrice = packSize > 1
          ? parseFloat((parseFloat(moveItem.price || 0) / packSize).toFixed(2))
          : parseFloat(moveItem.price || 0);
        const existingSingles = await dataService.getAreaItems('singles');
        const match = (existingSingles || []).find(
          s => (s.name || '').toLowerCase().trim() === (moveItem.name || '').toLowerCase().trim()
        );
        if (match) {
          await dataService.updateAreaItem('singles', match.id, {
            ...match, stock: parseInt(match.stock || 0, 10) + totalSingles,
          });
        } else {
          await dataService.addAreaItem('singles', {
            name: moveItem.name || '', category: moveItem.category || '',
            price: unitPrice, stock: totalSingles, packSize,
            unitName: moveUnitName || parseUnitName(moveItem.size) || 'pc',
          });
        }
        await loadAreaItems('singles');
      } else {
        const destItems = await dataService.getAreaItems(moveDestTab);
        const match = (destItems || []).find(
          d => (d.name || '').toLowerCase().trim() === (moveItem.name || '').toLowerCase().trim()
        );
        if (match) {
          await dataService.updateAreaItem(moveDestTab, match.id, {
            ...match, [destField]: parseInt(match[destField] || 0, 10) + qty,
          });
        } else {
          await dataService.addAreaItem(moveDestTab, {
            name: moveItem.name || '', barcode: moveItem.barcode || '',
            size: moveItem.size || '', price: moveItem.price || '',
            notes: moveItem.notes || '',
            quantity: destUsesPcs ? '' : String(qty),
            pcs: destUsesPcs ? String(qty) : (moveItem.pcs || ''),
          });
        }
        if (areaItems[moveDestTab]) await loadAreaItems(moveDestTab);
      }
      await loadAreaItems(moveSourceTab);
      await logAction('STOCK_MOVE', `Moved ${qty} x ${moveItem.name} from ${AREA_LABELS[moveSourceTab] || moveSourceTab} → ${AREA_LABELS[moveDestTab] || moveDestTab}`);
      setShowMoveModal(false);
    } catch (err) {
      console.error('Move stock error:', err);
      alert('Failed to move stock. Please try again.');
    } finally { setMoveSaving(false); }
  };

  // Kept as alias — the goods-source path is handled inline above via the
  // extended handleMoveStock. This comment is just a marker.

  const [searchTerm, setSearchTerm] = useState('');
  const [lightboxSrc, setLightboxSrc] = useState(null);

  // ── Load goods ──────────────────────────────────────────────────────────
  useEffect(() => { loadGoods(); }, []);

  useEffect(() => {
    const unsubscribe = dataService.onGoodsChange((updatedGoods) => {
      const sorted = (updatedGoods || [])
        .filter(g => (g.name || '').trim() !== '')
        .slice()
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setGoods(sorted);
      setGoodsLastSynced(new Date());
    });
    return () => unsubscribe();
  }, []);

  const loadGoods = async () => {
    setGoodsLoading(true);
    try {
      const data = await dataService.getGoods();
      const sorted = (data || [])
        .filter(g => (g.name || '').trim() !== '')
        .slice()
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setGoods(sorted);
      setGoodsLastSynced(new Date());
    } catch (err) {
      console.error('Error loading goods:', err);
    } finally {
      setGoodsLoading(false);
    }
  };

  // ── Load assets ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab === 'assets') loadAssets();
  }, [activeTab]);

  // ── Load storage-area tabs when active ─────────────────────────────────────
  const loadAreaItems = async (areaKey) => {
    setAreaLoading(prev => ({ ...prev, [areaKey]: true }));
    try {
      const data = await dataService.getAreaItems(areaKey);
      const sorted = (data || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setAreaItems(prev => ({ ...prev, [areaKey]: sorted }));
      setAreaLastSynced(prev => ({ ...prev, [areaKey]: new Date() }));
    } catch (err) {
      console.error('loadAreaItems:', areaKey, err);
    } finally {
      setAreaLoading(prev => ({ ...prev, [areaKey]: false }));
    }
  };

  useEffect(() => {
    if (AREA_TABS.includes(activeTab)) {
      if (!(areaItems[activeTab]?.length)) loadAreaItems(activeTab);
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load commission goods when tab is active ─────────────────────────────
  useEffect(() => {
    if (activeTab === 'commission') {
      setCommissionLoading(true);
      dataService.getCommissionGoods().then(d => {
        setCommissionGoods(d || []);
        setCommissionLoading(false);
      }).catch(() => setCommissionLoading(false));
    }
  }, [activeTab]);

  const loadAssets = async () => {
    setAssetsLoading(true);
    try {
      const data = await dataService.getOperationalAssets();
      setAssets(data || []);
      setAssetsLastSynced(new Date());
    } catch (err) {
      console.error('Error loading operational assets:', err);
    } finally {
      setAssetsLoading(false);
    }
  };

  // ── Helpers ──────────────────────────────────────────────────────────────
  const getStockStatus = (qty) => {
    if (qty === undefined || qty === null) return null;
    if (qty <= 0) return { label: 'Out of Stock', cls: 'out-of-stock' };
    if (qty <= 5) return { label: 'Low Stock',    cls: 'low-stock'    };
    return              { label: 'In Stock',       cls: 'in-stock'     };
  };

  const getBarcodeImageUrl = (good) =>
    good.barcodeImage || good.barcode_image || good.barcodeUrl || good.barcode_url || null;

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  // ── CRUD ─────────────────────────────────────────────────────────────────
  const handleUpdateGood = async (id, updates) => {
    await dataService.updateGood(id, updates);
    await loadGoods();
    const name = updates.name || goods.find(g => g.id === id)?.name || id;
    await logAction('PRODUCT_UPDATED', `Updated product: ${name}`).catch(() => {});
    setEditingGood(null);
  };

  const handleDeleteGood = async (id) => {
    const name = goods.find(g => g.id === id)?.name || id;
    await dataService.deleteGood(id);
    await loadGoods();
    await logAction('PRODUCT_DELETED', `Deleted product: ${name}`).catch(() => {});
    setEditingGood(null);
  };

  // ── Area-item CRUD handlers ──────────────────────────────────────────────────
  const handleAreaAdd = async () => {
    if (!areaForm.name.trim()) { alert('Name is required'); return; }
    setAreaSaving(true);
    try {
      await dataService.addAreaItem(activeTab, areaForm);
      await loadAreaItems(activeTab);
      setShowAreaAddModal(false);
      setAreaForm(AREA_FORM_BLANK);
    } catch (err) { console.error(err); alert('Failed to save.'); }
    finally { setAreaSaving(false); }
  };

  const handleAreaUpdate = async () => {
    if (!areaForm.name.trim()) { alert('Name is required'); return; }
    setAreaSaving(true);
    try {
      await dataService.updateAreaItem(activeTab, editingAreaItem.id, areaForm);
      await loadAreaItems(activeTab);
      setEditingAreaItem(null);
      setAreaForm(AREA_FORM_BLANK);
    } catch (err) { console.error(err); alert('Failed to update.'); }
    finally { setAreaSaving(false); }
  };

  const handleAreaDelete = async (id) => {
    if (!window.confirm('Delete this item? This cannot be undone.')) return;
    await dataService.deleteAreaItem(activeTab, id);
    await loadAreaItems(activeTab);
    setEditingAreaItem(null);
    setAreaForm(AREA_FORM_BLANK);
  };

  const filteredGoods  = filterAndSort(goods,  searchTerm);
  const filteredAssets = filterAssets(assets, searchTerm);

  const handleTabChange = (tab) => { setActiveTab(tab); setSearchTerm(''); };

  return (
    <div className="inventory">

      {/* Lightbox */}
      {lightboxSrc && (
        <Portal>
          <div className="inv-lightbox" onClick={() => setLightboxSrc(null)}>
            <button className="inv-lightbox-close" onClick={() => setLightboxSrc(null)}><X size={28} /></button>
            <img src={lightboxSrc} alt="Barcode" className="inv-lightbox-img" onClick={e => e.stopPropagation()} />
          </div>
        </Portal>
      )}

      {/* Edit modal */}
      {editingGood && (
        <EditProductModal
          good={editingGood}
          onUpdate={handleUpdateGood}
          onDelete={handleDeleteGood}
          onCancel={() => setEditingGood(null)}
          categories={catalogueCategories}
        />
      )}

      {/* ── Sticky bar ── */}
      <div className="inv-sticky-bar">
        <div className="inv-tab-row">
          <button className={`inv-tab-btn${activeTab === 'goods'      ? ' inv-tab-btn-active'                              : ''}`} onClick={() => handleTabChange('goods')}>🏪 Front Store</button>
          {catalogueAreas.map(area => (
            <button
              key={area.key}
              className={`inv-tab-btn${activeTab === area.key ? ` inv-tab-btn-active inv-tab-btn-active-${area.key}` : ''}`}
              onClick={() => handleTabChange(area.key)}
            >
              {area.emoji} {area.label}
            </button>
          ))}
          <button className={`inv-tab-btn${activeTab === 'singles'    ? ' inv-tab-btn-active inv-tab-btn-active-singles'   : ''}`} onClick={() => handleTabChange('singles')}>🔢 Singles</button>
          <button className={`inv-tab-btn${activeTab === 'assets'     ? ' inv-tab-btn-active inv-tab-btn-active-assets'    : ''}`} onClick={() => handleTabChange('assets')}>🔧 Operational Assets</button>
          <button className={`inv-tab-btn${activeTab === 'commission' ? ' inv-tab-btn-active inv-tab-btn-active-commission': ''}`} onClick={() => handleTabChange('commission')}>🤝 Commission</button>
        </div>

        {activeTab === 'goods' && (
          <div style={{ padding:'6px 12px 2px', borderTop:'1px solid var(--border,#e5e7eb)' }}>
            <div style={{ fontWeight:700, fontSize:'14px', color:'var(--text-primary,#111)' }}>🏪 Front Store</div>
            <div style={{ fontSize:'11px', color:'var(--text-secondary,#6b7280)', marginTop:'1px' }}>Products available for sale at the counter. This list feeds the Checkout search bar.</div>
          </div>
        )}
        {activeTab === 'singles' && (
          <div style={{ padding:'6px 12px 2px', borderTop:'1px solid var(--border,#e5e7eb)' }}>
            <div style={{ fontWeight:700, fontSize:'14px', color:'var(--text-primary,#111)' }}>🔢 Singles</div>
            <div style={{ fontSize:'11px', color:'var(--text-secondary,#6b7280)', marginTop:'1px' }}>Individual units broken out from packets moved from Front Store or other storage areas.</div>
          </div>
        )}
        {activeTab === 'commission' && (
          <div style={{ padding:'6px 12px 2px', borderTop:'1px solid var(--border,#e5e7eb)' }}>
            <div style={{ fontWeight:700, fontSize:'14px', color:'var(--text-primary,#111)' }}>Commission Products</div>
            <div style={{ fontSize:'11px', color:'var(--text-secondary,#6b7280)', marginTop:'1px' }}>Products sold on behalf of others. Shop earns a commission per sale.</div>
          </div>
        )}
        {catalogueAreas.map(area => activeTab === area.key && (
          <div key={area.key} style={{ padding:'6px 12px 2px', borderTop:'1px solid var(--border,#e5e7eb)' }}>
            <div style={{ fontWeight:700, fontSize:'14px', color:'var(--text-primary,#111)' }}>{area.emoji} {area.label}</div>
          </div>
        ))}

        <div className="inv-toolbar">
          <div className="inv-search-box">
            <Search size={16} className="inv-search-icon" />
            <input
              type="text"
              className="inv-search-input"
              placeholder={
                activeTab === 'goods'      ? 'Search Front Store Product' :
                activeTab === 'assets'     ? 'Search Asset'               :
                activeTab === 'commission' ? 'Search Commission Product'   :
                activeTab === 'singles'    ? 'Search Singles'              :
                catalogueAreas.find(a => a.key === activeTab)
                  ? `Search ${catalogueAreas.find(a => a.key === activeTab).label} Items`
                  : 'Search'
              }
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                className="inv-search-clear"
                onPointerDown={e => { e.preventDefault(); e.stopPropagation(); setSearchTerm(''); }}
                onClick={() => setSearchTerm('')}
              >×</button>
            )}
          </div>
          {activeTab === 'commission' && (
            <button
              onClick={() => { setEditCommission(null); setCommissionForm({ name:'', sellingPrice:'', commissionRate:'', ownerName:'', stock:'', notes:'' }); setShowCommissionModal(true); }}
              style={{ flexShrink:0, background:'linear-gradient(135deg,#667eea,#764ba2)', color:'#fff', border:'none', borderRadius:'10px', padding:'8px 14px', fontWeight:700, fontSize:'12px', cursor:'pointer', whiteSpace:'nowrap' }}
            >+ Add</button>
          )}
          {(activeTab === 'goods' || AREA_TABS.includes(activeTab)) && activeTab !== 'singles' && (
            <button
              className="inv-move-stock-btn"
              onClick={() => openMoveModal(activeTab)}
            >⇄ Move Stock</button>
          )}
        </div>

        <div className="inv-meta-row">
          {activeTab === 'commission' ? (
            <span className="inv-count">{commissionGoods.length} item{commissionGoods.length !== 1 ? 's' : ''}</span>
          ) : activeTab === 'goods' ? (
            <>
              <span className="inv-count">{filteredGoods.length} item{filteredGoods.length !== 1 ? 's' : ''}</span>
              {goodsLastSynced && (
                <span className="inv-sync-label">
                  Synced {goodsLastSynced.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                </span>
              )}
            </>
          ) : AREA_TABS.includes(activeTab) ? (
            <>
              <span className="inv-count">{(areaItems[activeTab] || []).filter(i => !searchTerm || (i.name||'').toLowerCase().includes(searchTerm.toLowerCase())).length} item{((areaItems[activeTab]||[]).length !== 1 ? 's' : '')}</span>
              {areaLastSynced[activeTab] && <span className="inv-sync-label">Synced {areaLastSynced[activeTab].toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12:true })}</span>}
            </>
          ) : (
            <>
              <span className="inv-count">{filteredAssets.length} item{filteredAssets.length !== 1 ? 's' : ''}</span>
              {assetsLastSynced && (
                <span className="inv-sync-label">
                  Synced {assetsLastSynced.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Scroll body ── */}
      <div className="inv-scroll-body">

        {/* GOODS */}
        {activeTab === 'goods' && (
          goodsLoading ? (
            <div className="inv-empty">Loading inventory…</div>
          ) : filteredGoods.length === 0 ? (
            <div className="inv-empty">
              {searchTerm ? `No items matching "${searchTerm}"` : 'No goods found. Go online to sync from Firebase.'}
            </div>
          ) : (
            <div className="inv-table-wrapper">
              <table className="inv-table">
                <thead className="inv-thead">
                  <tr>
                    <th className="inv-col-frozen inv-col-num">#</th>
                    <th className="inv-col-name">PRODUCT NAME</th>
                    <th className="inv-col-size">SIZE</th>
                    <th>CATEGORY</th>
                    <th className="inv-col-right">PRICE</th>
                    <th className="inv-col-center">STOCK</th>
                    <th>STATUS</th>
                    <th className="inv-col-barcode-no">BARCODE</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGoods.map((good, idx) => {
                    const status = getStockStatus(good.stock_quantity);
                    const barcodeImgUrl = getBarcodeImageUrl(good);
                    return (
                      <tr key={good.id} className="inv-data-row">
                        <td className="inv-col-frozen inv-col-num inv-num-cell">{idx + 1}</td>
                        <td className="inv-col-name inv-name-cell">
                          <span className="inv-cell-value">{good.name ?? ''}</span>
                        </td>
                        <td className="inv-size-cell">
                          <span className="inv-cell-value">{good.size ?? ''}</span>
                        </td>
                        <td className="inv-cat-cell">{good.category || '—'}</td>
                        <td className="inv-col-right">
                          <span className="inv-cell-value">{fmt(parseFloat(good.price || 0))}</span>
                        </td>
                        <td className="inv-col-center">
                          <span className="inv-cell-value">{good.stock_quantity ?? ''}</span>
                        </td>
                        <td>
                          {status ? <span className={`inv-badge ${status.cls}`}>{status.label}</span> : '—'}
                        </td>
                        <td className="inv-col-barcode-no inv-barcode-no-cell">
                          {good.barcode ? (
                            <span className="inv-barcode-number">{good.barcode}</span>
                          ) : <span className="inv-barcode-none">—</span>}
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* OPERATIONAL ASSETS */}
        {activeTab === 'assets' && (
          assetsLoading ? (
            <div className="inv-empty">Loading operational assets…</div>
          ) : filteredAssets.length === 0 ? (
            <div className="inv-empty">
              {searchTerm
                ? `No assets matching "${searchTerm}"`
                : 'No operational assets yet. Assets are recorded when you purchase from a supplier in Add Cash Entry.'}
            </div>
          ) : (
            <div className="inv-table-wrapper">
              <table className="inv-table">
                <thead className="inv-thead">
                  <tr>
                    <th className="inv-col-frozen inv-col-num">#</th>
                    <th className="inv-col-name">ASSET NAME</th>
                    <th className="inv-col-center">QTY</th>
                    <th className="inv-col-right">UNIT COST</th>
                    <th className="inv-col-right">SUBTOTAL</th>
                    <th>SUPPLIER</th>
                    <th>REF</th>
                    <th className="inv-col-center">PAYMENT</th>
                    <th className="inv-col-center">DETAILS</th>
                    <th>COMMENTS</th>
                    <th>DATE</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssets.map((asset, idx) => (
                    <tr key={asset.id} className="inv-data-row">
                      <td className="inv-col-frozen inv-col-num inv-num-cell">{idx + 1}</td>
                      <td className="inv-col-name inv-name-cell">
                        <span className="inv-cell-value">{asset.name || '—'}</span>
                      </td>
                      <td className="inv-col-center">
                        <span className="inv-cell-value">{asset.qty ?? '—'}</span>
                      </td>
                      <td className="inv-col-right">
                        <span className="inv-cell-value">{fmt(parseFloat(asset.costPrice || 0))}</span>
                      </td>
                      <td className="inv-col-right">
                        <span className="inv-cell-value">{fmt(parseFloat(asset.subtotal || 0))}</span>
                      </td>
                      <td className="inv-cat-cell">{asset.supplierName || '—'}</td>
                      <td className="inv-cat-cell">{asset.invoiceRef || '—'}</td>
                      <td className="inv-col-center">
                        <span className={`inv-badge ${asset.paymentType === 'cash' ? 'in-stock' : 'low-stock'}`}>
                          {asset.paymentType === 'cash' ? 'Cash' : 'Credit'}
                        </span>
                      </td>
                      <td className="inv-col-center">
                        <button
                          className="inv-detail-btn"
                          title="View details"
                          onClick={() => setAssetDetailItem(asset)}
                        >
                          <FileText size={15} strokeWidth={1.8} />
                        </button>
                      </td>
                      <td className="inv-cat-cell" style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {asset.comments || '—'}
                      </td>
                      <td className="inv-cat-cell">{formatDate(asset.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* ── STORAGE AREA TABS (Container / Storeroom / Tent / Tent-in-Store) ── */}
        {AREA_TABS.includes(activeTab) && (() => {
          const tabItems = (areaItems[activeTab] || []);
          const filtered = searchTerm
            ? tabItems.filter(i => (i.name||'').toLowerCase().includes(searchTerm.toLowerCase()) || (i.barcode||'').includes(searchTerm))
            : tabItems;
          const loading  = areaLoading[activeTab];

          const pcsOnly = catalogueAreas.find(a => a.key === activeTab)?.pcsOnly ?? false;

          if (loading) return <div className="inv-empty">Loading…</div>;
          if (filtered.length === 0) return (
            <div className="inv-empty">
              {searchTerm
                ? `No items matching "${searchTerm}"`
                : 'No items yet. Go online to sync from Firebase.'}
            </div>
          );

          return (
            <div className="inv-table-wrapper">
              <table className="inv-table">
                <thead className="inv-thead">
                  <tr>
                    <th className="inv-col-frozen inv-col-num">#</th>
                    <th className="inv-col-name">NAME</th>
                    {!pcsOnly && <th className="inv-col-barcode-no">BARCODE</th>}
                    {!pcsOnly && <th className="inv-col-center">CTN / QTY</th>}
                    <th className="inv-col-center">PCS</th>
                    {!pcsOnly && <th>SIZE</th>}
                    {!pcsOnly && <th className="inv-col-center">UNITS/PACK</th>}
                    <th className="inv-col-right">PRICE</th>
                    {!pcsOnly && <th>NOTES</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item, idx) => (
                    <tr
                      key={item.id}
                      className="inv-data-row"
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setEditingAreaItem(item);
                        setAreaForm({
                          name:         item.name         || '',
                          barcode:      item.barcode      || '',
                          quantity:     item.quantity     ?? '',
                          pcs:          item.pcs          ?? '',
                          size:         item.size         || '',
                          price:        item.price        != null ? String(item.price) : '',
                          notes:        item.notes        || '',
                          unitsPerPack: item.unitsPerPack != null ? String(item.unitsPerPack) : '',
                        });
                        setShowAreaAddModal(true);
                      }}
                    >
                      <td className="inv-col-frozen inv-col-num inv-num-cell">{idx + 1}</td>
                      <td className="inv-col-name inv-name-cell">
                        <span className="inv-cell-value">{item.name || '—'}</span>
                      </td>
                      {!pcsOnly && (
                        <td className="inv-col-barcode-no inv-barcode-no-cell">
                          {item.barcode
                            ? <span className="inv-barcode-number">{item.barcode}</span>
                            : <span className="inv-barcode-none">—</span>}
                        </td>
                      )}
                      {!pcsOnly && (
                        <td className="inv-col-center">
                          <span className="inv-cell-value">{item.quantity ?? '—'}</span>
                        </td>
                      )}
                      <td className="inv-col-center">
                        <span className="inv-cell-value">{item.pcs ?? '—'}</span>
                      </td>
                      {!pcsOnly && (
                        <td className="inv-size-cell">
                          <span className="inv-cell-value">{item.size || '—'}</span>
                        </td>
                      )}
                      {!pcsOnly && (
                        <td className="inv-col-center">
                          <span className="inv-cell-value">{item.unitsPerPack != null && item.unitsPerPack !== '' ? item.unitsPerPack : '—'}</span>
                        </td>
                      )}
                      <td className="inv-col-right">
                        <span className="inv-cell-value">{item.price != null && item.price !== '' ? fmt(parseFloat(item.price)) : '—'}</span>
                      </td>
                      {!pcsOnly && (
                        <td className="inv-cat-cell" style={{ maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {item.notes || '—'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}

        {/* ── SINGLES TAB ── */}
        {activeTab === 'singles' && (() => {
          const tabItems = (areaItems['singles'] || []);
          const filtered = searchTerm
            ? tabItems.filter(i => (i.name||'').toLowerCase().includes(searchTerm.toLowerCase()))
            : tabItems;
          const loading  = areaLoading['singles'];
          if (loading) return <div className="inv-empty">Loading…</div>;
          if (filtered.length === 0) return (
            <div className="inv-empty">
              {searchTerm
                ? `No singles matching "${searchTerm}"`
                : 'No singles yet. Move a packet from Front Store or a storage area using ⇄ Move Stock.'}
            </div>
          );
          return (
            <div className="inv-table-wrapper">
              <table className="inv-table">
                <thead className="inv-thead">
                  <tr>
                    <th className="inv-col-frozen inv-col-num">#</th>
                    <th className="inv-col-name">NAME</th>
                    <th>CATEGORY</th>
                    <th className="inv-col-right">PRICE</th>
                    <th className="inv-col-center">STOCK</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item, idx) => {
                    const stock  = parseInt(item.stock ?? 0, 10);
                    const status = getStockStatus(stock);
                    return (
                      <tr key={item.id} className="inv-data-row">
                        <td className="inv-col-frozen inv-col-num inv-num-cell">{idx + 1}</td>
                        <td className="inv-col-name inv-name-cell">
                          <span className="inv-cell-value">
                            {item.name || '—'}
                            {item.unitName ? <span style={{ color: '#667eea', fontWeight: 400, fontSize: '0.85em', marginLeft: '5px' }}>({item.unitName})</span> : null}
                          </span>
                        </td>
                        <td className="inv-cat-cell">{item.category || '—'}</td>
                        <td className="inv-col-right">
                          <span className="inv-cell-value">{item.price != null && item.price !== '' ? fmt(parseFloat(item.price)) : '—'}</span>
                        </td>
                        <td className="inv-col-center">
                          <span className="inv-cell-value">{stock}</span>
                        </td>
                        <td>
                          {status ? <span className={`inv-badge ${status.cls}`}>{status.label}</span> : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()}
        {activeTab === 'commission' && (          <>
            {commissionLoading ? (
              <div style={{ textAlign:'center', padding:'40px', color:'var(--text-secondary,#9ca3af)' }}>Loading...</div>
            ) : commissionGoods.length === 0 ? (
              <div style={{ textAlign:'center', padding:'40px', color:'var(--text-secondary,#9ca3af)' }}>
                <div style={{ fontSize:'32px', marginBottom:'8px' }}>🤝</div>
                <div style={{ fontWeight:600 }}>No commission products yet</div>
                <div style={{ fontSize:'13px', marginTop:'4px' }}>Add products you sell on behalf of others</div>
              </div>
            ) : (
              <div style={{ padding:'0 12px 24px', overflowX:'auto' }}>
                <table style={{ width:'100%', minWidth:'500px', borderCollapse:'collapse', fontSize:'13px' }}>
                  <thead>
                    <tr style={{ borderBottom:'2px solid var(--border,#e5e7eb)' }}>
                      <th style={{ textAlign:'left', padding:'8px 6px', color:'var(--text-secondary,#6b7280)', fontWeight:600, fontSize:'11px', textTransform:'uppercase', minWidth:'120px' }}>Product</th>
                      <th style={{ textAlign:'right', padding:'8px 6px', color:'var(--text-secondary,#6b7280)', fontWeight:600, fontSize:'11px', textTransform:'uppercase', minWidth:'70px' }}>Price</th>
                      <th style={{ textAlign:'center', padding:'8px 6px', color:'var(--text-secondary,#6b7280)', fontWeight:600, fontSize:'11px', textTransform:'uppercase', minWidth:'50px' }}>Stock</th>
                      <th style={{ textAlign:'center', padding:'8px 6px', color:'var(--text-secondary,#6b7280)', fontWeight:600, fontSize:'11px', textTransform:'uppercase', minWidth:'55px' }}>Comm%</th>
                      <th style={{ textAlign:'right', padding:'8px 6px', color:'var(--text-secondary,#6b7280)', fontWeight:600, fontSize:'11px', textTransform:'uppercase', minWidth:'70px' }}>Earned</th>
                      <th style={{ textAlign:'left', padding:'8px 6px', color:'var(--text-secondary,#6b7280)', fontWeight:600, fontSize:'11px', textTransform:'uppercase', minWidth:'90px' }}>Owner</th>
                      <th style={{ width:'32px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {commissionGoods.map((g, i) => (
                      <tr key={g.id} style={{ borderBottom:'1px solid var(--border,#f3f4f6)', background: i%2===0 ? 'transparent' : 'var(--surface-alt,rgba(0,0,0,0.02))' }}>
                        <td style={{ padding:'10px 6px', fontWeight:600, color:'var(--text-primary,#111)' }}>{g.name}</td>
                        <td style={{ padding:'10px 6px', textAlign:'right', color:'var(--text-primary,#374151)' }}>{fmt(parseFloat(g.sellingPrice||0))}</td>
                        <td style={{ padding:'10px 6px', textAlign:'center', color:'var(--text-primary,#374151)' }}>{g.stock||0}</td>
                        <td style={{ padding:'10px 6px', textAlign:'center', color:'#4f46e5', fontWeight:600 }}>{g.commissionRate||0}%</td>
                        <td style={{ padding:'10px 6px', textAlign:'right', color:'#16a34a', fontWeight:700 }}>{fmt(parseFloat(g.commissionEarned||0))}</td>
                        <td style={{ padding:'10px 6px', color:'var(--text-secondary,#6b7280)', fontSize:'12px' }}>{g.ownerName||'—'}</td>
                        <td style={{ padding:'10px 6px', textAlign:'center' }}>
                          <button
                            onClick={() => { setEditCommission(g); setCommissionForm({ name:g.name, sellingPrice:g.sellingPrice, commissionRate:g.commissionRate, ownerName:g.ownerName||'', stock:g.stock||'', notes:g.notes||'' }); setShowCommissionModal(true); }}
                            style={{ background:'none', border:'none', cursor:'pointer', fontSize:'15px', padding:'2px' }}
                          >✏️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

      </div>{/* end inv-scroll-body */}

      {/* ── Area Item Add / Edit Modal ── */}
      {showAreaAddModal && (() => {
        const pcsOnly    = catalogueAreas.find(a => a.key === activeTab)?.pcsOnly ?? false;
        const activeArea = catalogueAreas.find(a => a.key === activeTab);
        const areaTitle  = activeArea ? `${activeArea.emoji} ${activeArea.label}` : activeTab;
        const isEdit = !!editingAreaItem;
        return (
          <Portal>
            <Overlay className="inv-modal-overlay" onDismiss={() => { setShowAreaAddModal(false); setEditingAreaItem(null); setAreaForm(AREA_FORM_BLANK); }}>
              <div className="inv-modal-content" onPointerDown={e => e.stopPropagation()}>
                <div className="inv-modal-header">
                  <h2>{isEdit ? 'Edit' : 'Add'} — {areaTitle}</h2>
                  <button className="inv-modal-close" onClick={() => { setShowAreaAddModal(false); setEditingAreaItem(null); setAreaForm(AREA_FORM_BLANK); }}><X size={20}/></button>
                </div>
                <div className="inv-modal-body">
                  <div className="inv-edit-form">

                    <div className="inv-form-group">
                      <label>Name *</label>
                      <input className="inv-input" value={areaForm.name} placeholder="Item name"
                        onChange={e => setAreaForm(f => ({...f, name: e.target.value}))} />
                    </div>

                    {!pcsOnly && (
                      <div className="inv-form-group">
                        <label>Barcode <span className="inv-label-hint">(optional)</span></label>
                        <input className="inv-input" value={areaForm.barcode} placeholder="Barcode number"
                          onChange={e => setAreaForm(f => ({...f, barcode: e.target.value}))} />
                      </div>
                    )}

                    <div className="inv-form-row">
                      {!pcsOnly && (
                        <div className="inv-form-group">
                          <label>CTN / Qty <span className="inv-label-hint">(cartons)</span></label>
                          <input className="inv-input" type="number" min="0" value={areaForm.quantity} placeholder="0"
                            onChange={e => setAreaForm(f => ({...f, quantity: e.target.value}))} />
                        </div>
                      )}
                      <div className="inv-form-group">
                        <label>Pcs <span className="inv-label-hint">(pieces)</span></label>
                        <input className="inv-input" type="number" min="0" value={areaForm.pcs} placeholder="0"
                          onChange={e => setAreaForm(f => ({...f, pcs: e.target.value}))} />
                      </div>
                    </div>

                    {!pcsOnly && (
                      <div className="inv-form-group">
                        <label>Size <span className="inv-label-hint">(e.g. 25kg bag, 24 x 300g)</span></label>
                        <input className="inv-input" value={areaForm.size} placeholder="e.g. 25kg bag, 24 x 300g"
                          onChange={e => setAreaForm(f => ({...f, size: e.target.value}))} />
                      </div>
                    )}

                    {!pcsOnly && (
                      <div className="inv-form-group">
                        <label>Units per pack <span className="inv-label-hint">(how many individual units in one bag/carton)</span></label>
                        <input className="inv-input" type="number" min="1" value={areaForm.unitsPerPack} placeholder="e.g. 25 for a 25kg bag repacked into 1kg bags"
                          onChange={e => setAreaForm(f => ({...f, unitsPerPack: e.target.value}))} />
                      </div>
                    )}

                    <div className="inv-form-group">
                      <label>Price <span className="inv-label-hint">(optional)</span></label>
                      <input className="inv-input" type="number" min="0" step="0.01" value={areaForm.price} placeholder="0.00"
                        onChange={e => setAreaForm(f => ({...f, price: e.target.value}))} />
                    </div>

                    {!pcsOnly && (
                      <div className="inv-form-group">
                        <label>Notes <span className="inv-label-hint">(optional)</span></label>
                        <input className="inv-input" value={areaForm.notes} placeholder="Any extra notes"
                          onChange={e => setAreaForm(f => ({...f, notes: e.target.value}))} />
                      </div>
                    )}

                    <div className={isEdit ? "inv-edit-actions-row" : "inv-form-actions"}>
                      {isEdit ? (
                        <>
                          <button className="inv-edit-cancel-btn" onClick={() => { setShowAreaAddModal(false); setEditingAreaItem(null); setAreaForm(AREA_FORM_BLANK); }} disabled={areaSaving}>Cancel</button>
                          <button className="inv-edit-delete-btn" onClick={() => handleAreaDelete(editingAreaItem.id)} disabled={areaSaving}>Delete</button>
                          <button className="inv-edit-update-btn" onClick={handleAreaUpdate} disabled={areaSaving}><Save size={15}/> {areaSaving ? 'Saving…' : 'Update'}</button>
                        </>
                      ) : (
                        <>
                          <button className="inv-btn-cancel" onClick={() => { setShowAreaAddModal(false); setAreaForm(AREA_FORM_BLANK); }}>Cancel</button>
                          <button className="inv-btn-save" onClick={handleAreaAdd} disabled={areaSaving}><Save size={16}/> {areaSaving ? 'Saving…' : 'Add Item'}</button>
                        </>
                      )}
                    </div>

                  </div>
                </div>
              </div>
            </Overlay>
          </Portal>
        );
      })()}

      {/* ── Commission Modal ── */}
      {showCommissionModal && (
        <Portal>
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}
            onClick={() => setShowCommissionModal(false)}>
            <div style={{ background:'var(--surface,white)', borderRadius:'16px', width:'100%', maxWidth:'380px', maxHeight:'85vh', overflowY:'auto', padding:'24px' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
                <h3 style={{ margin:0, fontSize:'16px', fontWeight:700 }}>{editCommission ? 'Edit Commission Product' : 'Add Commission Product'}</h3>
                <button onClick={() => setShowCommissionModal(false)} style={{ background:'none', border:'none', cursor:'pointer' }}><X size={20}/></button>
              </div>
              {[
                ['Product Name *', 'name', 'text', 'e.g. Coca Cola 330ml'],
                ['Selling Price', 'sellingPrice', 'number', '0.00'],
                ['Commission Rate (%)', 'commissionRate', 'number', 'e.g. 10'],
                ['Stock Available (qty)', 'stock', 'number', '0'],
                ['Owner / Supplier Name', 'ownerName', 'text', 'Who owns this product'],
                ['Notes', 'notes', 'text', 'Optional notes'],
              ].map(([label, key, type, ph]) => (
                <div key={key} style={{ marginBottom:'14px' }}>
                  <label style={{ fontSize:'13px', fontWeight:600, display:'block', marginBottom:'4px', color:'var(--text-primary,#111)' }}>{label}</label>
                  <input
                    type={type}
                    placeholder={ph}
                    value={commissionForm[key]}
                    onChange={e => setCommissionForm(f => ({...f, [key]: e.target.value}))}
                    style={{ width:'100%', padding:'10px 12px', borderRadius:'8px', border:'1.5px solid var(--border,#e5e7eb)', fontSize:'14px', background:'var(--surface,white)', color:'var(--text-primary,#111)', boxSizing:'border-box' }}
                  />
                </div>
              ))}
              <div style={{ display:'flex', gap:'10px', marginTop:'8px' }}>
                {editCommission && (
                  <button
                    onClick={async () => {
                      await dataService.deleteCommissionGood(editCommission.id);
                      setCommissionGoods(await dataService.getCommissionGoods());
                      setShowCommissionModal(false);
                    }}
                    style={{ flex:1, padding:'12px', borderRadius:'10px', border:'none', background:'#fee2e2', color:'#dc2626', fontWeight:700, cursor:'pointer' }}
                  >Delete</button>
                )}
                <button
                  onClick={async () => {
                    if (!commissionForm.name.trim()) { alert('Product name is required'); return; }
                    if (editCommission) {
                      await dataService.updateCommissionGood(editCommission.id, commissionForm);
                    } else {
                      await dataService.addCommissionGood(commissionForm);
                    }
                    setCommissionGoods(await dataService.getCommissionGoods());
                    setShowCommissionModal(false);
                  }}
                  style={{ flex:2, padding:'12px', borderRadius:'10px', border:'none', background:'linear-gradient(135deg,#667eea,#764ba2)', color:'#fff', fontWeight:700, cursor:'pointer' }}
                >Save</button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* ── Move Stock Modal ── */}
      {showMoveModal && (() => {
        const isGoodsSource = moveSourceTab === 'goods';
        const srcItems = isGoodsSource
          ? goods
          : (areaItems[moveSourceTab] || []);
        const filteredMoveItems = moveSearchTerm
          ? srcItems.filter(i => (i.name || '').toLowerCase().includes(moveSearchTerm.toLowerCase()))
          : srcItems;
        // dest options: when moving FROM goods → all area tabs (no goods as dest of itself)
        //               when moving FROM area  → all area tabs + goods (Front Store), minus source
        const destOptions = isGoodsSource
          ? AREA_TABS
          : ['goods', ...AREA_TABS].filter(t => t !== moveSourceTab);
        const srcUsesPcs = !isGoodsSource && (catalogueAreas.find(a => a.key === moveSourceTab)?.pcsOnly ?? false);
        const srcField   = isGoodsSource ? 'stock_quantity' : (srcUsesPcs ? 'pcs' : 'quantity');

        return (
          <Portal>
            <Overlay className="inv-modal-overlay" onDismiss={() => setShowMoveModal(false)}>
              <div className="inv-modal-content inv-move-modal-content" onPointerDown={e => e.stopPropagation()}>

                {/* Header */}
                <div className="inv-modal-header">
                  <h2>⇄ Move Stock — {AREA_LABELS[moveSourceTab]}</h2>
                  <button className="inv-modal-close" onClick={() => setShowMoveModal(false)}><X size={20}/></button>
                </div>

                <div className="inv-modal-body">

                  {/* Step 1 — Select Item */}
                  <div className="inv-move-section-label">1. Select item to move</div>
                  {moveItem ? (
                    <div className="inv-move-search-wrap" style={{ cursor: 'default' }}>
                      <Check size={14} className="inv-move-search-icon" style={{ color: '#22c55e' }} />
                      <span className="inv-input inv-move-search-input" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-primary,#111)', fontWeight: 500 }}>
                        {moveItem.name || '—'}
                      </span>
                      <button
                        className="inv-move-search-clear"
                        onPointerDown={e => e.preventDefault()}
                        onClick={() => { setMoveItem(null); setMoveSearchTerm(''); setMoveQty(''); setMoveDestTab(''); }}
                      >
                        <X size={13}/>
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="inv-move-search-wrap">
                        <Search size={14} className="inv-move-search-icon" />
                        <input
                          className="inv-input inv-move-search-input"
                          placeholder={`Search in ${AREA_LABELS[moveSourceTab]}…`}
                          value={moveSearchTerm}
                          onChange={e => { setMoveSearchTerm(e.target.value); setMoveItem(null); }}
                        />
                        {moveSearchTerm && (
                          <button className="inv-move-search-clear" onPointerDown={e => e.preventDefault()} onClick={() => { setMoveSearchTerm(''); setMoveItem(null); }}>
                            <X size={13}/>
                          </button>
                        )}
                      </div>

                      <div className="inv-move-item-list">
                        {filteredMoveItems.length === 0 ? (
                          <div className="inv-move-empty">
                            {moveSearchTerm ? `No items matching "${moveSearchTerm}"` : 'No items in this storage area.'}
                          </div>
                        ) : (
                          filteredMoveItems.map(item => {
                            const stock = item[srcField] != null && item[srcField] !== '' ? item[srcField] : 0;
                            return (
                              <div
                                key={item.id}
                                className="inv-move-item-row"
                                onClick={() => { setMoveItem(item); setMoveQty(''); }}
                              >
                                <div className="inv-move-item-name">{item.name || '—'}</div>
                                <div className="inv-move-item-stock">
                                  {isGoodsSource ? 'Stock' : (srcField === 'pcs' ? 'Pcs' : 'Qty')}: <strong>{item[srcField] ?? 0}</strong>
                                  {isGoodsSource && item.size ? <span style={{ color:'#9ca3af', marginLeft: 6, fontSize:'11px' }}>({item.size})</span> : null}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </>
                  )}

                  {/* Step 2 — Quantity */}
                  {moveItem && (
                    <>
                      <div className="inv-move-section-label" style={{ marginTop: 18 }}>
                        2. Quantity to move
                        <span className="inv-move-available">
                          Available: {moveItem[srcField] ?? 0}
                        </span>
                      </div>
                      <input
                        className="inv-input"
                        type="number"
                        min="1"
                        max={moveItem[srcField] ?? undefined}
                        placeholder={`Max ${moveItem[srcField] ?? 0}`}
                        value={moveQty}
                        onChange={e => setMoveQty(e.target.value)}
                      />
                    </>
                  )}

                  {/* Step 3 — Destination */}
                  {moveItem && (
                    <>
                      <div className="inv-move-section-label" style={{ marginTop: 18 }}>3. Move to</div>
                      <div className="inv-move-dest-grid">
                        {destOptions.map(tab => (
                          <button
                            key={tab}
                            className={`inv-move-dest-btn${moveDestTab === tab ? ' inv-move-dest-btn-active' : ''}`}
                            onClick={() => {
                              setMoveDestTab(tab);
                              setMoveSellWhole(false);
                              if (tab === 'singles') {
                                const size = moveItem.size || (isGoodsSource ? moveItem.size : '');
                                setMoveUnitName(parseUnitName(size));
                              } else {
                                setMoveUnitName('');
                              }
                            }}
                          >
                            {AREA_LABELS[tab]}
                          </button>
                        ))}
                      </div>
                      {moveDestTab === 'goods' && !isGoodsSource && (() => {
                        const packSize = parsePackSize(moveItem.size, moveItem);
                        const qtyNum   = parseInt(moveQty, 10) || 0;
                        const hasUnits = packSize > 1;
                        return (
                          <div style={{ marginTop: 14 }}>
                            {hasUnits && (
                              <>
                                <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: 8, color: 'var(--text-primary,#111)' }}>
                                  How will this be sold in Front Store?
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                  {/* Option A: break into units */}
                                  <label style={{
                                    display: 'flex', alignItems: 'flex-start', gap: 10,
                                    padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                                    border: `2px solid ${!moveSellWhole ? '#059669' : 'var(--border,#e5e7eb)'}`,
                                    background: !moveSellWhole ? 'rgba(5,150,105,0.06)' : 'var(--surface-alt,#f3f4f6)',
                                  }}>
                                    <input type="radio" name="sellMode" checked={!moveSellWhole}
                                      onChange={() => setMoveSellWhole(false)}
                                      style={{ marginTop: 2, accentColor: '#059669' }} />
                                    <div>
                                      <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary,#111)' }}>
                                        Break into {packSize} individual units
                                      </div>
                                      <div style={{ fontSize: '12px', color: '#6b7280', marginTop: 2 }}>
                                        {qtyNum > 0
                                          ? `+${qtyNum * packSize} units added to Front Store`
                                          : `Each bag/carton → ${packSize} units in Front Store`}
                                      </div>
                                    </div>
                                  </label>
                                  {/* Option B: sell whole */}
                                  <label style={{
                                    display: 'flex', alignItems: 'flex-start', gap: 10,
                                    padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                                    border: `2px solid ${moveSellWhole ? '#2563eb' : 'var(--border,#e5e7eb)'}`,
                                    background: moveSellWhole ? 'rgba(37,99,235,0.06)' : 'var(--surface-alt,#f3f4f6)',
                                  }}>
                                    <input type="radio" name="sellMode" checked={moveSellWhole}
                                      onChange={() => setMoveSellWhole(true)}
                                      style={{ marginTop: 2, accentColor: '#2563eb' }} />
                                    <div>
                                      <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary,#111)' }}>
                                        Sell whole bag/carton as-is
                                      </div>
                                      <div style={{ fontSize: '12px', color: '#6b7280', marginTop: 2 }}>
                                        {qtyNum > 0
                                          ? `+${qtyNum} unit${qtyNum !== 1 ? 's' : ''} added to Front Store`
                                          : 'Moves as-is — no unpacking'}
                                      </div>
                                    </div>
                                  </label>
                                </div>
                              </>
                            )}
                            {!hasUnits && (
                              <div style={{ padding: '10px 12px', background: 'var(--surface-alt,#f3f4f6)', borderRadius: 8, fontSize: '13px', color: 'var(--text-secondary,#6b7280)' }}>
                                {qtyNum > 0
                                  ? <><span style={{ fontWeight: 600, color: '#059669' }}>+{qtyNum}</span> unit{qtyNum !== 1 ? 's' : ''} added to Front Store stock</>
                                  : 'Set a quantity above to see the preview.'}
                                <div style={{ marginTop: 4, fontSize: '11px' }}>
                                  💡 Tip: add a <strong>Units per pack</strong> value to this item to enable break-down or sell-whole options.
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      {moveDestTab === 'singles' && (
                        <div style={{ marginTop: 14 }}>
                          <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '5px', color: 'var(--text-primary,#111)' }}>
                            Unit name <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: '12px' }}>(e.g. roll, can, pc)</span>
                          </label>
                          <input
                            className="inv-input"
                            placeholder="e.g. roll, can, bottle, pc"
                            value={moveUnitName}
                            onChange={e => setMoveUnitName(e.target.value)}
                            style={{ fontSize: '14px' }}
                          />
                        </div>
                      )}
                    </>
                  )}

                  {/* Actions */}
                  <div className="inv-form-actions" style={{ marginTop: 24 }}>
                    <button className="inv-btn-cancel" onClick={() => setShowMoveModal(false)} disabled={moveSaving}>
                      Cancel
                    </button>
                    <button
                      className="inv-move-confirm-btn"
                      onClick={handleMoveStock}
                      disabled={moveSaving || !moveItem || !moveDestTab || !moveQty}
                    >
                      {moveSaving ? 'Moving…' : '⇄ Confirm Move'}
                    </button>
                  </div>

                </div>
              </div>
            </Overlay>
          </Portal>
        );
      })()}

      {/* ── Asset Detail Modal ── */}
      {assetDetailItem && (
        <Portal>
          <div
            style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}
            onClick={() => setAssetDetailItem(null)}
          >
            <div
              style={{ background:'var(--surface,white)', borderRadius:'16px', width:'100%', maxWidth:'380px', maxHeight:'85vh', overflowY:'auto', boxShadow:'0 12px 40px rgba(0,0,0,0.25)' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 18px 12px', borderBottom:'1px solid var(--border,#e5e7eb)' }}>
                <h3 style={{ margin:0, fontSize:'15px', fontWeight:700, color:'var(--text-primary,#111)' }}>📋 Asset Details</h3>
                <button onClick={() => setAssetDetailItem(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-secondary,#6b7280)', padding:'2px' }}><X size={20}/></button>
              </div>
              <div style={{ padding:'16px 18px', display:'flex', flexDirection:'column', gap:'10px' }}>
                {[
                  ['Asset Name',    assetDetailItem.name       || '—'],
                  ['Quantity',      assetDetailItem.qty        ?? '—'],
                  ['Unit Cost',     fmt(parseFloat(assetDetailItem.costPrice || 0))],
                  ['Subtotal',      fmt(parseFloat(assetDetailItem.subtotal  || 0))],
                  ['Supplier',      assetDetailItem.supplierName || '—'],
                  ['Invoice / Ref', assetDetailItem.invoiceRef  || '—'],
                  ['Payment',       assetDetailItem.paymentType === 'cash' ? 'Cash' : 'Credit'],
                  ['Comments',      assetDetailItem.comments   || '—'],
                  ['Date',          formatDate(assetDetailItem.date)],
                ].map(([label, value]) => (
                  <div key={label} style={{ display:'flex', justifyContent:'space-between', gap:'12px', fontSize:'13px', borderBottom:'1px solid var(--border,#f3f4f6)', paddingBottom:'8px' }}>
                    <span style={{ fontWeight:600, color:'var(--text-secondary,#6b7280)', flexShrink:0 }}>{label}</span>
                    <span style={{ color:'var(--text-primary,#111)', textAlign:'right', wordBreak:'break-word' }}>{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Portal>
      )}

    </div>
  );
}

export default Inventory;
