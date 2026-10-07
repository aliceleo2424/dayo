"use client";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { fetchPartnerPayoutAudit, recordPartnerPayout, PAYOUT_METHODS, payoutPaidAtIso,
  payoutSourceLabel, payoutStatusLabel, type PayoutAudit, type PayoutMethod,
  type RecordPayoutInput, type RecordPayoutResult } from "@/lib/partner-payouts";

export function PartnerPayoutDialog({ partnerId, onClose, onRecorded }: {
  partnerId: string | null; onClose: () => void;
  onRecorded: (result: RecordPayoutResult) => void;
}) {
  const [audit, setAudit] = useState<PayoutAudit | null>(null);
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [amount, setAmount] = useState(""), [method, setMethod] = useState<PayoutMethod>("bank_transfer");
  const [destination, setDestination] = useState(""), [paidAt, setPaidAt] = useState("");
  const [reference, setReference] = useState(""), [note, setNote] = useState("");
  const [locked, setLocked] = useState(false), [saved, setSaved] = useState(false), [refresh, setRefresh] = useState(0);
  const epoch = useRef(0), inFlight = useRef(false), payload = useRef<RecordPayoutInput | null>(null);
  const requestId = useRef("");

  useEffect(() => {
    const generation = ++epoch.current;
    setAudit(null); setError(""); setNotice(""); setSaved(false); setLocked(false);
    setAmount(""); setMethod("bank_transfer"); setDestination(""); setPaidAt(""); setReference(""); setNote("");
    payload.current = null; requestId.current = crypto.randomUUID();
    if (!partnerId) return;
    setLoading(true);
    void fetchPartnerPayoutAudit(partnerId).then(value => {
      if (epoch.current !== generation) return;
      setAudit(value); setAmount(String(value.summary.amount));
    }).catch(err => { if (epoch.current === generation) setError(err instanceof Error ? err.message : "정산 조회 실패"); })
      .finally(() => { if (epoch.current === generation) setLoading(false); });
    return () => { epoch.current += 1; };
  }, [partnerId, refresh]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!partnerId || !audit || !audit.summary.can_record || saved || inFlight.current) return;
    const generation = epoch.current;
    setError(""); setNotice("");
    try {
      if (!payload.current) {
        const actualAmount = Number(amount);
        if (!Number.isSafeInteger(actualAmount) || actualAmount !== audit.summary.amount || actualAmount <= 0)
          throw new Error("실제 지급액이 미지급 보상 합계와 일치해야 합니다. 부분 지급은 이 화면에서 기록하지 않습니다.");
        payload.current = { partnerId, amount: actualAmount, method, destination, paidAt: payoutPaidAtIso(paidAt),
          bookingIds: audit.unpaid_items.map(item => item.booking_id), requestId: requestId.current, reference, note };
      }
      inFlight.current = true; setBusy(true); setLocked(true);
      const result = await recordPartnerPayout(payload.current);
      if (epoch.current !== generation) return;
      setSaved(true); setNotice(result.already_recorded ? "기존 지급 기록을 확인했습니다." : "지급 완료 기록을 저장했습니다.");
      onRecorded(result);
      try { const next = await fetchPartnerPayoutAudit(partnerId); if (epoch.current === generation) setAudit(next); }
      catch { if (epoch.current === generation) setError("저장은 완료됐지만 이력을 새로 불러오지 못했습니다. 새로고침해 주세요."); }
    } catch (err) {
      if (epoch.current === generation) setError(err instanceof Error ? err.message : "지급 기록 저장 실패");
    } finally { inFlight.current = false; setBusy(false); }
  }
  const enabled = !!audit?.summary.can_record && !loading && !busy && !saved;
  const fieldsDisabled = !enabled || locked;
  const time = (value: string) => new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) + " KST";
  return <Dialog open={!!partnerId} onOpenChange={open => { if (!open && !inFlight.current) onClose(); }}>
    <DialogContent className="max-h-[90vh] w-[calc(100%-24px)] max-w-2xl overflow-y-auto rounded-lg">
      <DialogHeader><DialogTitle>파트너 지급 기록</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">실제 송금을 완료한 뒤 기록해 주세요. 이 화면에서 송금하지 않습니다.</p>
      {loading ? <p role="status">정산 근거를 불러오는 중…</p> : null}
      {error ? <p role="alert" className="break-words text-sm text-red-600">{error}</p> : null}
      {notice ? <p role="status" className="text-sm text-green-700">{notice}</p> : null}
      {audit ? <>
        <section className="rounded-lg border bg-muted/30 p-3 text-sm">
          <h3 className="font-semibold">{audit.summary.partner_name}</h3>
          <p>최종 지급액: <strong>{formatCurrency(audit.summary.amount)}</strong> · {payoutStatusLabel(audit.summary.status)}</p>
          <p>미지급 완료 세션 {audit.summary.session_count}회 (기존 기록 {audit.summary.legacy_count}회 포함)</p>
          <p>유저 지연 취소 보상 {audit.summary.cancellation_count}건 · 관리자 승인 보상 {audit.summary.compensation_count}건</p>
          <p>보상 합계 {formatCurrency(audit.summary.gross_amount)} − 이미 적용된 패널티 상계 {formatCurrency(audit.summary.offset_amount)}</p>
          {audit.summary.status === "needs_review" ? <p className="mt-2 text-red-600">포인트 잔액과 보상 근거가 일치하지 않습니다. 지급 기록 전에 기존 데이터를 확인해 주세요.</p> : null}
          <details className="mt-2"><summary>포함될 보상 근거 {audit.unpaid_items.length}건</summary>
            <ul className="mt-2 space-y-2">{audit.unpaid_items.map(item => <li key={item.booking_id} className="break-all">
              {payoutSourceLabel(item.source_type)} · {formatCurrency(item.net_amount)}<br/>예약 ID: {item.booking_id}
              {item.offset_amount > 0 ? <span className="block">기존 상계: {formatCurrency(item.offset_amount)}</span> : null}
            </li>)}</ul>
          </details>
        </section>
        <form onSubmit={event => void save(event)} className="grid gap-3">
          <label className="grid gap-1 text-sm">실제 지급액 (KRW)<input required type="number" min="1" step="1" value={amount} onChange={e => setAmount(e.target.value)} disabled={fieldsDisabled} className="min-w-0 rounded-md border p-2"/></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">지급 방법<select value={method} disabled={fieldsDisabled} onChange={e => {
              const next = e.target.value as PayoutMethod; setMethod(next); setDestination(next === "cash" ? "현금 지급" : "");
            }} className="rounded-md border p-2">{PAYOUT_METHODS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label className="grid gap-1 text-sm">실제 지급 일시 (KST)<input required type="datetime-local" value={paidAt} onChange={e => setPaidAt(e.target.value)} disabled={fieldsDisabled} className="min-w-0 rounded-md border p-2"/></label>
          </div>
          <label className="grid gap-1 text-sm">지급 대상 표시<input required maxLength={160} value={destination} onChange={e => setDestination(e.target.value)} disabled={fieldsDisabled} placeholder="국민은행 ****1234 / PayPal c***@gmail.com / 현금 지급" className="min-w-0 rounded-md border p-2"/></label>
          <p className="text-xs text-muted-foreground">마스킹한 표시만 입력해 주세요. 전체 계좌번호나 이메일을 입력하지 마세요.</p>
          <label className="grid gap-1 text-sm">송금 참조 (선택)<input maxLength={200} value={reference} onChange={e => setReference(e.target.value)} disabled={fieldsDisabled} className="min-w-0 rounded-md border p-2"/></label>
          <label className="grid gap-1 text-sm">메모 (선택)<textarea maxLength={1000} value={note} onChange={e => setNote(e.target.value)} disabled={fieldsDisabled} className="min-w-0 rounded-md border p-2"/></label>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy || loading} onClick={() => setRefresh(v => v + 1)}>새로고침</Button>
            <Button type="submit" variant="coral" disabled={!enabled}>{busy ? "저장 중…" : "지급 완료 기록"}</Button>
          </div>
        </form>
        <section className="space-y-3"><h3 className="font-semibold">지급 이력</h3>
          {!audit.payouts.length ? <p className="text-sm text-muted-foreground">기록된 지급 내역이 없습니다.</p> : audit.payouts.map(payout => <article key={payout.id} className="rounded-lg border p-3 text-sm">
            <p className="font-semibold">지급완료 · {formatCurrency(payout.amount)} · {PAYOUT_METHODS.find(item => item.value === payout.payout_method)?.label}</p>
            <p className="break-all">{payout.payout_destination_label}</p><p>{time(payout.paid_at)}</p>
            <p>처리자: {payout.processed_by_name} · {payout.processed_by}</p>
            {payout.payout_reference ? <p className="break-all">참조: {payout.payout_reference}</p> : null}
            {payout.note ? <p className="whitespace-pre-wrap break-words">메모: {payout.note}</p> : null}
            <details className="mt-2"><summary>지급 ID / 포함 보상 {payout.items.length}건</summary><p className="break-all">{payout.id}</p>
              <ul className="space-y-1">{payout.items.map(item => <li key={item.booking_id} className="break-all">{payoutSourceLabel(item.source_type)} · {formatCurrency(item.net_amount)} · {item.booking_id}</li>)}</ul>
            </details>
          </article>)}
        </section>
      </> : !loading ? <Button variant="outline" onClick={() => setRefresh(v => v + 1)}>다시 불러오기</Button> : null}
    </DialogContent>
  </Dialog>;
}
