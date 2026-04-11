import { ApiProperty } from "@nestjs/swagger";
import { InventoryAuditStatus } from "@dayday/database";
import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsUUID,
  Min,
  ValidateNested,
} from "class-validator";

export class InventoryAuditItemDto {
  @ApiProperty()
  @IsUUID()
  warehouseId!: string;

  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty({ description: "Фактическое количество на дату опись" })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  factQty!: number;

  @ApiProperty({ enum: ["201", "204"] })
  @IsIn(["201", "204"])
  inventoryAccountCode!: "201" | "204";
}

export class CreateInventoryAuditDto {
  @ApiProperty({ example: "2026-04-03" })
  @IsDateString()
  date!: string;

  @ApiProperty({ enum: InventoryAuditStatus })
  @IsEnum(InventoryAuditStatus)
  status!: InventoryAuditStatus;

  @ApiProperty({ type: [InventoryAuditItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InventoryAuditItemDto)
  items!: InventoryAuditItemDto[];
}
