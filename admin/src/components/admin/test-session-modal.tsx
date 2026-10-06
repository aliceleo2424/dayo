"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";

type Member = { id: string; nickname: string | null; user_name: string | null; email: string | null; role: string | null };
type TestBooking = { id: string; learner_id: string; partner_user_id: string; scheduled_at: string; language: string; is_test_session: boolean };

export function TestSessionModal({ open, onClose, members, onCreated }: {
  open: boolean; onClose: () => void; members: Member[]; onCreated: () => void;
}) {
  const [userId, setUserId] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [language, setLanguage] = useState("en");
  const [start, setStart] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [booking, setBooking] = useState<TestBooking | null>(null);
  const request = useRef<{ key: string; id: string } | null>(null);
  const label = (id: string) => {
    const m = members.find(row => row.id === id);
    return m ? [m.nickname || m.user_name, m.email].filter(Boolean).join(" · ") || m.id : id;
  };
  useEffect(() => {
    if (!open) return;
    // datetime-local has no timezone: format explicitly as KST regardless of admin device timezone.
    setStart(new Date(Date.now() + 5 * 60_000 + 9 * 3_600_000).toISOString().slice(0, 16));
    setBooking(null); setError(""); request.current = null;
  }, [open]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !userId || !partnerId || !start) return;
    const scheduledAt = new Date(start + ":00+09:00").toISOString();
    const key = JSON.stringify([userId, partnerId, language, scheduledAt]);
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
    setBusy(true); setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc("admin_create_test_session", {
        p_user_id: userId, p_partner_id: partnerId, p_language: language,
        p_scheduled_at: scheduledAt, p_request_id: request.current.id,
      });
      if (rpcError) throw rpcError;
      if (!data?.success || !data.booking?.is_test_session) throw new Error("테스트 예약 생성 결과를 확인할 수 없습니다.");
      setBooking(data.booking); onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : (e as { message?: string })?.message || "테스트 세션 생성에 실패했습니다. 다시 시도해 주세요.");
    } finally { setBusy(false); }
  }
  const fieldClass = "w-full min-w-0 rounded-md border bg-background px-3 py-2 text-sm";
  const roomLink = booking ? `https://www.dayotalk.com/room?bookingId=${encodeURIComponent(booking.id)}` : "";
  return <Dialog open={open} onOpenChange={value => { if (!value && !busy) onClose(); }}>
    <DialogContent aria-describedby="test-session-description" className="max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto">
      <DialogHeader><DialogTitle>테스트 세션 생성</DialogTitle></DialogHeader>
      <p id="test-session-description" className="sr-only">관리자 전용 실제 대화방 QA 예약입니다. 이용권 차감과 보상은 없습니다.</p>
      {booking ? <div className="space-y-3 text-sm">
        <div className="flex items-center gap-2"><Badge>TEST</Badge> 테스트 세션이 생성되었습니다.</div>
        <dl className="grid gap-2 break-words">
          <div><dt className="text-muted-foreground">시작 시간 · 30분</dt><dd>{new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }).format(new Date(booking.scheduled_at))} KST</dd></div>
          <div><dt className="text-muted-foreground">유저</dt><dd>{label(booking.learner_id)}</dd></div>
          <div><dt className="text-muted-foreground">파트너</dt><dd>{label(booking.partner_user_id)}</dd></div>
          <div><dt className="text-muted-foreground">예약 / 세션 ID</dt><dd className="break-all font-mono text-xs">{booking.id}</dd></div>
        </dl>
        <p>각 참여자는 본인 계정으로 로그인해야 합니다. 시작 5분 전부터 입장할 수 있습니다. 관리자 계정으로는 참여자를 대신할 수 없습니다.</p>
        <div className="flex flex-wrap gap-2">
          <a className="rounded-md border px-3 py-2" href={roomLink} target="_blank" rel="noopener noreferrer">유저 룸 열기</a>
          <a className="rounded-md border px-3 py-2" href={roomLink} target="_blank" rel="noopener noreferrer">파트너 룸 열기</a>
        </div>
        <p className="text-xs text-muted-foreground">두 링크는 같은 예약으로 연결됩니다. 이용권·보상·매출 집계·예약 이메일에 포함되지 않습니다.</p>
        <Button onClick={onClose}>닫기</Button>
      </div> : <form onSubmit={create} className="space-y-3">
        <label className="block space-y-1 text-sm"><span>유저</span><select required className={fieldClass} value={userId} onChange={e => setUserId(e.target.value)}><option value="">유저 선택</option>{members.filter(m => ["user", "learner"].includes(m.role || "")).map(m => <option key={m.id} value={m.id}>{label(m.id)}</option>)}</select></label>
        <label className="block space-y-1 text-sm"><span>파트너</span><select required className={fieldClass} value={partnerId} onChange={e => setPartnerId(e.target.value)}><option value="">파트너 선택</option>{members.filter(m => m.role === "partner").map(m => <option key={m.id} value={m.id}>{label(m.id)}</option>)}</select></label>
        <label className="block space-y-1 text-sm"><span>세션 언어</span><select className={fieldClass} value={language} onChange={e => setLanguage(e.target.value)}><option value="en">영어</option><option value="es">스페인어</option><option value="fr">프랑스어</option><option value="ko">한국어</option></select></label>
        <label className="block space-y-1 text-sm"><span>시작 시간 (KST)</span><input className={fieldClass} required type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></label>
        <p className="text-xs text-muted-foreground">30분 고정 · 기존 25분 대화 + 5분 후속 활동<br />이용권 차감·파트너 보상·예약 이메일 없음</p>
        {error && <p role="alert" className="break-words text-sm text-red-700">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy || !userId || !partnerId || !start}>{busy ? "생성 중…" : "테스트 세션 생성"}</Button>
      </form>}
    </DialogContent>
  </Dialog>;
}
