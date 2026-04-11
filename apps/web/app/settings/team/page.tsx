"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../lib/api-client";
import {
  CARD_CONTAINER_CLASS,
  INPUT_BORDERED_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../../lib/design-system";
import { useAuth } from "../../../lib/auth-context";
import { useRequireAuth } from "../../../lib/use-require-auth";

type MemberRow = {
  userId: string;
  organizationId: string;
  role: string;
  joinedAt: string;
  user: {
    id: string;
    email: string;
    fullName: string | null;
    avatarUrl: string | null;
  };
};

type AccessReq = {
  id: string;
  createdAt: string;
  message: string | null;
  requester: { id: string; email: string; fullName: string | null };
};

const ROLES = ["USER", "ACCOUNTANT", "ADMIN", "OWNER"] as const;

export default function TeamSettingsPage() {
  const { t } = useTranslation();
  const { ready, token } = useRequireAuth();
  const { user, refreshSession } = useAuth();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [requests, setRequests] = useState<AccessReq[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("USER");
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  const canManage =
    user?.role === "OWNER" || user?.role === "ADMIN";

  const load = useCallback(async () => {
    if (!token) return;
    setLoadErr(null);
    const res = await apiFetch("/api/team/members");
    if (!res.ok) {
      setLoadErr(String(res.status));
      return;
    }
    const data = (await res.json()) as MemberRow[];
    setMembers(data);

    if (canManage) {
      const r = await apiFetch("/api/team/access-requests");
      if (r.ok) {
        setRequests((await r.json()) as AccessReq[]);
      } else {
        setRequests([]);
      }
    } else {
      setRequests([]);
    }
  }, [token, canManage]);

  useEffect(() => {
    if (!ready || !token) return;
    void load();
  }, [ready, token, load]);

  async function removeMember(targetUserId: string) {
    if (!canManage) return;
    if (!window.confirm(t("teamPage.removeConfirm"))) return;
    setBusyId(targetUserId);
    try {
      const res = await apiFetch(`/api/team/members/${targetUserId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const txt = await res.text();
        alert(txt || String(res.status));
        return;
      }
      await load();
      await refreshSession();
    } finally {
      setBusyId(null);
    }
  }

  async function approveRequest(id: string, role: string) {
    setBusyId(id);
    try {
      const res = await apiFetch(`/api/team/access-requests/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const txt = await res.text();
        alert(txt || String(res.status));
        return;
      }
      await load();
      await refreshSession();
    } finally {
      setBusyId(null);
    }
  }

  async function declineRequest(id: string) {
    setBusyId(id);
    try {
      const res = await apiFetch(`/api/team/access-requests/${id}/decline`, {
        method: "POST",
      });
      if (!res.ok) {
        const txt = await res.text();
        alert(txt || String(res.status));
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setInviteMsg(null);
    setBusyId("invite");
    try {
      const res = await apiFetch("/api/team/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      if (!res.ok) {
        const txt = await res.text();
        setInviteMsg(txt || String(res.status));
        return;
      }
      setInviteEmail("");
      setInviteMsg(t("teamPage.inviteOk"));
    } finally {
      setBusyId(null);
    }
  }

  if (!ready || !token) {
    return <div className="text-sm text-gray-500">{t("common.loading")}</div>;
  }

  if (user?.role === "USER") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {t("teamPage.noAccess")}
      </div>
    );
  }

  return (
    <div className="space-y-10 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{t("teamPage.title")}</h1>
        <p className="text-gray-600 mt-2">{t("teamPage.subtitle")}</p>
      </div>

      {loadErr && (
        <p className="text-red-600 text-sm">{loadErr}</p>
      )}

      {canManage && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium text-gray-900">{t("teamPage.inviteTitle")}</h2>
          <form
            onSubmit={(e) => void sendInvite(e)}
            className={`flex flex-wrap items-end gap-3 ${CARD_CONTAINER_CLASS} p-4`}
          >
            <label className="text-[13px] font-medium text-[#34495E]">
              Email
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className={`block w-56 mt-1 ${INPUT_BORDERED_CLASS}`}
              />
            </label>
            <label className="text-[13px] font-medium text-[#34495E]">
              {t("teamPage.role")}
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className={`block mt-1 min-w-[10rem] ${INPUT_BORDERED_CLASS}`}
              >
                {ROLES.filter((r) => r !== "OWNER").map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={busyId === "invite"}
              className={`${PRIMARY_BUTTON_CLASS} disabled:opacity-50`}
            >
              {t("teamPage.inviteSubmit")}
            </button>
            {inviteMsg && <p className="text-sm text-gray-700 w-full">{inviteMsg}</p>}
          </form>
        </section>
      )}

      {canManage && requests.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium text-gray-900">{t("teamPage.requestsTitle")}</h2>
          <ul className="space-y-2">
            {requests.map((req) => (
              <li
                key={req.id}
                className="rounded-xl border border-amber-100 bg-amber-50/50 px-4 py-3 flex flex-wrap gap-3 items-center justify-between"
              >
                <div>
                  <div className="font-medium text-gray-900">
                    {req.requester.fullName || req.requester.email}
                  </div>
                  <div className="text-xs text-gray-600">{req.requester.email}</div>
                  {req.message && (
                    <div className="text-sm text-gray-700 mt-1">{req.message}</div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <ApproveRoleSelect
                    onApprove={(role) => void approveRequest(req.id, role)}
                    disabled={busyId === req.id}
                  />
                  <button
                    type="button"
                    disabled={busyId === req.id}
                    onClick={() => void declineRequest(req.id)}
                    className={`${SECONDARY_BUTTON_CLASS} px-3 py-1.5 text-[13px]`}
                  >
                    {t("teamPage.decline")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-gray-900">{t("teamPage.membersTitle")}</h2>
        <div className={`overflow-x-auto ${CARD_CONTAINER_CLASS}`}>
          <table className="min-w-full text-[13px]">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-2 font-medium">{t("teamPage.email")}</th>
                <th className="px-4 py-2 font-medium">{t("teamPage.role")}</th>
                <th className="px-4 py-2 font-medium">{t("teamPage.joined")}</th>
                {canManage && <th className="px-4 py-2 font-medium">{t("teamPage.actions")}</th>}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId} className="border-t border-gray-100">
                  <td className="px-4 py-2">{m.user.email}</td>
                  <td className="px-4 py-2">{m.role}</td>
                  <td className="px-4 py-2 tabular-nums text-gray-600">
                    {new Date(m.joinedAt).toLocaleDateString()}
                  </td>
                  {canManage && (
                    <td className="px-4 py-2">
                      {m.role !== "OWNER" && m.userId !== user?.id ? (
                        <button
                          type="button"
                          disabled={busyId === m.userId}
                          onClick={() => void removeMember(m.userId)}
                          className="text-red-600 hover:underline text-sm disabled:opacity-50"
                        >
                          {t("teamPage.remove")}
                        </button>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ApproveRoleSelect({
  onApprove,
  disabled,
}: {
  onApprove: (role: string) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [role, setRole] = useState("USER");
  return (
    <div className="flex items-center gap-2">
      <select
        value={role}
        onChange={(e) => setRole(e.target.value)}
        className={`${INPUT_BORDERED_CLASS} py-1.5 text-[13px]`}
        disabled={disabled}
      >
        {ROLES.filter((r) => r !== "OWNER").map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onApprove(role)}
        className={`${PRIMARY_BUTTON_CLASS} px-3 py-1.5 text-[13px] disabled:opacity-50`}
      >
        {t("teamPage.approve")}
      </button>
    </div>
  );
}
