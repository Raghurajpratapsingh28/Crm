import { AsyncLocalStorage } from "node:async_hooks";

type RequestStore = { requestId: string };

export const requestContext = new AsyncLocalStorage<RequestStore>();

export function currentRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}
