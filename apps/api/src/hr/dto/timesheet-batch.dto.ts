import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { TimesheetEntryType } from "@dayday/database";

export class TimesheetBatchItemDto {
  @ApiProperty()
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ minimum: 1, maximum: 31 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  fromDay!: number;

  @ApiProperty({ minimum: 1, maximum: 31 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  toDay!: number;

  @ApiProperty({ enum: TimesheetEntryType })
  @IsEnum(TimesheetEntryType)
  type!: TimesheetEntryType;

  @ApiPropertyOptional({ description: "Часы (по умолчанию 8 для рабочих типов, 0 для OFF)" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(24)
  hours?: number;
}

export class TimesheetBatchUpdateDto {
  @ApiProperty({ type: [TimesheetBatchItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimesheetBatchItemDto)
  batches!: TimesheetBatchItemDto[];
}
