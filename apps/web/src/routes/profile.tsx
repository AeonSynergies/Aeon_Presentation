import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { Header } from "~/components/layout/Header";
import { RequireAuth } from "~/components/layout/RequireAuth";
import { useAuth } from "~/hooks/useAuth";
import { trpc } from "~/lib/trpc";

// Profile & Settings (Phase 5a) — self-service account basics, available to every role.
// Distinct from Team Management (Admin-managing-others): this only ever touches the
// signed-in account, via user.updateProfile/changePassword (protectedProcedure, no role
// gate needed since there's nothing here an Admin could grant that the caller doesn't
// already have over their own account).
export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  return (
    <RequireAuth>
      <Header />
      <ProfileForm />
    </RequireAuth>
  );
}

function ProfileForm() {
  const { user, updateUser } = useAuth();
  const updateProfile = trpc.user.updateProfile.useMutation();
  const changePassword = trpc.user.changePassword.useMutation();

  const [name, setName] = React.useState(user?.name ?? "");
  const [email, setEmail] = React.useState(user?.email ?? "");
  const [currentPasswordForEmail, setCurrentPasswordForEmail] = React.useState("");
  const [profileError, setProfileError] = React.useState<string | null>(null);
  const [profileSaved, setProfileSaved] = React.useState(false);

  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = React.useState(false);

  if (!user) return null;

  const emailChanged = email.trim().toLowerCase() !== user.email.toLowerCase();

  async function onSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileError(null);
    setProfileSaved(false);
    try {
      const updated = await updateProfile.mutateAsync({
        name: name.trim() || undefined,
        email: email.trim() || undefined,
        currentPassword: emailChanged ? currentPasswordForEmail : undefined,
      });
      updateUser({ name: updated.name, email: updated.email });
      setCurrentPasswordForEmail("");
      setProfileSaved(true);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Couldn't save your profile.");
    }
  }

  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSaved(false);
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation don't match.");
      return;
    }
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSaved(true);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Couldn't change your password.");
    }
  }

  return (
    <div className="home-view">
      <h1 className="home-title" style={{ margin: 0 }}>
        Profile &amp; Settings
      </h1>
      <p className="home-sub">Your account basics — name, email, and password. Role and permissions are managed by an Admin via Team.</p>

      <form className="builder-subcard" style={{ maxWidth: 480, marginBottom: 24 }} onSubmit={onSaveProfile}>
        <h2 style={{ marginTop: 0 }}>Account</h2>
        <div className="q-block">
          <div className="q-label">Name</div>
          <input type="text" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="q-block">
          <div className="q-label">Email</div>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {emailChanged && (
          <div className="q-block">
            <div className="q-label">Current password (required to change email)</div>
            <input type="password" required value={currentPasswordForEmail} onChange={(e) => setCurrentPasswordForEmail(e.target.value)} />
          </div>
        )}
        {profileError && <div className="auth-error">{profileError}</div>}
        {profileSaved && !profileError && <div className="q-hint">Saved.</div>}
        <button type="submit" className="btn-primary" disabled={updateProfile.isPending}>
          {updateProfile.isPending ? "Saving…" : "Save changes"}
        </button>
      </form>

      <form className="builder-subcard" style={{ maxWidth: 480 }} onSubmit={onChangePassword}>
        <h2 style={{ marginTop: 0 }}>Change password</h2>
        <div className="q-block">
          <div className="q-label">Current password</div>
          <input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </div>
        <div className="q-block">
          <div className="q-label">New password</div>
          <input type="password" required minLength={8} placeholder="At least 8 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
        <div className="q-block">
          <div className="q-label">Confirm new password</div>
          <input type="password" required minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </div>
        {passwordError && <div className="auth-error">{passwordError}</div>}
        {passwordSaved && !passwordError && <div className="q-hint">Password changed.</div>}
        <button type="submit" className="btn-primary" disabled={changePassword.isPending}>
          {changePassword.isPending ? "Changing…" : "Change password"}
        </button>
      </form>
    </div>
  );
}
