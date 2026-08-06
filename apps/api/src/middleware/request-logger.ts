import type { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger.js";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  if (req.path === "/health" || req.path === "/ready") {
    next();
    return;
  }

  const started = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - started;
    const payload = {
      requestId: req.requestId,
      method: req.method,
      path: redactInvitationPath(req.path),
      status: res.statusCode,
      ms,
    };
    if (res.statusCode >= 500) {
      logger.error(payload, "request");
    } else if (res.statusCode >= 400) {
      logger.warn(payload, "request");
    } else {
      logger.info(payload, "request");
    }
  });

  next();
}

function redactInvitationPath(path: string) {
  return path.replace(/\/invitations\/([^/]+)(\/accept)?$/, (_match, segment: string, accept?: string) => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(segment);
    if (uuid) return `/invitations/${segment}${accept ?? ""}`;
    return `/invitations/[redacted]${accept ?? ""}`;
  });
}
