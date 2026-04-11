"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { publicApiFetch } from "../../../lib/public-api-fetch";
import { SignatureProviderMark } from "../../../components/signature-provider-mark";

type VerifyPayload = {
  verified: true;
  signedAt: string | null;
  signerName: string | null;
  organization: { name: string; taxId: string };
  documentHashSha256: string | null;
  documentKind: "INVOICE" | "RECONCILIATION_ACT";
  provider: string;
  certificate: { subject: string | null; issuer: string | null };
  invoice?: { number: string; issuedAt: string };
};

export default function VerifySignaturePage() {
  const { t } = useTranslation();
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [data, setData] = useState<VerifyPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      const res = await publicApiFetch(`/api/public/verify/${id}`);
      if (cancelled) return;
      if (!res.ok) {
        setError(t("verify.notFound"));
        setData(null);
      } else {
        setData((await res.json()) as VerifyPayload);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, t]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-lg border border-slate-200/80 p-8 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-xl font-semibold text-slate-900">
            {t("verify.title")}
          </h1>
          <p className="text-sm text-slate-600">{t("verify.subtitle")}</p>
        </div>

        {loading && (
          <p className="text-center text-slate-500">{t("common.loading")}</p>
        )}

        {error && !loading && (
          <div className="rounded-xl border border-red-100 bg-red-50 text-red-800 text-sm p-4 text-center">
            {error}
          </div>
        )}

        {data && !loading && (
          <div className="space-y-6">
            <div className="flex flex-col items-center gap-4">
              <div
                className="h-28 w-28 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shadow-inner border-4 border-emerald-200/80"
                aria-hidden
              >
                <span className="text-6xl font-bold leading-none pb-1">✓</span>
              </div>
              <p className="text-center font-semibold text-emerald-900 text-xl tracking-tight">
                {t("verify.statusConfirmed")}
              </p>
            </div>

            <dl className="space-y-3 text-sm border-t border-slate-100 pt-5">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 shrink-0">{t("verify.org")}</dt>
                <dd className="font-medium text-slate-900 text-right">
                  {data.organization.name}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">{t("verify.voen")}</dt>
                <dd className="font-mono text-slate-900">{data.organization.taxId}</dd>
              </div>
              {data.signerName && (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">{t("verify.signerName")}</dt>
                  <dd className="font-medium text-slate-900 text-right">
                    {data.signerName}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">{t("verify.docKind")}</dt>
                <dd className="text-slate-900 text-right">
                  {data.documentKind === "INVOICE"
                    ? t("verify.docKindInvoice")
                    : t("verify.docKindReconciliation")}
                </dd>
              </div>
              {data.invoice && (
                <>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">{t("verify.invoiceNo")}</dt>
                    <dd className="font-medium text-slate-900">
                      {data.invoice.number}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">{t("verify.invoiceDate")}</dt>
                    <dd className="text-slate-900">
                      {data.invoice.issuedAt.slice(0, 10)}
                    </dd>
                  </div>
                </>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">{t("verify.signedAt")}</dt>
                <dd className="text-slate-900">
                  {data.signedAt
                    ? data.signedAt.slice(0, 19).replace("T", " ")
                    : "—"}
                </dd>
              </div>
              <div className="flex flex-col items-center gap-3 py-4 border-t border-b border-slate-100">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide text-center">
                  {t("verify.signedWith")}
                </p>
                <SignatureProviderMark provider={data.provider} />
              </div>
              {data.documentHashSha256 && (
                <div className="pt-1">
                  <dt className="text-slate-500 mb-1">{t("verify.sha256")}</dt>
                  <dd className="text-slate-700 break-all font-mono text-xs leading-relaxed bg-slate-50 rounded-lg p-3 border border-slate-100">
                    {data.documentHashSha256}
                  </dd>
                </div>
              )}
              {data.certificate.subject && (
                <div className="pt-2">
                  <dt className="text-slate-500 mb-1">{t("verify.certSubject")}</dt>
                  <dd className="text-slate-800 break-all text-xs">
                    {data.certificate.subject}
                  </dd>
                </div>
              )}
              {data.certificate.issuer && (
                <div>
                  <dt className="text-slate-500 mb-1">{t("verify.certIssuer")}</dt>
                  <dd className="text-slate-800 break-all text-xs">
                    {data.certificate.issuer}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}

        <div className="text-center pt-2">
          <Link
            href="/"
            className="text-sm text-action hover:text-primary font-medium"
          >
            {t("verify.backHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}
