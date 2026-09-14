"use client";

/* ops-dashboard-v3 2026-09-14 — marketing dummy template removed */

import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, GraduationCap, Users, Wallet } from "lucide-react";
import { AdminHeader } from "@/components/admin/header";
import { RoleActions } from "@/components/admin/role-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateProfileRole } from "@/lib/admin-data";
import { supabase } from "@/lib/supabase";
import { formatCurrency, formatDateTime } from "@/lib/utils";

type KpiState = {
  members: number;
  partners: number;
  sessions: number;
  paid: number;
};

type MemberRow = {
  id: string;
  nickname: string | null;
  user_name: string | null;
  email: string | null;
  role: string | null;
  ticket_count: number | null;
  point_balance: number | null;
};

type SessionRow = {
  id: string;
  scheduled_at: string | null;
  status: string | null;
  learner: string;
  partner: string;
};

const ZERO_KPI: KpiState = { members: 0, partners: 0, sessions: 0, paid: 0 };

function nameOf(row: MemberRow) {
  return String(row.nickname || row.user_name || row.email || "미등록").trim() || "미등록";
}

export default function DashboardPage() {
  const [kpi, setKpi] = useState<KpiState>(ZERO_KPI);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setNotice("");
    try {
      const [memberCount, partnerCount, sessionCount, paidRows, memberRows] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "partner"),
        supabase.from("bookings").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("amount").eq("status", "paid"),
        supabase
          .from("profiles")
          .select("id, nickname, user_name, email, role, ticket_count, point_balance")
          .order("created_at", { ascending: false }),
      ]);

      let list: MemberRow[] = [];
      if (!memberRows.error && memberRows.data) {
        list = memberRows.data as unknown as MemberRow[];
      } else {
        const fallback = await supabase
          .from("profiles")
          .select("id, nickname, user_name, email, role, point_balance")
          .order("created_at", { ascending: false });
        list = (fallback.data || []) as unknown as MemberRow[];
      }

      const paid = paidRows.error
        ? 0
        : ((paidRows.data || []) as unknown as { amount?: number }[]).reduce(
          (sum, row) => sum + Number(row.amount || 0),
          0
        );

      setKpi({
        members: memberCount.error ? 0 : memberCount.count || 0,
        partners: partnerCount.error ? 0 : partnerCount.count || 0,
        sessions: sessionCount.error ? 0 : sessionCount.count || 0,
        paid,
      });
      setMembers(list);

      const bookingSelects = [
        "id, learner_id, partner_user_id, partner_name, scheduled_at, status",
        "id, learner_id, partner_id, partner_name, scheduled_at, status",
        "id, learner_id, partner_name, scheduled_at, status",
        "*",
      ];
      let bookingData: Record<string, unknown>[] = [];
      for (let i = 0; i < bookingSelects.length; i += 1) {
        const query = supabase.from("bookings").select(bookingSelects[i]);
        const ordered = bookingSelects[i] === "*"
          ? await query.order("created_at", { ascending: false })
          : await query.order("scheduled_at", { ascending: true });
        if (!ordered.error) {
          bookingData = (ordered.data || []) as unknown as Record<string, unknown>[];
          break;
        }
      }

      const ids = Array.from(new Set(
        bookingData.flatMap((row) => [String(row.learner_id || ""), String(row.partner_user_id || row.partner_id || "")]).filter(Boolean)
      ));
      const names = new Map<string, string>();
      if (ids.length) {
        const named = await supabase.from("profiles").select("user_id, nickname, user_name, email").in("user_id", ids);
        ((named.data || []) as unknown as { user_id?: string; nickname?: string; user_name?: string; email?: string }[]).forEach((row) => {
          const uid = String(row.user_id || "");
          const label = String(row.nickname || row.user_name || row.email || "").trim();
          if (uid && label) names.set(uid, label);
        });
      }

      setSessions(bookingData.map((row) => {
        const learnerId = String(row.learner_id || "");
        const partnerId = String(row.partner_user_id || row.partner_id || "");
        return {
          id: String(row.id || crypto.randomUUID()),
          scheduled_at: (row.scheduled_at as string | null) || null,
          status: (row.status as string | null) || null,
          learner: names.get(learnerId) || "학습자",
          partner: names.get(partnerId) || String(row.partner_name || "파트너 미정"),
        };
      }));
    } catch (err) {
      console.error("[DayO Admin] ops dashboard", err);
      setKpi(ZERO_KPI);
      setMembers([]);
      setSessions([]);
      setNotice("실데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setRole(row: MemberRow, nextRole: "partner" | "user") {
    const label = String(row.nickname || row.email || "회원").trim() || "회원";
    const ok = window.confirm(
      nextRole === "partner"
        ? `${label}님을 대화 파트너로 승인하시겠습니까?`
        : `${label}님을 일반 유저로 강등하시겠습니까?`
    );
    if (!ok) return;
    const prevRole = row.role;
    setBusyId(row.id);
    setMembers((prev) => prev.map((item) => (item.id === row.id ? { ...item, role: nextRole } : item)));
    try {
      await updateProfileRole(row, nextRole);
      setNotice(
        nextRole === "partner"
          ? "성공적으로 파트너 권한이 부여되었습니다."
          : "일반 유저로 변경되었습니다."
      );
    } catch (err) {
      setMembers((prev) => prev.map((item) => (item.id === row.id ? { ...item, role: prevRole } : item)));
      setNotice(err instanceof Error ? err.message : "권한 변경에 실패했습니다.");
    } finally {
      setBusyId("");
    }
  }

  const cards = [
    { label: "총 가입 회원", value: kpi.members.toLocaleString("ko-KR"), icon: Users },
    { label: "등록된 파트너", value: kpi.partners.toLocaleString("ko-KR"), icon: GraduationCap },
    { label: "예약/완료 세션", value: kpi.sessions.toLocaleString("ko-KR"), icon: CalendarCheck },
    { label: "누적 결제액", value: formatCurrency(kpi.paid), icon: Wallet },
  ];

  return (
    <>
      <AdminHeader title="운영 대시보드" />
      <main data-dashboard-version="ops-v3" className="space-y-8 p-6">
        {notice ? <p className="text-sm text-red-600">{notice}</p> : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.label}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="h-8 w-20 animate-pulse rounded-md bg-muted" />
                  ) : (
                    <div className="text-2xl font-bold">{card.value}</div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </section>

        <section>
          <h2 className="mb-4 text-lg font-semibold">파트너 & 회원 관리</h2>
          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <div className="h-40 animate-pulse rounded-md bg-muted" />
              ) : !members.length ? (
                <p className="py-10 text-center text-sm text-muted-foreground">등록된 회원이 없습니다.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                        <th className="px-3 py-3 font-medium">닉네임</th>
                        <th className="px-3 py-3 font-medium">이메일</th>
                        <th className="px-3 py-3 font-medium">role</th>
                        <th className="px-3 py-3 font-medium">보유 티켓</th>
                        <th className="px-3 py-3 font-medium">적립 포인트</th>
                        <th className="px-3 py-3 font-medium">권한</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((row) => {
                        const role = String(row.role || "user");
                        return (
                          <tr key={row.id} className="border-b last:border-0">
                            <td className="px-3 py-3 font-medium">{nameOf(row)}</td>
                            <td className="px-3 py-3">{row.email || "미등록"}</td>
                            <td className="px-3 py-3">
                              <Badge variant={role === "admin" ? "coral" : role === "partner" ? "success" : "default"}>{role}</Badge>
                            </td>
                            <td className="px-3 py-3">{Number(row.ticket_count || 0)}</td>
                            <td className="px-3 py-3">{`${Number(row.point_balance || 0)} P`}</td>
                            <td className="px-3 py-3">
                              <RoleActions
                                role={row.role}
                                busy={busyId === row.id}
                                onApprove={() => void setRole(row, "partner")}
                                onDemote={() => void setRole(row, "user")}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section>
          <h2 className="mb-4 text-lg font-semibold">세션 예약 현황</h2>
          {loading ? (
            <div className="h-32 animate-pulse rounded-xl bg-muted" />
          ) : !sessions.length ? (
            <Card>
              <CardContent className="py-16 text-center">
                <p className="text-lg font-semibold">현재 예정된 세션 예약이 없습니다 ☕</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                        <th className="px-3 py-3 font-medium">세션 일시</th>
                        <th className="px-3 py-3 font-medium">학습자</th>
                        <th className="px-3 py-3 font-medium">파트너</th>
                        <th className="px-3 py-3 font-medium">상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map((row) => (
                        <tr key={row.id} className="border-b last:border-0">
                          <td className="px-3 py-3">{row.scheduled_at ? formatDateTime(row.scheduled_at) : "미정"}</td>
                          <td className="px-3 py-3">{row.learner}</td>
                          <td className="px-3 py-3">{row.partner}</td>
                          <td className="px-3 py-3">{row.status || "pending"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </section>
      </main>
    </>
  );
}
