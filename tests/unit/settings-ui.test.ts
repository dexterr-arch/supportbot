import { describe, it, expect } from 'vitest';
import { settingsMenu, settingsModal, fieldsMenu } from '../../src/discord/settings-ui.js';
import { defaults } from '../../src/config/settings.js';
import type { Database } from '../../src/database/client.js';
const db = {
  guildSettings: { upsert: async () => ({ data: defaults, revision: 4 }) },
} as unknown as Database;
describe('guided setup', () => {
  it('shows a numbered setup checklist and plain-language sections', () => {
    const home = settingsMenu();
    const json = JSON.stringify(home.components.map((c) => c.toJSON()));
    expect(json).toContain('Channels & staff roles');
    expect(json).toContain('Post / refresh panel');
    expect(json).not.toContain('information');
    expect(home.embeds[0]!.description).toContain('Still to choose');
  });
  it('uses native role and channel pickers rather than asking for IDs', async () => {
    const role = (await settingsModal(db, 'guild', 'supportRoleId')).toJSON();
    const channel = (await settingsModal(db, 'guild', 'panelChannelId')).toJSON();
    expect(JSON.stringify(role)).toContain('"type":6');
    expect(JSON.stringify(channel)).toContain('"type":8');
    expect(channel.title).toBe('Public panel channel');
  });
  it('edits categories with four labeled fields and no JSON', async () => {
    const form = (await settingsModal(db, 'guild', 'category.management')).toJSON();
    expect(form.components).toHaveLength(4);
    expect(JSON.stringify(form)).not.toContain('JSON');
    expect(JSON.stringify(form)).not.toContain('Staff role override');
    expect(JSON.stringify(form)).toContain('Management ticket folder');
  });
  it('gives every routing option a helpful display name and description', async () => {
    const menu = await fieldsMenu(db, 'guild', 'routing');
    const json = JSON.stringify(menu.components.map((c) => c.toJSON()));
    expect(json).toContain('Private transcript log');
    expect(json).not.toContain('"label":"panelChannelId"');
  });
});
