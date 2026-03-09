/**
 * tablePdf.js
 * Shared utility: export any HTML table to a branded A4 PDF.
 *
 * Usage:
 *   import { exportTableToPDF } from '../utils/tablePdf';
 *   exportTableToPDF({ title: 'Sales Journal', rows, columns, summary });
 *
 * columns: [{ header: 'Date', key: 'date' }, ...]
 * rows:    array of objects keyed by column.key
 * summary: [{ label: 'Total', value: '1,234.00' }, ...]  (optional)
 */
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export async function exportTableToPDF({ title, columns, rows, summary = [] }) {
      
  const pageW  = 210;
  const pageH  = 297;
  const margin = 12;
  const pdf    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ── 1. Logo ──────────────────────────────────────────────────────────────
  let logoDone = false;
  try {
    const res = await fetch('/a.c.t-logo.png');
    if (res.ok) {
      const blob = await res.blob();
      const b64  = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob);
      });
      const img = new Image();
      await new Promise(resolve => { img.onload = resolve; img.onerror = resolve; img.src = b64; });
      const ratio = img.naturalHeight / (img.naturalWidth || 1);
      const lw = 26, lh = Math.min(lw * ratio, 16);
      pdf.addImage(b64, 'PNG', margin, 5, lw, lh);
      logoDone = true;
    }
  } catch (_) {}

  // ── 2. Header bar ────────────────────────────────────────────────────────
  pdf.setFillColor(102, 126, 234);
  pdf.rect(0, 0, pageW, 24, 'F');
  if (!logoDone) {
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(12); pdf.setFont('helvetica', 'bold');
    pdf.text('A.C.T Services', margin, 11);
  }
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(10); pdf.setFont('helvetica', 'bold');
  pdf.text(title, logoDone ? margin + 28 : margin, logoDone ? 11 : 19);
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  pdf.setFontSize(7); pdf.setFont('helvetica', 'normal');
  pdf.text(`Generated: ${today}`, pageW - margin, 19, { align: 'right' });

  // ── 3. Table ─────────────────────────────────────────────────────────────
  const startY = 30;
  const head   = [columns.map(c => c.header)];
  const body   = rows.map(row => columns.map(c => {
    const val = row[c.key];
    return val !== undefined && val !== null ? String(val) : '—';
  }));

  if (body.length === 0) body.push([{ content: 'No data', colSpan: columns.length, styles: { halign: 'center', textColor: [150, 150, 150] } }]);

  pdf.autoTable({
    startY,
    head,
    body,
    margin: { left: margin, right: margin },
    styles: { fontSize: 7.5, cellPadding: 2.5, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: [102, 126, 234], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 248, 252] },
  });

  // ── 4. Summary ───────────────────────────────────────────────────────────
  if (summary.length > 0) {
    let sy = pdf.lastAutoTable.finalY + 6;
    summary.forEach(({ label, value }) => {
      pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(80, 80, 80);
      pdf.text(label + ':', pageW - margin - 60, sy);
      pdf.setFont('helvetica', 'bold'); pdf.setTextColor(20, 20, 20);
      pdf.text(String(value), pageW - margin, sy, { align: 'right' });
      sy += 6;
    });
  }

  // ── 5. Footer ────────────────────────────────────────────────────────────
  pdf.setFontSize(6.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(160, 160, 160);
  pdf.text('A.C.T Services — Confidential', pageW / 2, pageH - 6, { align: 'center' });

  // ── 6. Open PDF via "Open with" chooser (Google Drive, PDF viewer, etc.) ─
  const fileName = `${title.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
  const isNative = window.Capacitor?.isNativePlatform?.();
  if (isNative) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      const pdfBlob = pdf.output('blob');
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(pdfBlob);
      });
      await Filesystem.writeFile({ path: fileName, data: b64, directory: Directory.Cache });
      const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
      // Opens Android "Open with" chooser — Google Drive, PDF viewers, etc.
      await Share.share({ url: uri, dialogTitle: `Open ${title}` });
      return;
    } catch (err) {
      console.error('Native PDF open error:', err);
      // Fallback: open as blob URL
      const blobUrl = URL.createObjectURL(pdf.output('blob'));
      window.open(blobUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
      return;
    }
  }
  pdf.save(fileName);
}
