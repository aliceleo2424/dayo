import { supabase } from "@/lib/supabase";

export function adminProfiles(options?: { count?: "exact"; head?: boolean }) {
  return supabase.rpc("admin_list_profiles", {}, options);
}

export type AuthProvider = "kakao" | "google" | "email" | "unknown";

export type CrmMember = {
  id: string;
  user_id: string | null;
  nickname: string | null;
  user_name: string | null;
  email: string | null;
  role: string | null;
  ticket_count: number;
  point_balance: number;
  last_test_score: number | null;
  speaking_level: string | null;
  last_test_date: string | null;
  created_at: string | null;
  provider: AuthProvider;
  avatar_url: string | null;
  client_key: string | null;
  admin_memo: string | null;
  kakao_id: string | null;
  name: string;
  paymentStatus: "paid" | "unpaid";
  totalSpent: number;
};

type ProfileRecord = {
  id?: string;
  user_id?: string | null;
  nickname?: string | null;
  user_name?: string | null;
  email?: string | null;
  role?: string | null;
  ticket_count?: number | null;
  point_balance?: number | null;
  last_test_score?: number | null;
  speaking_level?: string | null;
  last_test_date?: string | null;
  created_at?: string | null;
  provider?: string | null;
  avatar_url?: string | null;
  client_key?: string | null;
  admin_memo?: string | null;
  kakao_id?: string | null;
};

export type MemberIdentity = {
  id?: string | null;
  nickname?: string | null;
  user_name?: string | null;
  email?: string | null;
  provider?: string | null;
  kakao_id?: string | null;
  avatar_url?: string | null;
  client_key?: string | null;
};

export function detectMemberProvider(row: MemberIdentity): AuthProvider {
  const provider = String(row.provider || "").trim().toLowerCase();
  if (provider === "kakao") return "kakao";
  if (provider === "google") return "google";
  if (provider === "email") return "email";
  return "unknown";
}

export function profileDisplayName(row: MemberIdentity) {
  const nick = String(row.nickname || row.user_name || "").trim();
  if (nick) return nick;
  if (detectMemberProvider(row) === "kakao") {
    const shortId = String(row.id || "").slice(0, 5) || "?????";
    return `카카오 회원 (${shortId})`;
  }
  return String(row.email || "미등록").trim() || "미등록";
}

/** Normalize profiles.learning_languages into a display tag like "🇺🇸 영어". */
export function formatLearningLanguageLabel(raw: string | null | undefined): string {
  const text = String(raw || "")
    .trim()
    .replace(/^\[|\]$/g, "")
    .replace(/^"|"$/g, "")
    .trim();
  if (!text) return "";

  const lower = text.toLowerCase();
  if (/\b(us|en|english|영어)\b/i.test(text) || lower === "en" || lower === "us") return "🇺🇸 영어";
  if (/\b(es|spanish|스페인어)\b/i.test(text) || lower === "es") return "🇪🇸 스페인어";
  if (/\b(fr|french|프랑스어)\b/i.test(text) || lower === "fr") return "🇫🇷 프랑스어";
  if (/\b(kr|ko|korean|한국어)\b/i.test(text) || lower === "kr" || lower === "ko") return "🇰🇷 한국어";
  return text;
}

function mapProfile(row: ProfileRecord, spentByUser: Map<string, number>): CrmMember {
  const id = String(row.id || "");
  const userId = row.user_id ? String(row.user_id) : null;
  const spent = (userId && spentByUser.get(userId)) || spentByUser.get(id) || 0;
  const provider = detectMemberProvider(row);
  return {
    id,
    user_id: userId,
    nickname: row.nickname || null,
    user_name: row.user_name || null,
    email: row.email || null,
    role: normalizeCrmRole(row.role),
    ticket_count: Number(row.ticket_count || 0),
    point_balance: Number(row.point_balance || 0),
    last_test_score: row.last_test_score == null ? null : Number(row.last_test_score),
    speaking_level: row.speaking_level || null,
    last_test_date: row.last_test_date || null,
    created_at: row.created_at || null,
    provider,
    avatar_url: row.avatar_url || null,
    client_key: row.client_key || null,
    admin_memo: row.admin_memo || null,
    kakao_id: row.kakao_id || null,
    name: profileDisplayName({ ...row, id }),
    paymentStatus: spent > 0 ? "paid" : "unpaid",
    totalSpent: spent,
  };
}

export async function fetchPaidSpendByUser() {
  const spent = new Map<string, number>();
  const orders = await supabase.from("orders").select("user_id, amount, status").eq("status", "paid");
  if (orders.error) return spent;
  for (const row of (orders.data || []) as { user_id?: string; amount?: number }[]) {
    const uid = String(row.user_id || "");
    if (!uid) continue;
    spent.set(uid, (spent.get(uid) || 0) + Number(row.amount || 0));
  }
  return spent;
}

export async function fetchCrmMembers(): Promise<{ rows: CrmMember[]; error: string }> {
  try {
    const selects = [
      "id, user_id, nickname, user_name, email, role, ticket_count, point_balance, last_test_score, speaking_level, last_test_date, created_at, provider, avatar_url, client_key, admin_memo, kakao_id",
      "id, user_id, nickname, user_name, email, role, ticket_count, point_balance, last_test_score, speaking_level, last_test_date, created_at, provider, avatar_url, client_key",
      "id, user_id, nickname, user_name, email, role, ticket_count, point_balance, last_test_score, speaking_level, last_test_date, created_at, provider, avatar_url",
      "id, user_id, nickname, user_name, email, role, ticket_count, point_balance, created_at, provider, avatar_url",
      "id, user_id, nickname, user_name, email, role, ticket_count, point_balance, created_at",
      "id, user_id, nickname, user_name, email, role, point_balance, created_at",
      "id, nickname, user_name, email, role, created_at",
    ];

    let data: ProfileRecord[] | null = null;
    let lastError = "";
    for (const columns of selects) {
      const result = await adminProfiles().select(columns).order("created_at", { ascending: false });
      if (!result.error) {
        data = (result.data || []) as unknown as ProfileRecord[];
        lastError = "";
        break;
      }
      lastError = result.error.message;
    }

    if (!data) {
      return { rows: [], error: lastError || "profiles를 읽을 수 없습니다." };
    }

    const spent = await fetchPaidSpendByUser();
    return { rows: data.map((row) => mapProfile(row, spent)), error: "" };
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : "회원 목록을 불러오지 못했습니다." };
  }
}

export async function fetchCrmMember(id: string): Promise<{ row: CrmMember | null; error: string }> {
  const selects = [
    "id, user_id, nickname, user_name, email, role, ticket_count, point_balance, last_test_score, speaking_level, last_test_date, created_at, provider, avatar_url, client_key, admin_memo, kakao_id",
    "id, user_id, nickname, user_name, email, role, ticket_count, point_balance, last_test_score, speaking_level, last_test_date, created_at, provider, avatar_url, client_key",
    "id, user_id, nickname, user_name, email, role, ticket_count, point_balance, last_test_score, speaking_level, last_test_date, created_at, provider, avatar_url",
    "id, user_id, nickname, user_name, email, role, ticket_count, point_balance, created_at, provider, avatar_url",
    "id, user_id, nickname, user_name, email, role, ticket_count, point_balance, created_at",
    "id, user_id, nickname, user_name, email, role, point_balance, created_at",
  ];

  let record: ProfileRecord | null = null;
  let lastError = "";
  for (const columns of selects) {
    const byPk = await adminProfiles().select(columns).eq("id", id).maybeSingle();
    if (!byPk.error) {
      record = (byPk.data || null) as unknown as ProfileRecord | null;
      lastError = "";
      break;
    }
    lastError = byPk.error.message;
  }

  if (!record) {
    for (const columns of selects) {
      const byAuth = await adminProfiles().select(columns).eq("user_id", id).maybeSingle();
      if (!byAuth.error) {
        record = (byAuth.data || null) as unknown as ProfileRecord | null;
        lastError = "";
        break;
      }
      lastError = byAuth.error.message;
    }
  }

  if (!record) {
    return { row: null, error: lastError };
  }

  const spent = await fetchPaidSpendByUser();
  return { row: mapProfile(record, spent), error: "" };
}

export type DashboardKpis = {
  memberCount: number;
  partnerCount: number;
  completedSessions: number;
  paidAmount: number;
};

export type BookingRow = {
  is_test_session: boolean;
  id: string;
  learner_id: string | null;
  partner_user_id: string | null;
  partner_name: string | null;
  language: string | null;
  scheduled_at: string | null;
  status: string | null;
  learner_nickname: string;
  partner_nickname: string;
  room_url: string;
};

function roomUrl(bookingId: string) {
  const short = String(bookingId || "").replace(/-/g, "").slice(0, 12) || "studio";
  return `https://dayo-live.daily.co/dayo-${short}`;
}

export async function fetchDashboardKpis(): Promise<DashboardKpis> {
  const [members, partners, sessions, orders] = await Promise.all([
    adminProfiles({ count: "exact", head: true }).select("id"),
    adminProfiles({ count: "exact", head: true }).select("id").eq("role", "partner"),
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "completed").eq("is_test_session", false),
    supabase.from("orders").select("amount").eq("status", "paid"),
  ]);

  const paidAmount = orders.error
    ? 0
    : (orders.data || []).reduce((sum, row) => sum + Number((row as { amount?: number }).amount || 0), 0);

  return {
    memberCount: members.error ? 0 : members.count || 0,
    partnerCount: partners.error ? 0 : partners.count || 0,
    completedSessions: sessions.error ? 0 : sessions.count || 0,
    paidAmount,
  };
}

export async function fetchPartnerProfiles() {
  const selects = [
    "id, user_id, nickname, user_name, email, role, partner_status, nationality, visa_type, languages, bank_name, bank_account, account_holder, identity_number_masked, id_document_url, bank_document_url, point_balance, created_at",
    "id, user_id, nickname, user_name, email, role, partner_status, visa_type, languages, bank_name, bank_account, account_holder, point_balance, created_at",
    "id, user_id, nickname, user_name, email, role, visa_type, languages, bank_name, bank_account, account_holder, point_balance, created_at",
    "id, user_id, nickname, user_name, email, role, point_balance, created_at",
  ];

  let last = await adminProfiles()
    .select(selects[selects.length - 1])
    .in("role", ["partner", "admin"])
    .order("created_at", { ascending: false });

  for (const columns of selects) {
    const result = await adminProfiles()
      .select(columns)
      .in("role", ["partner", "admin"])
      .order("created_at", { ascending: false });
    last = result;
    if (!result.error) return result;
  }
  return last;
}

type BookingRecord = {
  is_test_session?: boolean;
  id?: string;
  learner_id?: string | null;
  partner_user_id?: string | null;
  partner_id?: string | null;
  partner_name?: string | null;
  language?: string | null;
  scheduled_at?: string | null;
  status?: string | null;
};

export async function fetchBookings(): Promise<{ rows: BookingRow[]; error: string }> {
  const selects = [
    "id, learner_id, partner_user_id, partner_name, language, scheduled_at, status, is_test_session",
    "id, learner_id, partner_id, partner_name, language, scheduled_at, status, is_test_session",
    "id, learner_id, partner_name, scheduled_at, status, is_test_session",
    "*",
  ];

  let result: { data: BookingRecord[] | null; error: { message: string } | null } = { data: null, error: { message: "bookings 조회 실패" } };
  for (const columns of selects) {
    const query = supabase.from("bookings").select(columns);
    const ordered = columns === "*"
      ? await query.order("created_at", { ascending: false })
      : await query.order("scheduled_at", { ascending: true });
    result = ordered as unknown as typeof result;
    if (!result.error) break;
  }

  if (result.error) {
    return { rows: [], error: "" };
  }

  const raw = (result.data || []).map((row) => ({
    id: String(row.id || ""),
    learner_id: row.learner_id || null,
    partner_user_id: row.partner_user_id || row.partner_id || null,
    partner_name: row.partner_name || null,
    is_test_session: row.is_test_session === true,
    language: row.language || null,
    scheduled_at: row.scheduled_at || null,
    status: row.status || null,
  }));
  const ids = Array.from(new Set(
    raw.flatMap((row) => [row.learner_id, row.partner_user_id]).filter((id): id is string => !!id)
  ));

  const names = new Map<string, string>();
  if (ids.length) {
    const profiles = await adminProfiles()
      .select("user_id, nickname, user_name, email")
      .in("user_id", ids);
    for (const profile of (profiles.data || []) as unknown as ProfileRecord[]) {
      const uid = String((profile as { user_id?: string }).user_id || "");
      const label = String(
        (profile as { nickname?: string }).nickname
        || (profile as { user_name?: string }).user_name
        || (profile as { email?: string }).email
        || ""
      ).trim();
      if (uid && label) names.set(uid, label);
    }
  }

  return {
    error: "",
    rows: raw.map((row) => ({
      ...row,
      learner_nickname: (row.learner_id && names.get(row.learner_id)) || "유저",
      partner_nickname: (row.partner_user_id && names.get(row.partner_user_id)) || row.partner_name || "파트너 미정",
      room_url: roomUrl(row.id),
    })),
  };
}

export function normalizeCrmRole(role: string | null | undefined) {
  return String(role || "user").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export type DrawerMember = {
  id: string;
  user_id?: string | null;
  nickname?: string | null;
  user_name?: string | null;
  email?: string | null;
  role?: string | null;
  ticket_count?: number | null;
  provider?: string | null;
  avatar_url?: string | null;
  client_key?: string | null;
  learning_languages?: string | null;
  created_at?: string | null;
  admin_memo?: string | null;
  kakao_id?: string | null;
};

export type MemberBookingSession = {
  id: string;
  scheduled_at: string | null;
  status: string | null;
  partner_name: string | null;
  learner_id?: string | null;
  rating: number | null;
  review: string | null;
};

export type SessionUtterance = {
  id: string;
  speaker: "learner" | "partner" | "unknown";
  text: string;
  timestamp: string | null;
};

export type SessionCorrection = {
  original: string;
  corrected: string;
  reason?: string;
};

export type SessionCsReport = {
  rating: number | null;
  review: string | null;
  wordHelpCount: number;
  wordHelpVocab: string[];
  corrections: SessionCorrection[];
  partnerStamp: string | null;
  partnerComment: string | null;
  hasReport: boolean;
  summary?: string | null;
  recap?: { userWordCount: number | null; userUtteranceCount: number | null; participationRatio: number | null; topics: string[]; expressions: string[] } | null;
};

export type SessionTranscriptContext = {
  id: string;
  scheduled_at?: string | null;
  status?: string | null;
  learnerName?: string;
  partnerName?: string;
  learnerId?: string | null;
  rating?: number | null;
  review?: string | null;
};

export async function fetchSessionDetailContext(bookingId: string): Promise<SessionTranscriptContext> {
  const bookingResult = await supabase.from("bookings").select("*").eq("id", bookingId).single();
  if (bookingResult.error || !bookingResult.data) {
    throw new Error(bookingResult.error?.message || "예약 정보를 불러오지 못했습니다.");
  }
  const booking = bookingResult.data as Record<string, unknown>;
  const learnerId = String(booking.learner_id || "");
  const partnerId = String(booking.partner_user_id || booking.partner_id || "");
  const ids = Array.from(new Set([learnerId, partnerId].filter(Boolean)));
  const names = new Map<string, string>();
  if (ids.length) {
    const byId = await adminProfiles().select("id, user_id, nickname, user_name").in("id", ids);
    if (!byId.error) {
      for (const profile of (byId.data || []) as unknown as ProfileRecord[]) {
        const name = String(profile.nickname || profile.user_name || "").trim();
        if (name) names.set(String(profile.id), name);
      }
    }
    const missing = ids.filter((id) => !names.has(id));
    if (missing.length) {
      const byUserId = await adminProfiles().select("id, user_id, nickname, user_name").in("user_id", missing);
      if (!byUserId.error) {
        for (const profile of (byUserId.data || []) as unknown as ProfileRecord[]) {
          const name = String(profile.nickname || profile.user_name || "").trim();
          if (profile.user_id && name) names.set(String(profile.user_id), name);
        }
      }
    }
  }
  return {
    id: bookingId,
    scheduled_at: typeof booking.scheduled_at === "string" ? booking.scheduled_at : null,
    status: typeof booking.status === "string" ? booking.status : null,
    learnerId: learnerId || null,
    learnerName: names.get(learnerId) || "유저",
    partnerName: names.get(partnerId) || String(booking.partner_name || "파트너 미정"),
    rating: booking.rating == null ? null : Number(booking.rating),
    review: String(booking.review || booking.feedback || booking.comment || booking.review_text || "").trim() || null,
  };
}

export type SessionTranscriptBundle = {
  utterances: SessionUtterance[];
  report: SessionCsReport;
  startedAt: string | null;
  endedAt: string | null;
};

export type MemberOrder = {
  id: string;
  created_at: string | null;
  product_name: string | null;
  amount: number;
  ticket_count: number | null;
  status: string | null;
  payment_method: string | null;
  refund_status: string | null;
  merchant_uid: string | null;
};

export type CreditLedgerRow = {
  id: string;
  created_at: string | null;
  delta: number;
  reason: string | null;
  source: string | null;
  balance_after: number | null;
};

export function bookingStatusLabel(status: string | null | undefined) {
  const raw = String(status || "").trim().toLowerCase();
  if (!raw || raw === "pending" || raw === "confirmed" || raw === "booked" || raw === "reserved") {
    return { label: "예약완료", variant: "default" as const };
  }
  if (raw === "in_progress" || raw === "ongoing" || raw === "live" || raw === "started") {
    return { label: "진행중", variant: "coral" as const };
  }
  if (raw === "completed" || raw === "done" || raw === "finished") {
    return { label: "정상완료", variant: "success" as const };
  }
  if (raw === "cancelled" || raw === "canceled") {
    return { label: "취소", variant: "warning" as const };
  }
  if (raw === "no_show" || raw === "noshow" || raw === "no-show") {
    return { label: "노쇼", variant: "warning" as const };
  }
  return { label: String(status || "예약완료"), variant: "default" as const };
}

export function orderStatusBadge(order: {
  status?: string | null;
  refund_status?: string | null;
}) {
  const refund = String(order.refund_status || "").toLowerCase();
  const status = String(order.status || "").toLowerCase();
  if (refund.includes("partial") || status.includes("partial")) {
    return { label: "부분환불", className: "bg-orange-100 text-orange-800 border-transparent" };
  }
  if (refund.includes("full") || refund === "refunded" || status === "refunded" || status === "full_refund") {
    return { label: "전액환불", className: "bg-red-100 text-red-700 border-transparent" };
  }
  if (status === "cancelled" || status === "canceled" || status === "failed") {
    return { label: "결제취소", className: "bg-slate-100 text-slate-700 border-transparent" };
  }
  if (status === "paid" || status === "completed" || status === "done" || !status) {
    return { label: "결제완료", className: "bg-emerald-50 text-emerald-700 border-transparent" };
  }
  return { label: String(order.status || "결제완료"), className: "bg-slate-100 text-slate-700 border-transparent" };
}

export function formatWon(amount: number | null | undefined) {
  return `${Number(amount || 0).toLocaleString("ko-KR")}원`;
}

export function formatSessionDateTime(value: string | null | undefined) {
  if (!value) return "일시 미정";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "일시 미정";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}.${m}.${day} ${hh}:${mm}`;
}

export function nearestTicketExpiry(orders: MemberOrder[]) {
  const paid = orders.filter((row) => {
    const status = String(row.status || "").toLowerCase();
    const refund = String(row.refund_status || "").toLowerCase();
    if (refund.includes("full") || status === "refunded" || status === "cancelled" || status === "canceled") {
      return false;
    }
    return !!row.created_at && (status === "paid" || status === "completed" || status === "done" || !status);
  });
  if (!paid.length) return null;

  const expiries = paid
    .map((row) => {
      const start = new Date(String(row.created_at));
      if (Number.isNaN(start.getTime())) return null;
      return new Date(start.getTime() + 90 * 24 * 60 * 60 * 1000);
    })
    .filter((d): d is Date => !!d)
    .sort((a, b) => a.getTime() - b.getTime());

  if (!expiries.length) return null;
  const now = Date.now();
  const upcoming = expiries.find((d) => d.getTime() >= now) || expiries[expiries.length - 1];
  const daysLeft = Math.ceil((upcoming.getTime() - now) / (24 * 60 * 60 * 1000));
  return {
    dateLabel: formatSessionDateTime(upcoming.toISOString()).split(" ")[0],
    daysLeft,
  };
}

export function paymentMethodLabel(raw: string | null | undefined) {
  const text = String(raw || "").trim();
  if (!text) return "결제수단 미기록";
  const lower = text.toLowerCase();
  if (lower.includes("kakao")) return "카카오페이";
  if (lower.includes("toss")) return "토스페이";
  if (lower.includes("card") || lower.includes("credit") || lower.includes("check")) return "신용/체크카드";
  return text;
}

export async function adjustProfileTickets(
  row: { id: string; user_id?: string | null },
  nextCount: number
) {
  const safe = Math.max(0, Math.floor(Number(nextCount) || 0));
  const payload = { ticket_count: safe, updated_at: new Date().toISOString() };

  const first = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", row.id)
    .select("id, ticket_count");
  if (!first.error && first.data && first.data.length) {
    return Number((first.data[0] as { ticket_count?: number }).ticket_count ?? safe);
  }

  const uid = row.user_id || row.id;
  const second = await supabase
    .from("profiles")
    .update(payload)
    .eq("user_id", uid)
    .select("id, ticket_count");
  if (second.error) throw new Error(second.error.message || first.error?.message || "티켓 업데이트 실패");
  if (!(second.data && second.data.length)) {
    throw new Error(first.error?.message || "프로필을 찾지 못해 티켓을 변경하지 못했습니다.");
  }
  return Number((second.data[0] as { ticket_count?: number }).ticket_count ?? safe);
}

export async function adjustProfileTicketsWithLedger(
  row: { id: string; user_id?: string | null },
  nextCount: number,
  delta: number,
  reason: string
) {
  const saved = await adjustProfileTickets(row, nextCount);
  const uid = row.user_id || row.id;
  try {
    await supabase.from("credit_ledgers").insert({
      user_id: uid,
      profile_id: row.id,
      delta,
      balance_after: saved,
      reason: String(reason || "").trim() || (delta > 0 ? "관리자 CS 보상 지급" : "관리자 수동 차감"),
      source: "admin_cs",
      created_at: new Date().toISOString(),
    });
  } catch {
    /* ledger table may be missing — ticket update still succeeds */
  }
  return saved;
}

export async function grantAdminTickets(
  row: { id: string },
  quantity: number,
  reason: string,
  sourceId: string
): Promise<{ ticketCount: number; duplicate: boolean }> {
  const result = await supabase.rpc("admin_grant_tickets", {
    p_user_id: row.id,
    p_quantity: quantity,
    p_reason: reason,
    p_source_id: sourceId,
  });
  if (result.error) throw new Error(result.error.message || "티켓 지급에 실패했습니다.");
  const data = result.data as { success?: boolean; ticket_count?: number; duplicate?: boolean } | null;
  const ticketCount = Number(data?.ticket_count);
  if (!data?.success || !Number.isFinite(ticketCount)) throw new Error("티켓 지급 결과를 확인하지 못했습니다.");
  return { ticketCount, duplicate: !!data.duplicate };
}

export async function fetchMemberOrders(userId: string): Promise<MemberOrder[]> {
  if (!userId) return [];
  const selects = [
    "id, created_at, product_name, amount, ticket_count, status, payment_method, refund_status, merchant_uid",
    "id, created_at, product_name, amount, ticket_count, status, merchant_uid",
    "id, created_at, product_name, amount, status",
    "*",
  ];
  for (const columns of selects) {
    const result = await supabase
      .from("orders")
      .select(columns)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (result.error) continue;
    const rows = (result.data || []) as unknown as Record<string, unknown>[];
    return rows.map((row) => ({
      id: String(row.id || ""),
      created_at: (row.created_at as string | null) || null,
      product_name: (row.product_name as string | null) || null,
      amount: Number(row.amount || 0),
      ticket_count: row.ticket_count == null ? null : Number(row.ticket_count),
      status: (row.status as string | null) || null,
      payment_method: (row.payment_method as string | null) || null,
      refund_status: (row.refund_status as string | null) || null,
      merchant_uid: (row.merchant_uid as string | null) || null,
    }));
  }
  return [];
}

export async function fetchCreditLedgers(userId: string, profileId?: string | null): Promise<CreditLedgerRow[]> {
  const ledgerUserId = userId || profileId;
  if (!ledgerUserId) return [];
  const result = await supabase
    .from("credit_ledgers")
    .select("id, user_id, change_amount, ledger_type, balance_after, created_at")
    .eq("user_id", ledgerUserId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (result.error) return [];
  const rows = (result.data || []) as unknown as Record<string, unknown>[];
  return rows.map((row) => {
    const ledgerType = String(row.ledger_type || "").trim();
    return {
      id: String(row.id || crypto.randomUUID()),
      created_at: (row.created_at as string | null) || null,
      delta: Number(row.change_amount || 0),
      reason: ledgerType === "admin_grant" ? "관리자 티켓 지급 (사유 미저장)"
        : ledgerType === "purchase" ? "티켓 구매" : null,
      source: ledgerType || null,
      balance_after: row.balance_after == null ? null : Number(row.balance_after),
    };
  });
}

export async function saveAdminMemo(
  row: { id: string },
  memo: string
) {
  const result = await supabase.rpc("admin_update_profile_memo", { p_profile_id: row.id, p_memo: memo });
  if (result.error) throw new Error(result.error.message);
  return String((result.data as { admin_memo?: string } | null)?.admin_memo || "");
}

export async function fetchAdminMemo(profileId: string) {
  const result = await adminProfiles()
    .select("admin_memo")
    .eq("id", profileId)
    .single();
  if (result.error) throw new Error(result.error.message);
  return String(result.data?.admin_memo || "");
}

export type BookingCsNote = {
  note: string;
  updated_at: string | null;
};

export async function fetchBookingCsNote(bookingId: string): Promise<BookingCsNote> {
  const result = await supabase.rpc("get_booking_cs_note", {
    p_booking_id: bookingId,
  });
  if (result.error) throw new Error(result.error.message || "예약별 CS 메모를 불러오지 못했습니다.");
  const data = result.data as { success?: boolean; note?: unknown; updated_at?: string | null } | null;
  if (!data?.success || typeof data.note !== "string") {
    throw new Error("예약별 CS 메모 조회 결과를 확인하지 못했습니다.");
  }
  return { note: data.note, updated_at: data.updated_at || null };
}

export async function saveBookingCsNote(bookingId: string, note: string): Promise<BookingCsNote> {
  const result = await supabase.rpc("set_booking_cs_note", {
    p_booking_id: bookingId,
    p_note: note,
  });
  if (result.error) throw new Error(result.error.message || "예약별 CS 메모를 저장하지 못했습니다.");
  const data = result.data as { success?: boolean; note?: unknown; updated_at?: string | null } | null;
  if (!data?.success || typeof data.note !== "string") {
    throw new Error("예약별 CS 메모 저장 결과를 확인하지 못했습니다.");
  }
  return { note: data.note, updated_at: data.updated_at || null };
}

export type AdminNoteEntry = {
  id: string;
  note: string;
  created_at: string;
};

export type AdminNoteTimeline = {
  entries: AdminNoteEntry[];
  legacyNote: string;
};

function parseAdminNoteEntry(value: unknown): AdminNoteEntry {
  const row = value as Record<string, unknown> | null;
  if (!row || typeof row.id !== "string" || typeof row.note !== "string" || typeof row.created_at !== "string") {
    throw new Error("메모 기록의 형식을 확인하지 못했습니다.");
  }
  return { id: row.id, note: row.note, created_at: row.created_at };
}

function parseAdminNoteTimeline(value: unknown): AdminNoteTimeline {
  const data = value as { success?: boolean; entries?: unknown; legacy_note?: unknown } | null;
  if (!data?.success || !Array.isArray(data.entries)) {
    throw new Error("메모 목록의 형식을 확인하지 못했습니다.");
  }
  return {
    entries: data.entries.map(parseAdminNoteEntry),
    legacyNote: typeof data.legacy_note === "string" ? data.legacy_note : "",
  };
}

export async function listMemberAdminNotes(profileId: string): Promise<AdminNoteTimeline> {
  const result = await supabase.rpc("list_member_admin_notes", { p_profile_id: profileId });
  if (result.error) throw new Error(result.error.message || "회원 메모를 불러오지 못했습니다.");
  return parseAdminNoteTimeline(result.data);
}

export async function addMemberAdminNote(profileId: string, note: string): Promise<AdminNoteEntry> {
  const result = await supabase.rpc("add_member_admin_note", { p_profile_id: profileId, p_note: note });
  if (result.error) throw new Error(result.error.message || "회원 메모를 추가하지 못했습니다.");
  const data = result.data as { success?: boolean; entry?: unknown } | null;
  if (!data?.success) throw new Error("회원 메모 추가 결과를 확인하지 못했습니다.");
  return parseAdminNoteEntry(data.entry);
}

export async function listBookingCsNotes(bookingId: string): Promise<AdminNoteTimeline> {
  const result = await supabase.rpc("list_booking_cs_notes", { p_booking_id: bookingId });
  if (result.error) throw new Error(result.error.message || "예약별 CS 메모를 불러오지 못했습니다.");
  return parseAdminNoteTimeline(result.data);
}

export async function addBookingCsNote(bookingId: string, note: string): Promise<AdminNoteEntry> {
  const result = await supabase.rpc("add_booking_cs_note", { p_booking_id: bookingId, p_note: note });
  if (result.error) throw new Error(result.error.message || "예약별 CS 메모를 추가하지 못했습니다.");
  const data = result.data as { success?: boolean; entry?: unknown } | null;
  if (!data?.success) throw new Error("예약별 CS 메모 추가 결과를 확인하지 못했습니다.");
  return parseAdminNoteEntry(data.entry);
}

export async function deleteMemberAdminNote(entryId: string): Promise<void> {
  const result = await supabase.rpc("delete_member_admin_note", { p_entry_id: entryId });
  if (result.error) throw new Error(result.error.message || "회원 메모를 삭제하지 못했습니다.");
  if (!(result.data as { success?: boolean } | null)?.success) throw new Error("회원 메모 삭제 결과를 확인하지 못했습니다.");
}

export async function deleteBookingCsNote(entryId: string): Promise<void> {
  const result = await supabase.rpc("delete_booking_cs_note", { p_entry_id: entryId });
  if (result.error) throw new Error(result.error.message || "예약별 CS 메모를 삭제하지 못했습니다.");
  if (!(result.data as { success?: boolean } | null)?.success) throw new Error("예약별 CS 메모 삭제 결과를 확인하지 못했습니다.");
}

export async function clearLegacyMemberAdminMemo(profileId: string): Promise<void> {
  const result = await supabase.rpc("clear_legacy_member_admin_memo", { p_profile_id: profileId });
  if (result.error) throw new Error(result.error.message || "기존 회원 메모를 삭제하지 못했습니다.");
  if (!(result.data as { success?: boolean } | null)?.success) throw new Error("기존 회원 메모 삭제 결과를 확인하지 못했습니다.");
}

export async function clearLegacyBookingCsNote(bookingId: string): Promise<void> {
  const result = await supabase.rpc("clear_legacy_booking_cs_note", { p_booking_id: bookingId });
  if (result.error) throw new Error(result.error.message || "기존 예약 메모를 삭제하지 못했습니다.");
  if (!(result.data as { success?: boolean } | null)?.success) throw new Error("기존 예약 메모 삭제 결과를 확인하지 못했습니다.");
}

export async function fetchMemberBookings(learnerId: string): Promise<MemberBookingSession[]> {
  if (!learnerId) return [];
  const selects = [
    "id, scheduled_at, status, partner_name, learner_id, rating, review",
    "id, scheduled_at, status, partner_name, learner_id, rating, feedback",
    "id, scheduled_at, status, partner_name, learner_id, rating",
    "id, scheduled_at, status, partner_name, learner_id",
    "id, scheduled_at, status, partner_name",
    "*",
  ];

  for (const columns of selects) {
    const result = await supabase
      .from("bookings")
      .select(columns)
      .eq("learner_id", learnerId)
      .order("scheduled_at", { ascending: false });
    if (result.error) continue;

    const rows = (result.data || []) as unknown as Record<string, unknown>[];
    return rows.map((row) => ({
      id: String(row.id || ""),
      scheduled_at: (row.scheduled_at as string | null) || null,
      status: (row.status as string | null) || null,
      partner_name: (row.partner_name as string | null) || null,
      learner_id: (row.learner_id as string | null) || learnerId,
      rating: row.rating == null || row.rating === "" ? null : Number(row.rating),
      review: String(row.review || row.feedback || row.comment || row.review_text || "").trim() || null,
    }));
  }
  return [];
}

function parseUtterances(raw: unknown, participantRole: SessionUtterance["speaker"] = "unknown"): SessionUtterance[] {
  let rows: unknown[] = [];
  if (Array.isArray(raw)) rows = raw;
  else if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) rows = parsed;
    } catch {
      rows = [];
    }
  } else if (raw && typeof raw === "object" && Array.isArray((raw as { messages?: unknown[] }).messages)) {
    rows = (raw as { messages: unknown[] }).messages;
  }

  return rows
    .map((item, index) => {
      const row = (item || {}) as Record<string, unknown>;
      const speakerRaw = String(row.speaker || row.role || row.from || participantRole).toLowerCase();
      const isPartner = /partner|tutor|teacher|host|assistant/.test(speakerRaw);
      const isLearner = /user|learner|student|me|member/.test(speakerRaw) || speakerRaw === "user";
      const text = String(row.text || row.content || row.message || "").trim();
      if (!text) return null;
      const ts = row.timestamp || row.created_at || row.time || null;
      return {
        id: String(row.id || `u-${index}`),
        speaker: isPartner ? "partner" as const : isLearner ? "learner" as const : "unknown" as const,
        text,
        timestamp: ts ? String(ts) : null,
      };
    })
    .filter((row): row is SessionUtterance => !!row)
    .sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return ta - tb;
    });
}

function parseCorrections(raw: unknown): SessionCorrection[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const original = String(row.original_text || row.original || row.before || row.source || row.spoken || "").trim();
    const corrected = String(row.suggested_text || row.corrected || row.after || row.target || row.suggestion || "").trim();
    // A spoken sentence or an unchanged pair is not a correction.
    if (!original || !corrected || original === corrected) return [];
    return [{ original, corrected, reason: String(row.short_reason || row.explanation || "").trim() || undefined }];
  });
}

function parseVocab(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item || "").trim()).filter(Boolean);
    } catch {
      return raw.split(/[,|/]/).map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

export async function fetchSessionTranscriptBundle(
  session: SessionTranscriptContext
): Promise<SessionTranscriptBundle> {
  const emptyReport: SessionCsReport = {
    rating: session.rating ?? null,
    review: session.review ?? null,
    wordHelpCount: 0,
    wordHelpVocab: [],
    corrections: [],
    partnerStamp: null,
    partnerComment: null,
    hasReport: false,
  };

  if (!session?.id) {
    return { utterances: [], report: emptyReport, startedAt: null, endedAt: null };
  }

  let utterances: SessionUtterance[] = [];
  let startedAt: string | null = session.scheduled_at || null;
  let endedAt: string | null = null;

  const logCandidates: Record<string, unknown>[] = [];
  // Every compatibility query keeps the full booking identity. Never use room
  // fragments, participant history, or partner names to identify a session.
  for (const table of ["session_logs", "session_transcripts"]) {
    const result = await supabase.from(table).select("*").eq("booking_id", session.id);
    if (!result.error) {
      const rows = (result.data || []) as Record<string, unknown>[];
      logCandidates.push(...rows.filter((row) => row.booking_id === session.id));
    }
    if (logCandidates.length) break;
  }

  const seen = new Set<string>();
  for (const log of logCandidates) {
    const role = log.participant_role === "learner" || log.participant_role === "partner" ? log.participant_role : "unknown";
    for (const row of parseUtterances(log.transcript || log.messages || log.utterances || log.logs, role)) {
      if (role !== "unknown" && row.speaker !== role) continue;
      const key = JSON.stringify([row.speaker, row.id, row.timestamp, row.text]);
      if (seen.has(key)) continue;
      seen.add(key);
      utterances.push({ ...row, id: String(log.id || "log") + ":" + row.id });
    }
  }
  utterances.sort((a, b) => (Date.parse(a.timestamp || "") || 0) - (Date.parse(b.timestamp || "") || 0));
  const starts = logCandidates.map((row) => row.started_at).filter((v): v is string => typeof v === "string" && Number.isFinite(Date.parse(v)));
  const ends = logCandidates.map((row) => row.ended_at || row.created_at).filter((v): v is string => typeof v === "string" && Number.isFinite(Date.parse(v)));
  if (starts.length) startedAt = starts.sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  if (ends.length) endedAt = ends.sort((a, b) => Date.parse(b) - Date.parse(a))[0];

  let report = { ...emptyReport };
  const byBooking = await supabase.from("session_reports").select("*").eq("booking_id", session.id).maybeSingle();
  const reportRow = !byBooking.error && byBooking.data?.booking_id === session.id
    ? byBooking.data as Record<string, unknown> : null;

  if (reportRow) {
    const feedback = Array.isArray(reportRow.feedback) ? reportRow.feedback : [];
    const corrections = feedback.filter((value) => {
      if (!value || typeof value !== "object") return false;
      const row = value as Record<string, unknown>;
      if (row.source !== "learner_recognized_speech" || row.meaning_preserved !== true || row.correction_needed !== true || row.ambiguous === true) return false;
      if (row.speaker && row.speaker !== "learner") return false;
      if (typeof row.original_text !== "string" || !row.original_text.trim() || typeof row.suggested_text !== "string" || !row.suggested_text.trim()) return false;
      if (row.booking_id && row.booking_id !== session.id) return false;
      if (row.source_log_id && !logCandidates.some((log) => log.id === row.source_log_id && log.participant_role !== "partner")) return false;
      return true;
    });
    const savedRecap = feedback.filter((value) => value && typeof value === "object" &&
      value.kind === "conversation_recap" && value.generator === "dayo_conversation_recap_v1" &&
      value.schema_version === 1 && value.booking_id === session.id && value.metrics && value.source).pop();
    const metric = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
    const vocab = parseVocab(reportRow.word_help_vocab || reportRow.vocab_chips || reportRow.keyword);
    report = {
      rating: reportRow.rating == null ? session.rating ?? null : Number(reportRow.rating),
      review: String(reportRow.review || reportRow.user_review || session.review || "").trim() || null,
      wordHelpCount: Number(reportRow.word_help_count || reportRow.help_count || vocab.length || 0),
      wordHelpVocab: vocab,
      corrections: parseCorrections(corrections.length ? corrections : reportRow.corrections || reportRow.ai_corrections),
      summary: typeof reportRow.summary === "string" ? reportRow.summary.trim() || null : null,
      recap: savedRecap ? {
        userWordCount: metric(savedRecap.metrics.user_word_count),
        userUtteranceCount: metric(savedRecap.metrics.user_utterance_count),
        participationRatio: metric(savedRecap.metrics.user_participation_ratio),
        topics: Array.isArray(savedRecap.topics) ? savedRecap.topics.flatMap((topic: Record<string, unknown>) => typeof topic?.ko === "string" ? [topic.ko] : typeof topic?.en === "string" ? [topic.en] : []) : [],
        expressions: Array.isArray(savedRecap.expressions) ? savedRecap.expressions.flatMap((expression: Record<string, unknown>) => typeof expression?.text === "string" ? [expression.text] : []) : [],
      } : null,
      partnerStamp: String(reportRow.stamp || "").trim() || null,
      partnerComment: String(reportRow.partner_comment || "").trim() || null,
      hasReport: true,
    };
  } else if (session.rating != null || session.review) {
    report = {
      ...emptyReport,
      rating: session.rating ?? null,
      review: session.review ?? null,
      hasReport: true,
    };
  }

  return { utterances, report, startedAt, endedAt };
}

export async function updateProfileRole(
  row: { id: string; user_id?: string | null },
  nextRole: "partner" | "user"
) {
  const uid = row.user_id || row.id;
  const result = await supabase.rpc("admin_set_user_role", {
    p_user_id: uid,
    p_role: nextRole,
  });
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error("프로필 권한을 변경하지 못했습니다.");
}
