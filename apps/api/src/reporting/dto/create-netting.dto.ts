import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNumber, IsOptional, IsUUID, Min } from "class-validator";

export class CreateNettingDto {
  @ApiProperty()
  @IsUUID()
  counterpartyId!: string;

  @ApiProperty({ description: "Сумма взаимозачёта (AZN)" })
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  amount!: number;

  /** Сумма из preview (`suggestedAmount`); если отличается от `amount`, бэкенд логирует ручную правку. */
  @ApiPropertyOptional({ description: "Системная сумма из netting/preview (аудит ручной правки)" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  previewSuggestedAmount?: number;
}
