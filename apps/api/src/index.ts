import "dotenv/config";
import * as trpcExpress from "@trpc/server/adapters/express";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { appRouter } from "./routers/_app.js";
import { createContext } from "./trpc.js";

const app = express();

const allowedOrigin = process.env.WEB_ORIGIN || "http://localhost:3000";
app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(cookieParser());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use(
  "/api/trpc",
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`Aeon API listening on port ${port}`);
});
