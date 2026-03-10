import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, ZoomIn, Camera, Upload, Check, Crop, RotateCcw, Save, Pencil, FileText } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import dataService from '../services/dataService';
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
const CATEGORIES = [
  'Baked Goods', 'Batteries', 'Beverages', 'Canned Food',
  'Cleaning Supplies', 'Clothes', 'Dairy', 'Fresh Meats',
  'Hardware', 'Personal Care', 'Pet Supplies', 'Produce',
  'Sewing Supplies', 'Snacks', 'Spices', 'Tobacco', 'Toiletries',
];

function CategorySelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef(null);
  const filtered = CATEGORIES.filter(c => c.toLowerCase().includes(search.toLowerCase()));

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
function EditProductModal({ good, onUpdate, onDelete, onCancel }) {
  const [form, setForm] = useState({
    name:           good.name           || '',
    size:           good.size           || '',
    category:       good.category       || '',
    price:          good.price          !== undefined ? good.price : '',
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
                  <label>Size * <span className="inv-label-hint">(e.g. 300g, 1L, 2kg)</span></label>
                  <input className="inv-input" value={form.size}
                    onChange={e => setForm(p => ({ ...p, size: e.target.value }))}
                    placeholder="e.g. 300g, 1L, 2kg" />
                </div>

                <div className="inv-form-group">
                  <label>Category *</label>
                  <CategorySelect value={form.category} onChange={val => setForm(p => ({ ...p, category: val }))} />
                </div>

                <div className="inv-form-row">
                  <div className="inv-form-group">
                    <label>Selling Price *</label>
                    <input className="inv-input" type="number" min="0" step="0.01"
                      value={form.price ?? ''} placeholder="0.00"
                      onChange={e => setForm(p => ({ ...p, price: e.target.value }))} />
                  </div>
                  <div className="inv-form-group">
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

  // ── Storage-area tabs: Container / Storeroom / Tent / Tent-in-Store ──────────
  const AREA_TABS = ['container', 'storeroom', 'tent', 'tent_in_store'];
  const [areaItems,   setAreaItems]   = useState({});
  const [areaLoading, setAreaLoading] = useState({});
  const [areaLastSynced, setAreaLastSynced] = useState({});
  const [showAreaAddModal,  setShowAreaAddModal]  = useState(false);
  const [editingAreaItem,   setEditingAreaItem]   = useState(null);
  const AREA_FORM_BLANK = { name:'', barcode:'', quantity:'', pcs:'', size:'', price:'', notes:'' };
  const [areaForm, setAreaForm] = useState(AREA_FORM_BLANK);
  const [areaSaving, setAreaSaving] = useState(false);

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
    setEditingGood(null);
  };

  const handleDeleteGood = async (id) => {
    await dataService.deleteGood(id);
    await loadGoods();
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
        />
      )}

      {/* ── Sticky bar ── */}
      <div className="inv-sticky-bar">
        <div className="inv-tab-row">
          <button
            className={`inv-tab-btn${activeTab === 'goods' ? ' inv-tab-btn-active' : ''}`}
            onClick={() => handleTabChange('goods')}
          >
            📦 Goods
          </button>
          <button className={`inv-tab-btn${activeTab === 'container'     ? ' inv-tab-btn-active inv-tab-btn-active-container'   : ''}`} onClick={() => handleTabChange('container')}>📦 Container</button>
          <button className={`inv-tab-btn${activeTab === 'storeroom'     ? ' inv-tab-btn-active inv-tab-btn-active-storeroom'   : ''}`} onClick={() => handleTabChange('storeroom')}>🗄️ Storeroom</button>
          <button className={`inv-tab-btn${activeTab === 'tent'          ? ' inv-tab-btn-active inv-tab-btn-active-tent'        : ''}`} onClick={() => handleTabChange('tent')}>⛺ Tent</button>
          <button className={`inv-tab-btn${activeTab === 'tent_in_store' ? ' inv-tab-btn-active inv-tab-btn-active-tent-in-store' : ''}`} onClick={() => handleTabChange('tent_in_store')}>🧺 Tent in Store</button>
          <button
            className={`inv-tab-btn${activeTab === 'assets' ? ' inv-tab-btn-active inv-tab-btn-active-assets' : ''}`}
            onClick={() => handleTabChange('assets')}
          >
            🔧 Operational Assets
          </button>
          <button
            className={`inv-tab-btn${activeTab === 'commission' ? ' inv-tab-btn-active inv-tab-btn-active-commission' : ''}`}
            onClick={() => handleTabChange('commission')}
          >
            🤝 Commission
          </button>
        </div>

        {activeTab === 'commission' && (
          <div style={{ padding:'6px 12px 2px', borderTop:'1px solid var(--border,#e5e7eb)' }}>
            <div style={{ fontWeight:700, fontSize:'14px', color:'var(--text-primary,#111)' }}>Commission Products</div>
            <div style={{ fontSize:'11px', color:'var(--text-secondary,#6b7280)', marginTop:'1px' }}>Products sold on behalf of others. Shop earns a commission per sale.</div>
          </div>
        )}
        {activeTab === 'container' && (
          <div style={{ padding:'6px 12px 2px', borderTop:'1px solid var(--border,#e5e7eb)' }}>
            <div style={{ fontWeight:700, fontSize:'14px', color:'var(--text-primary,#111)' }}>📦 Container</div>
            <div style={{ fontSize:'11px', color:'var(--text-secondary,#6b7280)', marginTop:'1px' }}>Stock stored in the container. Tracks cartons, pieces, size and price.</div>
          </div>
        )}
        {activeTab === 'storeroom' && (
          <div style={{ padding:'6px 12px 2px', borderTop:'1px solid var(--border,#e5e7eb)' }}>
            <div style={{ fontWeight:700, fontSize:'14px', color:'var(--text-primary,#111)' }}>🗄️ Storeroom</div>
            <div style={{ fontSize:'11px', color:'var(--text-secondary,#6b7280)', marginTop:'1px' }}>Stock held in the storeroom.</div>
          </div>
        )}
        {activeTab === 'tent' && (
          <div style={{ padding:'6px 12px 2px', borderTop:'1px solid var(--border,#e5e7eb)' }}>
            <div style={{ fontWeight:700, fontSize:'14px', color:'var(--text-primary,#111)' }}>⛺ Tent</div>
            <div style={{ fontSize:'11px', color:'var(--text-secondary,#6b7280)', marginTop:'1px' }}>Items displayed and sold from the tent.</div>
          </div>
        )}
        {activeTab === 'tent_in_store' && (
          <div style={{ padding:'6px 12px 2px', borderTop:'1px solid var(--border,#e5e7eb)' }}>
            <div style={{ fontWeight:700, fontSize:'14px', color:'var(--text-primary,#111)' }}>🧺 Tent in Store</div>
            <div style={{ fontSize:'11px', color:'var(--text-secondary,#6b7280)', marginTop:'1px' }}>Tent stock stored inside the building.</div>
          </div>
        )}

        <div className="inv-toolbar">
          <div className="inv-search-box">
            <Search size={16} className="inv-search-icon" />
            <input
              type="text"
              className="inv-search-input"
              placeholder={
                activeTab === 'goods'         ? 'Search Front Store Product' :
                activeTab === 'assets'        ? 'Search Asset'               :
                activeTab === 'commission'    ? 'Search Commission Product'   :
                activeTab === 'container'     ? 'Search Container Items'      :
                activeTab === 'storeroom'     ? 'Search Storeroom Items'      :
                activeTab === 'tent'          ? 'Search Tent Items'           :
                activeTab === 'tent_in_store' ? 'Search Tent in Store Items'  : 'Search'
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
                    <th className="inv-col-center">BARCODE</th>
                    <th className="inv-col-center">EDIT</th>
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
                        <td className="inv-col-center">
                          {barcodeImgUrl ? (
                            <button className="inv-barcode-thumb-btn"
                              onClick={() => setLightboxSrc(barcodeImgUrl)} title="View barcode image">
                              <ZoomIn size={18} strokeWidth={1.8} />
                            </button>
                          ) : <span className="inv-barcode-none">—</span>}
                        </td>
                        <td className="inv-col-center">
                          <button
                            className="inv-edit-row-btn"
                            onClick={() => setEditingGood(good)}
                            title="Edit product"
                          >
                            <Pencil size={15} strokeWidth={2} />
                          </button>
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

          const isTent        = activeTab === 'tent';
          const isTentInStore = activeTab === 'tent_in_store';

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
                    {!isTent && !isTentInStore && <th>BARCODE</th>}
                    {!isTent && !isTentInStore && <th className="inv-col-center">CTN / QTY</th>}
                    <th className="inv-col-center">PCS</th>
                    {!isTent && !isTentInStore && <th>SIZE</th>}
                    <th className="inv-col-right">PRICE</th>
                    {!isTent && !isTentInStore && <th>NOTES</th>}
                    <th className="inv-col-center">EDIT</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item, idx) => (
                    <tr key={item.id} className="inv-data-row">
                      <td className="inv-col-frozen inv-col-num inv-num-cell">{idx + 1}</td>
                      <td className="inv-col-name inv-name-cell">
                        <span className="inv-cell-value">{item.name || '—'}</span>
                      </td>
                      {!isTent && !isTentInStore && (
                        <td className="inv-cat-cell">{item.barcode || '—'}</td>
                      )}
                      {!isTent && !isTentInStore && (
                        <td className="inv-col-center">
                          <span className="inv-cell-value">{item.quantity ?? '—'}</span>
                        </td>
                      )}
                      <td className="inv-col-center">
                        <span className="inv-cell-value">{item.pcs ?? '—'}</span>
                      </td>
                      {!isTent && !isTentInStore && (
                        <td className="inv-size-cell">
                          <span className="inv-cell-value">{item.size || '—'}</span>
                        </td>
                      )}
                      <td className="inv-col-right">
                        <span className="inv-cell-value">{item.price != null && item.price !== '' ? fmt(parseFloat(item.price)) : '—'}</span>
                      </td>
                      {!isTent && !isTentInStore && (
                        <td className="inv-cat-cell" style={{ maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {item.notes || '—'}
                        </td>
                      )}
                      <td className="inv-col-center">
                        <button
                          className="inv-edit-row-btn"
                          onClick={() => {
                            setEditingAreaItem(item);
                            setAreaForm({
                              name:     item.name     || '',
                              barcode:  item.barcode  || '',
                              quantity: item.quantity != null ? String(item.quantity) : '',
                              pcs:      item.pcs      != null ? String(item.pcs)      : '',
                              size:     item.size     || '',
                              price:    item.price    != null ? String(item.price)    : '',
                              notes:    item.notes    || '',
                            });
                            setShowAreaAddModal(true);
                          }}
                          title="Edit item"
                        >
                          <Pencil size={15} strokeWidth={2} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}

        {/* ── COMMISSION TAB ── */}
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
        const isTent        = activeTab === 'tent';
        const isTentInStore = activeTab === 'tent_in_store';
        const areaLabels    = {
          container:     '📦 Container',
          storeroom:     '🗄️ Storeroom',
          tent:          '⛺ Tent',
          tent_in_store: '🧺 Tent in Store',
        };
        const isEdit = !!editingAreaItem;
        return (
          <Portal>
            <Overlay className="inv-modal-overlay" onDismiss={() => { setShowAreaAddModal(false); setEditingAreaItem(null); setAreaForm(AREA_FORM_BLANK); }}>
              <div className="inv-modal-content" onPointerDown={e => e.stopPropagation()}>
                <div className="inv-modal-header">
                  <h2>{isEdit ? 'Edit' : 'Add'} — {areaLabels[activeTab]}</h2>
                  <button className="inv-modal-close" onClick={() => { setShowAreaAddModal(false); setEditingAreaItem(null); setAreaForm(AREA_FORM_BLANK); }}><X size={20}/></button>
                </div>
                <div className="inv-modal-body">
                  <div className="inv-edit-form">

                    <div className="inv-form-group">
                      <label>Name *</label>
                      <input className="inv-input" value={areaForm.name} placeholder="Item name"
                        onChange={e => setAreaForm(f => ({...f, name: e.target.value}))} />
                    </div>

                    {!isTent && !isTentInStore && (
                      <div className="inv-form-group">
                        <label>Barcode <span className="inv-label-hint">(optional)</span></label>
                        <input className="inv-input" value={areaForm.barcode} placeholder="Barcode number"
                          onChange={e => setAreaForm(f => ({...f, barcode: e.target.value}))} />
                      </div>
                    )}

                    <div className="inv-form-row">
                      {!isTent && !isTentInStore && (
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

                    {!isTent && !isTentInStore && (
                      <div className="inv-form-group">
                        <label>Size <span className="inv-label-hint">(optional, e.g. 300g, 1L)</span></label>
                        <input className="inv-input" value={areaForm.size} placeholder="e.g. 300g, 1L"
                          onChange={e => setAreaForm(f => ({...f, size: e.target.value}))} />
                      </div>
                    )}

                    <div className="inv-form-group">
                      <label>Price <span className="inv-label-hint">(optional)</span></label>
                      <input className="inv-input" type="number" min="0" step="0.01" value={areaForm.price} placeholder="0.00"
                        onChange={e => setAreaForm(f => ({...f, price: e.target.value}))} />
                    </div>

                    {!isTent && !isTentInStore && (
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
