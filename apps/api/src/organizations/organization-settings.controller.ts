import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { UserRole } from "@dayday/database";
import { OrganizationId } from "../common/org-id.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { GlobalCompanyDirectoryService } from "../global-directory/global-company-directory.service";
import { PatchOrganizationSettingsDto } from "./dto/patch-organization-settings.dto";
import { OrganizationSettingsService } from "./organization-settings.service";

@ApiTags("organization")
@ApiBearerAuth("bearer")
@Controller("organization")
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganizationSettingsController {
  constructor(
    private readonly settings: OrganizationSettingsService,
    private readonly directory: GlobalCompanyDirectoryService,
  ) {}

  @Get("settings")
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: "Organization profile + bank accounts" })
  getSettings(@OrganizationId() organizationId: string) {
    return this.settings.getSettings(organizationId);
  }

  @Patch("settings")
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: "Update organization profile and/or bank accounts" })
  patchSettings(
    @OrganizationId() organizationId: string,
    @Body() dto: PatchOrganizationSettingsDto,
  ) {
    return this.settings.patchSettings(organizationId, dto);
  }

  @Post("settings/logo")
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: "Upload organization logo (PNG/JPEG/WebP, max 2 MB)" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: { file: { type: "string", format: "binary" } },
    },
  })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 2 * 1024 * 1024 } }))
  uploadLogo(
    @OrganizationId() organizationId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.settings.uploadLogo(organizationId, file);
  }

  @Get("directory/by-voen/:taxId")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.USER)
  @ApiOperation({
    summary: "Global company directory lookup by VÖEN (smart-fill)",
  })
  lookupDirectory(@Param("taxId") taxId: string) {
    return this.directory.findByTaxId(taxId);
  }
}
