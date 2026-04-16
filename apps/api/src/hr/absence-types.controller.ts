import { Controller, Get, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { UserRole } from "@dayday/database";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { OrganizationId } from "../common/org-id.decorator";
import { AbsenceTypesService } from "./absence-types.service";

@ApiTags("hr-absence-types")
@ApiBearerAuth("bearer")
@Controller("hr/absence-types")
export class AbsenceTypesController {
  constructor(private readonly types: AbsenceTypesService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.USER)
  @ApiOperation({
    summary:
      "Məzuniyyət növləri (AZ); boşdursa — TK AР üzrə standart dəst avtomatik yaradılır",
  })
  list(@OrganizationId() organizationId: string) {
    return this.types.listOrSeed(organizationId);
  }
}
