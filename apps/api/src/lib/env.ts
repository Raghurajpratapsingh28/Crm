import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), "../../.env") });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const env = {
  nodeEnv: optional("NODE_ENV", "development"),
  port: Number(optional("API_PORT", "4000")),
  webUrl: optional("WEB_URL", "http://localhost:3000"),
  databaseUrl: optional(
    "DATABASE_URL",
    "postgresql://crm:crm@localhost:5432/crm?schema=public",
  ),
  supabaseJwtSecret:
    process.env.NODE_ENV === "production"
      ? required("SUPABASE_JWT_SECRET")
      : optional("SUPABASE_JWT_SECRET", "dev-only-not-for-production"),
  supabaseUrl: optional("NEXT_PUBLIC_SUPABASE_URL", ""),
};

export const isDev = env.nodeEnv !== "production";
