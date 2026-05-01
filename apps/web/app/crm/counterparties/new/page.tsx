"use client";

import { redirect } from "next/navigation";

/**
 * Legacy route: counterparty creation moved to modal (Sales & Invoicing refactor).
 * Keep path for backward compatibility; hide old page by redirect.
 */
export default function NewCounterpartyPage() {
  redirect("/crm/counterparties");
}
