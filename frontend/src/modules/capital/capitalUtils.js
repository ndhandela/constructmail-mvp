export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Mirrors routers/capital.py's _require_project_owner: a company owner
// always has write access, otherwise it falls back to this project's own
// project_members.role.
export function isProjectOwner(project, user) {
  if (!project || !user) return false;
  if (user.permission_level === 'owner') return true;
  return project.member_role === 'owner';
}

export function formatCurrency(amount) {
  const value = Number(amount) || 0;
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

// variance = budgeted - actual (see services/capital_helpers.py). Positive
// means under budget, negative means over — brick/green are the same
// error/success pair Trust already uses for compliant vs. at-risk states.
export function varianceColor(variance) {
  return variance < 0 ? 'var(--brick)' : 'var(--green)';
}

export function varianceBg(variance) {
  return variance < 0 ? '#FDECEA' : 'var(--green-bg)';
}
