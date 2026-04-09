import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  TURSO_CONNECTION_URL: z.string().min(1, 'TURSO_CONNECTION_URL is required'),
  TURSO_AUTH_TOKEN: z.string().min(1, 'TURSO_AUTH_TOKEN is required'),
  JWT_ACCESS_SECRET: z.string().optional(),
  AUTH_ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  AUTH_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  AUTH_LOCKOUT_ATTEMPTS: z.coerce.number().int().positive().default(5),
  AUTH_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),
  PASSWORD_RESET_OTP_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  BCRYPT_ROUNDS: z.coerce.number().int().min(12).default(12),
  PUBLIC_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20),
  AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(100),
  APP_BASE_URL: z.string().url().optional(),
  CRON_SECRET: z.string().min(1).optional(),
  BETTER_AUTH_SECRET: z.string().min(1).optional(),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  SMTP_FROM_EMAIL: z.string().email().optional(),
  SMTP_FROM_NAME: z.string().min(1).optional(),
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1).optional(),
  NEXT_PUBLIC_FIREBASE_DATABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1).optional(),
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().min(1).optional(),
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().min(1).optional(),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().min(1).optional(),
}).transform((values, ctx) => {
  const jwtAccessSecret = values.JWT_ACCESS_SECRET ?? values.BETTER_AUTH_SECRET;

  if (!jwtAccessSecret) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['JWT_ACCESS_SECRET'],
      message: 'JWT_ACCESS_SECRET is required (or provide BETTER_AUTH_SECRET as a fallback)',
    });
  } else if (jwtAccessSecret.length < 32) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['JWT_ACCESS_SECRET'],
      message: 'JWT_ACCESS_SECRET must be at least 32 characters long',
    });
  }

  return {
    ...values,
    JWT_ACCESS_SECRET: jwtAccessSecret ?? '',
  };
});

type Env = z.infer<typeof envSchema>;

const buildPlaceholderEnv = {
  TURSO_CONNECTION_URL: 'file:build.db',
  TURSO_AUTH_TOKEN: 'build-token',
  JWT_ACCESS_SECRET: 'build-placeholder-jwt-access-secret-1234567890',
} satisfies Partial<Record<keyof Env, string>>;

let cachedEnv: Env | null = null;

function isBuildPhase() {
  return (
    process.env.npm_lifecycle_event === 'build' ||
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.NEXT_PHASE === 'phase-export'
  );
}

function parseEnv() {
  const source = isBuildPhase()
    ? { ...buildPlaceholderEnv, ...process.env }
    : process.env;

  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const formatted = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${formatted}`);
  }

  return parsed.data;
}

function getEnv() {
  if (!cachedEnv) {
    cachedEnv = parseEnv();
  }

  return cachedEnv;
}

export const env = new Proxy({} as Env, {
  get(_target, prop: string) {
    return getEnv()[prop as keyof Env];
  },
});
