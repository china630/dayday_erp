import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength } from "class-validator";

export class ValidateIbanDto {
  @ApiProperty({ example: "AZ21NABZ00000000137010001944" })
  @IsString()
  @MaxLength(64)
  iban!: string;
}

