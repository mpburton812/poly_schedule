/**
 * Event comment thread helpers and GCal description formatting.
 */

export function normalizeEventComments(comments) {
  if (!Array.isArray(comments)) return [];
  return comments.filter((c) => c && typeof c.text === 'string' && c.text.trim());
}

export function appendEventComment(event, author, text) {
  const trimmed = String(text || '').trim();
  if (!trimmed || !author) return null;
  const entry = {
    id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    author,
    text: trimmed,
    createdAt: new Date().toISOString()
  };
  event.comments = [...normalizeEventComments(event.comments), entry];
  return entry;
}

/** Human-readable notes + comment thread for the GCal description field. */
export function formatGCalDescription(event) {
  const lines = [];
  const notes = String(event?.notes || '').trim();
  if (notes) {
    lines.push(notes);
  }

  const comments = normalizeEventComments(event?.comments);
  if (comments.length) {
    if (lines.length) lines.push('');
    lines.push('--- Comments ---');
    for (const comment of comments) {
      const when = comment.createdAt
        ? new Date(comment.createdAt).toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        })
        : '';
      const stamp = when ? ` (${when})` : '';
      lines.push(`${comment.author}${stamp}: ${comment.text}`);
    }
  }

  return lines.join('\n').trim();
}
