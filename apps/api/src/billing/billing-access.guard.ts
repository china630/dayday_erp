import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { BillingStatus } from "@dayday/database";
import { IS_PUBLIC_KEY } from "../auth/constants";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class BillingAccessGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<{
      method: string;
      path?: string;
      url?: string;
      user?: AuthUser;
      originalUrl?: string;
    }>();
    const method = (req.method ?? "GET").toUpperCase();
    const path = this.normalizePath(
      req.originalUrl?.split("?")[0] ??
        req.path ??
        req.url?.split("?")[0] ??
        "",
    );
    const user = req.user;
    if (!user?.organizationId || user.isSuperAdmin) return true;

    const org = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { billingStatus: true },
    });
    const status = org?.billingStatus ?? BillingStatus.ACTIVE;

    if (status === BillingStatus.SOFT_BLOCK) {
      if (this.isExportPath(path)) {
        throw new HttpException(
          {
            statusCode: HttpStatus.PAYMENT_REQUIRED,
            code: "BILLING_SOFT_BLOCK_EXPORTS",
            message:
              "Billing SOFT_BLOCK: export functions are restricted until invoice payment.",
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
      return true;
    }

    if (status === BillingStatus.HARD_BLOCK) {
      if (["GET", "HEAD", "OPTIONS"].includes(method)) return true;
      if (this.isBillingPaymentPath(path, method)) return true;
      throw new HttpException(
        {
          statusCode: HttpStatus.PAYMENT_REQUIRED,
          code: "BILLING_HARD_BLOCK_READ_ONLY",
          message:
            "Billing HARD_BLOCK: system is in read-only mode until invoice payment.",
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    return true;
  }

  private normalizePath(path: string): string {
    if (!path) return "";
    if (path.startsWith("/api")) return path;
    return path.startsWith("/") ? `/api${path}` : `/api/${path}`;
  }

  private isBillingPaymentPath(path: string, method: string): boolean {
    if (method !== "POST") return false;
    if (path === "/api/billing/checkout") return true;
    if (path.startsWith("/api/billing/webhooks/")) return true;
    if (path === "/api/public/billing/webhook") return true;
    return false;
  }

  private isExportPath(path: string): boolean {
    const p = path.toLowerCase();
    return (
      p.includes("/export") ||
      p.includes("/pdf") ||
      p.includes("/xlsx") ||
      p.includes("/xml") ||
      p.includes("/tax-export")
    );
  }
}
