import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import type { Request, Response } from "express";
import { CurrentUser } from "./decorators/current-user.decorator";
import { Public } from "./decorators/public.decorator";
import { AuthService } from "./auth.service";
import { AcceptInviteTokenDto } from "./dto/accept-invite-token.dto";
import { CreateOrgDto } from "./dto/create-org.dto";
import { JoinOrgDto } from "./dto/join-org.dto";
import { LoginDto } from "./dto/login.dto";
import { RegisterOrgDto } from "./dto/register-org.dto";
import { RegisterUserDto } from "./dto/register-user.dto";
import { SwitchOrgDto } from "./dto/switch-org.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import type { AuthUser } from "./types/auth-user";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("register-user")
  @ApiOperation({
    summary:
      "Регистрация только пользователя (email, пароль, имя, фамилия); организация — позже POST /auth/organizations",
  })
  async registerUser(
    @Body() dto: RegisterUserDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const out = await this.auth.registerUser(dto);
    this.auth.setRefreshCookie(res, out.refreshToken);
    const { refreshToken: _r, ...body } = out;
    return body;
  }

  @Public()
  @Post("register")
  @ApiOperation({ summary: "Регистрация организации и владельца + план счетов АР" })
  async register(
    @Body() dto: RegisterOrgDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const out = await this.auth.register(dto);
    this.auth.setRefreshCookie(res, out.refreshToken);
    const { refreshToken: _r, ...body } = out;
    return body;
  }

  @Public()
  @Post("login")
  @ApiOperation({ summary: "Вход, access token в теле, refresh в HttpOnly cookie" })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const out = await this.auth.login(dto);
    this.auth.setRefreshCookie(res, out.refreshToken);
    const { refreshToken: _r, ...body } = out;
    return body;
  }

  @Public()
  @Post("refresh")
  @ApiOperation({ summary: "Новая пара токенов по refresh cookie" })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.refresh_token as string | undefined;
    const out = await this.auth.refreshFromCookie(token);
    this.auth.setRefreshCookie(res, out.refreshToken);
    const { refreshToken: _r, ...body } = out;
    return body;
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post("logout")
  @ApiOperation({ summary: "Очистить refresh cookie (access можно отбросить на клиенте)" })
  logout(@Res({ passthrough: true }) res: Response) {
    this.auth.clearRefreshCookie(res);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get("me")
  @ApiOperation({ summary: "Текущий пользователь и список организаций" })
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.userId, user.organizationId, user.role);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post("organizations")
  @ApiOperation({
    summary: "Создать новую организацию (текущий пользователь — OWNER)",
  })
  async createOrganization(
    @Body() dto: CreateOrgDto,
    @CurrentUser() user: AuthUser,
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

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post("switch")
  @ApiOperation({
    summary: "Переключить контекст организации (новый access + refresh JWT)",
  })
  async switchOrganization(
    @Body() dto: SwitchOrgDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const out = await this.auth.switchOrganization(
      user.userId,
      dto.organizationId,
    );
    this.auth.setRefreshCookie(res, out.refreshToken);
    const { refreshToken: _r, ...body } = out;
    return body;
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post("join-org")
  @ApiOperation({ summary: "Запрос на вступление в организацию по VÖEN" })
  joinOrg(@Body() dto: JoinOrgDto, @CurrentUser() user: AuthUser) {
    return this.auth.requestJoinByTaxId(
      user.userId,
      dto.taxId,
      dto.message,
    );
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get("invites")
  @ApiOperation({ summary: "Входящие приглашения по email" })
  pendingInvites(@CurrentUser() user: AuthUser) {
    return this.auth.listInvitesForUser(user.email);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post("invites/:id/accept")
  @ApiOperation({ summary: "Принять приглашение в организацию" })
  acceptInvite(@Param("id") inviteId: string, @CurrentUser() user: AuthUser) {
    return this.auth.acceptInvite(user.userId, user.email, inviteId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post("invites/accept-by-token")
  @ApiOperation({ summary: "Принять приглашение по invite token" })
  acceptInviteByToken(
    @Body() dto: AcceptInviteTokenDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.auth.acceptInviteByToken(user.userId, user.email, dto.token);
  }
}
