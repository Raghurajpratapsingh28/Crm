import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { logger } from "./utils/logger.js";

const app = createApp();
const server = app.listen(env.port, () => {
  logger.info({ port: env.port }, "api listening");
});

const SHUTDOWN_MS = 10_000;
let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "api shutting down");

  const force = setTimeout(() => {
    logger.error("graceful shutdown timed out");
    process.exit(1);
  }, SHUTDOWN_MS);
  force.unref();

  server.close(async (err) => {
    if (err) {
      logger.error({ err }, "error closing http server");
    }
    try {
      await prisma.$disconnect();
    } catch (disconnectError) {
      logger.error({ err: disconnectError }, "error disconnecting prisma");
    }
    process.exit(err ? 1 : 0);
  });
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
