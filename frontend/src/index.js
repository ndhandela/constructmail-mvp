import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

// Enables the PWA: offline app-shell caching, cache-then-network for API
// GETs, and the offline fallback page. No-ops outside of production builds
// (see serviceWorkerRegistration.js) — desktop/browser behavior is
// unchanged either way, this only makes the site installable/app-like.
serviceWorkerRegistration.register();
