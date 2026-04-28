import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { UserRole } from "@dayday/database";
import type { AuthUser } from "../types/auth-user";

const MUTATION_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

@Injectable()
export class AuditorMutationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      method?: string;
      path?: string;
      originalUrl?: string;
      user?: AuthUser;
    }>();
    const method = (req.method ?? "").toUpperCase();
    if (!MUTATION_METHODS.has(method)) {
      return true;
    }

    const user = req.user;
    if (!user?.role || user.role !== UserRole.AUDITOR) {
      return true;
    }

    const path = req.path ?? req.originalUrl ?? "";
    if (path.endsWith("/auth/logout")) {
      return true;
    }

    throw new ForbiddenException({
      code: "AUDITOR_READ_ONLY",
      message: "AUDITOR role has read-only access. Mutations are not allowed.",
    });
  }
}
