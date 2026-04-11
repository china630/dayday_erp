import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PublicVerifyController } from "./public-verify.controller";
import { SignatureService } from "./signature.service";

@Module({
  imports: [PrismaModule],
  controllers: [PublicVerifyController],
  providers: [SignatureService],
  exports: [SignatureService],
})
export class SignatureModule {}
