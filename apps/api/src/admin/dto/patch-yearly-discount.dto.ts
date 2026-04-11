import { IsNumber, Max, Min } from "class-validator";

export class PatchYearlyDiscountDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  percent!: number;
}
