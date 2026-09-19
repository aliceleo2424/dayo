"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

export type AdminIdentity = {
  id: string;
  email: string;
  displayName: string;
  role: "admin";
};

type AdminVerification =
  | { status: "authorized"; identity: AdminIdentity }
  | { status: "unauthenticated" }
  | { status: "forbidden"; message: string };

const AdminAuthContext = createContext<AdminIdentity | null>(null);

export async function verifyCurrentAdmin(): Promise<AdminVerification> {
  const userResult = await supabase.auth.getUser();
  const user = userResult.data.user;
  if (userResult.error || !user) return { status: "unauthenticated" };

  const profileResult = await supabase
    .from("profiles")
    .select("id, role, nickname, user_name, email")
    .eq("id", user.id)
    .maybeSingle();

  if (profileResult.error) {
    return { status: "forbidden", message: "관리자 권한을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }

  const profile = profileResult.data;
  if (!profile || String(profile.role || "").trim().toLowerCase() !== "admin") {
    return { status: "forbidden", message: "관리자 계정만 접근할 수 있습니다." };
  }

  const email = String(profile.email || user.email || "").trim();
  const displayName = String(profile.nickname || profile.user_name || email.split("@")[0] || "관리자").trim();
  return {
    status: "authorized",
    identity: { id: user.id, email, displayName, role: "admin" },
  };
}

export function useAdminAuth() {
  const identity = useContext(AdminAuthContext);
  if (!identity) throw new Error("useAdminAuth must be used inside AdminAuthGuard");
  return identity;
}

export function AdminAuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [identity, setIdentity] = useState<AdminIdentity | null>(null);
  const [deniedMessage, setDeniedMessage] = useState("");

  const verify = useCallback(async () => {
    const result = await verifyCurrentAdmin();
    if (result.status === "authorized") {
      setDeniedMessage("");
      setIdentity(result.identity);
      return;
    }
    setIdentity(null);
    if (result.status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    setDeniedMessage(result.message);
  }, [router]);

  useEffect(() => {
    let active = true;
    void verify();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (!active) return;
      if (event === "SIGNED_OUT") {
        setIdentity(null);
        router.replace("/login");
      } else if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        void verify();
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [router, verify]);

  if (deniedMessage) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <section className="w-full max-w-md rounded-2xl border bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-navy">관리자 접근 권한이 없습니다</h1>
          <p className="mt-3 text-sm text-muted-foreground">{deniedMessage}</p>
          <Button
            className="mt-6"
            onClick={async () => {
              await supabase.auth.signOut();
              router.replace("/login");
            }}
          >
            로그인 화면으로 돌아가기
          </Button>
        </section>
      </main>
    );
  }

  if (!identity) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-muted-foreground">관리자 권한을 확인하고 있습니다…</p>
      </main>
    );
  }

  return <AdminAuthContext.Provider value={identity}>{children}</AdminAuthContext.Provider>;
}
