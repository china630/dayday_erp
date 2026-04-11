import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class SwitchOrgDto {
  @ApiProperty()
  @IsUUID()
  organizationId!: string;
}
