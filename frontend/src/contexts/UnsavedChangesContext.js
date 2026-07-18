import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import '../styles/UnsavedChangesGuard.css';

const UnsavedChangesContext = createContext(null);

// Shared dirty-state store for the whole app. Any page/app with editable
// state (Projects edit form, Mail compose, Clash annotation editor, Vendor
// edit forms, ...) calls setDirty(true) on the first user edit and
// setDirty(false) after a successful save/discard. Sidebar (and any other
// nav element) routes clicks through guardNavigation() instead of switching
// immediately, so an in-progress edit anywhere can't be silently lost.
export function UnsavedChangesProvider({ children }) {
  const [isDirty, setIsDirty] = useState(false);
  const [dirtyLabel, setDirtyLabel] = useState(undefined);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveHandlerRef = useRef(null);
  const pendingActionRef = useRef(null);

  const setDirty = useCallback((dirty, label) => {
    setIsDirty(dirty);
    setDirtyLabel(dirty ? label : undefined);
  }, []);

  const registerSaveHandler = useCallback((fn) => {
    saveHandlerRef.current = fn;
  }, []);

  // Returns true if navigation proceeded immediately (nothing dirty), false
  // if it opened the confirm dialog and navigation is deferred until the
  // user picks Save & Switch / Discard / Cancel.
  const guardNavigation = useCallback((onProceed) => {
    if (!isDirty) {
      onProceed();
      return true;
    }
    pendingActionRef.current = onProceed;
    setConfirmOpen(true);
    return false;
  }, [isDirty]);

  const handleCancel = () => {
    setConfirmOpen(false);
    pendingActionRef.current = null;
  };

  const handleDiscard = () => {
    setConfirmOpen(false);
    setDirty(false);
    const proceed = pendingActionRef.current;
    pendingActionRef.current = null;
    if (proceed) proceed();
  };

  const handleSaveAndSwitch = async () => {
    setSaving(true);
    try {
      if (saveHandlerRef.current) {
        await saveHandlerRef.current();
      }
      setConfirmOpen(false);
      setDirty(false);
      const proceed = pendingActionRef.current;
      pendingActionRef.current = null;
      if (proceed) proceed();
    } catch (err) {
      console.error('Save & switch failed:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <UnsavedChangesContext.Provider
      value={{ isDirty, dirtyLabel, setDirty, registerSaveHandler, guardNavigation }}
    >
      {children}

      {confirmOpen && (
        <div className="ucg-overlay">
          <div className="ucg-box" role="dialog" aria-modal="true" aria-label="Unsaved changes">
            <h4 className="ucg-title">Unsaved changes</h4>
            <p className="ucg-body">
              You have unsaved edits{dirtyLabel ? ` in ${dirtyLabel}` : ''}. Save before
              switching, or discard them?
            </p>
            <div className="ucg-actions">
              <button className="ucg-btn ucg-btn-cancel" onClick={handleCancel} disabled={saving}>
                Cancel
              </button>
              <button className="ucg-btn ucg-btn-discard" onClick={handleDiscard} disabled={saving}>
                Discard
              </button>
              <button className="ucg-btn ucg-btn-save" onClick={handleSaveAndSwitch} disabled={saving}>
                {saving ? 'Saving…' : 'Save & Switch'}
              </button>
            </div>
          </div>
        </div>
      )}
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChanges() {
  const ctx = useContext(UnsavedChangesContext);
  if (!ctx) {
    throw new Error('useUnsavedChanges must be used within UnsavedChangesProvider');
  }
  return ctx;
}
