import { ApiProperty } from "@nestjs/swagger";
import { HoldingAccessRole } from "@dayday/database";
import { IsEnum, IsUUID } from "class-validator";

export class AddHoldingMemberDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;

  @ApiProperty({ enum: HoldingAccessRole })
  @IsEnum(HoldingAccessRole)
  role!: HoldingAccessRole;
}

export class UpdateHoldingMemberDto {
  @ApiProperty({ enum: HoldingAccessRole })
  @IsEnum(HoldingAccessRole)
  role!: HoldingAccessRole;
}
