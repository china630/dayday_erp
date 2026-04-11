import { BankStatementLineType } from "@dayday/database";
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";

export class WebhookBankTransactionDto {
  @ApiProperty({ example: "ext-tx-001" })
  @IsString()
  externalId!: string;

  @ApiProperty({ example: "150.00" })
  @IsString()
  amount!: string;

  @ApiProperty({ enum: BankStatementLineType })
  @IsEnum(BankStatementLineType)
  type!: BankStatementLineType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  counterpartyTaxId?: string;

  @ApiProperty({ required: false, description: "YYYY-MM-DD" })
  @IsOptional()
  @IsString()
  valueDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;
}

export class BankingWebhookDto {
  @ApiProperty({ example: "Pasha Bank" })
  @IsString()
  bankName!: string;

  @ApiProperty({ type: [WebhookBankTransactionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WebhookBankTransactionDto)
  transactions!: WebhookBankTransactionDto[];
}
