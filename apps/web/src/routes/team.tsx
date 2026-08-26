import { ROLES, ROLE_LABELS, can, type Role } from "@aeon/types";
import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { Header } from "~/components/layout/Header";
import { RequireAuth } from "~/components/layout/RequireAuth";
import { useAuth } from "~/hooks/useAuth";
import { trpc } from "~/lib/trpc";

// Team Management — replaces the prototype's old version entirely. That one couldn't
// enforce anything (pre-backend, pure client-side state); every action here calls a real
// requirePermission("manageUsers") mutation, so this screen is a UI convenience on top of
// enforcement that already exists server-side, not the enforcement itself. Frontend-gated
// on can(role, "manageUsers") too — a non-admin sees an explanation, not a blank/broken
// page — but that's the secondary layer; a direct API call is what's actually rejected.
export const Route = createFileRoute("/team")({
  component: TeamPage,
});

function TeamPage() {
  return (
    <RequireAuth>
      <Header />
      <TeamGate />
    </RequireAuth>
  );
}

function TeamGate() {
  const { user } = useAuth();
  if (!user) return null;
  if (!can(user.role, "manageUsers")) {
    return (
      <div className="home-view">
        <div className="empty-state">
          Team Management is only available to Admin accounts. Your role ({ROLE_LABELS[user.role as Role] ?? user.role}) doesn't include
          it.
        </div>
      </div>
    );
  }
  return <TeamManager />;
}

type UserRow = { id: string; email: string; name: string; role: string; createdAt: string };

function TeamManager() {
  const { user: me } = useAuth();
  const utils = trpc.useUtils();
  const { data: users, isLoading, error } = trpc.user.list.useQuery();
  const createUser = trpc.user.create.useMutation();
  const updateRole = trpc.user.updateRole.useMutation();
  const removeUser = trpc.user.remove.useMutation();

  const [showAdd, setShowAdd] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", email: "", password: "", role: "SALES_EXECUTIVE" as Role });
  const [formError, setFormError] = React.useState<string | null>(null);
  const [rowError, setRowError] = React.useState<{ id: string; message: string } | null>(null);

  async function onAddUser(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      await createUser.mutateAsync(form);
      await utils.user.list.invalidate();
      setForm({ name: "", email: "", password: "", role: "SALES_EXECUTIVE" });
      setShowAdd(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't create the user.");
    }
  }

  async function onChangeRole(id: string, role: Role) {
    setRowError(null);
    try {
      await updateRole.mutateAsync({ id, role });
      await utils.user.list.invalidate();
    } catch (err) {
      setRowError({ id, message: err instanceof Error ? err.message : "Couldn't change that user's role." });
    }
  }

  async function onRemove(id: string) {
    setRowError(null);
    try {
      await removeUser.mutateAsync({ id });
      await utils.user.list.invalidate();
    } catch (err) {
      setRowError({ id, message: err instanceof Error ? err.message : "Couldn't remove that user." });
    }
  }

  return (
    <div className="home-view">
      <div className="home-controls">
        <h1 className="home-title" style={{ margin: 0 }}>
          Team
        </h1>
        <button type="button" className="new-deck-btn" onClick={() => setShowAdd((s) => !s)}>
          {showAdd ? "✕ Cancel" : "＋ New User"}
        </button>
      </div>
      <p className="home-sub">
        Add, promote, or remove accounts. Every role change here is what actually gates access — there's no separate "real" permission
        system elsewhere.
      </p>

      {showAdd && (
        <form className="builder-subcard" style={{ maxWidth: 480, marginBottom: 24 }} onSubmit={onAddUser}>
          <div className="q-block">
            <div className="q-label">Name</div>
            <input type="text" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="q-block">
            <div className="q-label">Email</div>
            <input type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div className="q-block">
            <div className="q-label">Initial password</div>
            <input
              type="text"
              required
              minLength={8}
              placeholder="At least 8 characters"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
            <div className="q-hint">
              Set directly — there's no email-invite flow yet. Share this with the person and have them change it once signed in.
            </div>
          </div>
          <div className="q-block">
            <div className="q-label">Role</div>
            <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}>
              {ROLES.map((r) => (
                <option value={r} key={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          {formError && <div className="auth-error">{formError}</div>}
          <button type="submit" className="btn-primary" disabled={createUser.isPending}>
            {createUser.isPending ? "Creating…" : "Create user"}
          </button>
        </form>
      )}

      {isLoading && <div className="empty-state">Loading team…</div>}
      {error && <div className="auth-error">{error.message}</div>}

      {users && (
        <div className="builder-subcard" style={{ padding: 0, overflow: "hidden" }}>
          <table className="team-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(users as UserRow[]).map((u) => (
                <React.Fragment key={u.id}>
                  <tr>
                    <td>
                      {u.name}
                      {u.id === me?.id && <span className="team-you-tag">YOU</span>}
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <select value={u.role} onChange={(e) => onChangeRole(u.id, e.target.value as Role)} disabled={updateRole.isPending}>
                        {ROLES.map((r) => (
                          <option value={r} key={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button type="button" className="mini-btn mini-btn-danger" onClick={() => onRemove(u.id)} disabled={removeUser.isPending}>
                        Remove
                      </button>
                    </td>
                  </tr>
                  {rowError?.id === u.id && (
                    <tr>
                      <td colSpan={4} className="team-row-error">
                        {rowError.message}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
