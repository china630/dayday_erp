"use client";

import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiBaseUrl, apiFetch } from "../../../lib/api-client";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { ModulePageLinks } from "../../../components/module-page-links";
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "../../../lib/design-system";

type VatValidationIssue = {
  code: string;
  message: string;
  context?: Record<string, string>;
};

type EtaxesPreview = {
  package: unknown;
  validation: {
    errors: VatValidationIssue[];
    readyToSubmit: boolean;
  };
};

function parseApiErrorBody(data: Record<string, unknown>): string {
  const m = data.message;
  if (typeof m === "string") return m;
  if (m && typeof m === "object" && !Array.isArray(m)) {
    const o = m as Record<string, unknown>;
    if (typeof o.message === "string") return o.message;
    if (Array.isArray(o.errors)) {
      return (o.errors as VatValidationIssue[])
        .map((e) => e.message)
        .join("; ");
    }
  }
  if (Array.isArray(m)) return m.join("; ");
  if (typeof data.code === "string" && typeof data.message === "string")
    return `${data.code}: ${data.message}`;
  try {
    return JSON.stringify(data).slice(0, 400);
  } catch {
    return "Error";
  }
}

export default function TaxExportPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const [year, setYear] = useState(new Date().getFullYear());
  const [quarter, setQuarter] = useState(
    Math.floor(new Date().getMonth() / 3) + 1,
  );
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [etaxesOpen, setEtaxesOpen] = useState(false);
  const [preview, setPreview] = useState<EtaxesPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  const download = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setErr(null);
    const path = `/api/reporting/vat-appendix-xlsx?year=${year}&quarter=${quarter}`;
    const url = path.startsWith("http") ? path : `${apiBaseUrl()}${path}`;
    const headers = new Headers();
    headers.set("Authorization", `Bearer ${token}`);
    try {
      const res = await fetch(url, { credentials: "include", headers });
      if (res.status === 401) {
        sessionStorage.clear();
        window.location.replace("/login");
        return;
      }
      if (!res.ok) {
        setErr(`${t("reporting.taxExportErr")}: ${res.status}`);
        setLoading(false);
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition");
      let name = `edv-${year}-Q${quarter}.xlsx`;
      const m = cd?.match(/filename="([^"]+)"/);
      if (m?.[1]) name = m[1];
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      setErr(t("reporting.taxExportErr"));
    }
    setLoading(false);
  }, [token, year, quarter, t]);

  const openEtaxesModal = useCallback(async () => {
    setEtaxesOpen(true);
    setPreview(null);
    setPreviewErr(null);
    setSubmitMsg(null);
    setSubmitErr(null);
    setPreviewLoading(true);
    try {
      const path = `/api/reporting/etaxes-vat-declaration?year=${year}&quarter=${quarter}`;
      const res = await apiFetch(path);
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        setPreviewErr(parseApiErrorBody(data));
        setPreviewLoading(false);
        return;
      }
      setPreview(data as unknown as EtaxesPreview);
    } catch {
      setPreviewErr(t("reporting.taxExportEtaxesLoadErr"));
    }
    setPreviewLoading(false);
  }, [year, quarter, t]);

  const submitEtaxes = useCallback(async () => {
    setSubmitLoading(true);
    setSubmitMsg(null);
    setSubmitErr(null);
    try {
      const path = `/api/reporting/etaxes-vat-declaration/submit?year=${year}&quarter=${quarter}`;
      const res = await apiFetch(path, { method: "POST" });
      const data = (await res.json()) as Record<string, unknown>;
      if (res.status === 400) {
        setSubmitErr(
          parseApiErrorBody(data) || t("reporting.taxExportEtaxesErrValidation"),
        );
        setSubmitLoading(false);
        return;
      }
      if (res.status === 503 || res.status === 502) {
        setSubmitErr(
          parseApiErrorBody(data) || t("reporting.taxExportEtaxesErrGateway"),
        );
        setSubmitLoading(false);
        return;
      }
      if (!res.ok) {
        setSubmitErr(parseApiErrorBody(data));
        setSubmitLoading(false);
        return;
      }
      const st =
        typeof data.gatewayStatus === "number" ? data.gatewayStatus : res.status;
      setSubmitMsg(t("reporting.taxExportEtaxesSuccess", { status: String(st) }));
    } catch {
      setSubmitErr(t("reporting.taxExportErr"));
    }
    setSubmitLoading(false);
  }, [year, quarter, t]);

  if (!ready) {
    return (
      <div className="text-gray-600">
        <p>{t("common.loading")}</p>
      </div>
    );
  }
  if (!token) return null;

  const pkg = preview?.package as
    | { appendixSales?: unknown[]; appendixPurchases?: unknown[] }
    | undefined;

  return (
    <div className="space-y-8 max-w-xl">
      <ModulePageLinks
        items={[
          { href: "/", labelKey: "nav.home" },
          { href: "/reporting", labelKey: "nav.reportingHub" },
          { href: "/invoices", labelKey: "nav.invoices" },
          { href: "/products", labelKey: "nav.products" },
        ]}
      />
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 mt-2">
          {t("reporting.taxExportTitle")}
        </h1>
        <p className="text-sm text-slate-600 mt-2">{t("reporting.taxExportSubtitle")}</p>
      </div>

      {err && <p className="text-red-600 text-sm">{err}</p>}

      <section className="bg-white p-6 shadow-sm rounded-xl border border-slate-100 space-y-4">
        <div className="flex flex-wrap gap-4 items-end">
          <label className="block text-sm font-medium text-gray-700">
            {t("reporting.taxExportYear")}
            <input
              type="number"
              className="block w-28 mt-1 rounded-md border border-slate-200 px-2 py-1.5"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            {t("reporting.taxExportQuarter")}
            <select
              className="block w-24 mt-1 rounded-md border border-slate-200 px-2 py-1.5"
              value={quarter}
              onChange={(e) => setQuarter(Number(e.target.value))}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
            </select>
          </label>
          <button
            type="button"
            disabled={loading}
            onClick={() => void download()}
            className={`${PRIMARY_BUTTON_CLASS} disabled:opacity-50`}
          >
            {loading ? "…" : t("reporting.taxExportDownload")}
          </button>
          <button
            type="button"
            disabled={previewLoading}
            onClick={() => void openEtaxesModal()}
            className={[
              SECONDARY_BUTTON_CLASS,
              "border-2 border-emerald-700 text-emerald-900 hover:bg-emerald-50",
              "focus:ring-emerald-700/30",
              "disabled:opacity-50",
            ].join(" ")}
          >
            {previewLoading ? "…" : t("reporting.taxExportEtaxesBtn")}
          </button>
        </div>
      </section>

      {etaxesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="etaxes-modal-title"
          onClick={() => setEtaxesOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-100 flex justify-between items-start gap-4">
              <h2 id="etaxes-modal-title" className="text-lg font-semibold text-gray-900">
                {t("reporting.taxExportEtaxesModalTitle")}
              </h2>
              <button
                type="button"
                className="text-slate-500 hover:text-slate-800 text-sm"
                onClick={() => setEtaxesOpen(false)}
              >
                {t("reporting.taxExportEtaxesClose")}
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-4 text-sm">
              {previewLoading && (
                <p className="text-slate-600">{t("common.loading")}</p>
              )}
              {previewErr && (
                <p className="text-red-600">{previewErr}</p>
              )}
              {preview && !previewLoading && (
                <>
                  <p className="text-slate-700">
                    {t("reporting.taxExportEtaxesSummary", {
                      sales: String(pkg?.appendixSales?.length ?? 0),
                      purchases: String(pkg?.appendixPurchases?.length ?? 0),
                      ready: preview.validation.readyToSubmit
                        ? t("reporting.taxExportEtaxesReadyYes")
                        : t("reporting.taxExportEtaxesReadyNo"),
                    })}
                  </p>
                  {preview.validation.errors.length > 0 && (
                    <div>
                      <p className="font-medium text-gray-900 mb-2">
                        {t("reporting.taxExportEtaxesValidationTitle")}
                      </p>
                      <ul className="list-disc pl-5 space-y-1 text-red-700">
                        {preview.validation.errors.map((e, i) => (
                          <li key={`${e.code}-${i}`}>{e.message}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-gray-900 mb-2">
                      {t("reporting.taxExportEtaxesPayloadTitle")}
                    </p>
                    <pre className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-x-auto max-h-64 overflow-y-auto">
                      {JSON.stringify(preview.package, null, 2)}
                    </pre>
                  </div>
                  {submitMsg && (
                    <p className="text-emerald-700 font-medium">{submitMsg}</p>
                  )}
                  {submitErr && (
                    <p className="text-red-600">{submitErr}</p>
                  )}
                </>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => setEtaxesOpen(false)}
              >
                {t("reporting.taxExportEtaxesClose")}
              </button>
              <button
                type="button"
                disabled={
                  submitLoading ||
                  previewLoading ||
                  !preview?.validation.readyToSubmit
                }
                onClick={() => void submitEtaxes()}
                className={[
                  "px-4 py-2 rounded-[2px] text-sm font-semibold border-2 border-emerald-700 bg-white text-emerald-900",
                  "hover:bg-emerald-50 disabled:opacity-50 shadow-sm",
                ].join(" ")}
              >
                {submitLoading ? "…" : t("reporting.taxExportEtaxesSubmit")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
