"use client";

import { redirect } from "next/navigation";

/**
 * Legacy route: invoice creation moved to modal (Sales & Invoicing refactor).
 * Keep path for backward compatibility; hide old page by redirect.
 */
export default function NewInvoicePage() {
  redirect("/invoices");
}
