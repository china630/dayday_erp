import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from "class-validator";

export class CreateInvoiceItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  quantity!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  unitPrice!: number;

  @ApiProperty({ description: "Ставка НДС, % (0 или 18)" })
  @Type(() => Number)
  @IsNumber()
  vatRate!: number;
}

export class CreateInvoiceDto {
  @ApiProperty()
  @IsUUID()
  counterpartyId!: string;

  @ApiProperty({ example: "2026-04-15" })
  @IsDateString()
  dueDate!: string;

  @ApiPropertyOptional({ enum: ["101", "221"], default: "101" })
  @IsOptional()
  @IsString()
  @IsIn(["101", "221"])
  debitAccountCode?: string;

  @ApiPropertyOptional({ description: "Склад отгрузки (остатки / списание при оплате)" })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiProperty({ type: [CreateInvoiceItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  items!: CreateInvoiceItemDto[];
}
