import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class CreateCashFlowItemDto {
  @ApiProperty({ example: "CF-CUSTOM" })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  code!: string;

  @ApiProperty({ example: "Xüsusi məqsəd" })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;
}
