import React from 'react';
import { MODULE_ICONS } from './moduleIcons';
import '../styles/ModuleToggleRow.css';

// One row per module: icon + name + a real toggle switch. Shared between
// the company-detail slide-over and the global-defaults panel so both
// look and behave identically.
export default function ModuleToggleRow({ moduleDef, enabled, toggling, error, onToggle }) {
  return (
    <div className="mtr-row">
      <div className="mtr-icon">{MODULE_ICONS[moduleDef.key]}</div>
      <div className="mtr-labels">
        <div className="mtr-label">{moduleDef.label}</div>
        {moduleDef.note && <div className="mtr-note">{moduleDef.note}</div>}
      </div>
      {moduleDef.gated ? (
        <button
          type="button"
          className={`mtr-switch ${enabled ? 'on' : ''}`}
          role="switch"
          aria-checked={enabled}
          aria-label={`${moduleDef.label} ${enabled ? 'enabled' : 'disabled'}`}
          disabled={toggling}
          onClick={onToggle}
        >
          <span className="mtr-switch-thumb" />
        </button>
      ) : (
        <span className="mtr-always-on">Always on</span>
      )}
      {error && <div className="mtr-row-error">{error}</div>}
    </div>
  );
}
