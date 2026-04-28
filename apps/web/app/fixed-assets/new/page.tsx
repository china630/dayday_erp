"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../lib/api-client";
import { inputFieldClass } from "../../../lib/form-classes";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { ModulePageLinks } from "../../../components/module-page-links";
import { SubscriptionPaywall } from "../../../components/subscription-paywall";

const lbl = "block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5";

function NewFixedAssetForm() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [invNo, setInvNo] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [life, setLife] = useState("60");
  const [salvage, setSalvage] = useState("0");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    const res = await apiFetch("/api/fixed-assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        inventoryNumber: invNo.trim(),
        purchaseDate,
        purchasePrice: Number(purchasePrice),
        usefulLifeMonths: Number(life),
        salvageValue: Number(salvage || 0),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      alert(await res.text());
      return;
    }
    router.push("/fixed-assets");
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
          { href: "/fixed-assets", labelKey: "nav.fixedAssets" },
          { href: "/reporting", labelKey: "nav.reportingHub" },
        ]}
      />
      <div>
        <Link href="/fixed-assets" className="text-sm text-action hover:text-primary">
          ← {t("fixedAssets.backList")}
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-4">{t("fixedAssets.newTitle")}</h1>
      </div>

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="bg-white p-6 shadow-sm rounded-xl border border-slate-100 max-w-lg grid gap-3"
      >
        <div>
          <span className={lbl}>{t("fixedAssets.name")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputFieldClass} required />
        </div>
        <div>
          <span className={lbl}>{t("fixedAssets.invNo")}</span>
          <input value={invNo} onChange={(e) => setInvNo(e.target.value)} className={inputFieldClass} />
        </div>
        <div>
          <span className={lbl}>{t("fixedAssets.commission")}</span>
          <input
            type="date"
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
            className={inputFieldClass}
          />
        </div>
        <div>
          <span className={lbl}>{t("fixedAssets.initial")}</span>
          <input
            type="number"
            step="0.01"
            value={purchasePrice}
            onChange={(e) => setPurchasePrice(e.target.value)}
            className={inputFieldClass}
            required
          />
        </div>
        <div>
          <span className={lbl}>{t("fixedAssets.life")}</span>
          <input
            type="number"
            min={1}
            value={life}
            onChange={(e) => setLife(e.target.value)}
            className={inputFieldClass}
          />
        </div>
        <div>
          <span className={lbl}>{t("fixedAssets.salvage")}</span>
          <input
            type="number"
            step="0.01"
            value={salvage}
            onChange={(e) => setSalvage(e.target.value)}
            className={inputFieldClass}
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="bg-action text-white px-4 py-2 rounded-lg hover:bg-action-hover text-sm font-medium w-fit disabled:opacity-50"
        >
          {busy ? "…" : t("fixedAssets.save")}
        </button>
      </form>
    </div>
  );
}

export default function NewFixedAssetPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  if (!ready) {
    return (
      <div className="text-gray-600">
        <p>{t("common.loading")}</p>
      </div>
    );
  }
  if (!token) return null;
  return (
    <SubscriptionPaywall module="fixedAssets">
      <NewFixedAssetForm />
    </SubscriptionPaywall>
  );
}
