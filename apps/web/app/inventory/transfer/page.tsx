import { redirect } from "next/navigation";

/** Legacy URL: реестр перемещений на `/inventory/transfers`. */
export default function LegacyInventoryTransferRedirectPage() {
  redirect("/inventory/transfers");
}
