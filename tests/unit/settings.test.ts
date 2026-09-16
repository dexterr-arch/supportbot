import { describe, it, expect } from 'vitest';
import { defaults, settingsSchema } from '../../src/config/settings.js';
import { envSchema } from '../../src/config/env.js';
describe('configuration validation', () => {
  it('accepts editable placeholders', () =>
    expect(settingsSchema.safeParse(defaults).success).toBe(true));
  it.each([
    { accentColor: 'orange' },
    { supportRoleId: '@everyone' },
    { orderBannerUrl: 'javascript:alert(1)' },
    { footerImageUrl: 'http://example.org/x.png' },
    { cooldownSeconds: 0 },
    { categories: [defaults.categories[0], defaults.categories[0]] },
    { surprise: 'unknown' },
  ])('rejects invalid settings %j', (patch) =>
    expect(settingsSchema.safeParse({ ...defaults, ...patch }).success).toBe(false),
  );
  it('refuses incomplete environment configuration without secrets', () =>
    expect(
      envSchema.safeParse({
        DISCORD_TOKEN: 'REPLACE_WITH_BOT_TOKEN',
        DATABASE_URL: 'file:local.db',
      }).success,
    ).toBe(false));
});
