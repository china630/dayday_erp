/**
 * Safe JSON parsing wrapper.
 *
 * Browsers throw `SyntaxError: Unexpected end of JSON input` when calling `res.json()`
 * on an empty body (e.g. 204 No Content, interrupted response, misconfigured proxy).
 *
 * This helper returns `null` for:
 * - HTTP 204
 * - empty/whitespace body
 *
 * Otherwise it parses JSON via `JSON.parse` on a cloned response body.
 */
export async function safeJson<T = unknown>(res: Response): Promise<T | null> {
  if (res.status === 204) return null;
  const text = await res.clone().text();
  if (!text.trim()) return null;
  return JSON.parse(text) as T;
}

