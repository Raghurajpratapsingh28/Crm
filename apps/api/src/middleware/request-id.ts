import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { requestContext } from "../lib/request-context.js";

declare global {
  // Express request augmentation requires a namespace.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header("x-request-id");
  req.requestId = incoming && incoming.trim() ? incoming.trim() : randomUUID();
  res.setHeader("x-request-id", req.requestId);
  requestContext.run({ requestId: req.requestId }, () => next());
}
