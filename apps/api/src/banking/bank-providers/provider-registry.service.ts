import { Injectable } from "@nestjs/common";
import type { BankingProviderInterface } from "./banking-provider.interface";
import { AbbAdapter } from "./abb.adapter";
import { BirbankAdapter } from "./birbank.adapter";
import { PashaBankAdapter } from "./pasha-bank.adapter";

export type BankingProviderKey = "pasha" | "abb" | "birbank";

@Injectable()
export class ProviderRegistryService {
  constructor(
    private readonly pasha: PashaBankAdapter,
    private readonly abb: AbbAdapter,
    private readonly birbank: BirbankAdapter,
  ) {}

  getProvider(key: BankingProviderKey): BankingProviderInterface {
    switch (key) {
      case "pasha":
        return this.pasha;
      case "abb":
        return this.abb;
      case "birbank":
        return this.birbank;
    }
  }
}

