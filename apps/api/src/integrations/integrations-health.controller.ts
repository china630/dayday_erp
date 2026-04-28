import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AccessControlService } from "../access/access-control.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { AuthUser } from "../auth/types/auth-user";
import { OrganizationId } from "../common/org-id.decorator";
import { UserRole } from "@dayday/database";
import { IntegrationReliabilityService } from "./integration-reliability.service";

@ApiTags("integrations")
@ApiBearerAuth("bearer")
@Controller("integrations")
@UseGuards(RolesGuard)
@Roles(UserRole.OWNER)
export class IntegrationsHealthController {
  constructor(
    private readonly access: AccessControlService,
    private readonly reliability: IntegrationReliabilityService,
  ) {}

  @Get("health")
  @ApiOperation({
    summary:
      "Integration health status for banking adapters, IBAN and tax providers (owner only)",
  })
  async health(
    @CurrentUser() user: AuthUser,
    @OrganizationId() organizationId: string,
  ) {
    await this.access.assertOwnerForBilling(user.userId, organizationId);
    const providers = await this.reliability.getProvidersHealthSnapshot([
      "pasha",
      "abb",
      "birbank",
      "iban",
      "tax",
    ]);
    return {
      organizationId,
      generatedAt: new Date().toISOString(),
      providers,
    };
  }
}

