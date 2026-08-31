import { can } from "@aeon/types";
import { Link } from "@tanstack/react-router";
import { useAuth } from "~/hooks/useAuth";

export function Header() {
  const { user, logout } = useAuth();
  return (
    <header className="app-header">
      <div className="app-header-brand">
        <span className="dot" />
        Aeon Presentation Platform
      </div>
      <nav className="app-nav">
        <Link to="/" className="nav-item" activeProps={{ className: "nav-item active" }} activeOptions={{ exact: true }}>
          Home
        </Link>
        {user && can(user.role, "meetingRecords") && (
          <Link to="/meeting-records" className="nav-item" activeProps={{ className: "nav-item active" }}>
            Meeting Records
          </Link>
        )}
        {user && can(user.role, "manageUsers") && (
          <Link to="/team" className="nav-item" activeProps={{ className: "nav-item active" }}>
            Team
          </Link>
        )}
        {user && can(user.role, "manageUsers") && (
          <Link to="/archived" className="nav-item" activeProps={{ className: "nav-item active" }}>
            Archived Files
          </Link>
        )}
        {user && (
          <Link to="/profile" className="nav-item" activeProps={{ className: "nav-item active" }}>
            Profile
          </Link>
        )}
      </nav>
      {user && (
        <button
          className="nav-item"
          onClick={() => logout()}
          style={{ marginLeft: "auto" }}
          title={user.email}
        >
          Sign out ({user.name})
        </button>
      )}
    </header>
  );
}
