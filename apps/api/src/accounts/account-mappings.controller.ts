import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { UserRole } from "@dayday/database";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { OrganizationId } from "../common/org-id.decorator";
import { AccountsService } from "./accounts.service";
import { CreateAccountMappingDto } from "./dto/create-account-mapping.dto";
import { RequiresModule } from "../subscription/requires-module.decorator";
import { SubscriptionGuard } from "../subscription/subscription.guard";
import { ModuleEntitlement } from "../subscription/subscription.constants";

@ApiTags("account-mappings")
@ApiBearerAuth("bearer")
@UseGuards(SubscriptionGuard)
@RequiresModule(ModuleEntitlement.IFRS_MAPPING)
@Controller("account-mappings")
export class AccountMappingsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @ApiOperation({ summary: "Список сопоставлений NAS ↔ IFRS" })
  list(@OrganizationId() organizationId: string) {
    return this.accounts.listMappings(organizationId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: "Создать сопоставление счёта NAS с IFRS" })
  create(
    @OrganizationId() organizationId: string,
    @Body() dto: CreateAccountMappingDto,
  ) {
    return this.accounts.createMapping(organizationId, dto);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: "Удалить сопоставление" })
  remove(
    @OrganizationId() organizationId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.accounts.deleteMapping(organizationId, id);
  }
}
