import { Link, NavLink } from "react-router-dom";
import { AudioLines, Library } from "lucide-react";
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
      <nav className="admin-sidebar-nav" aria-label="Điều hướng quản trị">
        <NavLink className={navClass} to="/admin">
          <Library size={17} />
          <span>Quản lý truyện</span>
        </NavLink>
      </nav>

      <nav className="admin-sidebar-nav" aria-label="Liên kết khác">
        <NavLink className={navClass} to="/library">
          <AudioLines size={17} />
          <span>Thư viện truyện</span>
        </NavLink>
      </nav>
    </aside>
  );
}
