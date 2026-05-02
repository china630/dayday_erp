import { redirect } from "next/navigation";

/** Просмотр счёта — только модалка на `/sales/invoices`; прямой URL перенаправляет с `?invoice=`. */
export default async function InvoiceDeepLinkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/sales/invoices?invoice=${encodeURIComponent(id)}`);
}
