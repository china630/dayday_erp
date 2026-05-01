/**
 * Список страниц для скриншотов: path — маршрут Next.js, fileName — имя файла без расширения в `screens/`.
 * Опционально для модалок:
 * - modalOpenSelector: селектор кнопки/элемента, который открывает модалку.
 * - modalVisibleSelector: селектор, который должен появиться после открытия модалки.
 */
export type ScreenshotPage = {
  path: string;
  fileName: string;
  requiresAuth?: boolean;
  sourceSlug?: string;
  modalOpenSelector?: string;
  modalVisibleSelector?: string;
};

export const pagesToScreenshot: ScreenshotPage[] = [
  // 001-003: onboarding / public
  { path: "/login", fileName: "001-login", requiresAuth: false, sourceSlug: "/login" },
  { path: "/register", fileName: "002-register-user", requiresAuth: false, sourceSlug: "/register" },
  { path: "/register-org", fileName: "003-register-org", requiresAuth: false, sourceSlug: "/register-org" },

  // 004-006: counterparties + invoice creation context
  { path: "/counterparties/[id]/edit", fileName: "004-counterparty-edit", sourceSlug: "/counterparties/[id]/edit" },
  { path: "/counterparties", fileName: "005-modal-create-counterparty", sourceSlug: "modal/create-counterparty" },
  { path: "/invoices", fileName: "006-modal-create-invoice", sourceSlug: "modal/create-invoice" },

  // 007-019: HR / companies / inventory modal registry
  { path: "/employees/new", fileName: "007-employees-new", sourceSlug: "/employees/new" },
  { path: "/employees", fileName: "008-modal-employee", sourceSlug: "modal/employee" },
  { path: "/hr/structure", fileName: "009-modal-department", sourceSlug: "modal/department" },
  { path: "/hr/positions", fileName: "010-modal-job-position", sourceSlug: "modal/job-position" },
  { path: "/payroll", fileName: "011-modal-absence", sourceSlug: "modal/absence" },
  { path: "/payroll", fileName: "012-modal-vacation-calc", sourceSlug: "modal/vacation-calc" },
  { path: "/payroll", fileName: "013-modal-sick-calc", sourceSlug: "modal/sick-calc" },
  { path: "/payroll", fileName: "014-modal-employee-absences", sourceSlug: "modal/employee-absences" },
  { path: "/payroll", fileName: "015-modal-payroll-run", sourceSlug: "modal/payroll-run" },
  { path: "/products", fileName: "016-modal-product", sourceSlug: "modal/product" },
  { path: "/companies", fileName: "017-modal-create-company", sourceSlug: "modal/create-company" },
  { path: "/holding", fileName: "018-modal-create-holding", sourceSlug: "modal/create-holding" },
  { path: "/companies", fileName: "019-modal-voen-request", sourceSlug: "modal/voen-request" },

  // 020-035: inventory forms and modals
  { path: "/inventory/purchase", fileName: "020-inventory-purchase-page", sourceSlug: "/inventory/purchase" },
  { path: "/inventory/purchase", fileName: "021-modal-inventory-purchase", sourceSlug: "modal/inventory-purchase" },
  { path: "/inventory/write-off", fileName: "022-inventory-write-off-page", sourceSlug: "/inventory/write-off" },
  { path: "/inventory", fileName: "023-modal-inventory-write-off", sourceSlug: "modal/inventory-write-off" },
  { path: "/inventory/surplus", fileName: "024-inventory-surplus-page", sourceSlug: "/inventory/surplus" },
  { path: "/inventory", fileName: "025-modal-inventory-surplus", sourceSlug: "modal/inventory-surplus" },
  { path: "/inventory/adjustments", fileName: "026-inventory-adjustments-page", sourceSlug: "/inventory/adjustments" },
  { path: "/inventory/adjustments", fileName: "027-modal-inventory-adjustments", sourceSlug: "modal/inventory-adjustments" },
  { path: "/inventory/transfers", fileName: "028-inventory-transfer-page", sourceSlug: "/inventory/transfers" },
  { path: "/inventory/transfers", fileName: "029-modal-inventory-transfer", sourceSlug: "modal/inventory-transfer" },
  { path: "/inventory/physical", fileName: "030-inventory-physical", sourceSlug: "/inventory/physical" },
  { path: "/inventory/audits", fileName: "031-modal-inventory-audit", sourceSlug: "modal/inventory-audit" },
  { path: "/inventory/audits", fileName: "032-modal-inventory-audit-history", sourceSlug: "modal/inventory-audit-history" },
  { path: "/inventory/audits", fileName: "033-modal-inventory-audit-detail-confirm", sourceSlug: "modal/inventory-audit-detail-confirm" },
  { path: "/inventory/warehouses/new", fileName: "034-inventory-warehouse-new-page", sourceSlug: "/inventory/warehouses/new" },
  { path: "/inventory", fileName: "035-modal-new-warehouse", sourceSlug: "modal/new-warehouse" },

  // 036-050: manufacturing / banking / settings / admin / print
  { path: "/manufacturing/recipe", fileName: "036-manufacturing-recipe", sourceSlug: "/manufacturing/recipe" },
  { path: "/manufacturing/release", fileName: "037-manufacturing-release", sourceSlug: "/manufacturing/release" },
  { path: "/expenses/quick", fileName: "038-expenses-quick", sourceSlug: "/expenses/quick" },
  { path: "/banking/money", fileName: "039-banking-money", sourceSlug: "/banking/money" },
  { path: "/banking", fileName: "040-banking", sourceSlug: "/banking" },
  { path: "/banking/cash", fileName: "041-banking-cash", sourceSlug: "/banking/cash" },
  { path: "/settings/team", fileName: "042-settings-team", sourceSlug: "/settings/team" },
  { path: "/settings/organization", fileName: "043-settings-organization", sourceSlug: "/settings/organization" },
  { path: "/settings/mapping", fileName: "044-settings-mapping", sourceSlug: "/settings/mapping" },
  { path: "/settings/finance/ifrs-mapping", fileName: "045-settings-ifrs-mapping", sourceSlug: "/settings/finance/ifrs-mapping" },
  { path: "/super-admin", fileName: "046-super-admin", sourceSlug: "/super-admin" },
  { path: "/admin/audit-log", fileName: "047-modal-audit-diff", sourceSlug: "modal/audit-diff" },
  { path: "/admin/billing", fileName: "048-modal-payment-confirmation", sourceSlug: "modal/payment-confirmation" },
  { path: "/settings/subscription", fileName: "049-modal-upgrade-required", sourceSlug: "modal/upgrade-required" },
  { path: "/banking/cash", fileName: "050-print-ko1", sourceSlug: "print/ko1" },
];
