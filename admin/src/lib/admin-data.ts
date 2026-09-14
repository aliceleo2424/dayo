import { supabase } from "@/lib/supabase";

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
