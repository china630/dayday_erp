import { IsIn, IsOptional, IsString, IsUUID, ValidateIf } from "class-validator";

export class PaymentWebhookDto {
  @IsOptional()
  @ValidateIf((o: PaymentWebhookDto) => !o.subscriptionInvoiceId)
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @ValidateIf((o: PaymentWebhookDto) => !o.orderId)
  @IsUUID()
  subscriptionInvoiceId?: string;

  @IsIn(["success", "failed"])
  status!: "success" | "failed";

  @IsString()
  signature!: string;

  @IsOptional()
  @IsString()
  externalId?: string;
}
