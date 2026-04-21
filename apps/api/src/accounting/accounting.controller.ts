import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { UserRole } from "@dayday/database";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { requireOrgRole } from "../auth/require-org-role";
import type { AuthUser } from "../auth/types/auth-user";
import { RolesGuard } from "../auth/guards/roles.guard";
import { OrganizationId } from "../common/org-id.decorator";
import {
  CASH_OPERATIONAL_ACCOUNT_CODE,
  MISC_OPERATING_EXPENSE_ACCOUNT_CODE,
} from "../ledger.constants";
import { AccountingService } from "./accounting.service";
import { QuickExpenseDto } from "./dto/quick-expense.dto";

@ApiTags("accounting")
@ApiBearerAuth("bearer")
@Controller("accounting")
export class AccountingController {
  constructor(private readonly accounting: AccountingService) {}

  @Post("quick-expense")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary:
      "Быстрая запись расхода: Дт 731 (прочие операционные) / Кт 101.01 (касса)",
  })
  async quickExpense(
    @OrganizationId() organizationId: string,
    @Body() dto: QuickExpenseDto,
    @CurrentUser() user: AuthUser,
  ) {
    const date = dto.date ? new Date(dto.date) : new Date();
    const ref = "WEB-EXP";
    const desc = dto.description?.trim() || "Операционный расход (веб)";
    const amt = String(dto.amount);
    const { transactionId } = await this.accounting.postTransaction({
      organizationId,
      date,
      reference: ref,
      description: desc,
      isFinal: true,
      actingUserRole: requireOrgRole(user),
      departmentId: dto.departmentId ?? null,
      lines: [
        {
          accountCode: MISC_OPERATING_EXPENSE_ACCOUNT_CODE,
          debit: amt,
          credit: 0,
        },
        {
          accountCode: CASH_OPERATIONAL_ACCOUNT_CODE,
          debit: 0,
          credit: amt,
        },
      ],
    });
    return { transactionId };
  }
}
