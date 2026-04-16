import { Module } from "@nestjs/common";
import { AccountingModule } from "../accounting/accounting.module";
import { RolesGuard } from "../auth/guards/roles.guard";
import { PrismaModule } from "../prisma/prisma.module";
import { AbsenceTypesController } from "./absence-types.controller";
import { AbsenceTypesService } from "./absence-types.service";
import { AbsencesController } from "./absences.controller";
import { AbsencesService } from "./absences.service";
import { EmployeesController } from "./employees.controller";
import { EmployeesService } from "./employees.service";
import { OrgStructureController } from "./org-structure.controller";
import { OrgStructureService } from "./org-structure.service";
import { TimesheetController } from "./timesheet.controller";
import { TimesheetService } from "./timesheet.service";
import { PayrollController } from "./payroll.controller";
import { PayrollHeavyQueueService } from "./payroll-heavy.queue";
import { PayrollHeavyWorker } from "./payroll-heavy.worker";
import { PayrollService } from "./payroll.service";

@Module({
  imports: [PrismaModule, AccountingModule],
  controllers: [
    EmployeesController,
    PayrollController,
    AbsencesController,
    AbsenceTypesController,
    OrgStructureController,
    TimesheetController,
  ],
  providers: [
    EmployeesService,
    PayrollHeavyQueueService,
    PayrollHeavyWorker,
    PayrollService,
    AbsenceTypesService,
    AbsencesService,
    OrgStructureService,
    TimesheetService,
    RolesGuard,
  ],
  exports: [OrgStructureService],
})
export class HrModule {}
