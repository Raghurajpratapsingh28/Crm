import type { ApiErrorBody, ApiErrorCode } from "@crm/types";

export class AppError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | string;

  constructor(status: number, code: ApiErrorCode | string, message: string) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export function unauthorized(message = "Authentication required") {
  return new AppError(401, "UNAUTHORIZED", message);
}

export function forbidden(message = "You do not have permission to perform this action") {
  return new AppError(403, "FORBIDDEN", message);
}

export function invalid(message: string) {
  return new AppError(400, "INVALID", message);
}

export function notFound(message = "Not found") {
  return new AppError(404, "NOT_FOUND", message);
}

export function toErrorBody(error: AppError | Error, requestId: string): ApiErrorBody {
  if (error instanceof AppError) {
    return {
      success: false,
      error: { code: error.code, message: error.message },
      requestId,
    };
  }
  return {
    success: false,
    error: { code: "INTERNAL", message: "Internal server error" },
    requestId,
  };
}

export function ok<T>(data: T) {
  return { success: true as const, data };
}
