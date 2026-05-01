import { redirect } from "next/navigation";

/** Legacy URL: создание ОС через модалку на `/fixed-assets` (`FixedAssetModal`). */
export default function LegacyNewFixedAssetRedirectPage() {
  redirect("/fixed-assets");
}
