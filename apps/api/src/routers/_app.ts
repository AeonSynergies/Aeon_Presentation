import { router } from "../trpc.js";
import { aiRouter } from "./ai.js";
import { archiveRouter } from "./archive.js";
import { authRouter } from "./auth.js";
import { collaborationRouter } from "./collaboration.js";
import { deckRouter } from "./deck.js";
import { meetingRouter } from "./meeting.js";
import { notificationsRouter } from "./notifications.js";
import { reportAssetsRouter } from "./reportAssets.js";
import { userRouter } from "./user.js";

export const appRouter = router({
  ai: aiRouter,
  archive: archiveRouter,
  auth: authRouter,
  collaboration: collaborationRouter,
  deck: deckRouter,
  meeting: meetingRouter,
  notifications: notificationsRouter,
  reportAssets: reportAssetsRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter;
