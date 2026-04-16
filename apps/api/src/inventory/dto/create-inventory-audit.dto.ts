import { ApiProperty } from "@nestjs/swagger";
import { InventoryAuditStatus } from "@dayday/database";
import {
  IsDateString,
  IsEnum,
  IsUUID,
} from "class-validator";

export class CreateInventoryAuditDto {
  @ApiProperty({ example: "2026-04-03" })
  @IsDateString()
  date!: string;

  @ApiProperty({ description: "Склад (одна опись — один физический склад)" })
  @IsUUID()
  warehouseId!: string;

  @ApiProperty({ enum: InventoryAuditStatus })
  @IsEnum(InventoryAuditStatus)
  status!: InventoryAuditStatus;
}
