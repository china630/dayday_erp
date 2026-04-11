import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tenantContextStorage } from "./tenant-context";

/**
 * Заполняет AsyncLocalStorage для Prisma tenant extension.
 * Порядок Nest: Guards → Interceptors → handler — JWT уже установил req.user.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      user?: { organizationId?: string; isSuperAdmin?: boolean };
      originalUrl?: string;
      url?: string;
    }>();
    const url = (req.originalUrl ?? req.url ?? "").split("?")[0];
    const user = req.user;

    const isPublic =
      url.startsWith("/api/public") ||
      url.startsWith("/api/auth/login") ||
      url.startsWith("/api/auth/register-user") ||
      url.startsWith("/api/auth/register") ||
      url.startsWith("/api/auth/refresh") ||
      url === "/api/health" ||
      url.startsWith("/docs");

    if (isPublic) {
      return tenantContextStorage.run(
        { organizationId: null, skipTenantFilter: true },
        () => next.handle(),
      );
    }

    if (!user) {
      return tenantContextStorage.run(
        { organizationId: null, skipTenantFilter: true },
        () => next.handle(),
      );
    }

    /** TZ §15 / PRD §7.6: маршруты `/api/admin/*` — супер-админ видит всю систему (Prisma без merge по organizationId). */
    const skipTenantFilter =
      Boolean(user.isSuperAdmin) && url.startsWith("/api/admin");

    return tenantContextStorage.run(
      {
        organizationId: user.organizationId ?? null,
        skipTenantFilter,
      },
      () => next.handle(),
    );
  }
}
