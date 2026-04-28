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

export class RecipeByproductDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty({ description: "Количество на 1 единицу выпуска" })
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantityPerUnit!: number;

  @ApiPropertyOptional({
    description: "Доля себестоимости готового выпуска для byproduct (0..1)",
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  costFactor?: number;
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

  @ApiPropertyOptional({
    type: [RecipeByproductDto],
    description:
      "Побочные продукты / брак: productId, quantityPerUnit, costFactor (0..1; по умолчанию 0)",
  })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => RecipeByproductDto)
  byproducts?: RecipeByproductDto[];
}
