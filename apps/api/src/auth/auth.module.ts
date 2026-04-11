import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AccountsModule } from "../accounts/accounts.module";
import { HrModule } from "../hr/hr.module";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { TeamController } from "./team.controller";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { RolesGuard } from "./guards/roles.guard";
import { SuperAdminGuard } from "./guards/super-admin.guard";
import { JwtStrategy } from "./strategies/jwt.strategy";

@Module({
  imports: [
    PrismaModule,
    AccountsModule,
    HrModule,
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("JWT_SECRET"),
        signOptions: {
          expiresIn: (config.get<string>("JWT_ACCESS_EXPIRES") ?? "15m") as any,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, TeamController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard, RolesGuard, SuperAdminGuard],
  exports: [AuthService, JwtModule, JwtAuthGuard, RolesGuard, SuperAdminGuard],
})
export class AuthModule {}
