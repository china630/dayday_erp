import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AbsenceType } from "@dayday/database";
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from "class-validator";

export class CreateAbsenceDto {
  @ApiProperty()
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ enum: AbsenceType })
  @IsEnum(AbsenceType)
  type!: AbsenceType;

  @ApiProperty({ example: "2026-06-01" })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: "2026-06-14" })
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
