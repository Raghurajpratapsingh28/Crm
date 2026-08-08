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
  SUPABASE_URL: z.string().optional().default(""),
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional().default(""),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(""),
  INVITATION_TTL_DAYS: z.coerce.number().int().positive().default(7),
  INVITATION_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),
  TASK_REMINDER_HOURS: z.coerce.number().int().positive().default(24),
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
const supabaseUrl = parsed.SUPABASE_URL || parsed.NEXT_PUBLIC_SUPABASE_URL;

export const env = {
  nodeEnv: parsed.NODE_ENV,
  port: parsed.API_PORT,
  webUrl: parsed.WEB_URL,
  databaseUrl: parsed.DATABASE_URL,
  supabaseJwtSecret: parsed.SUPABASE_JWT_SECRET,
  supabaseUrl,
  supabaseServiceRoleKey: parsed.SUPABASE_SERVICE_ROLE_KEY,
  invitationTtlDays: parsed.INVITATION_TTL_DAYS,
  invitationResendCooldownSeconds: parsed.INVITATION_RESEND_COOLDOWN_SECONDS,
  taskReminderHours: parsed.TASK_REMINDER_HOURS,
};

export const isDev = env.nodeEnv !== "production";
export const isTest = env.nodeEnv === "test";
