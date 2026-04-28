import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsUUID } from "class-validator";

export class PayrollPayoutDto {
  @ApiPropertyOptional({
    description: "Organization bank account selected for payroll payout",
  })
  @IsUUID()
  bankAccountId!: string;

  @ApiPropertyOptional({
    enum: ["ABB_XML", "UNIVERSAL_XLSX"],
    description:
      "Optional payout format override; if omitted format is derived from selected bank account",
  })
  @IsOptional()
  @IsIn(["ABB_XML", "UNIVERSAL_XLSX"])
  payoutFormat?: "ABB_XML" | "UNIVERSAL_XLSX";
}

