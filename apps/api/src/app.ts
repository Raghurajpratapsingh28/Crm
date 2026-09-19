import cors from "cors";
import express, { type Express } from "express";
import { env } from "./lib/env.js";
import { healthRouter } from "./modules/health/routes.js";
import { authRouter } from "./modules/auth/routes.js";
import { paymentsRouter } from "./modules/payments/routes.js";

export function createApp(): Express {
  const app = express();

  app.use(cors({ origin: env.webUrl, credentials: true }));
  app.use(express.json({ limit: "1mb" }));

  app.use(healthRouter);
  app.use("/auth", authRouter);
  app.use(paymentsRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "not_found", message: "Route not found" });
  });

  return app;
}
