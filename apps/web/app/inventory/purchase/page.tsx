import { redirect } from "next/navigation";

/** Закупки только через модальное окно на `/inventory`. */
export default function InventoryPurchaseRedirectPage() {
  redirect("/inventory?modal=purchase");
}
