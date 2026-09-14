"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type PartnerProfile = {
  id: string;
  user_id: string | null;
  nickname: string | null;
  user_name: string | null;
  email: string | null;
  role: string | null;
  visa_type: string | null;
  languages: string | null;
  bank_name: string | null;
  bank_account: string | null;
  account_holder: string | null;
  point_balance: number | null;
  created_at: string | null;
};

type Activity = {
  completed_count: number;
  avg_rating: number | null;
};

function dash(value: string | null | undefined) {
  const text = String(value || "").trim();
  return text || "미등록";
}

function partnerName(row: PartnerProfile) {
  return dash(row.nickname || row.user_name || row.email);
}

export function PartnerDetailModal({
  partner,
  open,
  onOpenChange,
  onSettled,
  onUpdated,
}: {
  partner: PartnerProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSettled?: (partnerId: string, nextBalance: number) => void;
  onUpdated?: (next: PartnerProfile) => void;
}) {
  const [activity, setActivity] = useState<Activity>({ completed_count: 0, avg_rating: null });
  const [logs, setLogs] = useState<{ id: string; points_settled: number; created_at: string; note: string | null }[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const points = Number(partner?.point_balance || 0);

  useEffect(() => {
    if (!open || !partner) return;
    let cancelled = false;
    setMessage("");

    async function load() {
      const uid = partner.user_id || partner.id;
      const rpc = await supabase.rpc("admin_partner_activity", { p_partner_user_id: uid });
      if (!cancelled && !rpc.error && rpc.data) {
        const data = rpc.data as Activity;
        setActivity({
          completed_count: Number(data.completed_count || 0),
          avg_rating: data.avg_rating == null ? null : Number(data.avg_rating),
        });
      } else if (!rpc.error) {
        /* keep defaults */
      } else {
        const { count } = await supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("status", "completed")
          .eq("partner_user_id", uid);
        if (!cancelled) {
          setActivity({ completed_count: count || 0, avg_rating: null });
        }
      }

      const { data: ledger } = await supabase
        .from("settlement_logs")
        .select("id, points_settled, created_at, note")
        .or(`partner_user_id.eq.${uid},partner_profile_id.eq.${partner.id}`)
        .order("created_at", { ascending: false })
        .limit(8);
      if (!cancelled) setLogs((ledger || []) as typeof logs);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [open, partner]);

  async function updateRole(nextRole: "user" | "partner") {
    if (!partner) return;
    const label = nextRole === "user" ? "일반 유저로 강등" : "파트너 승인 완료";
    const ok = window.confirm(`${partnerName(partner)} 님을 ${label} 처리할까요?`);
    if (!ok) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.from("profiles").update({ role: nextRole }).eq("id", partner.id);
    setBusy(false);
    if (error) {
      setMessage(error.message || "권한 변경에 실패했습니다.");
      return;
    }
    const next = { ...partner, role: nextRole };
    onUpdated?.(next);
    setMessage(nextRole === "user" ? "일반 유저로 강등되었습니다." : "파트너 승인이 완료되었습니다.");
  }

  async function settle() {
    if (!partner) return;
    const ok = window.confirm("해당 파트너에게 포인트 정산 입금을 완료 처리하시겠습니까?");
    if (!ok) return;
    setBusy(true);
    setMessage("");
    const uid = partner.user_id || partner.id;
    const rpc = await supabase.rpc("settle_partner_payout", { p_partner_user_id: uid });
    const rpcData = rpc.data as { success?: boolean; message?: string } | null;
    if (!rpc.error && rpcData?.success) {
      setBusy(false);
      setMessage(rpcData.message || "정산 입금이 완료 처리되었습니다. 보유 포인트가 0으로 초기화되었습니다.");
      onSettled?.(partner.id, 0);
      return;
    }

    const fallbackAmount = points;
    const { error: logErr } = await supabase.from("settlement_logs").insert({
      partner_user_id: uid,
      partner_profile_id: partner.id,
      points_settled: fallbackAmount,
      amount_krw: fallbackAmount,
      note: "10일 정산 입금 완료",
    });
    const { error: updErr } = await supabase.from("profiles").update({ point_balance: 0 }).eq("id", partner.id);
    setBusy(false);
    if (logErr || updErr) {
      setMessage((rpc.error || logErr || updErr)?.message || "정산 처리에 실패했습니다.");
      return;
    }
    setMessage("정산 입금이 완료 처리되었습니다. 보유 포인트가 0으로 초기화되었습니다.");
    onSettled?.(partner.id, 0);
  }

  const bankLine = [partner?.bank_name, partner?.account_holder, partner?.bank_account]
    .filter((part) => String(part || "").trim())
    .join(" · ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent id="partner-detail-modal" className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{partner ? partnerName(partner) : "파트너 상세"}</DialogTitle>
        </DialogHeader>
        {partner && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">파트너 기본 정보</CardTitle></CardHeader>
              <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
                <p><span className="text-muted-foreground">닉네임</span><br />{partnerName(partner)}</p>
                <p><span className="text-muted-foreground">이메일</span><br />{dash(partner.email)}</p>
                <p><span className="text-muted-foreground">권한 상태</span><br />{dash(partner.role)}</p>
                <p><span className="text-muted-foreground">담당 언어</span><br />{dash(partner.languages)}</p>
                <p><span className="text-muted-foreground">비자 유형</span><br />{dash(partner.visa_type)}</p>
                <p className="sm:col-span-2">
                  <span className="text-muted-foreground">가입일</span><br />
                  {partner.created_at ? formatDate(partner.created_at) : "미등록"}
                </p>
              </CardContent>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">누적 완료 세션</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold">{activity.completed_count}회</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">평균 평점</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {activity.avg_rating == null ? "—" : `⭐ ${activity.avg_rating.toFixed(2)}`}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">적립 및 정산 현황</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid gap-3 sm:grid-cols-2">
                  <p>
                    <span className="text-muted-foreground">현재 보유 포인트</span><br />
                    <strong>{`${points || 0} P`}</strong>
                    <span className="text-muted-foreground"> (1P = 1원)</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">지급 대기 정산액</span><br />
                    <strong className="text-coral">{formatCurrency(points)}</strong>
                  </p>
                </div>
                <p>
                  <span className="text-muted-foreground">정산 계좌</span><br />
                  {bankLine || "미등록"}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled={busy || partner.role === "user"} onClick={() => updateRole("user")}>
                    일반 유저로 강등
                  </Button>
                  <Button variant="outline" disabled={busy || partner.role === "partner"} onClick={() => updateRole("partner")}>
                    파트너 승인 완료
                  </Button>
                  <Button variant="coral" disabled={busy || points <= 0} onClick={settle}>
                    포인트 수동 정산/지급 완료 처리
                  </Button>
                </div>
                {message && <p className="text-sm text-emerald-700">{message}</p>}
                {logs.length > 0 && (
                  <div className="border-t pt-3">
                    <p className="mb-2 text-xs font-semibold text-muted-foreground">최근 정산 기록</p>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {logs.map((log) => (
                        <li key={log.id}>
                          {formatDate(log.created_at)} · {Number(log.points_settled || 0).toLocaleString("ko-KR")}P
                          {log.note ? ` · ${log.note}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export { partnerName };
