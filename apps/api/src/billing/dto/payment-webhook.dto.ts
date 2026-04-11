import { IsIn, IsOptional, IsString, IsUUID } from "class-validator";

export class PaymentWebhookDto {
  @IsUUID()
  orderId!: string;

  @IsIn(["success", "failed"])
  status!: "success" | "failed";

  @IsString()
  signature!: string;

  @IsOptional()
  @IsString()
  externalId?: string;
}
