import { redirect } from "next/navigation";

/** Legacy URL: создание склада только через модалку на `/inventory` (`NewWarehouseModal`). */
export default function LegacyNewWarehouseRedirectPage() {
  redirect("/inventory?modal=newWh");
}
