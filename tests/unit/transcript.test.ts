import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  renderParts,
  safeLink,
  type TranscriptMessage,
} from '../../src/transcripts/html.js';
const message: TranscriptMessage = {
  id: '1',
  author: '<img onerror=alert(1)>',
  authorId: '2',
  timestamp: '2026-09-16T00:00:00Z',
  text: '<script>alert("x")</script> & goodbye',
  embeds: [{ description: '<svg onload=alert(1)>' }],
  attachments: [
    { name: '<unsafe>.txt', url: 'javascript:alert(1)' },
    { name: 'file.txt', url: 'https://example.org/file?x="bad"' },
  ],
};
describe('transcript safety', () => {
  it('escapes all HTML delimiters', () =>
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;'));
  it('allows only HTTPS attachment links', () => {
    expect(safeLink('javascript:alert(1)')).toBe('');
    expect(safeLink('data:text/html,bad')).toBe('');
    expect(safeLink('https://example.org/file')).toBe('https://example.org/file');
  });
  it('escapes authors, text, embeds, and attachment names and disables scripts', () => {
    const html = renderParts('Ticket <1>', [message])[0]!;
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('&lt;unsafe&gt;');
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain(message.timestamp);
  });
  it('splits on message boundaries, preserving every message', () => {
    const msgs = Array.from({ length: 30 }, (_, i) => ({
      ...message,
      id: String(i),
      text: 'x'.repeat(300),
    }));
    const parts = renderParts('Ticket', msgs, 3500);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(Buffer.byteLength(p)).toBeLessThanOrEqual(3500);
    for (const m of msgs)
      expect(parts.join('').match(new RegExp('id="m-' + m.id + '"', 'g'))).toHaveLength(1);
  });
  it('returns a valid empty transcript', () =>
    expect(renderParts('Empty', [])[0]).toContain('No messages were available'));
});
