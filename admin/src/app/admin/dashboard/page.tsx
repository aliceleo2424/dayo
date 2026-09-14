"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, GraduationCap, Users, Wallet } from "lucide-react";
import { AdminHeader } from "@/components/admin/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";

type Kpis = {
  memberCount: number;
  partnerCount: number;
  completedSessions: number;
  paidAmount: number;
};

type ProfileRow = {
  id: string;
  nickname: string | null;
  user_name: string | null;
  email: string | null;
  role: string | null;
  ticket_count: number | null;
  point_balance: number | null;
  created_at: string | null;
};

type BookingRow = {
  id: string;
  scheduled_at: string | null;
  status: string | null;
  partner_name: string | null;
  learner_id: string | null;
  partner_user_id: string | null;
  learner_label: string;
  partner_label: string;
};

const emptyKpis: Kpis = {
  memberCount: 0,
  partnerCount: 0,
  completedSessions: 0,
  paidAmount: 0,
};

const roleLabel: Record<string, string> = {
  user: "유저",
  partner: "파트너",
  admin: "관리자",
};

const statusLabel: Record<string, string> = {
  pending: "대기",
  confirmed: "확정",
  completed: "완료",
  cancelled: "취소",
};

function displayName(row: ProfileRow) {
  return String(row.nickname || row.user_name || row.email || "미등록").trim() || "미등록";
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className || "h-8 w-24"}`} />;
}

export default function DashboardPage() {
  const [kpis, setKpis] = useState<Kpis>(emptyKpis);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setNotice("");
    try {
      const [membersRes, partnersRes, sessionsRes, ordersRes, profilesRes] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }).in("role", ["partner", "admin"]),
        supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "completed"),
        supabase.from("orders").select("amount").eq("status", "paid"),
        supabase
          .from("profiles")
          .select("id, nickname, user_name, email, role, ticket_count, point_balance, created_at")
          .order("created_at", { ascending: false }),
      ]);

      let profileRows: ProfileRow[] = [];
      if (!profilesRes.error && profilesRes.data) {
        profileRows = (profilesRes.data as unknown) as ProfileRow[];
      } else {
        const fallback = await supabase
          .from("profiles")
          .select("id, nickname, user_name, email, role, point_balance, created_at")
          .order("created_at", { ascending: false });
        profileRows = ((fallback.data || []) as unknown) as ProfileRow[];
      }

      const paidAmount = ordersRes.error
        ? 0
        : (((ordersRes.data || []) as unknown) as { amount?: number }[]).reduce(
          (sum: number, row: { amount?: number }) => sum + Number(row.amount || 0),
          0
        );

      setKpis({
        memberCount: membersRes.error ? 0 : membersRes.count || 0,
        partnerCount: partnersRes.error ? 0 : partnersRes.count || 0,
        completedSessions: sessionsRes.error ? 0 : sessionsRes.count || 0,
        paidAmount,
      });
      setProfiles(profileRows);

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
          bookingData = ((ordered.data || []) as unknown) as Record<string, unknown>[];
          break;
        }
      }

      const ids: string[] = [];
      bookingData.forEach((row) => {
        const learnerId = String(row.learner_id || "");
        const partnerId = String(row.partner_user_id || row.partner_id || "");
        if (learnerId) ids.push(learnerId);
        if (partnerId) ids.push(partnerId);
      });
      const uniqueIds = Array.from(new Set(ids));
      const nameMap = new Map<string, string>();
      if (uniqueIds.length) {
        const namesRes = await supabase
          .from("profiles")
          .select("user_id, nickname, user_name, email")
          .in("user_id", uniqueIds);
        (namesRes.data || []).forEach((profile: { user_id?: string; nickname?: string; user_name?: string; email?: string }) => {
          const uid = String(profile.user_id || "");
          const label = String(profile.nickname || profile.user_name || profile.email || "").trim();
          if (uid && label) nameMap.set(uid, label);
        });
      }

      setBookings(
        bookingData.map((row) => {
          const learnerId = String(row.learner_id || "") || null;
          const partnerId = String(row.partner_user_id || row.partner_id || "") || null;
          return {
            id: String(row.id || ""),
            scheduled_at: (row.scheduled_at as string | null) || null,
            status: (row.status as string | null) || null,
            partner_name: (row.partner_name as string | null) || null,
            learner_id: learnerId,
            partner_user_id: partnerId,
            learner_label: (learnerId && nameMap.get(learnerId)) || "학습자",
            partner_label: (partnerId && nameMap.get(partnerId)) || String(row.partner_name || "파트너 미정"),
          };
        })
      );
    } catch (err) {
      console.error("[DayO Admin] dashboard load", err);
      setKpis(emptyKpis);
      setProfiles([]);
      setBookings([]);
      setNotice("대시보드 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateRole(row: ProfileRow, nextRole: "user" | "partner") {
    const label = nextRole === "partner" ? "파트너 승인" : "일반 유저 강등";
    const ok = window.confirm(`${displayName(row)} 님을 ${label} 처리할까요?`);
    if (!ok) return;
    setBusyId(row.id);
    setNotice("");
    try {
      const { error } = await supabase.from("profiles").update({ role: nextRole }).eq("id", row.id);
      if (error) {
        setNotice(error.message || "권한 변경에 실패했습니다.");
        return;
      }
      setProfiles((prev) => prev.map((item) => (item.id === row.id ? { ...item, role: nextRole } : item)));
      setKpis((prev) => {
        const wasStaff = prevRoleIsStaff(row.role);
        const nextStaff = nextRole === "partner";
        let partnerCount = prev.partnerCount;
        if (!wasStaff && nextStaff) partnerCount += 1;
        if (wasStaff && !nextStaff) partnerCount = Math.max(0, partnerCount - 1);
        return { ...prev, partnerCount };
      });
      setNotice(`${displayName(row)} 권한이 ${roleLabel[nextRole]}(으)로 변경되었습니다.`);
    } catch (err) {
      console.error("[DayO Admin] role update", err);
      setNotice("권한 변경 중 오류가 발생했습니다.");
    } finally {
      setBusyId("");
    }
  }

  const kpiCards = [
    { label: "총 가입 회원", value: kpis.memberCount.toLocaleString("ko-KR"), icon: Users },
    { label: "등록된 파트너", value: kpis.partnerCount.toLocaleString("ko-KR"), icon: GraduationCap },
    { label: "진행/완료 세션", value: kpis.completedSessions.toLocaleString("ko-KR"), icon: CalendarCheck },
    { label: "누적 결제액", value: formatCurrency(kpis.paidAmount), icon: Wallet },
  ];

  return (
    <>
      <AdminHeader title="운영 대시보드" />
      <main className="space-y-8 p-6">
        {notice && <p className="text-sm text-emerald-700">{notice}</p>}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpiCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.label}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {loading ? <Skeleton /> : <div className="text-2xl font-bold">{card.value}</div>}
                </CardContent>
              </Card>
            );
          })}
        </section>

        <section>
          <h2 className="mb-4 text-lg font-semibold">가입 회원 & 파트너 관리</h2>
          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <Skeleton className="h-40 w-full" />
              ) : !profiles.length ? (
                <p className="py-10 text-center text-sm text-muted-foreground">등록된 회원이 없습니다.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                        <th className="px-3 py-3 font-medium">닉네임</th>
                        <th className="px-3 py-3 font-medium">이메일</th>
                        <th className="px-3 py-3 font-medium">역할</th>
                        <th className="px-3 py-3 font-medium">보유 티켓</th>
                        <th className="px-3 py-3 font-medium">적립 포인트</th>
                        <th className="px-3 py-3 font-medium">가입일</th>
                        <th className="px-3 py-3 font-medium">권한 변경</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profiles.map((row) => {
                        const role = String(row.role || "user");
                        return (
                          <tr key={row.id} className="border-b last:border-0">
                            <td className="px-3 py-3 font-medium">{displayName(row)}</td>
                            <td className="px-3 py-3">{row.email || "미등록"}</td>
                            <td className="px-3 py-3">
                              <Badge variant={role === "admin" ? "coral" : role === "partner" ? "success" : "default"}>
                                {roleLabel[role] || role}
                              </Badge>
                            </td>
                            <td className="px-3 py-3">{Number(row.ticket_count || 0)}</td>
                            <td className="px-3 py-3">{`${Number(row.point_balance || 0)} P`}</td>
                            <td className="px-3 py-3">{row.created_at ? formatDate(row.created_at) : "—"}</td>
                            <td className="px-3 py-3">
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  variant="coral"
                                  disabled={busyId === row.id || role === "partner"}
                                  onClick={() => void updateRole(row, "partner")}
                                >
                                  파트너 승인
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busyId === row.id || role === "user"}
                                  onClick={() => void updateRole(row, "user")}
                                >
                                  일반 유저 강등
                                </Button>
                              </div>
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
          <h2 className="mb-4 text-lg font-semibold">실시간 세션 예약 현황</h2>
          {loading ? (
            <Skeleton className="h-32 w-full" />
          ) : !bookings.length ? (
            <Card>
              <CardContent className="py-16 text-center">
                <p className="text-lg font-semibold">현재 예정된 대화 세션 예약이 없습니다 🌿</p>
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
                      {bookings.map((row) => {
                        const status = String(row.status || "pending");
                        return (
                          <tr key={row.id} className="border-b last:border-0">
                            <td className="px-3 py-3">{row.scheduled_at ? formatDateTime(row.scheduled_at) : "미정"}</td>
                            <td className="px-3 py-3">{row.learner_label}</td>
                            <td className="px-3 py-3">{row.partner_label}</td>
                            <td className="px-3 py-3">
                              <Badge variant={status === "completed" ? "success" : status === "confirmed" ? "coral" : "default"}>
                                {statusLabel[status] || status}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
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

function prevRoleIsStaff(role: string | null) {
  return role === "partner" || role === "admin";
}
