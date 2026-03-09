/**
 * PdfTableButton
 * A tiny PDF icon button placed at the top-right of any table wrapper.
 *
 * Props:
 *   title   – string – PDF title (e.g. 'Sales Journal')
 *   columns – [{ header, key }]
 *   rows    – [{ [key]: value }]
 *   summary – [{ label, value }]  (optional)
 */
import React, { useState } from 'react';
import { exportTableToPDF } from '../utils/tablePdf';

export default function PdfTableButton({ title, columns, rows, summary = [] }) {
  const [busy, setBusy] = useState(false);

  const handleClick = async (e) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      await exportTableToPDF({ title, columns, rows, summary });
    } catch (err) {
      console.error('PDF export error:', err);
      alert('Could not generate PDF. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      title={`Export ${title} to PDF`}
      style={{
        position: 'absolute',
        top: '8px',
        right: '8px',
        zIndex: 10,
        background: busy ? '#e5e7eb' : 'transparent',
        border: '1px solid #d1d5db',
        borderRadius: '5px',
        padding: '3px 5px',
        cursor: busy ? 'wait' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.15s',
      }}
    >
      {busy ? (
        <span style={{ fontSize: '11px', color: '#6b7280' }}>…</span>
      ) : (
        /* Official PDF icon — red rectangle with white letters */
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="22" height="22" rx="3" fill="#DC2626"/>
          <text x="11" y="15" textAnchor="middle" fill="white"
            fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="8">PDF</text>
        </svg>
      )}
    </button>
  );
}
