import { PartialType } from "@nestjs/swagger";
import { CreateIfrsMappingRuleDto } from "./create-ifrs-mapping-rule.dto";

export class UpdateIfrsMappingRuleDto extends PartialType(
  CreateIfrsMappingRuleDto,
) {}
