import * as React from "react";
import { trpc } from "~/lib/trpc";

// In-app notifications (see Notification, schema.prisma) — polled like everything else in
// this app (no push/websocket infra). First and so far only source: collaboration.ts's
// session-invite notification, whose linkUrl points at the same popped-out Discovery Notes
// window DeckPlayer's own "Discovery Notes" control opens (window.open, never an in-app
// navigation) — clicking a notification here is a second path into that exact window, the
// email being the first; either one is a valid way in, with no separate "accept" step.
const NOTIFICATIONS_POLL_MS = 5000;

export function NotificationBell() {
  const [open, setOpen] = React.useState(false);
  const utils = trpc.useUtils();
  const notifications = trpc.notifications.list.useQuery(undefined, { refetchInterval: NOTIFICATIONS_POLL_MS });
  const markRead = trpc.notifications.markRead.useMutation({ onSuccess: () => utils.notifications.list.invalidate() });

  const rows = notifications.data ?? [];
  const unreadCount = rows.filter((n) => !n.readAt).length;

  function openNotification(n: (typeof rows)[number]) {
    if (!n.readAt) markRead.mutate({ id: n.id });
    if (n.linkUrl) window.open(n.linkUrl, "aeon-discovery-notes", "width=560,height=860,noopener");
    setOpen(false);
  }

  return (
    <div className="notif-bell">
      <button type="button" className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label="Notifications">
        🔔{unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
      </button>
      {open && (
        <div className="notif-dropdown">
          {rows.length === 0 && <div className="q-hint">No notifications yet.</div>}
          <ul className="notif-list">
            {rows.map((n) => (
              <li key={n.id}>
                <button type="button" className={`notif-item ${n.readAt ? "" : "notif-item-unread"}`} onClick={() => openNotification(n)}>
                  <div className="notif-title">{n.title}</div>
                  <div className="notif-body">{n.body}</div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
