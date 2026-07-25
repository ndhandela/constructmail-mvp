import React, { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE_URL } from '../capitalUtils';

// Shared searchable/creatable category dropdown — used by both the
// milestone form and the budget item form so a category only ever needs to
// be created once per project, then reused across every work item instead
// of each form growing its own ad hoc "add category" flow.
export default function CategoryPicker({ userId, project, value, onChange, disabled }) {
  const [categories, setCategories] = useState([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const wrapperRef = useRef(null);

  const fetchCategories = useCallback(async () => {
    if (!project) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${project.id}/categories?userId=${userId}`);
      const data = await res.json();
      if (data.success) setCategories(data.categories || []);
    } catch (err) {
      console.error('Fetch categories error:', err);
    }
  }, [project, userId]);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  // Keep the displayed text in sync with the selected category when `value`
  // changes from outside (e.g. the form resets when switching from add to
  // edit mode).
  useEffect(() => {
    if (!value) {
      setQuery('');
      return;
    }
    const selected = categories.find((c) => String(c.id) === String(value));
    if (selected) setQuery(selected.name);
  }, [value, categories]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = categories.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()));
  const trimmedQuery = query.trim();
  const exactMatch = categories.some((c) => c.name.toLowerCase() === trimmedQuery.toLowerCase());

  const handleSelect = (category) => {
    setQuery(category.name);
    setOpen(false);
    setError('');
    onChange(category.id);
  };

  const handleCreate = async () => {
    if (!trimmedQuery) return;
    setCreating(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${project.id}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: Number(userId), name: trimmedQuery }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Could not create category.');
        return;
      }
      setCategories((prev) => (prev.some((c) => c.id === data.category.id) ? prev : [...prev, data.category]));
      handleSelect(data.category);
    } catch (err) {
      setError('Network error. Try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="capital-category-picker" ref={wrapperRef}>
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); onChange(''); }}
        onFocus={() => setOpen(true)}
        placeholder="Search or create a category…"
        disabled={disabled || creating}
        autoComplete="off"
      />
      {open && (
        <ul className="capital-category-picker-menu">
          {filtered.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => handleSelect(c)}>{c.name}</button>
            </li>
          ))}
          {trimmedQuery && !exactMatch && (
            <li>
              <button type="button" className="capital-category-picker-create" onClick={handleCreate} disabled={creating}>
                {creating ? 'Creating…' : `+ Create "${trimmedQuery}"`}
              </button>
            </li>
          )}
          {filtered.length === 0 && !trimmedQuery && (
            <li className="capital-category-picker-empty">Type to search or create a category</li>
          )}
        </ul>
      )}
      {error && <div className="capital-error">{error}</div>}
    </div>
  );
}
