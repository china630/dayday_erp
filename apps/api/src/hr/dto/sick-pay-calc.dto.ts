import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsOptional, IsUUID } from "class-validator";

export class SickPayCalcDto {
  @ApiProperty()
  @IsUUID()
  employeeId!: string;

  @ApiPropertyOptional({
    description:
      "Növün id (formula SICK_LEAVE_STAJ); boşdursa — təşkilatda SICK kodu",
  })
  @IsOptional()
  @IsUUID()
  absenceTypeId?: string;

  @ApiProperty({ example: "2026-06-01" })
  @IsDateString()
  periodStart!: string;

  @ApiProperty({ example: "2026-06-14" })
  @IsDateString()
  periodEnd!: string;
}
