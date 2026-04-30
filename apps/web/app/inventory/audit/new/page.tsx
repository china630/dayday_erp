import { redirect } from "next/navigation";

/**
 * Legacy URL: многошаговая инвентаризация открывается в модальном окне на `/inventory/audits`
 * (см. `InventoryAuditCreateFlow`). Отдельная полноэкранная страница не используется.
 */
export default function LegacyInventoryAuditNewRedirectPage() {
  redirect("/inventory/audits?newAudit=1");
}
