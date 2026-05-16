import React, { useState, useRef } from 'react';
import '../styles/ClashAnalyzer.css';

export default function ClashUploader({ onParsed }) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  const readFile = (file) => {
    setError('');
    if (!file) return;

    if (!file.name.endsWith('.html') && !file.name.endsWith('.htm')) {
      setError('Please upload a Navisworks HTML clash report (.html or .htm).');
      return;
    }

    setLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      setLoading(false);
      onParsed(e.target.result, file.name);
    };
    reader.onerror = () => {
      setLoading(false);
      setError('Could not read file. Please try again.');
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    readFile(file);
  };

  const handleFileChange = (e) => {
    readFile(e.target.files[0]);
  };

  return (
    <div className="clash-uploader-wrapper">
      <div className="clash-uploader-hero">
        <div className="clash-uploader-badge">POMAR Clash · BIM Intelligence</div>
        <h1 className="clash-uploader-title">Navisworks Clash Analyzer</h1>
        <p className="clash-uploader-sub">
          Upload your Navisworks HTML clash report and get an instant, actionable
          breakdown — severity scoring, element pairs, RFI signals, and more.
        </p>
      </div>

      <div
        className={`clash-drop-zone ${dragging ? 'dragging' : ''} ${loading ? 'loading' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !loading && inputRef.current.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload Navisworks HTML clash report"
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".html,.htm"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        {loading ? (
          <div className="clash-drop-loading">
            <div className="clash-spinner" />
            <p>Parsing report…</p>
          </div>
        ) : (
          <>
            <div className="clash-drop-icon">📄</div>
            <p className="clash-drop-label">
              {dragging ? 'Drop it here' : 'Drag & drop your HTML clash report'}
            </p>
            <p className="clash-drop-hint">or click to browse — .html / .htm only</p>
          </>
        )}
      </div>

      {error && <p className="clash-upload-error">{error}</p>}

      <div className="clash-uploader-steps">
        <div className="clash-step">
          <span className="clash-step-num">1</span>
          <span>Export HTML report from Navisworks Manage → Clash Detective</span>
        </div>
        <div className="clash-step">
          <span className="clash-step-num">2</span>
          <span>Upload the .html file above</span>
        </div>
        <div className="clash-step">
          <span className="clash-step-num">3</span>
          <span>Get instant severity scores, RFI signals, and AI summaries</span>
        </div>
      </div>
    </div>
  );
}
