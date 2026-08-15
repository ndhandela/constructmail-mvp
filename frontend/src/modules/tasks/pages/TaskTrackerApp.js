import React, { useContext, useState, useEffect, useCallback } from 'react';
import ModuleLockedNotice, { isModuleLocked } from '../../../components/ModuleLockedNotice';
import PageHeader from '../../../components/PageHeader';
import { ProjectContext, ALL_PROJECTS } from '../../../contexts/ProjectContext';
import { API_BASE_URL, formatDate, statusMeta } from '../tasksUtils';
import TaskForm from '../components/TaskForm';
import '../styles/TaskTrackerApp.css';

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Done' },
];

// Project selection comes from the shared header/sidebar switcher
// (ProjectContext.currentProjectId), same as Permits/Invoice Tracker/
// Documents — no separate in-page picker (Invoice Tracker shipped a bug
// from building a local one before).
export default function TaskTrackerApp({ user, userId }) {
  const tasksLocked = isModuleLocked(user?.active_modules, 'tasks', user?.account_status);
  const { projects, currentProjectId } = useContext(ProjectContext);
  const selectedProject = currentProjectId !== ALL_PROJECTS
    ? projects.find((p) => String(p.id) === String(currentProjectId))
    : null;

  const [tasks, setTasks] = useState([]);
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [assignedToMe, setAssignedToMe] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);

  const fetchTasks = useCallback(async () => {
    if (currentProjectId === ALL_PROJECTS) {
      setTasks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/tasks?project_id=${currentProjectId}&userId=${userId}`);
      const data = await res.json();
      if (data.success) {
        setTasks(data.tasks || []);
        setAssignableUsers(data.assignable_users || []);
      } else {
        setError(data.detail || 'Could not load tasks.');
      }
    } catch (err) {
      console.error('Fetch tasks error:', err);
      setError('Network error. Try again.');
    } finally {
      setLoading(false);
    }
  }, [userId, currentProjectId]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const handleToggleStatus = async (task) => {
    const nextStatus = task.status === 'done' ? 'open' : 'done';
    try {
      const res = await fetch(`${API_BASE_URL}/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: Number(userId), status: nextStatus }),
      });
      const data = await res.json();
      if (data.success) fetchTasks();
    } catch (err) {
      console.error('Toggle task status error:', err);
    }
  };

  const handleDelete = async (task) => {
    if (!window.confirm(`Delete "${task.title}"?`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/tasks/${task.id}?userId=${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) fetchTasks();
    } catch (err) {
      console.error('Delete task error:', err);
    }
  };

  const visibleTasks = tasks
    .filter((t) => !statusFilter || t.status === statusFilter)
    .filter((t) => !assignedToMe || String(t.assigned_to) === String(userId));

  if (tasksLocked) {
    return (
      <div className="tasks-app">
        <ModuleLockedNotice
          moduleName="POMAR Task Tracker"
          companyName={user?.company}
          variant="upgrade"
          icon="✅"
          description="A simple, assignable task list for each project. Upgrade your plan to unlock Task Tracker."
        />
      </div>
    );
  }

  return (
    <div className="tasks-app">
      <div className="tasks-container">
        <PageHeader
          backLabel={`Back to ${selectedProject?.name || 'Project'}`}
          backHref={user?.new_nav_enabled ? '/project' : undefined}
          title="Task Tracker"
          actionLabel="+ Add task"
          onAction={() => setShowForm(true)}
          actionDisabled={currentProjectId === ALL_PROJECTS}
          actionTitle={currentProjectId === ALL_PROJECTS ? 'Select a project from the header to add a task' : undefined}
        />

        {currentProjectId === ALL_PROJECTS ? (
          <p className="tasks-muted">Select a project from the header to view its tasks.</p>
        ) : (
          <>
            <div className="tasks-toolbar">
              <div className="tasks-filters">
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  {STATUS_FILTER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <label className="tasks-checkbox-label">
                  <input
                    type="checkbox"
                    checked={assignedToMe}
                    onChange={(e) => setAssignedToMe(e.target.checked)}
                  />
                  Assigned to me
                </label>
              </div>
            </div>

            {error && <div className="tasks-error">{error}</div>}

            {loading ? (
              <p className="tasks-muted">Loading tasks…</p>
            ) : visibleTasks.length === 0 ? (
              <p className="tasks-muted">
                {tasks.length === 0 ? 'No tasks yet. Add one to get started.' : 'No tasks match these filters.'}
              </p>
            ) : (
              <div className="tasks-table-wrapper">
                <table className="tasks-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Title</th>
                      <th>Assigned To</th>
                      <th>Due Date</th>
                      <th>Status</th>
                      <th>Created By</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTasks.map((task) => {
                      const meta = statusMeta(task.status);
                      return (
                        <tr key={task.id} className={task.status === 'done' ? 'tasks-row-done' : ''}>
                          <td>
                            <input
                              type="checkbox"
                              checked={task.status === 'done'}
                              disabled={!task.can_edit}
                              onChange={() => handleToggleStatus(task)}
                              title={task.status === 'done' ? 'Mark as open' : 'Mark as done'}
                            />
                          </td>
                          <td>
                            <div className="tasks-title-cell">{task.title}</div>
                            {task.description && <div className="tasks-desc-cell">{task.description}</div>}
                          </td>
                          <td>{task.assigned_to_name || '—'}</td>
                          <td>{formatDate(task.due_date)}</td>
                          <td>
                            <span className={`tasks-status-pill ${meta.className}`}>{meta.label}</span>
                          </td>
                          <td>{task.created_by_name}</td>
                          <td className="tasks-row-actions">
                            {task.can_edit && (
                              <button className="tasks-link-btn" onClick={() => setEditingTask(task)}>Edit</button>
                            )}
                            {task.can_delete && (
                              <button className="tasks-link-btn tasks-link-btn-danger" onClick={() => handleDelete(task)}>Delete</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {showForm && selectedProject && (
        <TaskForm
          userId={userId}
          projectId={selectedProject.id}
          assignableUsers={assignableUsers}
          onSaved={() => { setShowForm(false); fetchTasks(); }}
          onCancel={() => setShowForm(false)}
        />
      )}
      {editingTask && (
        <TaskForm
          userId={userId}
          projectId={editingTask.project_id}
          task={editingTask}
          assignableUsers={assignableUsers}
          onSaved={() => { setEditingTask(null); fetchTasks(); }}
          onCancel={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}
