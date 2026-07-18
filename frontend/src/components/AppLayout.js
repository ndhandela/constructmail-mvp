import React from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import '../styles/AppLayout.css';

// Shared shell for every authenticated product view: full-width sticky
// header on top, icon sidebar below it, content area filling the rest.
// Each top-level product branch in App.js wraps its page in this instead of
// duplicating <Header>/<Footer> — app-to-app navigation is still a full page
// load (this codebase has no client router), so AppLayout simply remounts
// on each product switch, same as Header did before.
export default function AppLayout({ userId, onLogout, user, children }) {
  return (
    <div className="app-layout">
      <Header userId={userId} onLogout={onLogout} user={user} />
      <div className="app-layout-body">
        <Sidebar user={user} />
        <main className="content-shell">
          {children}
        </main>
      </div>
    </div>
  );
}
