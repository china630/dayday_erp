/**
 * Глобальная фиксация мутаций: POST / PATCH / PUT / DELETE (кроме auth login/register/refresh).
 * Записывает oldValues/newValues для Invoice, Employee, Product, JournalEntry (quick-expense),
 * иначе — HTTP_MUTATION с телом запроса в changes. Хеш SHA-256 для проверки целостности.
 */
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, from, of } from "rxjs";
import { mergeMap } from "rxjs/operators";
import type { AuthUser } from "../auth/types/auth-user";
import { AuditService } from "./audit.service";

const MUTATION_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

@Injectable()
export class AuditMutationInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditMutationInterceptor.name);

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
      pathRaw.includes("/auth/refresh") ||
      pathRaw.includes("/billing/webhooks")
    ) {
      return next.handle();
    }

    return from(this.audit.loadOldSnapshot(req)).pipe(
      mergeMap((oldSnapshot) =>
        next.handle().pipe(
          mergeMap((responseBody: unknown) => {
            void this.audit
              .persistAfterMutation({
                req,
                responseBody,
                oldSnapshot,
              })
              .catch((err: unknown) => {
                const msg =
                  err instanceof Error ? err.message : String(err);
                this.logger.error(`persistAfterMutation failed: ${msg}`);
              });
            return of(responseBody);
          }),
        ),
      ),
    );
  }
}
