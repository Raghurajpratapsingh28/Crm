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
      path: req.path,
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
