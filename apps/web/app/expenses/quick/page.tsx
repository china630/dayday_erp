"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../lib/api-client";
import {
  CARD_CONTAINER_CLASS,
  INPUT_BORDERED_CLASS,
  PRIMARY_BUTTON_CLASS,
} from "../../../lib/design-system";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { ModulePageLinks } from "../../../components/module-page-links";

export default function QuickExpensePage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return;
    setBusy(true);
    setMsg(null);
    setErr(null);
    const res = await apiFetch("/api/accounting/quick-expense", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: n,
        date: date || undefined,
        description: description.trim() || undefined,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr(`${t("quickExpense.err")}: ${await res.text()}`);
      return;
    }
    setMsg(t("quickExpense.ok"));
    setAmount("");
    setDescription("");
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
    <div className="mx-auto max-w-lg space-y-6">
      <ModulePageLinks
        items={[
          { href: "/", labelKey: "nav.home" },
          { href: "/reporting", labelKey: "nav.reportingHub" },
          { href: "/banking", labelKey: "nav.banking" },
        ]}
      />
      <div>
        <h1 className="text-xl font-semibold text-[#34495E]">{t("quickExpense.title")}</h1>
        <p className="mt-1 text-[13px] text-[#7F8C8D]">{t("quickExpense.subtitle")}</p>
      </div>

      {msg && <p className="text-sm text-emerald-700">{msg}</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}

      <form
        onSubmit={(e) => void submit(e)}
        className={`${CARD_CONTAINER_CLASS} space-y-4 p-5`}
      >
        <label className="block text-[13px] font-medium text-[#34495E]">
          {t("quickExpense.amount")}
          <input
            type="number"
            step="0.01"
            min={0.01}
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`mt-1 block w-full ${INPUT_BORDERED_CLASS}`}
          />
        </label>
        <label className="block text-[13px] font-medium text-[#34495E]">
          {t("quickExpense.date")}
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={`mt-1 block w-full ${INPUT_BORDERED_CLASS}`}
          />
        </label>
        <label className="block text-[13px] font-medium text-[#34495E]">
          {t("quickExpense.description")}
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`mt-1 block w-full ${INPUT_BORDERED_CLASS}`}
          />
        </label>
        <button type="submit" disabled={busy} className={PRIMARY_BUTTON_CLASS}>
          {busy ? "…" : t("quickExpense.submit")}
        </button>
      </form>
    </div>
  );
}
