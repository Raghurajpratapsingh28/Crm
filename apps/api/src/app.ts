import cors from "cors";
import express, { type Express } from "express";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { requestId } from "./middleware/request-id.js";
import { requestLogger } from "./middleware/request-logger.js";
import { activitiesRouter } from "./modules/activities/routes.js";
import { analyticsRouter } from "./modules/analytics/routes.js";
import { auditRouter } from "./modules/audit/routes.js";
import { authRouter } from "./modules/auth/routes.js";
import { billingRouter } from "./modules/billing/routes.js";
import { companiesRouter } from "./modules/companies/routes.js";
import { contactsRouter } from "./modules/contacts/routes.js";
import { dealsRouter } from "./modules/deals/routes.js";
import { healthRouter } from "./modules/health/routes.js";
import { notificationsRouter } from "./modules/notifications/routes.js";
import { organizationsRouter } from "./modules/organizations/routes.js";
import { paymentsRouter } from "./modules/payments/routes.js";
import { pipelinesRouter } from "./modules/pipelines/routes.js";
import { tasksRouter } from "./modules/tasks/routes.js";
import { teamRouter } from "./modules/team/routes.js";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(requestId);
  app.use(requestLogger);
  app.use(cors({ origin: env.webUrl, credentials: true }));
  app.use(express.json({ limit: "1mb" }));

  app.use(healthRouter);
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/organizations", organizationsRouter);
  app.use("/api/v1/team", teamRouter);
  app.use("/api/v1/contacts", contactsRouter);
  app.use("/api/v1/companies", companiesRouter);
  app.use("/api/v1/deals", dealsRouter);
  app.use("/api/v1/pipelines", pipelinesRouter);
  app.use("/api/v1/tasks", tasksRouter);
  app.use("/api/v1/activities", activitiesRouter);
  app.use("/api/v1/notifications", notificationsRouter);
  app.use("/api/v1/analytics", analyticsRouter);
  app.use("/api/v1/billing", billingRouter);
  app.use("/api/v1/audit", auditRouter);
  app.use(paymentsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
