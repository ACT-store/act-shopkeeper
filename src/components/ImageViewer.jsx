import React, { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * ImageViewer — fullscreen overlay for viewing any image.
 *
 * Usage:
 *   const [viewImg, setViewImg] = useState(null);
 *   <img src={url} onClick={() => setViewImg(url)} style={{cursor:'pointer'}} />
 *   {viewImg && <ImageViewer src={viewImg} onClose={() => setViewImg(null)} />}
 */
export default function ImageViewer({ src, onClose, alt = 'Image preview' }) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!src) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.92)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        cursor: 'zoom-out',
      }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          background: 'rgba(255,255,255,0.15)',
          border: 'none',
          borderRadius: '50%',
          width: 40,
          height: 40,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          zIndex: 1,
        }}
        aria-label="Close"
      >
        <X size={22} />
      </button>

      {/* Image — stop propagation so clicking the image itself doesn't close */}
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '100%',
          maxHeight: '90vh',
          borderRadius: '8px',
          objectFit: 'contain',
          boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
          cursor: 'default',
        }}
      />
    </div>
  );
}
