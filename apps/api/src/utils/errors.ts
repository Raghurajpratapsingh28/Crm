import type { ApiErrorBody } from "@crm/types";

export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export function toErrorBody(error: AppError | Error, requestId: string): ApiErrorBody {
  if (error instanceof AppError) {
    return { error: error.code, message: error.message, requestId };
  }
  return { error: "internal", message: "Internal server error", requestId };
}
