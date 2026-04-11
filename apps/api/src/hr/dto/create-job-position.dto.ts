import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsNotEmpty, IsNumber, IsString, IsUUID, Min } from "class-validator";

export class CreateJobPositionDto {
  @ApiProperty()
  @IsUUID()
  departmentId!: string;

  @ApiProperty({ example: "Бухгалтер" })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalSlots!: number;

  @ApiProperty({ example: 1200, description: "Нижняя граница вилки оклада по штатке (AZN)" })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minSalary!: number;

  @ApiProperty({ example: 1800, description: "Верхняя граница вилки оклада по штатке (AZN)" })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxSalary!: number;
}
