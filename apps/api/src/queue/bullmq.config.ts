import type { ConnectionOptions } from "bullmq";

export function connectionFromRedisUrl(url: string): ConnectionOptions {
  const u = new URL(url);
  const port = u.port ? Number(u.port) : 6379;
  const opts: ConnectionOptions = {
    host: u.hostname,
    port,
  };
  if (u.password) {
    opts.password = decodeURIComponent(u.password);
  }
  if (u.username && u.username !== "default") {
    opts.username = decodeURIComponent(u.username);
  }
  return opts;
}
