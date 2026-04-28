import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class MergeCounterpartiesDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  sourceId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  targetId!: string;
}
