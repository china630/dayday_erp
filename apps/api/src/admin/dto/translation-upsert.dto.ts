import { IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";

export class TranslationUpsertDto {
  @IsString()
  @MinLength(2)
  @MaxLength(10)
  locale!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  key!: string;

  @IsString()
  @IsNotEmpty()
  value!: string;
}
