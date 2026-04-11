/** Единый ответ liveness: GET /api/health и legacy GET /health. */
export const HEALTH_CHECK_PAYLOAD = {
  status: "ok",
  service: "dayday-api",
} as const;
