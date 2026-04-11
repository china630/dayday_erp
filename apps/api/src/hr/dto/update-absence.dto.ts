import { ApiPropertyOptional } from "@nestjs/swagger";
import { AbsenceType } from "@dayday/database";
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from "class-validator";

export class UpdateAbsenceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional({ enum: AbsenceType })
  @IsOptional()
  @IsEnum(AbsenceType)
  type?: AbsenceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
