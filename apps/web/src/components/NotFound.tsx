import { Link } from "@tanstack/react-router";

export function NotFound({ children }: { children?: React.ReactNode }) {
  return (
    <div className="p-8 flex flex-col items-center justify-center gap-4 text-center">
      <div style={{ color: "var(--fog)" }}>{children || <p>The page you are looking for does not exist.</p>}</div>
      <div className="flex gap-2">
        <button className="icon-btn" onClick={() => window.history.back()}>
          Go back
        </button>
        <Link to="/" className="icon-btn">
          Home
        </Link>
      </div>
    </div>
  );
}
