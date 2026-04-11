import { ApiProperty } from "@nestjs/swagger";
import { SignatureProvider } from "@dayday/database";
import { IsEnum } from "class-validator";

export class InitiateSignatureDto {
  @ApiProperty({ enum: SignatureProvider, example: SignatureProvider.ASAN_IMZA })
  @IsEnum(SignatureProvider)
  provider!: SignatureProvider;
}
