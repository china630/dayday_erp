import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";

export class PatchBankingDirectBankDto {
  @ApiPropertyOptional({ description: "Отключить опрос этого банка" })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  enabled?: boolean;

  @ApiPropertyOptional({ description: "GET URL выдачи операций" })
  @IsOptional()
  @IsString()
  url?: string | null;

  @ApiPropertyOptional({
    description:
      "Новый Bearer-токен (пусто = не менять; только при смене ключа шифрования)",
  })
  @IsOptional()
  @IsString()
  token?: string | null;

  @ApiPropertyOptional({ description: "Удалить сохранённый токен" })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  clearToken?: boolean;
}

export class PatchBankingDirectDto {
  @ApiPropertyOptional({ enum: ["mock", "rest"] })
  @IsOptional()
  @IsIn(["mock", "rest"])
  syncMode?: "mock" | "rest";

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => PatchBankingDirectBankDto)
  pasha?: PatchBankingDirectBankDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => PatchBankingDirectBankDto)
  abb?: PatchBankingDirectBankDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => PatchBankingDirectBankDto)
  kapital?: PatchBankingDirectBankDto;
}
