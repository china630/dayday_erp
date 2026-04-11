"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../../lib/api-client";
import { inputFieldWideClass } from "../../../../lib/form-classes";
import { useRequireAuth } from "../../../../lib/use-require-auth";
import { ModulePageLinks } from "../../../../components/module-page-links";

const lbl = "block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5";

export default function NewWarehousePage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const router = useRouter();
  const [whName, setWhName] = useState("");
  const [whLoc, setWhLoc] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !whName.trim()) return;
    setBusy(true);
    const res = await apiFetch("/api/inventory/warehouses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: whName.trim(), location: whLoc }),
    });
    setBusy(false);
    if (!res.ok) {
      alert(await res.text());
      return;
    }
    router.push("/inventory");
  }

  if (!ready) {
    return (
      <div className="text-gray-600">
        <p>{t("common.loading")}</p>
      </div>
    );
  }
  if (!token) return null;

  return (
    <div className="space-y-6">
      <ModulePageLinks
        items={[
          { href: "/", labelKey: "nav.home" },
          { href: "/inventory", labelKey: "nav.inventory" },
          { href: "/products", labelKey: "nav.products" },
        ]}
      />
      <div>
        <Link href="/inventory" className="text-sm text-action hover:text-primary">
          ← {t("inventory.backList")}
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-4">{t("inventory.warehouseNewTitle")}</h1>
      </div>

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="bg-white p-6 shadow-sm rounded-xl border border-slate-100 max-w-lg space-y-4"
      >
        <div>
          <span className={lbl}>{t("inventory.whNamePh")}</span>
          <input
            placeholder={t("inventory.whNamePlaceholder")}
            value={whName}
            onChange={(e) => setWhName(e.target.value)}
            required
            className={inputFieldWideClass}
          />
        </div>
        <div>
          <span className={lbl}>{t("inventory.whLocPh")}</span>
          <input
            placeholder={t("inventory.whLocPlaceholder")}
            value={whLoc}
            onChange={(e) => setWhLoc(e.target.value)}
            className={inputFieldWideClass}
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="bg-action text-white px-4 py-2 rounded-lg hover:bg-action-hover text-sm font-medium disabled:opacity-50"
        >
          {busy ? "…" : t("inventory.createWh")}
        </button>
      </form>
    </div>
  );
}
