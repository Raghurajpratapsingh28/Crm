import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), "../../.env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SUPABASE_JWT_SECRET: z.string().min(1, "SUPABASE_JWT_SECRET is required"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional().default(""),
});

function parseEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${details}`);
  }
  return result.data;
}

const parsed = parseEnv();

export const env = {
  nodeEnv: parsed.NODE_ENV,
  port: parsed.API_PORT,
  webUrl: parsed.WEB_URL,
  databaseUrl: parsed.DATABASE_URL,
  supabaseJwtSecret: parsed.SUPABASE_JWT_SECRET,
  supabaseUrl: parsed.NEXT_PUBLIC_SUPABASE_URL,
};

export const isDev = env.nodeEnv !== "production";
