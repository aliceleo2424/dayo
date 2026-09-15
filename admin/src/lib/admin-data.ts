import { supabase } from "@/lib/supabase";

export type AuthProvider = "kakao" | "google" | "email";

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
};

export type MemberIdentity = {
  id?: string | null;
  nickname?: string | null;
  user_name?: string | null;
  email?: string | null;
  provider?: string | null;
  avatar_url?: string | null;
  client_key?: string | null;
};

export function detectMemberProvider(row: MemberIdentity): AuthProvider {
  const provider = String(row.provider || "").trim().toLowerCase();
  if (provider.includes("kakao")) return "kakao";
  if (provider.includes("google")) return "google";

  const email = String(row.email || "").trim().toLowerCase();
  const avatar = String(row.avatar_url || "").trim().toLowerCase();
  const clientKey = String(row.client_key || "").trim().toLowerCase();

  if (email.includes("kakao") || avatar.includes("kakao") || clientKey.includes("kakao")) return "kakao";
  if (email.endsWith("@gmail.com") || email.includes("googlemail") || avatar.includes("google")) return "google";
  return "email";
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
      const result = await supabase.from("profiles").select(columns).order("created_at", { ascending: false });
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
    "id, user_id, nickname, user_name, email, role, ticket_count, point_balance, last_test_score, speaking_level, last_test_date, created_at, provider, avatar_url, client_key",
    "id, user_id, nickname, user_name, email, role, ticket_count, point_balance, last_test_score, speaking_level, last_test_date, created_at, provider, avatar_url",
    "id, user_id, nickname, user_name, email, role, ticket_count, point_balance, created_at, provider, avatar_url",
    "id, user_id, nickname, user_name, email, role, ticket_count, point_balance, created_at",
    "id, user_id, nickname, user_name, email, role, point_balance, created_at",
  ];

  let record: ProfileRecord | null = null;
  let lastError = "";
  for (const columns of selects) {
    const byPk = await supabase.from("profiles").select(columns).eq("id", id).maybeSingle();
    if (!byPk.error) {
      record = (byPk.data || null) as unknown as ProfileRecord | null;
      lastError = "";
      break;
    }
    lastError = byPk.error.message;
  }

  if (!record) {
    for (const columns of selects) {
      const byAuth = await supabase.from("profiles").select(columns).eq("user_id", id).maybeSingle();
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
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "partner"),
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "completed"),
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
  const fullSelect = "id, user_id, nickname, user_name, email, role, visa_type, languages, bank_name, bank_account, account_holder, point_balance, created_at";
  const first = await supabase
    .from("profiles")
    .select(fullSelect)
    .in("role", ["partner", "admin"])
    .order("created_at", { ascending: false });

  if (!first.error) return first;

  return supabase
    .from("profiles")
    .select("id, user_id, nickname, user_name, email, role, point_balance, created_at")
    .in("role", ["partner", "admin"])
    .order("created_at", { ascending: false });
}

type BookingRecord = {
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
    "id, learner_id, partner_user_id, partner_name, language, scheduled_at, status",
    "id, learner_id, partner_id, partner_name, language, scheduled_at, status",
    "id, learner_id, partner_name, scheduled_at, status",
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
    language: row.language || null,
    scheduled_at: row.scheduled_at || null,
    status: row.status || null,
  }));
  const ids = Array.from(new Set(
    raw.flatMap((row) => [row.learner_id, row.partner_user_id]).filter((id): id is string => !!id)
  ));

  const names = new Map<string, string>();
  if (ids.length) {
    const profiles = await supabase
      .from("profiles")
      .select("user_id, nickname, user_name, email")
      .in("user_id", ids);
    for (const profile of profiles.data || []) {
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

export async function updateProfileRole(
  row: { id: string; user_id?: string | null },
  nextRole: "partner" | "user"
) {
  const first = await supabase
    .from("profiles")
    .update({ role: nextRole })
    .eq("id", row.id)
    .select("id");
  if (!first.error && first.data && first.data.length) return;

  const uid = row.user_id || row.id;
  const second = await supabase
    .from("profiles")
    .update({ role: nextRole })
    .eq("user_id", uid)
    .select("id");
  if (second.error) throw new Error(second.error.message);
  if (first.error && !(second.data && second.data.length)) throw new Error(first.error.message);
  if (!(second.data && second.data.length)) {
    throw new Error("프로필을 찾지 못해 권한을 변경하지 못했습니다.");
  }
}
