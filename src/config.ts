import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-5.4-mini-2026-03-17"),
  SESSION_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  SESSION_MAX_LIFETIME_MINUTES: z.coerce.number().int().positive().default(60),
  MAX_ACTIVE_SESSIONS: z.coerce.number().int().positive().default(100),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(8_388_608),
  LOG_LEVEL: z.string().default("info"),
  PORT: z.coerce.number().int().positive().default(3000),
  TAX_FAKE_MODEL: z.string().optional()
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = EnvSchema.parse(env);
  const fakeModel = parsed.TAX_FAKE_MODEL === "1";
  if (parsed.NODE_ENV === "production") {
    if (!parsed.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required in production.");
    if (fakeModel) throw new Error("TAX_FAKE_MODEL is not allowed in production.");
  }
  return {
    NODE_ENV: parsed.NODE_ENV,
    OPENAI_API_KEY: parsed.OPENAI_API_KEY,
    OPENAI_MODEL: parsed.OPENAI_MODEL,
    SESSION_TTL_MINUTES: parsed.SESSION_TTL_MINUTES,
    SESSION_MAX_LIFETIME_MINUTES: parsed.SESSION_MAX_LIFETIME_MINUTES,
    MAX_ACTIVE_SESSIONS: parsed.MAX_ACTIVE_SESSIONS,
    MAX_UPLOAD_BYTES: parsed.MAX_UPLOAD_BYTES,
    LOG_LEVEL: parsed.LOG_LEVEL,
    PORT: parsed.PORT,
    TAX_FAKE_MODEL: parsed.TAX_FAKE_MODEL,
    production: parsed.NODE_ENV === "production",
    fakeModel: parsed.NODE_ENV === "test" && fakeModel,
    openaiModel: parsed.OPENAI_MODEL,
    sessionTtlMs: parsed.SESSION_TTL_MINUTES * 60_000,
    sessionMaxLifetimeMs: parsed.SESSION_MAX_LIFETIME_MINUTES * 60_000,
    maxActiveSessions: parsed.MAX_ACTIVE_SESSIONS,
    maxUploadBytes: parsed.MAX_UPLOAD_BYTES,
    logLevel: parsed.LOG_LEVEL,
    port: parsed.PORT
  };
}
