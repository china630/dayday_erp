import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNumber, IsUUID, Min } from "class-validator";

export class CreateNettingDto {
  @ApiProperty()
  @IsUUID()
  counterpartyId!: string;

  @ApiProperty({ description: "Сумма взаимозачёта (AZN)" })
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  amount!: number;
}
