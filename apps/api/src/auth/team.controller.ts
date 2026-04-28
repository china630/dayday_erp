import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { UserRole } from "@dayday/database";
import { OrganizationId } from "../common/org-id.decorator";
import { CurrentUser } from "./decorators/current-user.decorator";
import { Roles } from "./decorators/roles.decorator";
import { ApproveAccessDto } from "./dto/approve-access.dto";
import { CreateInviteDto } from "./dto/create-invite.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { RolesGuard } from "./guards/roles.guard";
import { requireOrgRole } from "./require-org-role";
import type { AuthUser } from "./types/auth-user";
import { AuthService } from "./auth.service";

@ApiTags("team")
@ApiBearerAuth("bearer")
@Controller("team")
@UseGuards(JwtAuthGuard)
export class TeamController {
  constructor(private readonly auth: AuthService) {}

  @Get("members")
  @ApiOperation({ summary: "Участники текущей организации" })
  members(@OrganizationId() organizationId: string) {
    return this.auth.listMembers(organizationId);
  }

  @Delete("members/:userId")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: "Исключить участника (не OWNER)" })
  removeMember(
    @CurrentUser() user: AuthUser,
    @OrganizationId() organizationId: string,
    @Param("userId") targetUserId: string,
  ) {
    return this.auth.removeMember(
      organizationId,
      targetUserId,
      user.userId,
      requireOrgRole(user),
    );
  }

  @Get("access-requests")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: "Ожидающие запросы на вступление по VÖEN" })
  accessRequests(@OrganizationId() organizationId: string) {
    return this.auth.listPendingAccessRequests(organizationId);
  }

  @Post("access-requests/:id/approve")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: "Принять запрос на доступ" })
  approveAccess(
    @CurrentUser() user: AuthUser,
    @OrganizationId() organizationId: string,
    @Param("id") requestId: string,
    @Body() dto: ApproveAccessDto,
  ) {
    return this.auth.decideAccessRequest(
      organizationId,
      requestId,
      user.userId,
      requireOrgRole(user),
      true,
      dto.role ?? UserRole.USER,
    );
  }

  @Post("access-requests/:id/decline")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: "Отклонить запрос на доступ" })
  declineAccess(
    @CurrentUser() user: AuthUser,
    @OrganizationId() organizationId: string,
    @Param("id") requestId: string,
  ) {
    return this.auth.decideAccessRequest(
      organizationId,
      requestId,
      user.userId,
      requireOrgRole(user),
      false,
      UserRole.USER,
    );
  }

  @Post("invites")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: "Пригласить пользователя по email" })
  createInvite(
    @CurrentUser() user: AuthUser,
    @OrganizationId() organizationId: string,
    @Body() dto: CreateInviteDto,
  ) {
    return this.auth.createInvite(
      organizationId,
      dto.email,
      dto.role,
      user.userId,
    );
  }

  @Get("invites")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: "Список активных приглашений организации" })
  invites(@OrganizationId() organizationId: string) {
    return this.auth.listOrganizationInvites(organizationId);
  }

  @Post("invites/:id/revoke")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: "Отозвать приглашение" })
  revokeInvite(
    @CurrentUser() user: AuthUser,
    @OrganizationId() organizationId: string,
    @Param("id") inviteId: string,
  ) {
    return this.auth.revokeInvite(
      organizationId,
      inviteId,
      requireOrgRole(user),
    );
  }
}
