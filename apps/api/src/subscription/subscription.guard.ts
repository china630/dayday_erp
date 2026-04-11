import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthUser } from "../auth/types/auth-user";
import { REQUIRES_MODULE_KEY } from "./subscription.constants";
import { SubscriptionAccessService } from "./subscription-access.service";

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: SubscriptionAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const moduleName = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRES_MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!moduleName) {
      return true;
    }

    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const orgId = req.user?.organizationId;
    if (!orgId) {
      throw new UnauthorizedException();
    }

    await this.access.assertModuleAccess(orgId, moduleName, {
      userEmail: req.user?.email,
      isSuperAdmin: req.user?.isSuperAdmin,
    });
    return true;
  }
}
