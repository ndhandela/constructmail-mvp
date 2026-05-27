import React, { useState, useRef, useEffect } from 'react';
import '../styles/VendorExport.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const EXPORT_COLUMNS = [
  { key: 'name',             label: 'Vendor Name'       },
  { key: 'trade',            label: 'Trade'             },
  { key: 'city',             label: 'City'              },
  { key: 'state',            label: 'State'             },
  { key: 'phone',            label: 'Phone'             },
  { key: 'email',            label: 'Email'             },
  { key: 'website',          label: 'Website'           },
  { key: 'address',          label: 'Address'           },
  { key: 'zip',              label: 'ZIP'               },
  { key: 'insurance_status', label: 'Insurance Status'  },
  { key: 'avg_rating',       label: 'Avg Rating'        },
  { key: 'review_count',     label: 'Reviews'           },
  { key: 'created_at',       label: 'Date Added'        },
];

async function fetchAllVendors(filters) {
  const queryParams = new URLSearchParams({
    ...filters,
    limit: 10000,
    offset: 0,
  });
  const response = await fetch(`${API_BASE_URL}/api/vendors?${queryParams}`, {
    headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error || 'Failed to fetch vendors');
  return data.vendors;
}

function formatValue(vendor, key) {
  if (key === 'avg_rating') return (parseFloat(vendor[key]) || 0).toFixed(1);
  if (key === 'insurance_status') {
    const map = { verified: 'Verified', pending: 'Pending', not_verified: 'Not Verified' };
    return map[vendor[key]] || vendor[key] || '';
  }
  if (key === 'created_at') {
    return vendor[key] ? new Date(vendor[key]).toLocaleDateString('en-US') : '';
  }
  return vendor[key] || '';
}

// ── CSV ──────────────────────────────────────────────────────────────────────

function generateCSV(vendors) {
  const header = EXPORT_COLUMNS.map(c => `"${c.label}"`).join(',');
  const rows = vendors.map(v =>
    EXPORT_COLUMNS.map(c => {
      const val = String(formatValue(v, c.key)).replace(/"/g, '""');
      return `"${val}"`;
    }).join(',')
  );
  return [header, ...rows].join('\r\n');
}

function downloadCSV(vendors, filterLabel) {
  const csv = generateCSV(vendors);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pomar-vendors${filterLabel ? `-${filterLabel}` : ''}-${today()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── PDF ──────────────────────────────────────────────────────────────────────

async function downloadPDF(vendors, filterLabel) {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });

  // Header bar
  doc.setFillColor(26, 26, 46); // --inkwell
  doc.rect(0, 0, doc.internal.pageSize.width, 48, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('POMAR', 36, 30);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Contractor & Supplier Intelligence', 36, 43);

  doc.setTextColor(180, 180, 180);
  doc.setFontSize(9);
  const rightX = doc.internal.pageSize.width - 36;
  doc.text(`Exported ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, rightX, 22, { align: 'right' });
  if (filterLabel) doc.text(`Filters: ${filterLabel}`, rightX, 36, { align: 'right' });
  doc.text(`${vendors.length} vendor${vendors.length !== 1 ? 's' : ''}`, rightX, 43, { align: 'right' });

  // Table
  const tableColumns = EXPORT_COLUMNS.filter(c => c.key !== 'address' && c.key !== 'zip'); // keep it lean in PDF
  autoTable(doc, {
    startY: 60,
    head: [tableColumns.map(c => c.label)],
    body: vendors.map(v => tableColumns.map(c => formatValue(v, c.key))),
    styles: {
      fontSize: 8,
      cellPadding: 4,
      textColor: [26, 26, 46],
      lineColor: [229, 231, 235],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: [26, 26, 46],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    alternateRowStyles: {
      fillColor: [250, 248, 244], // --parchment
    },
    columnStyles: {
      0: { cellWidth: 110 }, // Vendor Name
      1: { cellWidth: 70  }, // Trade
      4: { cellWidth: 80  }, // Phone
      5: { cellWidth: 110 }, // Email
    },
    didDrawPage: (data) => {
      // Footer
      const pageCount = doc.internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Page ${data.pageNumber} of ${pageCount}  ·  pomar.ai`,
        doc.internal.pageSize.width / 2,
        doc.internal.pageSize.height - 12,
        { align: 'center' }
      );
    },
  });

  doc.save(`pomar-vendors${filterLabel ? `-${filterLabel}` : ''}-${today()}.pdf`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10);
}

function buildFilterLabel(filters) {
  const parts = [];
  if (filters.trade) parts.push(filters.trade);
  if (filters.city) parts.push(filters.city);
  if (filters.insurance_status) parts.push(filters.insurance_status.replace('_', '-'));
  if (filters.min_rating) parts.push(`${filters.min_rating}star+`);
  if (filters.search) parts.push(filters.search);
  return parts.join('-').toLowerCase().replace(/\s+/g, '-');
}

// ── Component ────────────────────────────────────────────────────────────────

export default function VendorExport({ filters }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(null); // 'csv' | 'pdf' | null
  const [error, setError] = useState('');
  const ref = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleExport = async (type) => {
    setOpen(false);
    setLoading(type);
    setError('');
    try {
      const vendors = await fetchAllVendors(filters);
      const label = buildFilterLabel(filters);
      if (type === 'csv') {
        downloadCSV(vendors, label);
      } else {
        await downloadPDF(vendors, label);
      }
    } catch (err) {
      console.error('Export error:', err);
      setError('Export failed. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="vendor-export" ref={ref}>
      <button
        className="export-btn"
        onClick={() => setOpen(o => !o)}
        disabled={!!loading}
      >
        {loading ? `Exporting ${loading.toUpperCase()}…` : '⬇ Export'}
        <span className="export-caret">▾</span>
      </button>

      {open && (
        <div className="export-dropdown">
          <button className="export-option" onClick={() => handleExport('csv')}>
            <span className="export-option-icon">📄</span>
            <div>
              <div className="export-option-title">Export CSV</div>
              <div className="export-option-desc">Opens in Excel / Google Sheets</div>
            </div>
          </button>
          <button className="export-option" onClick={() => handleExport('pdf')}>
            <span className="export-option-icon">📋</span>
            <div>
              <div className="export-option-title">Export PDF</div>
              <div className="export-option-desc">POMAR branded vendor report</div>
            </div>
          </button>
        </div>
      )}

      {error && <p className="export-error">{error}</p>}
    </div>
  );
}
