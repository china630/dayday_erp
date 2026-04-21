import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { StockService } from "./stock.service";

@Module({
  imports: [PrismaModule],
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
