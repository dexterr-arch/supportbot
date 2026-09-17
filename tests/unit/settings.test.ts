import { describe, it, expect } from 'vitest';
import { defaults, settingsSchema, supportOnlySettings } from '../../src/config/settings.js';
import { envSchema } from '../../src/config/env.js';
describe('configuration validation', () => {
  it('upgrades old settings to support and management while preserving routing and branding', () => {
    const original = settingsSchema.parse(defaults);
    original.panelChannelId = '1549726256826945656';
    original.categories[0]!.label = 'Basic Support';
    original.categories.push({
      ...original.categories[0]!,
      key: 'order',
      label: 'Order',
      order: true,
    });
    const result = supportOnlySettings(original);
    expect(result.categories.map((c) => c.key)).toEqual(['support', 'management']);
    expect(result.categories[0]!.label).toBe('Basic Support');
    expect(result.panelChannelId).toBe(original.panelChannelId);
    expect(result.categories.every((c) => !c.order)).toBe(true);
    expect(original.categories).toHaveLength(3);
  });
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
