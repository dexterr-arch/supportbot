import 'dotenv/config';
import { z } from 'zod';
export const idSchema = z.string().regex(/^\d{17,20}$/);
export const envSchema = z.object({
  DISCORD_TOKEN: z
    .string()
    .min(30)
    .refine((v) => !v.includes('REPLACE'), 'Set the bot token privately.'),
  DISCORD_CLIENT_ID: idSchema,
  DISCORD_GUILD_ID: idSchema,
  DATABASE_URL: z.url().refine((v) => /^postgres(ql)?:/.test(v), 'PostgreSQL is required.'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});
export function loadEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success)
    throw new Error(
      'Invalid environment fields: ' +
        [...new Set(result.error.issues.map((i) => i.path[0]))].join(', '),
    );
  return result.data;
}
