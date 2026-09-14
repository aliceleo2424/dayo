"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminHeader } from "@/components/admin/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchCrmMember, type CrmMember } from "@/lib/admin-data";
import { supabase } from "@/lib/supabase";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { ArrowLeft, Send } from "lucide-react";

type OrderRow = {
  id: string;
  product_name: string | null;
  amount: number | null;
  status: string | null;
  created_at: string | null;
};

type BookingRow = {
  id: string;
  scheduled_at: string | null;
  status: string | null;
  partner_name: string | null;
};

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [user, setUser] = useState<CrmMember | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchCrmMember(id);
      setUser(result.row);
      setError(result.error && !result.row ? result.error : "");

      if (result.row) {
        const authId = result.row.user_id || result.row.id;
        const paid = await supabase
          .from("orders")
          .select("id, product_name, amount, status, created_at")
          .eq("user_id", authId)
          .order("created_at", { ascending: false });
        setOrders(((paid.data || []) as unknown as OrderRow[]));

        let bookingData: BookingRow[] = [];
        const bookingSelects = [
          "id, scheduled_at, status, partner_name",
          "id, scheduled_at, status",
          "*",
        ];
        for (const columns of bookingSelects) {
          const query = await supabase.from("bookings").select(columns).eq("learner_id", authId);
          if (!query.error) {
            bookingData = (query.data || []) as unknown as BookingRow[];
            break;
          }
        }
        setBookings(bookingData);
      }
    } catch (err) {
      setUser(null);
      setError(err instanceof Error ? err.message : "회원 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const title = user ? `회원 상세 — ${user.name}` : "회원 상세";

  return (
    <>
      <AdminHeader title={title} />
      <main className="space-y-6 p-6">
        <Link href="/admin/users" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> 회원 목록으로
        </Link>

        {loading ? (
          <div className="h-64 animate-pulse rounded-xl bg-muted" />
        ) : !user ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              {error || "해당 회원을 찾을 수 없습니다."}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader><CardTitle>기본 정보</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div><span className="text-muted-foreground">닉네임</span><p className="font-medium">{user.name}</p></div>
                <div><span className="text-muted-foreground">이메일</span><p>{user.email || "미등록"}</p></div>
                <div>
                  <span className="text-muted-foreground">role</span>
                  <p>
                    <Badge variant={user.role === "admin" ? "coral" : user.role === "partner" ? "success" : "default"}>
                      {user.role || "user"}
                    </Badge>
                  </p>
                </div>
                <div><span className="text-muted-foreground">보유 티켓</span><p>{user.ticket_count}</p></div>
                <div><span className="text-muted-foreground">적립 포인트</span><p>{user.point_balance} P</p></div>
                <div>
                  <span className="text-muted-foreground">결제</span>
                  <p>
                    <Badge variant={user.paymentStatus === "paid" ? "success" : "warning"}>
                      {user.paymentStatus === "paid" ? "결제완료" : "미결제"}
                    </Badge>
                    {user.totalSpent > 0 ? ` ${formatCurrency(user.totalSpent)}` : ""}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">가입일</span>
                  <p>{user.created_at ? formatDate(user.created_at) : "—"}</p>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6 lg:col-span-2">
              <Tabs defaultValue="test">
                <TabsList>
                  <TabsTrigger value="test">진단 리포트</TabsTrigger>
                  <TabsTrigger value="lifecycle">세션 · 결제</TabsTrigger>
                  <TabsTrigger value="crm">CRM 발송</TabsTrigger>
                </TabsList>

                <TabsContent value="test">
                  <Card>
                    <CardHeader><CardTitle>스피킹 진단 결과</CardTitle></CardHeader>
                    <CardContent>
                      {user.last_test_score != null ? (
                        <div className="space-y-4">
                          <div className="flex items-center gap-4">
                            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-coral/10 text-2xl font-bold text-coral">
                              {user.last_test_score}
                            </div>
                            <div>
                              <p className="font-medium">최근 테스트 점수</p>
                              <p className="text-sm text-muted-foreground">
                                레벨: {user.speaking_level || "미기록"}
                                {user.last_test_date ? ` · ${formatDateTime(user.last_test_date)}` : ""}
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-muted-foreground">테스트 미완료</p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="lifecycle">
                  <div className="space-y-4">
                    <Card>
                      <CardHeader><CardTitle>결제 내역</CardTitle></CardHeader>
                      <CardContent>
                        {!orders.length ? (
                          <p className="text-sm text-muted-foreground">결제 내역이 없습니다.</p>
                        ) : (
                          <div className="space-y-3">
                            {orders.map((order) => (
                              <div key={order.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                                <div>
                                  <p className="font-medium">{order.product_name || "티켓 충전"}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {order.created_at ? formatDateTime(order.created_at) : ""} · {order.status || "paid"}
                                  </p>
                                </div>
                                <span>{formatCurrency(Number(order.amount || 0))}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader><CardTitle>세션 예약</CardTitle></CardHeader>
                      <CardContent>
                        {!bookings.length ? (
                          <p className="text-sm text-muted-foreground">현재 예정된 세션 예약이 없습니다 ☕</p>
                        ) : (
                          <div className="space-y-3">
                            {bookings.map((booking) => (
                              <div key={booking.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                                <div>
                                  <p className="font-medium">{booking.partner_name || "파트너 미정"}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {booking.scheduled_at ? formatDateTime(booking.scheduled_at) : "미정"}
                                  </p>
                                </div>
                                <Badge variant="outline">{booking.status || "pending"}</Badge>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="crm">
                  <Card>
                    <CardHeader><CardTitle>CRM 메시지 즉시 발송</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <Label>채널</Label>
                        <Select defaultValue="alimtalk">
                          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="alimtalk">알림톡</SelectItem>
                            <SelectItem value="push">Push</SelectItem>
                            <SelectItem value="sms">SMS</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div><Label>메시지</Label><Input placeholder="메시지를 입력하세요" className="mt-1" /></div>
                      <Button variant="coral"><Send className="mr-1 h-4 w-4" /> 발송하기</Button>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
