import { Link, NavLink } from "react-router-dom";
import { AudioLines, Download } from "lucide-react";
import { BrandIcon } from "../components/BrandIcon";

const navClass = ({ isActive }) => `admin-nav-item${isActive ? " active" : ""}`;

export function Sidebar() {
  return (
    <aside className="admin-sidebar" id="admin-sidebar">
      <Link to="/admin" className="admin-sidebar-brand">
        <span className="admin-sidebar-brand-icon">
          <BrandIcon />
        </span>
        <span>
          <strong>Audio Story</strong>
          <small>STUDIO</small>
        </span>
      </Link>

      <div className="admin-sidebar-label">WORKSPACE</div>
      <nav className="admin-sidebar-nav" aria-label="Điều hướng chính">
        <NavLink className={navClass} to="/admin">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 19v-5M12 19V5M19 19V9" />
          </svg>
          <span>Kho truyện audio</span>
        </NavLink>
        <NavLink className={navClass} to="/library">
          <AudioLines size={16} />
          <span>Khám phá truyện</span>
        </NavLink>
        <NavLink className={navClass} to="/douyin">
          <Download size={16} />
          <span>Tải Douyin</span>
        </NavLink>
      </nav>
    </aside>
  );
}
