import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL, formatCurrency } from '../capitalUtils';

// Project-level rollup: spend summed by category across every work item in
// the project (GET /api/projects/:id/spend-by-category) — the view a
// single work item's own budget items can't show, since the same category
// can tag budget items under several different work items.
export default function SpendByCategoryTab({ userId, project }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchSpend = useCallback(async () => {
    if (!project) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${project.id}/spend-by-category?userId=${userId}`);
      const data = await res.json();
      if (data.success) setCategories(data.categories || []);
    } catch (err) {
      console.error('Fetch spend-by-category error:', err);
    } finally {
      setLoading(false);
    }
  }, [project, userId]);

  useEffect(() => { fetchSpend(); }, [fetchSpend]);

  const maxBudgeted = Math.max(1, ...categories.map((c) => Number(c.budgeted_amount) || 0));

  return (
    <div className="capital-tab-panel">
      <div className="capital-dashboard-header">
        <h2>Spend by Category</h2>
      </div>

      {loading ? (
        <p className="capital-muted">Loading spend by category…</p>
      ) : categories.length === 0 ? (
        <p className="capital-muted">No categories yet. Add budget items to a work item to see spend roll up here.</p>
      ) : (
        <div className="capital-table-wrapper">
          {categories.map((cat) => {
            const budgeted = Number(cat.budgeted_amount) || 0;
            const actual = Number(cat.actual_spent) || 0;
            const widthPct = Math.min(100, (actual / maxBudgeted) * 100);
            const over = budgeted > 0 && actual > budgeted;
            return (
              <div className="capital-bar-row" key={cat.category_id}>
                <span className="capital-bar-name">{cat.name}</span>
                <div className="capital-bar-track">
                  <div
                    className={`capital-bar-fill${over ? ' capital-bar-fill-over' : ''}`}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
                <span className="capital-bar-value">
                  {formatCurrency(actual)} / {formatCurrency(budgeted)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
