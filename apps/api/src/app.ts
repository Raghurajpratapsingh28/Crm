import cors from "cors";
import express, { type Express } from "express";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { requestId } from "./middleware/request-id.js";
import { requestLogger } from "./middleware/request-logger.js";
import { authRouter } from "./modules/auth/routes.js";
import { healthRouter } from "./modules/health/routes.js";
import { paymentsRouter } from "./modules/payments/routes.js";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(requestId);
  app.use(requestLogger);
  app.use(cors({ origin: env.webUrl, credentials: true }));
  app.use(express.json({ limit: "1mb" }));

  app.use(healthRouter);
  app.use("/auth", authRouter);
  app.use(paymentsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
