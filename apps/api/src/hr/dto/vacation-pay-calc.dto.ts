import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsOptional, IsUUID } from "class-validator";

export class VacationPayCalcDto {
  @ApiProperty()
  @IsUUID()
  employeeId!: string;

  @ApiPropertyOptional({
    description:
      "Məzuniyyət növü (formula LABOR_LEAVE_304 olmalıdır); boşdursa yalnız hesablama aparılır",
  })
  @IsOptional()
  @IsUUID()
  absenceTypeId?: string;

  @ApiProperty({ example: "2026-06-01", description: "Первый день отпуска" })
  @IsDateString()
  vacationStart!: string;

  @ApiProperty({ example: "2026-06-14", description: "Последний день отпуска" })
  @IsDateString()
  vacationEnd!: string;
}
