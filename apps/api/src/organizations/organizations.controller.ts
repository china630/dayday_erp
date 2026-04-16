import { Body, Controller, ForbiddenException, Get, Post } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { OrganizationId } from "../common/org-id.decorator";
import { TransferOwnershipDto } from "./dto/transfer-ownership.dto";
import { OrganizationsService } from "./organizations.service";

@ApiTags("organizations")
@ApiBearerAuth("bearer")
@Controller("organizations")
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get("tree")
  @ApiOperation({
    summary:
      "Дерево доступных организаций: Holdings -> organizations + отдельный список свободных компаний",
  })
  async tree(@CurrentUser() user: AuthUser) {
    return this.organizations.getOrganizationsTreeForUser(user.userId);
  }

  @Post("transfer-ownership")
  @ApiOperation({
    summary:
      "Передать владение организацией: ownerId → newOwner; прежний OWNER становится ADMIN (v10.3)",
  })
  async transferOwnership(
    @CurrentUser() user: AuthUser,
    @OrganizationId() organizationId: string,
    @Body() dto: TransferOwnershipDto,
  ) {
    if (!user.organizationId) {
      throw new ForbiddenException("Organization context required");
    }
    return this.organizations.transferOwnership(
      user.userId,
      organizationId,
      dto.newOwnerUserId,
    );
  }
}
