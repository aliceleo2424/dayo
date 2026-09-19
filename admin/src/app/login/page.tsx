"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verifyCurrentAdmin } from "@/components/admin/admin-auth-guard";
import { supabase } from "@/lib/supabase";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void verifyCurrentAdmin().then(async (result) => {
      if (!active) return;
      if (result.status === "authorized") {
        router.replace("/admin/dashboard");
        return;
      }
      if (result.status === "forbidden") await supabase.auth.signOut();
      if (active) setChecking(false);
    });
    return () => {
      active = false;
    };
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) {
        setError("이메일 또는 비밀번호를 확인해 주세요.");
        return;
      }
      const verification = await verifyCurrentAdmin();
      if (verification.status !== "authorized") {
        await supabase.auth.signOut();
        setError(
          verification.status === "forbidden"
            ? verification.message
            : "로그인 세션을 확인하지 못했습니다. 다시 시도해 주세요."
        );
        return;
      }
      router.replace("/admin/dashboard");
      router.refresh();
    } catch {
      setError("로그인 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <section className="w-full max-w-sm rounded-2xl border bg-white p-8 shadow-sm">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-navy text-white">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-semibold text-navy">DayO Admin</h1>
          <p className="mt-2 text-sm text-muted-foreground">관리자 계정으로 로그인해 주세요.</p>
        </div>

        {checking ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            로그인 상태를 확인하고 있습니다…
          </div>
        ) : (
          <form className="space-y-5" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="admin-email">이메일</Label>
              <Input
                id="admin-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-password">비밀번호</Label>
              <Input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
              {submitting ? "로그인 중…" : "로그인"}
            </Button>
          </form>
        )}
      </section>
    </main>
  );
}
