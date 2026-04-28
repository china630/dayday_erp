import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsUUID, ArrayMinSize } from "class-validator";

export class TimesheetMassApproveDto {
  @ApiProperty({ type: [String], description: "Employee IDs to approve", minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  employeeIds!: string[];
}
