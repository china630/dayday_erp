import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access/access-control.module";
import { IntegrationReliabilityService } from "./integration-reliability.service";
import { IntegrationsHealthController } from "./integrations-health.controller";

@Module({
  imports: [AccessControlModule],
  controllers: [IntegrationsHealthController],
  providers: [IntegrationReliabilityService],
  exports: [IntegrationReliabilityService],
})
export class IntegrationsModule {}

