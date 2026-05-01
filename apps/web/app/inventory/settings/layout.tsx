import { Suspense } from "react";

export default function InventorySettingsLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="p-4 text-gray-600">…</div>}>{children}</Suspense>;
}
