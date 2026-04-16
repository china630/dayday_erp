import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

export class RecipeLineDto {
  @ApiProperty()
  @IsUUID()
  componentProductId!: string;

  @ApiProperty({ description: "На 1 единицу готовой продукции" })
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantityPerUnit!: number;

  @ApiPropertyOptional({
    description: "Доля технологических потерь (0–2); списание × (1 + wasteFactor)",
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(2)
  wasteFactor?: number;
}

export class UpsertRecipeDto {
  @ApiProperty()
  @IsUUID()
  finishedProductId!: string;

  @ApiProperty({ type: [RecipeLineDto] })
  @ValidateNested({ each: true })
  @Type(() => RecipeLineDto)
  @ArrayMinSize(1)
  lines!: RecipeLineDto[];
}
