import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsUUID } from "class-validator";

export class VacationPayCalcDto {
  @ApiProperty()
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ example: "2026-06-01", description: "Первый день отпуска" })
  @IsDateString()
  vacationStart!: string;

  @ApiProperty({ example: "2026-06-14", description: "Последний день отпуска" })
  @IsDateString()
  vacationEnd!: string;
}
