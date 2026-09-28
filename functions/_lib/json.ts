/**
 * json.ts — tolerant JSON extraction for model output.
 *
 * Claude is asked for bare JSON, but occasionally wraps it in ```json fences
 * or adds a sentence before/after. Slice from the first `{` to the last `}`
 * so either case still parses. Truncated output still throws — callers
 * should check stop_reason for that.
 */

export function extractJSONObject(raw: string): string {
  const text = raw.replace(/```(?:json)?/gi, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return text;
  return text.slice(start, end + 1);
}

export function parseModelJSON<T>(raw: string): T {
  return JSON.parse(extractJSONObject(raw)) as T;
}
