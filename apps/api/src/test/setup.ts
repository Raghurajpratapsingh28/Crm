import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

process.env.NODE_ENV = process.env.NODE_ENV || "test";
loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), "../../.env") });
