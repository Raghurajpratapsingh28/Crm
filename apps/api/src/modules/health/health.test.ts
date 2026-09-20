import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../../test/helpers.js";

describe("health and security headers", () => {
  it("returns liveness without a database check and sets baseline headers", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});
