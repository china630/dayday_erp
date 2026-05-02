"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { accountDisplayName } from "../../../lib/account-display-name";
import { apiFetch } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import { useRequireAuth } from "../../../lib/use-require-auth";
import {
  CARD_CONTAINER_CLASS,
  INPUT_BORDERED_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../../lib/design-system";
import { PageHeader } from "../../../components/layout/page-header";
import { uiLangRuAz } from "../../../lib/i18n/ui-lang";

type AccountRow = {
  id: string;
  code: string;
  nameAz: string;
  nameRu: string;
  nameEn: string;
  displayName?: string;
  type: string;
};

type TemplateRow = {
  id: string;
  code: string;
  nameAz: string;
  nameRu: string;
  nameEn: string;
  displayName?: string;
  accountType: string;
  parentCode: string | null;
  templateGroups: string[];
};

function canImportNas(role: string | null | undefined): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "ACCOUNTANT";
}

export default function NasChartSettingsPage() {
  const { t, i18n } = useTranslation();
  const { token, ready } = useRequireAuth();
  const { user } = useAuth();
  const canImport = canImportNas(user?.role);
  const loc = uiLangRuAz(i18n.language);

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [tplLoading, setTplLoading] = useState(false);
  const [tplErr, setTplErr] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);

  useEffect(() => {
    if (!modalOpen) return;
    const tmr = setTimeout(() => setDebouncedSearch(search.trim()), 320);
    return () => clearTimeout(tmr);
  }, [search, modalOpen]);

  const loadAccounts = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setErr(null);
    const res = await apiFetch(
      `/api/accounts?ledgerType=NAS&locale=${encodeURIComponent(loc)}`,
    );
    if (!res.ok) {
      setErr(t("chartPage.loadErr"));
      setAccounts([]);
      setLoading(false);
      return;
    }
    const rows = (await res.json()) as AccountRow[];
    setAccounts(rows);
    setLoading(false);
  }, [token, loc, t]);

  useEffect(() => {
    if (!ready || !token) return;
    void loadAccounts();
  }, [ready, token, loadAccounts]);

  const loadTemplates = useCallback(async () => {
    if (!token || !modalOpen) return;
    setTplLoading(true);
    setTplErr(null);
    const q = new URLSearchParams();
    q.set("locale", loc);
    if (debouncedSearch) q.set("search", debouncedSearch);
    const res = await apiFetch(`/api/accounts/templates?${q.toString()}`);
    if (!res.ok) {
      setTplErr(t("chartPage.loadErr"));
      setTemplates([]);
      setTplLoading(false);
      return;
    }
    setTemplates((await res.json()) as TemplateRow[]);
    setTplLoading(false);
  }, [token, modalOpen, debouncedSearch, loc, t]);

  useEffect(() => {
    if (!modalOpen || !ready || !token) return;
    void loadTemplates();
  }, [modalOpen, ready, token, loadTemplates]);

  async function onImport(templateId: string) {
    if (!token || !canImport) return;
    setImportingId(templateId);
    setTplErr(null);
    const res = await apiFetch("/api/accounts/import-from-template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateAccountId: templateId }),
    });
    setImportingId(null);
    if (!res.ok) {
      setTplErr(`${t("chartPage.importErr")}: ${res.status}`);
      return;
    }
    await loadAccounts();
    await loadTemplates();
  }

  if (!ready) return <p>{t("common.loading")}</p>;
  if (!token) return null;

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        title={t("chartPage.title")}
        subtitle={t("chartPage.subtitle")}
        actions={
          canImport ? (
            <button
              type="button"
              className={PRIMARY_BUTTON_CLASS}
              onClick={() => {
                setModalOpen(true);
                setSearch("");
                setDebouncedSearch("");
              }}
            >
              {t("chartPage.addFromCatalog")}
            </button>
          ) : undefined
        }
      />

      {!canImport ? (
        <p className="text-sm text-slate-600">{t("chartPage.readOnlyHint")}</p>
      ) : null}

      {err && <p className="text-sm text-red-600">{err}</p>}
      {loading ? (
        <p>{t("chartPage.loading")}</p>
      ) : (
        <div className={CARD_CONTAINER_CLASS}>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left p-2">{t("chartPage.colCode")}</th>
                <th className="text-left p-2">{t("chartPage.colName")}</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="p-2 font-mono">{a.code}</td>
                  <td className="p-2">
                    {a.displayName ?? accountDisplayName(a, loc)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className={`${CARD_CONTAINER_CLASS} w-full max-w-2xl bg-white p-5 max-h-[90vh] overflow-y-auto`}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-gray-900 m-0">
                {t("chartPage.modalTitle")}
              </h2>
              <button
                type="button"
                className={SECONDARY_BUTTON_CLASS}
                onClick={() => setModalOpen(false)}
              >
                {t("chartPage.close")}
              </button>
            </div>
            <input
              className={`mt-4 w-full ${INPUT_BORDERED_CLASS}`}
              placeholder={t("chartPage.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {tplErr && <p className="text-sm text-red-600 mt-2">{tplErr}</p>}
            {tplLoading ? (
              <p className="mt-4">{t("chartPage.loading")}</p>
            ) : templates.length === 0 ? (
              <p className="mt-4 text-sm text-slate-600">{t("chartPage.emptyTemplates")}</p>
            ) : (
              <table className="min-w-full text-sm mt-4">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left p-2">{t("chartPage.colCode")}</th>
                    <th className="text-left p-2">{t("chartPage.colName")}</th>
                    {canImport && <th className="text-left p-2 w-28" />}
                  </tr>
                </thead>
                <tbody>
                  {templates.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="p-2 font-mono">{r.code}</td>
                      <td className="p-2">
                        {r.displayName ?? accountDisplayName(r, loc)}
                      </td>
                      {canImport && (
                        <td className="p-2">
                          <button
                            type="button"
                            className="text-blue-700 text-xs font-medium"
                            disabled={importingId !== null}
                            onClick={() => void onImport(r.id)}
                          >
                            {importingId === r.id ? "…" : t("chartPage.import")}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
