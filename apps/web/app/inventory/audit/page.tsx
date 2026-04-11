import { redirect } from "next/navigation";

/** Sprint UX: alias to inventory audits registry (see also /inventory/audits). */
export default function InventoryAuditIndexPage() {
  redirect("/inventory/audits");
}
