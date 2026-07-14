import React, { createContext, useState, useEffect, useCallback } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export const ALL_PROJECTS = 'all';

export const ProjectContext = createContext({
  projects: [],
  currentProjectId: ALL_PROJECTS,
  setCurrentProjectId: () => {},
  loading: true,
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

  useEffect(() => {
    if (!userId) {
      setProjects([]);
      setCurrentProjectIdState(ALL_PROJECTS);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`${API_BASE_URL}/api/projects?userId=${userId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const list = data.projects || [];
        setProjects(list);

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
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [userId]);

  return (
    <ProjectContext.Provider value={{ projects, currentProjectId, setCurrentProjectId, loading }}>
      {children}
    </ProjectContext.Provider>
  );
}
