import { Injectable } from "@nestjs/common";
import {
  TaxpayerIntegrationService,
  type TaxpayerLookupResult,
} from "./taxpayer-integration.service";

@Injectable()
export class TaxService {
  constructor(private readonly taxpayerIntegration: TaxpayerIntegrationService) {}

  async lookupTaxpayerByVoen(rawVoen: string): Promise<TaxpayerLookupResult> {
    return this.taxpayerIntegration.lookupTaxpayerByVoen(rawVoen);
  }
}
