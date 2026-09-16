import pino from 'pino';
export const logger = pino({
  level: 'info',
  redact: {
    paths: [
      'token',
      'password',
      'DATABASE_URL',
      'DISCORD_TOKEN',
      'authorization',
      'req.headers.authorization',
    ],
    censor: '[REDACTED]',
  },
});
// Never serialize third-party Error objects: Discord and database errors may contain credentials.
export function safeError(error: unknown) {
  return {
    kind: error instanceof Error ? error.constructor.name : 'UnknownError',
    code:
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      /^[A-Z0-9_]{1,30}$/.test(String(error.code))
        ? String(error.code)
        : undefined,
  };
}
export class UserError extends Error {}
