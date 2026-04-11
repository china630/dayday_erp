import { Module } from "@nestjs/common";
import { CounterpartiesController } from "./counterparties.controller";

@Module({
  controllers: [CounterpartiesController],
})
export class CounterpartiesModule {}
