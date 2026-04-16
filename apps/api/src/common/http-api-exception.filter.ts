import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";

/**
 * Единый JSON для клиента: message — всегда строка (в т.ч. из массива class-validator).
 */
@Catch(HttpException)
export class HttpApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpApiExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const body = exception.getResponse();

    let message = exception.message;
    let code: string | undefined;

    if (typeof body === "string") {
      message = body;
    } else if (body && typeof body === "object") {
      const o = body as Record<string, unknown>;
      if (typeof o.code === "string") code = o.code;
      const m = o.message;
      if (typeof m === "string") message = m;
      else if (Array.isArray(m) && m.every((x) => typeof x === "string")) {
        message = m.join("; ");
      } else if (Array.isArray(m)) {
        message = m
          .map((x) => (typeof x === "string" ? x : JSON.stringify(x)))
          .join("; ");
      }
    }

    if (status >= 500) {
      this.logger.warn(`${status} ${message}`);
    }

    const payload: Record<string, unknown> = {
      statusCode: status,
      message,
      error: HttpStatus[status] ?? "Error",
    };
    if (code) payload.code = code;

    res.status(status).json(payload);
  }
}
