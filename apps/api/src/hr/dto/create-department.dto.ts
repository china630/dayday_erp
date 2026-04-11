import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString, IsUUID } from "class-validator";

export class CreateDepartmentDto {
  @ApiProperty({ example: "Продажи" })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: "Родительское подразделение" })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @ApiPropertyOptional({ description: "Руководитель (сотрудник организации)" })
  @IsOptional()
  @IsUUID()
  managerId?: string | null;
}
