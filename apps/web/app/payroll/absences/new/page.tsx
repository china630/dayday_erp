import { redirect } from "next/navigation";

/** Legacy URL: отсутствия вводятся с `/payroll` (модалки HR). */
export default function LegacyNewAbsenceRedirectPage() {
  redirect("/payroll");
}
