import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class ImportFromTemplateDto {
  @ApiProperty({
    format: "uuid",
    description: "ID строки глобального справочника `template_accounts`",
  })
  @IsUUID()
  templateAccountId!: string;
}
