import { PartialType } from "@nestjs/swagger";
import { CreateHoldingDto } from "./create-holding.dto";

export class UpdateHoldingDto extends PartialType(CreateHoldingDto) {}
