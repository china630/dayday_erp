import {
  Body,
  Controller,
  ForbiddenException,
  forwardRef,
  Get,
  Inject,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { UserRole } from "@dayday/database";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthService } from "../auth/auth.service";
import { CreateOrgDto } from "../auth/dto/create-org.dto";
import { OrganizationId } from "../common/org-id.decorator";
import { TransferOwnershipDto } from "./dto/transfer-ownership.dto";
import { OrganizationsService } from "./organizations.service";

@ApiTags("organizations")
@ApiBearerAuth("bearer")
@Controller("organizations")
export class OrganizationsController {
  constructor(
    private readonly organizations: OrganizationsService,
    @Inject(forwardRef(() => AuthService))
    private readonly auth: AuthService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      "Создать организацию (эквивалент POST /api/auth/organizations): coaTemplate full|small для NAS",
  })
  async createOrganization(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOrgDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const out = await this.auth.createOrganizationForExistingUser(
      user.userId,
      dto,
    );
    this.auth.setRefreshCookie(res, out.refreshToken);
    const { refreshToken: _r, ...body } = out;
    return body;
  }

  @Get("tree")
  @ApiOperation({
    summary:
      "Дерево доступных организаций: Holdings -> organizations + отдельный список свободных компаний",
  })
  async tree(@CurrentUser() user: AuthUser) {
    return this.organizations.getOrganizationsTreeForUser(user.userId);
  }

  @Post("transfer-ownership")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER)
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
