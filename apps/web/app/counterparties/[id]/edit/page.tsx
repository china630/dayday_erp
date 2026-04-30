import { redirect } from "next/navigation";

/** Редактирование перенесено в модальное окно на списке контрагентов. */
export default function CounterpartyEditLegacyRedirect() {
  redirect("/counterparties");
}
