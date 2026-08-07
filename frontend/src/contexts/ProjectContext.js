import React, { createContext, useState, useEffect, useCallback } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export const ALL_PROJECTS = 'all';

export const ProjectContext = createContext({
  projects: [],
  currentProjectId: ALL_PROJECTS,
  setCurrentProjectId: () => {},
  lastProjectId: null,
  loading: true,
  refreshProjects: () => {},
});

function storageKey(userId) {
  return `pomar_project_${userId}`;
}

// Separate from storageKey: currentProjectId can legitimately be the
// ALL_PROJECTS sentinel, but the new left nav's "Project" item (Sidebar.js)
// needs a specific project to land on even from that state, so it never
// dead-ends into Project Detail's "select a project" fallback.
function lastProjectStorageKey(userId) {
  return `pomar_last_project_${userId}`;
}

export function ProjectProvider({ userId, children }) {
  const [projects, setProjects] = useState([]);
  const [currentProjectId, setCurrentProjectIdState] = useState(ALL_PROJECTS);
  const [lastProjectId, setLastProjectId] = useState(null);
  const [loading, setLoading] = useState(true);

  const setCurrentProjectId = useCallback((projectId) => {
    setCurrentProjectIdState(projectId);
    if (userId) {
      localStorage.setItem(storageKey(userId), projectId);
      if (projectId !== ALL_PROJECTS) {
        localStorage.setItem(lastProjectStorageKey(userId), projectId);
        setLastProjectId(projectId);
      }
    }
  }, [userId]);

  const fetchProjects = useCallback((selectProjectId) => {
    if (!userId) {
      setProjects([]);
      setCurrentProjectIdState(ALL_PROJECTS);
      setLoading(false);
      return Promise.resolve();
    }

    setLoading(true);

    return fetch(`${API_BASE_URL}/api/projects?userId=${userId}`)
      .then((res) => res.json())
      .then((data) => {
        const list = data.projects || [];
        setProjects(list);

        if (selectProjectId) {
          setCurrentProjectId(String(selectProjectId));
          return;
        }

        const saved = localStorage.getItem(storageKey(userId));
        const savedIsValid = saved === ALL_PROJECTS || list.some((p) => String(p.id) === saved);
        const resolved = savedIsValid ? saved : list.length > 0 ? String(list[0].id) : ALL_PROJECTS;
        setCurrentProjectIdState(resolved);
        if (resolved !== ALL_PROJECTS) {
          localStorage.setItem(lastProjectStorageKey(userId), resolved);
          setLastProjectId(resolved);
        }
      })
      .catch((err) => {
        console.error('Fetch projects error:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [userId, setCurrentProjectId]);

  useEffect(() => {
    if (userId) {
      setLastProjectId(localStorage.getItem(lastProjectStorageKey(userId)));
    } else {
      setLastProjectId(null);
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    fetchProjects().then(() => {
      if (cancelled) return;
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const refreshProjects = useCallback((selectProjectId) => fetchProjects(selectProjectId), [fetchProjects]);

  return (
    <ProjectContext.Provider value={{ projects, currentProjectId, setCurrentProjectId, lastProjectId, loading, refreshProjects }}>
      {children}
    </ProjectContext.Provider>
  );
}
