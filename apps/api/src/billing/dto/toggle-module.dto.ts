import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsString, MinLength } from "class-validator";

export class ToggleModuleDto {
  @ApiProperty({
    example: "kassa_pro",
    description: "Ключ модуля из каталога `pricing_modules`",
  })
  @IsString()
  @MinLength(1)
  moduleKey!: string;

  @ApiProperty({ description: "Включить (true) или выключить (false) модуль" })
  @IsBoolean()
  enabled!: boolean;
}
