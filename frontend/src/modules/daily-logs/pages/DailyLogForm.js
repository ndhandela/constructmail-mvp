import React, { useState } from 'react';
import { API_BASE_URL, DELAY_CATEGORIES, WEATHER_OPTIONS, delayCategoryLabel } from '../dailyLogsUtils';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function PhotoDropzone({ files, onFilesAdded, onRemove }) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    onFilesAdded(Array.from(e.dataTransfer.files || []));
  };

  return (
    <div className="dailylogs-field">
      <label>Site photos</label>
      <div
        className={`dailylogs-dropzone${dragOver ? ' dailylogs-dropzone-active' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById('dailylogs-photo-input').click()}
      >
        <p>Drag photos here, or click to choose files</p>
        <input
          id="dailylogs-photo-input"
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => onFilesAdded(Array.from(e.target.files || []))}
        />
      </div>

      {files.length > 0 && (
        <div className="dailylogs-photo-preview-grid">
          {files.map((file, i) => (
            <div key={`${file.name}-${i}`} className="dailylogs-photo-preview">
              <img src={URL.createObjectURL(file)} alt={file.name} />
              <button type="button" className="dailylogs-photo-preview-remove" onClick={() => onRemove(i)}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DailyLogForm({ userId, project, log, onSaved, onCancel }) {
  const isEdit = !!log;
  const [form, setForm] = useState({
    log_date: log?.log_date ? log.log_date.slice(0, 10) : todayISO(),
    weather: log?.weather || '',
    crew_count: log?.crew_count ?? '',
    work_performed: log?.work_performed || '',
    delays_notes: log?.delays_notes || '',
    delay_category: log?.delay_category || '',
    materials_notes: log?.materials_notes || '',
    safety_notes: log?.safety_notes || '',
  });
  const [photoFiles, setPhotoFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const addFiles = (newFiles) => {
    const images = newFiles.filter((f) => f.type.startsWith('image/'));
    setPhotoFiles((prev) => [...prev, ...images]);
  };

  const removeFile = (index) => {
    setPhotoFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      let res;
      if (isEdit) {
        res = await fetch(`${API_BASE_URL}/api/daily-logs/logs/${log.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: Number(userId),
            weather: form.weather || null,
            crew_count: form.crew_count === '' ? null : Number(form.crew_count),
            work_performed: form.work_performed.trim() || null,
            delays_notes: form.delays_notes.trim() || null,
            delay_category: form.delay_category || null,
            materials_notes: form.materials_notes.trim() || null,
            safety_notes: form.safety_notes.trim() || null,
          }),
        });
      } else {
        const formData = new FormData();
        formData.append('userId', String(userId));
        formData.append('log_date', form.log_date);
        if (form.weather) formData.append('weather', form.weather);
        if (form.crew_count !== '') formData.append('crew_count', String(Number(form.crew_count)));
        if (form.work_performed.trim()) formData.append('work_performed', form.work_performed.trim());
        if (form.delays_notes.trim()) formData.append('delays_notes', form.delays_notes.trim());
        if (form.delay_category) formData.append('delay_category', form.delay_category);
        if (form.materials_notes.trim()) formData.append('materials_notes', form.materials_notes.trim());
        if (form.safety_notes.trim()) formData.append('safety_notes', form.safety_notes.trim());
        photoFiles.forEach((file) => formData.append('photos', file));

        res = await fetch(`${API_BASE_URL}/api/daily-logs/projects/${project.id}/logs`, {
          method: 'POST',
          body: formData,
        });
      }

      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Could not save log.');
        return;
      }
      onSaved();
    } catch (err) {
      setError('Network error. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dailylogs-modal-overlay" onClick={onCancel}>
      <form className="dailylogs-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>{isEdit ? `Edit log — ${form.log_date}` : 'New daily log'}</h3>

        <div className="dailylogs-form-row">
          <div className="dailylogs-field">
            <label>Date</label>
            <input
              type="date"
              value={form.log_date}
              onChange={(e) => setForm((f) => ({ ...f, log_date: e.target.value }))}
              disabled={saving || isEdit}
              required
            />
          </div>
          <div className="dailylogs-field">
            <label>Weather</label>
            <select
              value={form.weather}
              onChange={(e) => setForm((f) => ({ ...f, weather: e.target.value }))}
              disabled={saving}
            >
              <option value="">Select…</option>
              {WEATHER_OPTIONS.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div className="dailylogs-field">
            <label>Crew count</label>
            <input
              type="number"
              min="0"
              value={form.crew_count}
              onChange={(e) => setForm((f) => ({ ...f, crew_count: e.target.value }))}
              disabled={saving}
            />
          </div>
        </div>

        <div className="dailylogs-field">
          <label>Work performed</label>
          <textarea
            value={form.work_performed}
            onChange={(e) => setForm((f) => ({ ...f, work_performed: e.target.value }))}
            rows={3}
            placeholder="What got done today…"
            disabled={saving}
          />
        </div>

        <div className="dailylogs-form-row">
          <div className="dailylogs-field" style={{ flex: 2 }}>
            <label>Delays</label>
            <textarea
              value={form.delays_notes}
              onChange={(e) => setForm((f) => ({ ...f, delays_notes: e.target.value }))}
              rows={2}
              placeholder="Anything that held up work…"
              disabled={saving}
            />
          </div>
          <div className="dailylogs-field">
            <label>Delay category</label>
            <select
              value={form.delay_category}
              onChange={(e) => setForm((f) => ({ ...f, delay_category: e.target.value }))}
              disabled={saving}
            >
              <option value="">None</option>
              {DELAY_CATEGORIES.map((c) => <option key={c} value={c}>{delayCategoryLabel(c)}</option>)}
            </select>
          </div>
        </div>

        <div className="dailylogs-field">
          <label>Materials notes</label>
          <textarea
            value={form.materials_notes}
            onChange={(e) => setForm((f) => ({ ...f, materials_notes: e.target.value }))}
            rows={2}
            disabled={saving}
          />
        </div>

        <div className="dailylogs-field">
          <label>Safety notes</label>
          <textarea
            value={form.safety_notes}
            onChange={(e) => setForm((f) => ({ ...f, safety_notes: e.target.value }))}
            rows={2}
            disabled={saving}
          />
        </div>

        {/* Photos are only attachable at create time — the backend edit
            endpoint is JSON-only, so removing an existing photo happens
            from the log detail view instead (DailyLogsList's LogDetail). */}
        {!isEdit && <PhotoDropzone files={photoFiles} onFilesAdded={addFiles} onRemove={removeFile} />}

        {error && <div className="dailylogs-error">{error}</div>}
        <div className="dailylogs-form-actions">
          <button type="button" className="dailylogs-btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" className="dailylogs-btn-primary" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add log'}
          </button>
        </div>
      </form>
    </div>
  );
}
