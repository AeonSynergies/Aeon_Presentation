import { prisma } from "@aeon/database";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc.js";

interface NotificationDTO {
  id: string;
  title: string;
  body: string;
  linkUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

function toNotificationDTO(n: {
  id: string;
  title: string;
  body: string;
  linkUrl: string | null;
  readAt: Date | null;
  createdAt: Date;
}): NotificationDTO {
  return { id: n.id, title: n.title, body: n.body, linkUrl: n.linkUrl, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() };
}

// Generic in-app notifications (see Notification, schema.prisma) — first use is a
// session-invite ping (collaboration.ts's invite mutation), but nothing here is
// invite-specific. Polled from the app header bell at the same interval as the rest of
// this app's "live" data (see useNotifications.ts) — there's no push/websocket
// infrastructure in this app, consistent with meeting.get's own polling model.
export const notificationsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await prisma.notification.findMany({
      where: { userId: ctx.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return rows.map(toNotificationDTO);
  }),

  markRead: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
    const existing = await prisma.notification.findFirst({ where: { id: input.id, userId: ctx.user.id } });
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Notification not found" });
    if (!existing.readAt) await prisma.notification.update({ where: { id: existing.id }, data: { readAt: new Date() } });
    return { ok: true };
  }),
});
