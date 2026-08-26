import { router } from "../trpc.js";
import { authRouter } from "./auth.js";
import { deckRouter } from "./deck.js";
import { meetingRouter } from "./meeting.js";
import { userRouter } from "./user.js";

export const appRouter = router({
  auth: authRouter,
  deck: deckRouter,
  meeting: meetingRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter;
