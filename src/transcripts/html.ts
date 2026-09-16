export interface TranscriptMessage {
  id: string;
  author: string;
  authorId: string;
  timestamp: string;
  text: string;
  embeds: unknown[];
  attachments: { name: string; url: string }[];
  components?: unknown[];
}
export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
export function safeLink(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' ? escapeHtml(u.href) : '';
  } catch {
    return '';
  }
}
function article(m: TranscriptMessage) {
  const attachments = m.attachments
    .map((a) => {
      const url = safeLink(a.url);
      return url
        ? '<li><a rel="noopener noreferrer" href="' + url + '">' + escapeHtml(a.name) + '</a></li>'
        : '<li>' + escapeHtml(a.name) + ' (link unavailable)</li>';
    })
    .join('');
  return (
    '<article id="m-' +
    escapeHtml(m.id) +
    '"><header><strong>' +
    escapeHtml(m.author) +
    '</strong> <small>' +
    escapeHtml(m.authorId) +
    ' · ' +
    escapeHtml(m.timestamp) +
    '</small></header><pre>' +
    escapeHtml(m.text) +
    '</pre>' +
    (m.embeds.length
      ? '<details open><summary>Embeds</summary><pre>' +
        escapeHtml(JSON.stringify(m.embeds, null, 2)) +
        '</pre></details>'
      : '') +
    (m.components?.length
      ? '<details><summary>Message components</summary><pre>' +
        escapeHtml(JSON.stringify(m.components, null, 2)) +
        '</pre></details>'
      : '') +
    (attachments ? '<ul>' + attachments + '</ul>' : '') +
    '</article>'
  );
}
export function documentHtml(title: string, body: string) {
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><title>' +
    escapeHtml(title) +
    '</title><style>body{color:#e7e7ec;background:#19191f;font:15px/1.6 system-ui;max-width:1000px;margin:40px auto;padding:0 24px}h1{color:#ff7b36}article{border-left:3px solid #ff6b24;border-radius:8px;background:#25252e;margin:16px 0;padding:18px}small{color:#aaa}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}a{color:#ff9a62}summary{cursor:pointer}</style></head><body><h1>' +
    escapeHtml(title) +
    '</h1><p>Private support transcript. Attachment links may expire. Deleted messages are unavailable.</p>' +
    body +
    '</body></html>'
  );
}
export function renderParts(title: string, messages: TranscriptMessage[], maxBytes = 1_000_000) {
  const parts: string[] = [];
  let body = '';
  for (const m of messages) {
    const block = article(m);
    if (Buffer.byteLength(documentHtml(title, block)) > maxBytes)
      throw new Error('A transcript message exceeds the safe upload limit.');
    if (body && Buffer.byteLength(documentHtml(title, body + block)) > maxBytes) {
      parts.push(documentHtml(title, body));
      body = '';
    }
    body += block;
  }
  parts.push(documentHtml(title, body || '<p>No messages were available.</p>'));
  return parts;
}
