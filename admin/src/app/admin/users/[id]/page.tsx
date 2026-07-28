"use client";

import { use } from "react";
import Link from "next/link";
import { AdminHeader } from "@/components/admin/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getUserById, getTestResultByUserId, getLifecycleByUserId } from "@/lib/mockData";
import { LANGUAGE_LABELS, PAYMENT_LABELS, PURPOSE_LABELS, UTM_LABELS } from "@/lib/types";
import { formatDate, formatDateTime } from "@/lib/utils";
import { ArrowLeft, Send } from "lucide-react";
import { notFound } from "next/navigation";

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const user = getUserById(id);
  if (!user) notFound();

  const testResult = getTestResultByUserId(id);
  const lifecycle = getLifecycleByUserId(id);

  return (
    <>
      <AdminHeader title={`회원 상세 — ${user.name}`} />
      <main className="space-y-6 p-6">
        <Link href="/admin/users" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> 회원 목록으로
        </Link>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader><CardTitle>기본 정보</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div><span className="text-muted-foreground">이름</span><p className="font-medium">{user.name}</p></div>
              <div><span className="text-muted-foreground">이메일</span><p>{user.email}</p></div>
              <div><span className="text-muted-foreground">목적</span><p><Badge variant="coral">{PURPOSE_LABELS[user.purpose]}</Badge></p></div>
              <div><span className="text-muted-foreground">언어</span><p>{LANGUAGE_LABELS[user.language]}</p></div>
              <div><span className="text-muted-foreground">UTM</span><p>{UTM_LABELS[user.utmSource]}</p></div>
              <div><span className="text-muted-foreground">결제</span><p><Badge>{PAYMENT_LABELS[user.paymentStatus]}</Badge></p></div>
              <div><span className="text-muted-foreground">가입일</span><p>{formatDate(user.joinedAt)}</p></div>
            </CardContent>
          </Card>

          <div className="space-y-6 lg:col-span-2">
            <Tabs defaultValue="test">
              <TabsList>
                <TabsTrigger value="test">진단 리포트</TabsTrigger>
                <TabsTrigger value="lifecycle">행동 로그</TabsTrigger>
                <TabsTrigger value="crm">CRM 발송</TabsTrigger>
              </TabsList>

              <TabsContent value="test">
                <Card>
                  <CardHeader><CardTitle>10초 스피킹 진단 결과</CardTitle></CardHeader>
                  <CardContent>
                    {testResult ? (
                      <div className="space-y-4">
                        <div className="flex items-center gap-4">
                          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-coral/10 text-2xl font-bold text-coral">{testResult.overallScore}</div>
                          <div>
                            <p className="font-medium">종합 점수</p>
                            <p className="text-sm text-muted-foreground">추천: {testResult.recommendedCourse}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          {[["유창성", testResult.fluency], ["어휘력", testResult.vocabulary], ["발음", testResult.pronunciation]].map(([label, score]) => (
                            <div key={label as string} className="rounded-lg border p-3 text-center">
                              <p className="text-xs text-muted-foreground">{label}</p>
                              <p className="text-lg font-bold">{score}</p>
                            </div>
                          ))}
                        </div>
                        {testResult.weakPoints.length > 0 && (
                          <div><p className="mb-1 text-sm font-medium">약점</p><div className="flex gap-2">{testResult.weakPoints.map((w) => <Badge key={w} variant="warning">{w}</Badge>)}</div></div>
                        )}
                      </div>
                    ) : (
                      <p className="text-muted-foreground">테스트 미완료</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="lifecycle">
                <Card>
                  <CardHeader><CardTitle>유저 라이프사이클</CardTitle></CardHeader>
                  <CardContent>
                    <div className="relative space-y-0">
                      {lifecycle.map((event, i) => (
                        <div key={event.id} className="flex gap-4 pb-6">
                          <div className="flex flex-col items-center">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-coral text-xs font-bold text-white">{i + 1}</div>
                            {i < lifecycle.length - 1 && <div className="mt-1 h-full w-0.5 bg-border" />}
                          </div>
                          <div className="pt-1">
                            <p className="text-sm font-medium">{event.label}</p>
                            <p className="text-xs text-muted-foreground">{formatDateTime(event.timestamp)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="crm">
                <Card>
                  <CardHeader><CardTitle>CRM 메시지 즉시 발송</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div><Label>채널</Label>
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
      </main>
    </>
  );
}
