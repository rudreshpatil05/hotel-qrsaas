import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  DB_SSL: z.coerce.boolean().default(false),
  DB_SYNC: z.coerce.boolean().default(false),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_GUEST_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  JWT_GUEST_TTL: z.string().default('30m'),
  PUBLIC_GUEST_URL: z.string().url().default('http://localhost:5173'),
  RAZORPAY_KEY_ID: z.string().min(1).optional(),
  RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional()
  ,INTERAKT_API_KEY: z.string().min(1).optional()
  ,INTERAKT_BASE_URL: z.string().url().default('https://api.interakt.ai')
  ,AWS_REGION: z.string().min(1).default('ap-south-1')
  ,S3_BUCKET: z.string().min(1).optional()
  ,CLOUDFRONT_URL: z.string().url().optional()
  ,REDIS_URL: z.string().url().optional()
  ,SENTRY_DSN: z.string().url().optional()
  ,CLOUDWATCH_LOG_GROUP: z.string().min(1).optional()
  ,PMS_PROVIDER: z.string().min(1).optional()
  ,PMS_BASE_URL: z.string().url().optional()
  ,PMS_API_KEY: z.string().min(1).optional()
});

const environment = Object.fromEntries(
  Object.entries(process.env).map(([key, value]) => [key, value === '' ? undefined : value])
);
const parsed = schema.safeParse(environment);
if (!parsed.success) {
  throw new Error(`Invalid environment: ${parsed.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join('; ')}`);
}
export const config = parsed.data;
