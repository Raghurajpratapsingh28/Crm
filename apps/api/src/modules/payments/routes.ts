import type { PaymentProvider } from "@crm/types";
import { Router, raw, type Request } from "express";
import { rateLimit } from "../../middleware/rate-limit.js";
import { ingestWebhook } from "../billing/billing.service.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { fail } from "../../utils/errors.js";

function headerMap(req: Request) {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers[key] = value;
    else if (Array.isArray(value) && value[0]) headers[key] = value[0];
  }
  return headers;
}

function rawBody(req: Request) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body);
  throw fail(400, "INVALID_WEBHOOK", "Webhook body must be raw");
}

async function handle(req: Request, provider: PaymentProvider) {
  const signature = String(
    req.header("stripe-signature") ?? req.header("x-razorpay-signature") ?? req.header("x-signature") ?? "",
  );
  return ingestWebhook({
    provider,
    raw: rawBody(req),
    signature,
    headers: headerMap(req),
  });
}

const webhookLimit = rateLimit({
  name: "billing-webhooks",
  windowMs: 60_000,
  max: 120,
  key: (req) => req.ip ?? "webhook",
});

export const stripeWebhookRouter: Router = Router();
stripeWebhookRouter.use(raw({ type: "application/json", limit: "256kb" }));
stripeWebhookRouter.use(webhookLimit);
stripeWebhookRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await handle(req, "STRIPE"));
  }),
);

export const razorpayWebhookRouter: Router = Router();
razorpayWebhookRouter.use(raw({ type: "application/json", limit: "256kb" }));
razorpayWebhookRouter.use(webhookLimit);
razorpayWebhookRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await handle(req, "RAZORPAY"));
  }),
);

/** @deprecated Mounted only if a caller still uses the old router. Prefer the raw webhook routers. */
export const paymentsRouter: Router = Router();
