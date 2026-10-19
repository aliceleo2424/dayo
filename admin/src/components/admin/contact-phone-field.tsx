"use client";
// Shared mobile number for booking alerts (owner request 2026-10-20).
// Reads/writes user_contact_info.mobile_phone through dayo_contact_phone / dayo_set_contact_phone,
// the same value the partner edits in the Partner Lounge and learners enter at checkout.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function pretty(value: string | null | undefined) {
  const d = String(value || "");
  return /^010\d{8}$/.test(d) ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : d;
}

export function ContactPhoneField({ userId, compact = false }: { userId: string; compact?: boolean }) {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    setMsg(null);
    void supabase.rpc("dayo_contact_phone", { p_user_id: userId }).then(({ data, error }) => {
      if (!alive) return;
      if (error) { setMsg({ ok: false, text: "불러오기 실패" }); return; }
      setValue(pretty(data as string | null)); setSaved(pretty(data as string | null));
    });
    return () => { alive = false; };
  }, [userId]);

  async function save() {
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc("dayo_set_contact_phone", { p_user_id: userId, p_phone: value });
    setBusy(false);
    if (error) {
      const text = /invalid_phone/.test(error.message) ? "010으로 시작하는 11자리" : /email_missing/.test(error.message) ? "계정 이메일이 없어 저장 불가" : "저장 실패";
      setMsg({ ok: false, text });
      return;
    }
    const next = pretty((data as { mobile_phone?: string } | null)?.mobile_phone);
    setValue(next); setSaved(next); setMsg({ ok: true, text: "저장됨" });
  }

  return (
    <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className={compact ? "min-w-[11rem]" : ""}>
      <div className="flex items-center gap-2">
        <Input
          type="tel"
          inputMode="tel"
          value={value}
          placeholder="010-0000-0000"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void save(); } }}
          className={compact ? "h-8 w-36 text-xs" : "h-9"}
          aria-label="예약 알림 휴대폰 번호"
        />
        <Button size="sm" variant="outline" disabled={busy || value === saved} onClick={() => void save()}>
          {busy ? "…" : "저장"}
        </Button>
      </div>
      {msg ? <p className={`mt-1 text-xs ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p> : null}
    </div>
  );
}
