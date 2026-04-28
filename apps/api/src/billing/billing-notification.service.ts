import { Injectable } from "@nestjs/common";
import { Prisma } from "@dayday/database";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class BillingNotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async notifyUpcomingInvoice(
    organizationId: string,
    now = new Date(),
  ): Promise<void> {
    const dayKey = now.toISOString().slice(0, 10);
    const entityId = `${organizationId}:${dayKey}`;
    const exists = await this.prisma.auditLog.findFirst({
      where: {
        organizationId,
        entityType: "in_app.notification",
        entityId,
        action: "BILLING_REMINDER_25TH",
      },
      select: { id: true },
    });
    if (exists) return;

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        userId: null,
        entityType: "in_app.notification",
        entityId,
        action: "BILLING_REMINDER_25TH",
        newValues: {
          title: "Billing reminder",
          message:
            "Внимание! 1-го числа будет сформирован счет. Пожалуйста, проверьте активные модули и отключите неиспользуемые.",
          createdAt: now.toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
  }
}
