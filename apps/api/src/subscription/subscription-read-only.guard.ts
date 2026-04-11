import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/types/auth-user";
import { IS_PUBLIC_KEY } from "../auth/constants";
import { SUBSCRIPTION_READ_ONLY_MESSAGE_AZ } from "./subscription-read-only.constants";

/**
 * После истечения expiresAt (демо или оплаченный период) — только чтение:
 * GET/HEAD/OPTIONS проходят; мутации — 403, кроме белого списка (оплата, auth, public).
 */
@Injectable()
export class SubscriptionReadOnlyGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<{
      method: string;
      path?: string;
      url?: string;
      user?: AuthUser;
    }>();

    const method = req.method?.toUpperCase() ?? "GET";
    if (["GET", "HEAD", "OPTIONS"].includes(method)) {
      return true;
    }

    const user = req.user;
    if (user?.isSuperAdmin) {
      return true;
    }

    if (!user?.organizationId) {
      return true;
    }

    const path =
      (req as { originalUrl?: string }).originalUrl?.split("?")[0] ??
      req.path ??
      req.url?.split("?")[0] ??
      "";
    if (this.isMutationWhitelisted(path, method)) {
      return true;
    }

    const sub = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId: user.organizationId },
      select: { expiresAt: true, isBlocked: true },
    });

    if (sub?.isBlocked) {
      throw new HttpException(
        {
          statusCode: HttpStatus.FORBIDDEN,
          code: "ORGANIZATION_SUSPENDED",
          message: "Organization access suspended",
        },
        HttpStatus.FORBIDDEN,
      );
    }

    if (!sub?.expiresAt) {
      return true;
    }

    if (sub.expiresAt.getTime() >= Date.now()) {
      return true;
    }

    throw new HttpException(
      {
        statusCode: HttpStatus.FORBIDDEN,
        code: "SUBSCRIPTION_READ_ONLY",
        message: SUBSCRIPTION_READ_ONLY_MESSAGE_AZ,
      },
      HttpStatus.FORBIDDEN,
    );
  }

  private isMutationWhitelisted(path: string, method: string): boolean {
    const p = this.normalizePath(path);
    if (p.startsWith("/api/auth")) {
      return true;
    }
    if (p.startsWith("/api/public")) {
      return true;
    }
    if (p === "/api/billing/checkout" && method === "POST") {
      return true;
    }
    return false;
  }

  /** Express path может быть с префиксом /api или без — приводим к виду /api/... */
  private normalizePath(path: string): string {
    if (!path) return "";
    if (path.startsWith("/api")) return path;
    return path.startsWith("/") ? `/api${path}` : `/api/${path}`;
  }
}
