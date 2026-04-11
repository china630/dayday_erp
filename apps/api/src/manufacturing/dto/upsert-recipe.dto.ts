import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsNumber,
  IsUUID,
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
