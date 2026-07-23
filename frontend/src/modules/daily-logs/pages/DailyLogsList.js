import React, { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL, canEditLog, delayCategoryLabel, formatDate, workSummary } from '../dailyLogsUtils';
import DailyLogForm from './DailyLogForm';

function LogPhotos({ photos }) {
  if (!photos || photos.length === 0) return <p className="dailylogs-muted">No photos on this log.</p>;
  return (
    <div className="dailylogs-photo-grid">
      {photos.map((photo) => (
        <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer" className="dailylogs-photo-thumb">
          <img src={photo.url} alt={photo.caption || 'Site photo'} loading="lazy" />
        </a>
      ))}
    </div>
  );
}

function LogDetail({ userId, user, project, log, onDeletedPhoto, onEdited }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  // Photos are only fetched here, on expand — the list view never loads
  // them, so a project with hundreds of logs stays cheap to page through.
  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/daily-logs/logs/${log.id}?userId=${userId}`);
      const data = await res.json();
      if (data.success) setDetail(data);
    } catch (err) {
      console.error('Fetch daily log detail error:', err);
    } finally {
      setLoading(false);
    }
  }, [log.id, userId]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  const canEdit = canEditLog(log, user, userId);

  const handleDeletePhoto = async (photoId) => {
    if (!window.confirm('Remove this photo?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/daily-logs/logs/${log.id}/photos/${photoId}?userId=${userId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchDetail();
        onDeletedPhoto();
      }
    } catch (err) {
      console.error('Delete daily log photo error:', err);
    }
  };

  if (editing) {
    return (
      <DailyLogForm
        userId={userId}
        project={project}
        log={log}
        onSaved={() => { setEditing(false); fetchDetail(); onEdited(); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="dailylogs-detail">
      {loading ? (
        <p className="dailylogs-muted">Loading…</p>
      ) : (
        <>
          <div className="dailylogs-detail-grid">
            <div><span className="dailylogs-detail-label">Delays</span><p>{detail?.log?.delays_notes || '—'}</p></div>
            <div><span className="dailylogs-detail-label">Delay category</span><p>{delayCategoryLabel(detail?.log?.delay_category)}</p></div>
            <div><span className="dailylogs-detail-label">Materials</span><p>{detail?.log?.materials_notes || '—'}</p></div>
            <div><span className="dailylogs-detail-label">Safety</span><p>{detail?.log?.safety_notes || '—'}</p></div>
          </div>

          <span className="dailylogs-detail-label">Photos</span>
          <LogPhotos photos={detail?.photos} />
          {canEdit && detail?.photos?.length > 0 && (
            <div className="dailylogs-photo-remove-list">
              {detail.photos.map((photo) => (
                <button key={photo.id} className="dailylogs-link-btn" onClick={() => handleDeletePhoto(photo.id)}>
                  Remove photo #{photo.id}
                </button>
              ))}
            </div>
          )}

          {canEdit && (
            <div className="dailylogs-form-actions">
              <button className="dailylogs-btn-secondary" onClick={() => setEditing(true)}>Edit log</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function DailyLogsList({ userId, user, project, refreshKey }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const fetchLogs = useCallback(async () => {
    if (!project) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ userId: String(userId), page: String(page) });
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      const res = await fetch(`${API_BASE_URL}/api/daily-logs/projects/${project.id}/logs?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs || []);
        setHasMore(!!data.has_more);
      }
    } catch (err) {
      console.error('Fetch daily logs error:', err);
    } finally {
      setLoading(false);
    }
  }, [project, userId, page, fromDate, toDate]);

  useEffect(() => { fetchLogs(); }, [fetchLogs, refreshKey]);

  useEffect(() => { setPage(1); }, [fromDate, toDate, project?.id]);

  if (!project) return null;

  return (
    <div className="dailylogs-list">
      <div className="dailylogs-filter-row">
        <div className="dailylogs-field">
          <label>From</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="dailylogs-field">
          <label>To</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        {(fromDate || toDate) && (
          <button className="dailylogs-btn-secondary" onClick={() => { setFromDate(''); setToDate(''); }}>Clear</button>
        )}
      </div>

      {loading ? (
        <p className="dailylogs-muted">Loading logs…</p>
      ) : logs.length === 0 ? (
        <p className="dailylogs-muted">No logs yet for this range. Add one to start the record.</p>
      ) : (
        <div className="dailylogs-entries">
          {logs.map((log) => {
            const expanded = expandedId === log.id;
            return (
              <div key={log.id} className="dailylogs-entry">
                <button
                  className="dailylogs-entry-header"
                  onClick={() => setExpandedId(expanded ? null : log.id)}
                >
                  <span className="dailylogs-entry-date">{formatDate(log.log_date)}</span>
                  <span className="dailylogs-entry-weather">{log.weather || '—'}</span>
                  <span className="dailylogs-entry-crew">{log.crew_count != null ? `${log.crew_count} crew` : '—'}</span>
                  <span className="dailylogs-entry-summary">{workSummary(log.work_performed)}</span>
                  <span className="dailylogs-entry-chevron">{expanded ? '▲' : '▼'}</span>
                </button>
                {expanded && (
                  <LogDetail
                    userId={userId}
                    user={user}
                    project={project}
                    log={log}
                    onDeletedPhoto={() => {}}
                    onEdited={fetchLogs}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="dailylogs-pagination">
        <button className="dailylogs-btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Newer</button>
        <span className="dailylogs-muted">Page {page}</span>
        <button className="dailylogs-btn-secondary" disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>Older →</button>
      </div>
    </div>
  );
}
