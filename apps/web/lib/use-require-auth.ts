"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "./auth-context";

/** Редирект на `/login`, если сессии нет. */
export function useRequireAuth(): { token: string | null; ready: boolean } {
  const { token, ready } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (ready && !token) {
      router.replace("/login");
    }
  }, [ready, token, router]);
  return { token, ready };
}
