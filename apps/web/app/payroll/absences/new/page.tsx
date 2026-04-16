"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "../../../../lib/use-require-auth";

export default function NewAbsencePage() {
  const { token, ready } = useRequireAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready || !token) return;
    router.replace("/payroll?tab=absences");
  }, [ready, token, router]);

  if (!ready) {
    return (
      <div className="text-gray-600">
        <p>Loading…</p>
      </div>
    );
  }
  if (!token) return null;

  return null;
}
