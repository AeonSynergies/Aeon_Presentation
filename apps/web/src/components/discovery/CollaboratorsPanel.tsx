import * as React from "react";
import { useAuth } from "~/hooks/useAuth";
import { trpc } from "~/lib/trpc";

// Real, permissioned multi-user access to a live Discovery Notes session (see
// collaboration.ts) — who can see this panel is exactly who's already in `rows` below,
// since only a current collaborator's meeting.get/collaboration.* calls succeed at all.
// Polls at a slower interval than the notes state itself (see useNotesWindowSession.ts):
// who's in the session and who owns it changes far less often than what's being typed.
const COLLAB_POLL_MS = 3000;

export function CollaboratorsPanel({ meetingId }: { meetingId: string }) {
  const { user } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const utils = trpc.useUtils();

  const collabs = trpc.collaboration.listCollaborators.useQuery({ meetingId }, { refetchInterval: COLLAB_POLL_MS });
  const pickable = trpc.user.listTeamPickable.useQuery(undefined, { enabled: inviteOpen });

  const refresh = () => utils.collaboration.listCollaborators.invalidate({ meetingId });
  const invite = trpc.collaboration.invite.useMutation({ onSuccess: refresh });
  const removeCollaborator = trpc.collaboration.removeCollaborator.useMutation({ onSuccess: refresh });
  const transferOwnership = trpc.collaboration.transferOwnership.useMutation({ onSuccess: refresh });
  const leave = trpc.collaboration.leave.useMutation();

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const rows = collabs.data ?? [];
  const isOwner = !!rows.find((r) => r.userId === user?.id)?.isOwner;
  const inSessionIds = new Set(rows.map((r) => r.userId));
  const invitable = (pickable.data ?? []).filter((u) => !inSessionIds.has(u.id));

  return (
    <div className="collab-panel">
      <button type="button" className="icon-btn" onClick={() => setOpen((o) => !o)}>
        👥 {rows.length}
      </button>
      {open && (
        <div className="collab-dropdown">
          <ul className="collab-list">
            {rows.map((r) => (
              <li className="collab-row" key={r.userId}>
                <span>
                  {r.name}
                  {r.isOwner && <span className="collab-owner-tag">OWNER</span>}
                  {r.userId === user?.id && <span className="team-you-tag">YOU</span>}
                </span>
                <span className="collab-row-actions">
                  {isOwner && !r.isOwner && (
                    <button type="button" className="mini-btn" onClick={() => run(() => transferOwnership.mutateAsync({ meetingId, userId: r.userId }))}>
                      Make owner
                    </button>
                  )}
                  {r.userId !== user?.id && (
                    <button
                      type="button"
                      className="mini-btn mini-btn-danger"
                      onClick={() => run(() => removeCollaborator.mutateAsync({ meetingId, userId: r.userId }))}
                    >
                      Remove
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {error && <div className="q-error">{error}</div>}
          <div className="collab-panel-footer">
            <button type="button" className="mini-btn" onClick={() => setInviteOpen((o) => !o)}>
              + Invite
            </button>
            {rows.length > 1 && (
              <button type="button" className="mini-btn" onClick={() => run(() => leave.mutateAsync({ meetingId }))}>
                Leave session
              </button>
            )}
          </div>
          {inviteOpen && (
            <ul className="collab-invite-list">
              {invitable.length === 0 && <li className="q-hint">No one else to invite.</li>}
              {invitable.map((u) => (
                <li key={u.id}>
                  <button type="button" className="mini-btn" onClick={() => run(() => invite.mutateAsync({ meetingId, userId: u.id }))}>
                    {u.name} ({u.email})
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
