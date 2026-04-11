import { apiBaseUrl } from "./api-client";

/** Запрос к публичным эндпоинтам API без редиректа на /login при 401. */
export function publicApiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = path.startsWith("http") ? path : `${apiBaseUrl()}${path}`;
  return fetch(url, { ...init });
}
