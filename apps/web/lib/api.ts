import { env } from "./env";

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly data?: unknown;

  constructor(status: number, code: string, message: string, data?: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit & { token?: string } = {}) {
  const { token, headers, ...rest } = options;
  const res = await fetch(`${env.NEXT_PUBLIC_API_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  const body = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    data?: T;
    error?: { code?: string; message?: string };
    message?: string;
  };

  if (!res.ok) {
    throw new ApiRequestError(
      res.status,
      body.error?.code ?? "INTERNAL",
      body.error?.message ?? body.message ?? `API ${res.status}`,
      body.data,
    );
  }

  return (body.data ?? body) as T;
}
