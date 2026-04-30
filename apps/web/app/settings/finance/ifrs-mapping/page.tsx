"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../../lib/api-client";
import { useAuth } from "../../../../lib/auth-context";
import { useRequireAuth } from "../../../../lib/use-require-auth";
import {
  CARD_CONTAINER_CLASS,
  INPUT_BORDERED_CLASS,
  PRIMARY_BUTTON_CLASS,
} from "../../../../lib/design-system";
import { PageHeader } from "../../../../components/layout/page-header";

type Rule = {
  id: string;
  sourceNasAccountCode: string;
  targetIfrsAccountCode: string;
  isActive: boolean;
};

function canManage(role: string | null | undefined): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export default function IfrsMappingRulesPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const { user } = useAuth();
  const canEdit = canManage(user?.role);

  const [rules, setRules] = useState<Rule[]>([]);
  const [sourceCode, setSourceCode] = useState("");
  const [targetCode, setTargetCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const res = await apiFetch("/api/ifrs-mapping-rules");
    if (!res.ok) {
      setError(`${t("mapping.loadErr")}: ${res.status}`);
      setRules([]);
      setLoading(false);
      return;
    }
    setRules((await res.json()) as Rule[]);
    setLoading(false);
  }, [token, t]);

  useEffect(() => {
    if (!ready || !token) return;
    void load();
  }, [ready, token, load]);

  async function createRule(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || !token) return;
    setSaving(true);
    setError(null);
    const res = await apiFetch("/api/ifrs-mapping-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceNasAccountCode: sourceCode.trim(),
        targetIfrsAccountCode: targetCode.trim(),
        isActive: true,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError(`${t("mapping.createErr")}: ${res.status}`);
      return;
    }
    setSourceCode("");
    setTargetCode("");
    await load();
  }

  async function toggleRule(rule: Rule) {
    if (!canEdit || !token) return;
    const res = await apiFetch(`/api/ifrs-mapping-rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !rule.isActive }),
    });
    if (!res.ok) {
      setError(`${t("mapping.updateErr", { defaultValue: "Update failed" })}: ${res.status}`);
      return;
    }
    await load();
  }

  async function removeRule(id: string) {
    if (!canEdit || !token) return;
    const res = await apiFetch(`/api/ifrs-mapping-rules/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(`${t("mapping.deleteErr")}: ${res.status}`);
      return;
    }
    await load();
  }

  if (!ready) return <p>{t("common.loading")}</p>;
  if (!token) return null;

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title={t("mapping.rulesTitle", { defaultValue: "IFRS Mapping Rules" })}
        subtitle={t("mapping.rulesSubtitle", {
          defaultValue:
            "Define NAS account code to IFRS account code rules for automatic IFRS mirror entries.",
        })}
      />

      {canEdit && (
        <form onSubmit={createRule} className={`${CARD_CONTAINER_CLASS} p-4 space-y-4`}>
          <div className="grid sm:grid-cols-2 gap-3">
            <input
              className={`w-full ${INPUT_BORDERED_CLASS}`}
              placeholder={t("mapping.sourceNasCode", { defaultValue: "Source NAS code" })}
              value={sourceCode}
              onChange={(e) => setSourceCode(e.target.value)}
              required
            />
            <input
              className={`w-full ${INPUT_BORDERED_CLASS}`}
              placeholder={t("mapping.targetIfrsCode", { defaultValue: "Target IFRS code" })}
              value={targetCode}
              onChange={(e) => setTargetCode(e.target.value)}
              required
            />
          </div>
          <button className={PRIMARY_BUTTON_CLASS} disabled={saving}>
            {saving ? "..." : t("mapping.save")}
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <p>{t("common.loading")}</p>
      ) : (
        <div className={CARD_CONTAINER_CLASS}>
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className="text-left p-2">{t("mapping.sourceNasCode", { defaultValue: "NAS" })}</th>
                <th className="text-left p-2">{t("mapping.targetIfrsCode", { defaultValue: "IFRS" })}</th>
                <th className="text-left p-2">{t("common.status", { defaultValue: "Status" })}</th>
                {canEdit && <th className="text-left p-2">{t("mapping.thActions")}</th>}
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="p-2 font-mono">{r.sourceNasAccountCode}</td>
                  <td className="p-2 font-mono">{r.targetIfrsAccountCode}</td>
                  <td className="p-2">{r.isActive ? "Active" : "Inactive"}</td>
                  {canEdit && (
                    <td className="p-2 space-x-3">
                      <button
                        type="button"
                        className="text-blue-700 text-xs"
                        onClick={() => void toggleRule(r)}
                      >
                        {r.isActive ? "Disable" : "Enable"}
                      </button>
                      <button
                        type="button"
                        className="text-red-600 text-xs"
                        onClick={() => void removeRule(r.id)}
                      >
                        {t("mapping.delete")}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
