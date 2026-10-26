import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Menu } from "lucide-react";
import { useStoriesAutoRefresh } from "../entities/stories/useStoriesAutoRefresh";
import { PlayerProvider } from "../features/player/PlayerProvider";
import { MiniPlayer } from "../features/player/MiniPlayer";
import { Sidebar } from "./Sidebar";

export function AppShell() {
  useStoriesAutoRefresh();
  const [collapsed, setCollapsed] = useState(() => window.matchMedia("(max-width: 860px)").matches);

  return (
    <PlayerProvider>
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
                  <Menu size={19} />
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
      <MiniPlayer />
    </PlayerProvider>
  );
}
