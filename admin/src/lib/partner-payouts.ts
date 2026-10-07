import { supabase } from "@/lib/supabase";

export const PAYOUT_METHODS = [
  { value: "bank_transfer", label: "계좌이체" }, { value: "cash", label: "현금" },
  { value: "paypal", label: "PayPal" }, { value: "wise", label: "Wise" }, { value: "other", label: "기타" },
] as const;
export type PayoutMethod = typeof PAYOUT_METHODS[number]["value"];
export type PayoutSummary = {
  partner_user_id: string; partner_name: string; point_balance: number; amount: number; gross_amount: number;
  offset_amount: number; total_offset_amount: number; source_count: number; session_count: number; legacy_count: number;
  cancellation_count: number; compensation_count: number; paid_total: number; payout_count: number;
  last_paid_at: string | null; can_record: boolean; status: "unpaid" | "paid" | "no_rewards" | "needs_review";
};
export type PayoutItem = {
  booking_id: string; source_type: string; reward_booking_id: string | null; tech_report_id: string | null;
  gross_amount: number; offset_amount: number; net_amount: number; earned_at: string;
};
export type PartnerPayout = {
  id: string; partner_user_id: string; amount: number; currency: string; payout_method: PayoutMethod;
  payout_destination_label: string; payout_reference: string | null; note: string | null;
  paid_at: string; processed_by: string; processed_by_name: string; created_at: string; status: "paid"; items: PayoutItem[];
};
export type PayoutAudit = { summary: PayoutSummary; unpaid_items: PayoutItem[]; payouts: PartnerPayout[] };
export type RecordPayoutInput = {
  partnerId: string; amount: number; method: PayoutMethod; destination: string; paidAt: string;
  bookingIds: string[]; requestId: string; reference: string; note: string;
};
export type RecordPayoutResult = { success: true; already_recorded: boolean; payout_id: string; amount: number; updated_balance: number };
export function payoutStatusLabel(status: PayoutSummary["status"]) {
  return { unpaid: "대기", paid: "지급완료", no_rewards: "적립 없음", needs_review: "확인 필요" }[status];
}
export function payoutSourceLabel(source: string) {
  return { session_reward: "세션 보상", legacy_session_reward: "기존 완료 세션 보상",
    late_cancellation: "유저 지연 취소 보상", admin_compensation: "관리자 승인 보상" }[source] || source;
}
export function payoutPaidAtIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("실제 지급 일시(KST)를 입력해 주세요.");
  const date = new Date(value + ":00+09:00");
  if (!Number.isFinite(date.getTime())) throw new Error("올바른 지급 일시를 입력해 주세요.");
  return date.toISOString();
}
function summary(value: unknown): value is PayoutSummary {
  const v = value as PayoutSummary | null;
  return !!v && typeof v.partner_user_id === "string" && typeof v.partner_name === "string"
    && typeof v.can_record === "boolean" && Number.isSafeInteger(v.amount)
    && Number.isSafeInteger(v.paid_total) && ["unpaid","paid","no_rewards","needs_review"].includes(v.status);
}
export async function fetchPartnerPayoutSummaries(partnerId: string | null = null): Promise<PayoutSummary[]> {
  const { data, error } = await supabase.rpc("admin_get_partner_payout_summary", { p_partner_user_id: partnerId });
  if (error) throw new Error(error.message || "정산 현황을 불러오지 못했습니다.");
  if (!Array.isArray(data) || !data.every(summary)) throw new Error("정산 현황 응답을 확인하지 못했습니다.");
  return data;
}
export async function fetchPartnerPayoutAudit(partnerId: string): Promise<PayoutAudit> {
  const { data, error } = await supabase.rpc("admin_get_partner_payout_audit", { p_partner_user_id: partnerId });
  if (error) throw new Error(error.message || "정산 이력을 불러오지 못했습니다.");
  const audit = data as PayoutAudit | null;
  if (!audit || !summary(audit.summary) || audit.summary.partner_user_id !== partnerId
    || !Array.isArray(audit.unpaid_items) || !Array.isArray(audit.payouts)) throw new Error("정확한 파트너 정산 응답을 확인하지 못했습니다.");
  return audit;
}
export async function recordPartnerPayout(input: RecordPayoutInput): Promise<RecordPayoutResult> {
  const { data, error } = await supabase.rpc("admin_record_partner_payout", {
    p_partner_user_id: input.partnerId, p_amount: input.amount, p_payout_method: input.method,
    p_payout_destination_label: input.destination.trim(), p_paid_at: input.paidAt,
    p_expected_booking_ids: input.bookingIds, p_request_id: input.requestId,
    p_payout_reference: input.reference.trim() || null, p_note: input.note.trim() || null,
  });
  if (error) throw new Error(error.message || "지급 기록을 저장하지 못했습니다.");
  const result = data as RecordPayoutResult | null;
  if (!result?.success || result.payout_id !== input.requestId || result.amount !== input.amount || typeof result.already_recorded !== "boolean" || !Number.isSafeInteger(result.updated_balance))
    throw new Error("지급 기록 저장 결과를 확인하지 못했습니다. 새로고침 후 이력을 확인해 주세요.");
  return result;
}
