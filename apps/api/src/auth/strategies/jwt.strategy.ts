import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import type { UserRole } from "@dayday/database";
import { ExtractJwt, Strategy } from "passport-jwt";
import { AuthService } from "../auth.service";

export type AccessTokenPayload = {
  sub: string;
  email: string;
  organizationId: string | null;
  role: UserRole | null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(
    config: ConfigService,
    private readonly auth: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>("JWT_SECRET"),
    });
  }

  validate(payload: AccessTokenPayload) {
    return this.auth.validateUserForJwtPayload(payload);
  }
}
