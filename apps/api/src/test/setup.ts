import { config as loadEnv } from "dotenv";
import http from "node:http";
import https from "node:https";
import { resolve } from "node:path";

process.env.NODE_ENV = process.env.NODE_ENV || "test";
http.globalAgent.keepAlive = false;
https.globalAgent.keepAlive = false;
loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), "../../.env") });
