import { useState } from "react";
import { Outlet } from "react-router-dom";
import { useStoriesAutoRefresh } from "../entities/stories/useStoriesAutoRefresh";
import { Sidebar } from "./Sidebar";

export function AppShell() {
  useStoriesAutoRefresh();
  const [collapsed, setCollapsed] = useState(() => window.matchMedia("(max-width: 860px)").matches);

  return (
    <>
      <div className={`admin-layout${collapsed ? " is-sidebar-collapsed" : ""}`}>
        <Sidebar />
        <div className="admin-main">
          <nav className="navbar">
            <div className="navbar-inner">
              <div className="admin-header-leading">
                <button
                  type="button"
                  className="admin-sidebar-toggle"
                  aria-label={collapsed ? "Mở menu bên trái" : "Thu gọn menu bên trái"}
                  aria-controls="admin-sidebar"
                  aria-expanded={!collapsed}
                  onClick={() => setCollapsed((value) => !value)}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M3 6h18M3 12h18M3 18h18" />
                  </svg>
                </button>
              </div>
            </div>
          </nav>
          <main className="admin-content">
            <div className="container">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
