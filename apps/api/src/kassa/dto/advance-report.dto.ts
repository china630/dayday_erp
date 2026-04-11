import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from "class-validator";

export class AdvanceExpenseLineDto {
  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiProperty()
  @IsString()
  description!: string;
}

export class CreateAdvanceReportDto {
  @ApiProperty()
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ example: "2026-04-03" })
  @IsDateString()
  reportDate!: string;

  @ApiProperty({ type: [AdvanceExpenseLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdvanceExpenseLineDto)
  expenseLines!: AdvanceExpenseLineDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  purpose?: string;
}
