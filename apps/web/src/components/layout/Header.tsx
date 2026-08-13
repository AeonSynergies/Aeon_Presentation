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
