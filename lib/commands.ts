type Command =
  | { type: 'start' }
  | { type: 'send'; text: string }
  | { type: 'unknown'; reason?: string };

export function parseCommand(raw: string): Command {
  const text = raw.trim();

  if (text.startsWith('/start')) {
    return { type: 'start' };
  }

  if (text.startsWith('/send')) {
    const payload = text.replace(/^\/send(@\w+)?/i, '').trim();
    if (!payload) {
      return { type: 'unknown', reason: 'missing-message' };
    }
    return { type: 'send', text: payload };
  }

  return { type: 'unknown' };
}
