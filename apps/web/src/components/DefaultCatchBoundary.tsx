import { ErrorComponent, Link, useRouter } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";

export function DefaultCatchBoundary({ error }: ErrorComponentProps) {
  const router = useRouter();
  console.error("DefaultCatchBoundary Error:", error);

  return (
    <div className="p-8 flex flex-col items-center justify-center gap-4 text-center">
      <ErrorComponent error={error} />
      <div className="flex gap-2">
        <button
          className="btn-primary"
          style={{ width: "auto" }}
          onClick={() => router.invalidate()}
        >
          Try Again
        </button>
        <Link to="/" className="icon-btn">
          Home
        </Link>
      </div>
    </div>
  );
}
