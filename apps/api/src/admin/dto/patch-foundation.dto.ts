import { IsNumber, Min } from "class-validator";

export class PatchFoundationDto {
  @IsNumber()
  @Min(0)
  amountAzn!: number;
}
