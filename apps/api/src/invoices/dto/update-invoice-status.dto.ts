import { ApiProperty } from "@nestjs/swagger";
import { InvoiceStatus } from "@dayday/database";
import { IsEnum } from "class-validator";

export class UpdateInvoiceStatusDto {
  @ApiProperty({ enum: InvoiceStatus })
  @IsEnum(InvoiceStatus)
  status!: InvoiceStatus;
}
