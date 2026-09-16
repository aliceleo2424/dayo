"use client";

import { AdminHeader } from "@/components/admin/header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HeroCopyEditor } from "@/components/admin/hero-copy-editor";
import { BannerPopupEditor, MagazinePostsEditor, RealReviewsEditor } from "@/components/admin/cms-settings-editors";

export default function CmsPage() {
  return (
    <>
      <AdminHeader title="프론트 CMS" />
      <main className="p-6">
        <Tabs defaultValue="banners">
          <TabsList>
            <TabsTrigger value="banners">배너/팝업</TabsTrigger>
            <TabsTrigger value="magazine">라운지 매거진</TabsTrigger>
            <TabsTrigger value="copy">카피 에디터</TabsTrigger>
            <TabsTrigger value="reviews">후기 관리</TabsTrigger>
          </TabsList>

          <TabsContent value="banners" className="mt-6">
            <BannerPopupEditor />
          </TabsContent>

          <TabsContent value="magazine" className="mt-6">
            <MagazinePostsEditor />
          </TabsContent>

          <TabsContent value="copy" className="mt-6">
            <HeroCopyEditor />
          </TabsContent>

          <TabsContent value="reviews" className="mt-6">
            <RealReviewsEditor />
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}
