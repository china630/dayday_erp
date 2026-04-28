import { Module } from "@nestjs/common";
import { GlobalCompanyDirectoryModule } from "../global-directory/global-company-directory.module";
import { PrismaModule } from "../prisma/prisma.module";
import { TaxModule } from "../tax/tax.module";
import { CounterpartiesController } from "./counterparties.controller";
import { CounterpartiesService } from "./counterparties.service";

@Module({
  imports: [PrismaModule, GlobalCompanyDirectoryModule, TaxModule],
  controllers: [CounterpartiesController],
  providers: [CounterpartiesService],
  exports: [CounterpartiesService],
})
export class CounterpartiesModule {}
