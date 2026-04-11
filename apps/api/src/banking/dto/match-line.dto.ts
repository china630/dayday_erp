import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class MatchBankLineDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  invoiceId!: string;
}
