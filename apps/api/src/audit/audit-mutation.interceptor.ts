/**
 * Глобальная фиксация мутаций: POST / PATCH / PUT / DELETE (кроме auth login/register/refresh).
 * Записывает oldValues/newValues для Invoice, Employee, Product, JournalEntry (quick-expense),
 * иначе — HTTP_MUTATION с телом запроса в changes. Хеш SHA-256 для проверки целостности.
 */
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, from } from "rxjs";
import { mergeMap } from "rxjs/operators";
import type { AuthUser } from "../auth/types/auth-user";
import { AuditService } from "./audit.service";

const MUTATION_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

@Injectable()
export class AuditMutationInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<{
      method: string;
      path?: string;
      url?: string;
      body?: unknown;
      user?: AuthUser;
      headers: Record<string, string | string[] | undefined>;
      ip?: string;
    }>();

    if (!MUTATION_METHODS.has(req.method)) {
      return next.handle();
    }

    const pathRaw = req.path ?? req.url ?? "";
    if (
      pathRaw.includes("/auth/login") ||
      pathRaw.includes("/auth/register-user") ||
      pathRaw.includes("/auth/register") ||
      pathRaw.includes("/auth/refresh")
    ) {
      return next.handle();
    }

    return from(this.audit.loadOldSnapshot(req)).pipe(
      mergeMap((oldSnapshot) =>
        next.handle().pipe(
          mergeMap(async (responseBody: unknown) => {
            await this.audit.persistAfterMutation({
              req,
              responseBody,
              oldSnapshot,
            });
            return responseBody;
          }),
        ),
      ),
    );
  }
}
