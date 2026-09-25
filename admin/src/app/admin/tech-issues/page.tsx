"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminHeader } from "@/components/admin/header";
import { supabase } from "@/lib/supabase";
import { formatDateTime } from "@/lib/utils";

type Evidence = {
  learner_room_entered?: number;
  partner_room_entered?: number;
  learner_media_connected?: number;
  partner_media_connected?: number;
};

type TechReport = {
  id: string;
  booking_id: string;
  reporter_role: string;
  issue_type: string;
  detail: string | null;
  reported_at: string;
  scheduled_at: string;
  decision: string;
  user_refund_decision: boolean | null;
  partner_reward_decision: boolean | null;
  resolution_reason: string | null;
  evidence: Evidence | null;
};

type Booking = {
  id: string;
  learner_id: string;
  partner_user_id: string | null;
  status: string;
  end_reason: string | null;
  ticket_refunded: boolean;
  partner_rewarded: boolean;
};

type Profile = { id: string; nickname: string | null; user_name: string | null; email: string | null };

const issueLabels: Record<string, string> = {
  cannot_hear_partner: "상대방 소리가 들리지 않음",
  partner_cannot_hear_me: "내 소리가 상대방에게 전달되지 않음",
  cannot_see_partner: "상대방 화면이 보이지 않음",
  partner_cannot_see_me: "내 화면이 상대방에게 보이지 않음",
  connection_unstable: "연결이 계속 끊김",
  counterpart_absent: "상대방 미입장 신고",
  other: "기타",
};

function personLabel(id: string | null | undefined, profiles: Map<string, Profile>) {
  if (!id) return "미지정";
  const profile = profiles.get(id);
  return String(profile?.nickname || profile?.user_name || profile?.email || id).trim();
}

export default function TechIssuesPage() {
  const [reports, setReports] = useState<TechReport[]>([]);
  const [bookings, setBookings] = useState<Map<string, Booking>>(new Map());
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [refundUser, setRefundUser] = useState(false);
  const [rewardPartner, setRewardPartner] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const reportResult = await supabase
      .from("session_tech_issue_reports")
      .select("id,booking_id,reporter_role,issue_type,detail,reported_at,scheduled_at,decision,user_refund_decision,partner_reward_decision,resolution_reason,evidence")
      .order("reported_at", { ascending: false })
      .limit(100);
    if (reportResult.error) {
      setError(`신고를 불러오지 못했습니다: ${reportResult.error.message}`);
      setReports([]);
      setLoading(false);
      return;
    }
    const rows = (reportResult.data || []) as TechReport[];
    const bookingIds = Array.from(new Set(rows.map((row) => row.booking_id)));
    const bookingResult = bookingIds.length
      ? await supabase.from("bookings")
          .select("id,learner_id,partner_user_id,status,end_reason,ticket_refunded,partner_rewarded")
          .in("id", bookingIds)
      : null;
    if (bookingResult?.error) {
      setError(`예약을 불러오지 못했습니다: ${bookingResult.error.message}`);
      setLoading(false);
      return;
    }
    const bookingRows = (bookingResult?.data || []) as Booking[];
    const userIds = Array.from(new Set(bookingRows.flatMap((row) =>
      [row.learner_id, row.partner_user_id].filter((id): id is string => !!id))));
    const profileResult = userIds.length
      ? await supabase.from("profiles").select("id,nickname,user_name,email").in("id", userIds)
      : null;
    if (profileResult?.error) {
      setError(`참가자 정보를 불러오지 못했습니다: ${profileResult.error.message}`);
      setLoading(false);
      return;
    }
    setError("");
    setReports(rows);
    setBookings(new Map(bookingRows.map((row) => [row.id, row])));
    setProfiles(new Map(((profileResult?.data || []) as Profile[]).map((row) => [row.id, row])));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function resolve(report: TechReport) {
    const trimmed = reason.trim();
    if (!trimmed || trimmed.length > 1000 || submitting) {
      setError("판정 사유를 1~1,000자로 입력해 주세요.");
      return;
    }
    const summary = `사용자 티켓 반환: ${refundUser ? "예" : "아니요"}\n파트너 6,000P 지급: ${rewardPartner ? "예" : "아니요"}`;
    if (!window.confirm(`${summary}\n\n이 판정을 확정할까요? 같은 예약의 모든 신고에 적용됩니다.`)) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await supabase.rpc("resolve_tech_issue_report", {
        p_report_id: report.id,
        p_refund_user: refundUser,
        p_reward_partner: rewardPartner,
        p_resolution_reason: trimmed,
      });
      if (result.error || !result.data?.success) {
        throw new Error(result.error?.message || result.data?.code || "판정에 실패했습니다.");
      }
      setSelectedId("");
      setRefundUser(false);
      setRewardPartner(false);
      setReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "판정에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  const pendingCount = reports.filter((row) => row.decision === "manual_review").length;

  return (
    <>
      <AdminHeader title="기술문제 신고 검토" />
      <main className="space-y-5 p-6">
        <p className="text-sm text-slate-600">
          검토 중 신고 {pendingCount}건 · 최근 100건 표시. 입장·연결 이벤트는 참고 기록이며 실패 원인이나 귀책을 증명하지 않습니다.
        </p>
        {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {loading && <p className="text-sm text-slate-500">신고를 불러오는 중입니다.</p>}
        {!loading && reports.length === 0 && <p className="rounded-lg border p-5 text-sm">기술문제 신고가 없습니다.</p>}
        {reports.map((report) => {
          const booking = bookings.get(report.booking_id);
          const evidence = report.evidence || {};
          const reviewing = selectedId === report.id && report.decision === "manual_review";
          return (
            <section key={report.id} className="space-y-3 rounded-xl border bg-white p-5 text-sm shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{issueLabels[report.issue_type] || report.issue_type}</strong>
                <span>{report.decision === "manual_review" ? "확인 중" : "처리 완료"}</span>
              </div>
              <p>신고: {formatDateTime(report.reported_at)} · 예약: {formatDateTime(report.scheduled_at)}</p>
              <p>예약 ID: {report.booking_id}</p>
              <p>유저: {personLabel(booking?.learner_id, profiles)} · 파트너: {personLabel(booking?.partner_user_id, profiles)}</p>
              <p>신고자: {report.reporter_role === "partner" ? "파트너" : "유저"}</p>
              <p>내용: {report.detail || "추가 내용 없음"}</p>
              <p>입장 기록 유저/파트너: {Number(evidence.learner_room_entered || 0)} / {Number(evidence.partner_room_entered || 0)}</p>
              <p>상대 미디어 수신 이벤트 유저/파트너: {Number(evidence.learner_media_connected || 0)} / {Number(evidence.partner_media_connected || 0)}</p>
              <p>현재 상태: {booking?.status || "확인 불가"} · {booking?.end_reason || "—"}</p>
              <p>티켓 반환: {booking?.ticket_refunded ? "완료" : "미반환"} · 파트너 보상: {booking?.partner_rewarded ? "지급" : "미지급"}</p>
              {report.decision !== "manual_review" && (
                <p>판정: 티켓 {report.user_refund_decision ? "반환" : "미반환"} / 파트너 {report.partner_reward_decision ? "6,000P 지급" : "미지급"} · 사유: {report.resolution_reason || "—"}</p>
              )}
              {report.decision === "manual_review" && !reviewing && (
                <button type="button" className="rounded-lg border px-4 py-2" onClick={() => {
                  setSelectedId(report.id); setRefundUser(false); setRewardPartner(false); setReason("");
                }}>검토하기</button>
              )}
              {reviewing && (
                <div className="space-y-3 rounded-lg bg-slate-50 p-4">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={refundUser} onChange={(event) => setRefundUser(event.target.checked)} />
                    사용자 티켓 반환 (원래 lot·유효기간)
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={rewardPartner} onChange={(event) => setRewardPartner(event.target.checked)} />
                    파트너 6,000P 지급
                  </label>
                  <label className="block font-semibold" htmlFor={`resolution-${report.id}`}>판정 사유 (필수)</label>
                  <textarea id={`resolution-${report.id}`} value={reason} maxLength={1000}
                    onChange={(event) => setReason(event.target.value)}
                    className="min-h-24 w-full rounded-lg border p-2" />
                  <button type="button" disabled={submitting || !reason.trim()}
                    className="rounded-lg bg-navy px-4 py-2 font-semibold text-white disabled:opacity-50"
                    onClick={() => void resolve(report)}>{submitting ? "처리 중…" : "처리 확정"}</button>
                </div>
              )}
            </section>
          );
        })}
      </main>
    </>
  );
}
