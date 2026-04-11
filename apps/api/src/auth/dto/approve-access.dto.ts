import { ApiPropertyOptional } from "@nestjs/swagger";
import { UserRole } from "@dayday/database";
import { IsEnum, IsOptional } from "class-validator";

export class ApproveAccessDto {
  @ApiPropertyOptional({ enum: UserRole, description: "Роль при принятии" })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
