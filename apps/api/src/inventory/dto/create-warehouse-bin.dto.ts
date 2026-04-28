import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class CreateWarehouseBinDto {
  @ApiProperty()
  @IsUUID()
  warehouseId!: string;

  @ApiProperty({ example: "A-01-03" })
  @IsString()
  @MaxLength(64)
  code!: string;

  @ApiPropertyOptional({ example: "A0103-0001" })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  barcode?: string;
}
