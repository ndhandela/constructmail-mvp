import React, { useState, useRef } from 'react';
import '../styles/CSVImport.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function CSVImport({ userId, onImportComplete }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [message, setMessage] = useState('');
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && selectedFile.type === 'text/csv') {
      setFile(selectedFile);
      setMessage('');
    } else {
      setMessage('❌ Please select a valid CSV file');
      setFile(null);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type === 'text/csv') {
      setFile(droppedFile);
      setMessage('');
    } else {
      setMessage('❌ Please drop a valid CSV file');
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setMessage('❌ Please select a file first');
      return;
    }

    setUploading(true);
    setMessage('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('userId', userId);

      const response = await fetch(`${API_BASE_URL}/api/vendors/bulk-import`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (data.success) {
        setImportResult({
          imported: data.imported.length,
          failed: data.failed.length,
          details: data
        });
        setMessage(`✅ Import complete: ${data.imported.length} vendors added`);
        setFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        if (onImportComplete) {
          onImportComplete();
        }
      } else {
        setMessage(`❌ ${data.error || 'Import failed'}`);
      }
    } catch (err) {
      console.error('Upload error:', err);
      setMessage('❌ Upload failed - check console');
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = () => {
    const headers = ['name', 'trade', 'phone', 'email', 'address', 'city', 'state', 'zip', 'website', 'insurance_status'];
    const templateContent = headers.join(',') + '\n' +
      'ABC Electrical,Electrical,972-555-1234,contact@abc.com,123 Main St,Dallas,TX,75201,https://abc.com,verified\n' +
      'Smith Plumbing,Plumbing,214-555-5678,info@smith.com,456 Oak Ave,Houston,TX,77001,https://smith.com,pending';
    
    const blob = new Blob([templateContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'vendors-template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="csv-import">
      <div className="csv-import-header">
        <h3>📥 Bulk Import Vendors</h3>
        <p>Upload a CSV file to add multiple vendors at once</p>
      </div>

      <div className="csv-import-content">
        {!importResult ? (
          <>
            <div
              className="csv-drop-zone"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <div className="csv-drop-icon">📄</div>
              <p className="csv-drop-text">Drag and drop your CSV file here</p>
              <p className="csv-drop-subtext">or</p>
              <button
                className="csv-browse-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                Browse Files
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
                disabled={uploading}
              />
            </div>

            {file && (
              <div className="csv-file-selected">
                <span className="csv-file-icon">✓</span>
                <span className="csv-file-name">{file.name}</span>
                <button
                  className="csv-remove-btn"
                  onClick={() => {
                    setFile(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                    }
                  }}
                  disabled={uploading}
                >
                  Remove
                </button>
              </div>
            )}

            <div className="csv-template-section">
              <p className="csv-template-label">CSV Format:</p>
              <p className="csv-template-text">name, trade, phone, email, address, city, state, zip, website, insurance_status</p>
              <button
                className="csv-template-btn"
                onClick={downloadTemplate}
              >
                📋 Download Template
              </button>
            </div>

            {message && (
              <div className={`csv-message ${message.includes('✅') ? 'success' : 'error'}`}>
                {message}
              </div>
            )}

            <button
              className="csv-upload-btn"
              onClick={handleUpload}
              disabled={!file || uploading}
            >
              {uploading ? 'Uploading...' : 'Upload & Import'}
            </button>
          </>
        ) : (
          <div className="csv-result">
            <div className="csv-result-header">
              <h4>✅ Import Complete</h4>
            </div>
            <div className="csv-result-stats">
              <div className="stat-box success">
                <span className="stat-number">{importResult.imported}</span>
                <span className="stat-label">Vendors Added</span>
              </div>
              {importResult.failed > 0 && (
                <div className="stat-box error">
                  <span className="stat-number">{importResult.failed}</span>
                  <span className="stat-label">Failed</span>
                </div>
              )}
            </div>

            {importResult.details.failed.length > 0 && (
              <div className="csv-failed-list">
                <h5>Failed Rows:</h5>
                <ul>
                  {importResult.details.failed.map((failure, idx) => (
                    <li key={idx}>
                      Row {failure.row}: {failure.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              className="csv-import-again-btn"
              onClick={() => {
                setImportResult(null);
                setFile(null);
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
              }}
            >
              Import More Vendors
            </button>
          </div>
        )}
      </div>
    </div>
  );
}