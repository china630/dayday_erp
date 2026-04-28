import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

export class AcceptInviteTokenDto {
  @ApiProperty()
  @IsString()
  @MinLength(16)
  token!: string;
}
