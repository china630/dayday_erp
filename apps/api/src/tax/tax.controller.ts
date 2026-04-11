import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { OrganizationId } from "../common/org-id.decorator";
import { TaxService } from "./tax.service";

@ApiTags("tax")
@ApiBearerAuth("bearer")
@Controller("tax")
export class TaxController {
  constructor(private readonly tax: TaxService) {}

  @Get("taxpayer-info")
  @ApiOperation({
    summary:
      "VÖEN lookup (e-taxes.gov.az): ad, ünvan, ƏDV statusu — JSON { name, isVatPayer, address }",
  })
  taxpayerInfo(
    @OrganizationId() _organizationId: string,
    @Query("voen") voen: string,
  ) {
    return this.tax.lookupTaxpayerByVoen(voen ?? "");
  }
}
