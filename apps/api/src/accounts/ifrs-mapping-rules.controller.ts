import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@dayday/database";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { OrganizationId } from "../common/org-id.decorator";
import { AccountsService } from "./accounts.service";
import { CreateIfrsMappingRuleDto } from "./dto/create-ifrs-mapping-rule.dto";
import { UpdateIfrsMappingRuleDto } from "./dto/update-ifrs-mapping-rule.dto";

@ApiTags("ifrs-mapping-rules")
@ApiBearerAuth("bearer")
@UseGuards(RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN)
@Controller("ifrs-mapping-rules")
export class IfrsMappingRulesController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @ApiOperation({ summary: "List IFRS mapping rules" })
  list(@OrganizationId() organizationId: string) {
    return this.accounts.listIfrsMappingRules(organizationId);
  }

  @Post()
  @ApiOperation({ summary: "Create IFRS mapping rule" })
  create(
    @OrganizationId() organizationId: string,
    @Body() dto: CreateIfrsMappingRuleDto,
  ) {
    return this.accounts.createIfrsMappingRule(organizationId, dto);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update IFRS mapping rule" })
  update(
    @OrganizationId() organizationId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateIfrsMappingRuleDto,
  ) {
    return this.accounts.updateIfrsMappingRule(organizationId, id, dto);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete IFRS mapping rule" })
  remove(
    @OrganizationId() organizationId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.accounts.deleteIfrsMappingRule(organizationId, id);
  }
}
