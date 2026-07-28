"use client";

import { AdminHeader } from "@/components/admin/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cmsBanners, cmsCopies, socialProofReviews } from "@/lib/mockData";
import { PURPOSE_LABELS } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { Plus, GripVertical } from "lucide-react";

export default function CmsPage() {
  return (
    <>
      <AdminHeader title="프론트 CMS" />
      <main className="p-6">
        <Tabs defaultValue="banners">
          <TabsList>
            <TabsTrigger value="banners">배너/팝업</TabsTrigger>
            <TabsTrigger value="copy">카피 에디터</TabsTrigger>
            <TabsTrigger value="reviews">후기 관리</TabsTrigger>
          </TabsList>

          <TabsContent value="banners" className="mt-6 space-y-4">
            <div className="flex justify-end"><Button variant="coral"><Plus className="mr-1 h-4 w-4" /> 배너 추가</Button></div>
            {cmsBanners.map((banner) => (
              <Card key={banner.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{banner.title}</h3>
                      <Badge variant={banner.isActive ? "success" : "default"}>{banner.isActive ? "ON" : "OFF"}</Badge>
                      <Badge variant="outline">P{banner.priority}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">타겟: {banner.targetAudience} · {formatDate(banner.startDate)} ~ {formatDate(banner.endDate)}</p>
                  </div>
                  <Switch checked={banner.isActive} />
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="copy" className="mt-6 space-y-4">
            {cmsCopies.map((copy) => (
              <Card key={copy.id}>
                <CardHeader><CardTitle className="text-base">{copy.label}</CardTitle></CardHeader>
                <CardContent>
                  <Label>{copy.key}</Label>
                  {copy.key === "rolling_languages" ? (
                    <Input defaultValue={copy.value} className="mt-1" placeholder="쉼표로 구분" />
                  ) : (
                    <Input defaultValue={copy.value} className="mt-1" />
                  )}
                </CardContent>
              </Card>
            ))}
            <Button variant="coral">변경사항 저장</Button>
          </TabsContent>

          <TabsContent value="reviews" className="mt-6 space-y-4">
            {socialProofReviews.sort((a, b) => a.priority - b.priority).map((review) => (
              <Card key={review.id}>
                <CardContent className="flex items-start gap-4 p-4">
                  <GripVertical className="mt-1 h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span>{review.emoji}</span>
                      <Badge>{PURPOSE_LABELS[review.category]}</Badge>
                      <Badge variant={review.isApproved ? "success" : "warning"}>{review.isApproved ? "승인" : "대기"}</Badge>
                      <Badge variant="outline">P{review.priority}</Badge>
                    </div>
                    <p className="mt-2 text-sm">&ldquo;{review.content}&rdquo;</p>
                    <p className="mt-1 text-xs text-muted-foreground">— {review.author}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">편집</Button>
                    <Switch checked={review.isApproved} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}
