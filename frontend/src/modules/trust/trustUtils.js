export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Company owners always resolve to full Trust access regardless of the
// trust_role column (mirrors services/trust_access.py's require_trust_role).
export function getTrustRole(user) {
  if (!user) return null;
  if (user.permission_level === 'owner') return 'owner';
  return user.trust_role || null;
}

export function canReviewTrust(role) {
  return role === 'owner' || role === 'compliance_reviewer';
}

export function severityColor(severity) {
  return severity === 'high' ? 'var(--brick)' : 'var(--slate)';
}
