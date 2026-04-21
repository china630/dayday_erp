import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthUser } from "../../auth/types/auth-user";
import { QuotaResource } from "../../quota/quota-resource";
import { QuotaService } from "../../quota/quota.service";
import { CHECK_QUOTA_KEY } from "../decorators/check-quota.decorator";

@Injectable()
export class QuotaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly quota: QuotaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const resource = this.reflector.getAllAndOverride<QuotaResource | undefined>(
      CHECK_QUOTA_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!resource) {
      return true;
    }

    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return true;
    }

    switch (resource) {
      case QuotaResource.USERS:
        await this.quota.assertEmployeeQuota(organizationId);
        return true;
      case QuotaResource.INVOICES_PER_MONTH:
        await this.quota.assertInvoiceMonthlyQuota(organizationId);
        return true;
      case QuotaResource.STORAGE:
        return true;
      default:
        return true;
    }
  }
}
