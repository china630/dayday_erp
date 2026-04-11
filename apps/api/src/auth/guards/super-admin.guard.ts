import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuthUser } from "../types/auth-user";

@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = req.user;
    if (!user?.userId) {
      throw new ForbiddenException();
    }
    if (user.isSuperAdmin) {
      return true;
    }
    const row = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { isSuperAdmin: true },
    });
    if (!row?.isSuperAdmin) {
      throw new ForbiddenException("Super admin only");
    }
    return true;
  }
}
