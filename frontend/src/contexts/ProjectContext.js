import React, { createContext, useState, useEffect, useCallback } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export const ALL_PROJECTS = 'all';

export const ProjectContext = createContext({
  projects: [],
  currentProjectId: ALL_PROJECTS,
  setCurrentProjectId: () => {},
  loading: true,
  refreshProjects: () => {},
});

function storageKey(userId) {
  return `pomar_project_${userId}`;
}

export function ProjectProvider({ userId, children }) {
  const [projects, setProjects] = useState([]);
  const [currentProjectId, setCurrentProjectIdState] = useState(ALL_PROJECTS);
  const [loading, setLoading] = useState(true);

  const setCurrentProjectId = useCallback((projectId) => {
    setCurrentProjectIdState(projectId);
    if (userId) {
      localStorage.setItem(storageKey(userId), projectId);
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
        if (savedIsValid) {
          setCurrentProjectIdState(saved);
        } else if (list.length > 0) {
          setCurrentProjectIdState(String(list[0].id));
        } else {
          setCurrentProjectIdState(ALL_PROJECTS);
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
    let cancelled = false;
    fetchProjects().then(() => {
      if (cancelled) return;
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const refreshProjects = useCallback((selectProjectId) => fetchProjects(selectProjectId), [fetchProjects]);

  return (
    <ProjectContext.Provider value={{ projects, currentProjectId, setCurrentProjectId, loading, refreshProjects }}>
      {children}
    </ProjectContext.Provider>
  );
}
