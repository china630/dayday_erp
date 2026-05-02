"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiBaseUrl, apiFetch } from "../../../lib/api-client";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { PageHeader } from "../../../components/layout/page-header";
import {
  DATA_TABLE_CLASS,
  DATA_TABLE_HEAD_ROW_CLASS,
  DATA_TABLE_TD_CENTER_CLASS,
  DATA_TABLE_TD_CLASS,
  DATA_TABLE_TD_RIGHT_CLASS,
  DATA_TABLE_TH_CENTER_CLASS,
  DATA_TABLE_TH_LEFT_CLASS,
  DATA_TABLE_TH_RIGHT_CLASS,
  DATA_TABLE_TR_CLASS,
  DATA_TABLE_VIEWPORT_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  TABLE_ROW_ICON_BTN_CLASS,
} from "../../../lib/design-system";
import { CircleArrowUp, Download, Loader2, Upload } from "lucide-react";

type ExportStatus = "GENERATED" | "UPLOADED" | "CONFIRMED_BY_TAX";

type TaxDeclarationExport = {
  id: string;
  taxType: string;
  period: string;
  generatedFileUrl: string;
  receiptFileUrl: string | null;
  status: ExportStatus;
  createdAt: string;
};

function parseApiErrorBody(data: unknown): string {
  if (!data || typeof data !== "object") return "Error";
  const payload = data as Record<string, unknown>;
  const m = payload.message;
  if (typeof m === "string") return m;
  if (Array.isArray(m)) return m.join("; ");
  if (typeof payload.code === "string" && typeof payload.message === "string") {
    return `${payload.code}: ${payload.message}`;
  }
  try {
    return JSON.stringify(payload).slice(0, 400);
  } catch {
    return "Error";
  }
}

export default function TaxExportPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [taxType, setTaxType] = useState("SIMPLIFIED_TAX");
  const [items, setItems] = useState<TaxDeclarationExport[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [receiptFiles, setReceiptFiles] = useState<Record<string, File | null>>({});

  const load = useCallback(async () => {
    if (!token) return;
    setLoadingList(true);
    setErr(null);
    try {
      const res = await apiFetch("/api/reporting/tax-declarations");
      const data = (await res.json()) as unknown;
      if (!res.ok) {
        setErr(parseApiErrorBody(data));
        setLoadingList(false);
        return;
      }
      setItems(Array.isArray(data) ? (data as TaxDeclarationExport[]) : []);
    } catch {
      setErr(t("reporting.taxExportErr"));
    }
    setLoadingList(false);
  }, [token, t]);

  useEffect(() => {
    if (!token) return;
    void load();
  }, [token, load]);

  const generate = useCallback(async () => {
    setGenerating(true);
    setErr(null);
    try {
      const res = await apiFetch("/api/reporting/tax-declarations/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taxType, period }),
      });
      const data = (await res.json()) as unknown;
      if (!res.ok) {
        setErr(parseApiErrorBody(data));
        setGenerating(false);
        return;
      }
      await load();
    } catch {
      setErr(t("reporting.taxExportErr"));
    }
    setGenerating(false);
  }, [taxType, period, load, t]);

  const statusLabel = useMemo(
    () => ({
      GENERATED: "GENERATED",
      UPLOADED: "UPLOADED",
      CONFIRMED_BY_TAX: "CONFIRMED_BY_TAX",
    }),
    [],
  );

  const downloadDeclaration = useCallback(
    async (id: string, periodValue: string) => {
      if (!token) return;
      setBusyId(id);
      setErr(null);
      const path = `/api/reporting/tax-declarations/${id}/download`;
      const url = `${apiBaseUrl()}${path}`;
      const headers = new Headers();
      headers.set("Authorization", `Bearer ${token}`);
      try {
        const res = await fetch(url, { credentials: "include", headers });
        if (!res.ok) {
          let message = `${t("reporting.taxExportErr")}: ${res.status}`;
          try {
            const data = (await res.json()) as unknown;
            message = parseApiErrorBody(data);
          } catch {}
          setErr(message);
          setBusyId(null);
          return;
        }
        const blob = await res.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `SIMPLIFIED_TAX-${periodValue}.xml`;
        a.click();
        URL.revokeObjectURL(a.href);
        await load();
      } catch {
        setErr(t("reporting.taxExportErr"));
      }
      setBusyId(null);
    },
    [token, t, load],
  );

  const uploadReceipt = useCallback(
    async (id: string) => {
      const file = receiptFiles[id];
      if (!file) {
        setErr("PDF file is required");
        return;
      }
      setBusyId(id);
      setErr(null);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await apiFetch(`/api/reporting/tax-declarations/${id}/receipt`, {
          method: "POST",
          body: form,
        });
        const data = (await res.json()) as unknown;
        if (!res.ok) {
          setErr(parseApiErrorBody(data));
          setBusyId(null);
          return;
        }
        setReceiptFiles((prev) => ({ ...prev, [id]: null }));
        await load();
      } catch {
        setErr(t("reporting.taxExportErr"));
      }
      setBusyId(null);
    },
    [receiptFiles, load, t],
  );

  if (!ready) {
    return (
      <div className="text-gray-600">
        <p>{t("common.loading")}</p>
      </div>
    );
  }
  if (!token) return null;

  return (
    <div className="space-y-8 max-w-5xl">
      <PageHeader title={t("reporting.taxExportTitle")} subtitle={t("reporting.taxExportSubtitle")} />

      {err && <p className="text-red-600 text-sm">{err}</p>}

      <section className="bg-white p-6 shadow-sm rounded-xl border border-slate-100 space-y-4">
        <div className="flex flex-wrap gap-4 items-end">
          <label className="block text-sm font-medium text-gray-700">
            {t("reporting.taxExportPeriod")}
            <input
              type="month"
              className="block w-40 mt-1 rounded-md border border-slate-200 px-2 py-1.5"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            {t("reporting.taxExportType")}
            <select
              className="block w-56 mt-1 rounded-md border border-slate-200 px-2 py-1.5"
              value={taxType}
              onChange={(e) => setTaxType(e.target.value)}
            >
              <option value="SIMPLIFIED_TAX">Sadələşdirilmiş vergi / Simplified Tax</option>
            </select>
          </label>
          <button
            type="button"
            disabled={generating}
            onClick={() => void generate()}
            className={`${PRIMARY_BUTTON_CLASS} disabled:opacity-50`}
          >
            {generating ? "…" : t("reporting.taxExportGenerate")}
          </button>
          <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={() => void load()}>
            {loadingList ? "…" : t("common.refresh")}
          </button>
        </div>
      </section>

      <section className="bg-white p-6 shadow-sm rounded-xl border border-slate-100">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {t("reporting.taxExportWorkflowTitle")}
        </h2>
        <div className={DATA_TABLE_VIEWPORT_CLASS}>
          <table className={`${DATA_TABLE_CLASS} min-w-full`}>
            <thead>
              <tr className={DATA_TABLE_HEAD_ROW_CLASS}>
                <th className={DATA_TABLE_TH_RIGHT_CLASS}>{t("reporting.taxExportPeriod")}</th>
                <th className={DATA_TABLE_TH_LEFT_CLASS}>{t("reporting.taxExportType")}</th>
                <th className={DATA_TABLE_TH_CENTER_CLASS}>{t("reporting.taxExportStatus")}</th>
                <th className={DATA_TABLE_TH_RIGHT_CLASS}>{t("reporting.taxExportActions")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className={`${DATA_TABLE_TR_CLASS} align-top`}>
                  <td className={DATA_TABLE_TD_RIGHT_CLASS}>{item.period}</td>
                  <td className={DATA_TABLE_TD_CLASS}>{item.taxType}</td>
                  <td className={DATA_TABLE_TD_CENTER_CLASS}>{statusLabel[item.status]}</td>
                  <td className={DATA_TABLE_TD_CLASS}>
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      <button
                        type="button"
                        className={TABLE_ROW_ICON_BTN_CLASS}
                        title={t("reporting.taxExportDownload")}
                        disabled={busyId === item.id}
                        onClick={() => void downloadDeclaration(item.id, item.period)}
                      >
                        {busyId === item.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-[#2980B9]" aria-hidden />
                        ) : (
                          <Download className="h-4 w-4 text-[#2980B9]" aria-hidden />
                        )}
                      </button>
                      {item.status !== "CONFIRMED_BY_TAX" && (
                        <>
                          <input
                            id={`tax-receipt-${item.id}`}
                            type="file"
                            accept="application/pdf"
                            className="sr-only"
                            onChange={(e) =>
                              setReceiptFiles((prev) => ({
                                ...prev,
                                [item.id]: e.target.files?.[0] ?? null,
                              }))
                            }
                          />
                          <label
                            htmlFor={`tax-receipt-${item.id}`}
                            className={`${TABLE_ROW_ICON_BTN_CLASS} cursor-pointer`}
                            title={t("reporting.taxExportAttachReceipt")}
                          >
                            <Upload className="h-4 w-4 text-[#7F8C8D]" aria-hidden />
                          </label>
                          <button
                            type="button"
                            className={TABLE_ROW_ICON_BTN_CLASS}
                            title={t("reporting.taxExportAttachReceipt")}
                            disabled={busyId === item.id}
                            onClick={() => void uploadReceipt(item.id)}
                          >
                            {busyId === item.id ? (
                              <Loader2 className="h-4 w-4 animate-spin text-[#2980B9]" aria-hidden />
                            ) : (
                              <CircleArrowUp className="h-4 w-4 text-[#2980B9]" aria-hidden />
                            )}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && !loadingList && (
                <tr className={DATA_TABLE_TR_CLASS}>
                  <td className={`${DATA_TABLE_TD_CLASS} py-6 text-center text-[#7F8C8D]`} colSpan={4}>
                    {t("reporting.taxExportEmpty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="bg-white p-6 shadow-sm rounded-xl border border-slate-100">
        <h3 className="text-base font-semibold text-gray-900 mb-2">
          {t("reporting.taxExportWorkflowHintTitle")}
        </h3>
        <ol className="list-decimal pl-5 space-y-1 text-sm text-slate-700">
          <li>{t("reporting.taxExportStepGenerate")}</li>
          <li>{t("reporting.taxExportStepDownload")}</li>
          <li>{t("reporting.taxExportStepReceipt")}</li>
        </ol>
      </section>
    </div>
  );
}
