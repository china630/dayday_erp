import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import type { AuthUser } from "../auth/types/auth-user";

/** Заголовок legacy (не рекомендуется; тенант из JWT). */
export const ORG_HEADER = "x-organization-id";

export const OrganizationId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<{
      user?: AuthUser;
      headers: Record<string, string | undefined>;
    }>();
    if (req.user?.organizationId) {
      return req.user.organizationId;
    }
    const raw = req.headers[ORG_HEADER] ?? req.headers[ORG_HEADER.toUpperCase()];
    const id = typeof raw === "string" ? raw.trim() : "";
    if (id) {
      return id;
    }
    throw new ForbiddenException(
      "Нет контекста организации: создайте компанию или выберите её в «Мои компании».",
    );
  },
);
