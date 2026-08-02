import type { NextFunction, Request, Response } from "express";
import { AppError, toErrorBody } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: "not_found",
    message: "Route not found",
    requestId: req.requestId,
  });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const requestId = req.requestId ?? "unknown";

  if (err instanceof AppError) {
    logger.warn({ err, requestId }, err.message);
    res.status(err.status).json(toErrorBody(err, requestId));
    return;
  }

  logger.error({ err, requestId }, "unhandled error");
  const fallback = err instanceof Error ? err : new Error("Internal server error");
  res.status(500).json(toErrorBody(fallback, requestId));
}
