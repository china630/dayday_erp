import { Module } from "@nestjs/common";
import { AccountingModule } from "../accounting/accounting.module";
import { FinanceService } from "./finance.service";

@Module({
  imports: [AccountingModule],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
