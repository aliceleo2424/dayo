"use client";
import { useEffect } from "react";
// Integration hooks only: no analytics transport, cookies or private data.
export function PostBookingCta({ postKey, postId }: { postKey: string; postId: string }) {
  useEffect(() => { document.dispatchEvent(new CustomEvent("dayo:post_view", {detail:{post_id:postId}})); }, [postId]);
  return <section className="mx-auto mt-12 max-w-3xl rounded-3xl bg-[#FFFBF4] px-5 py-9 text-center sm:px-10">
    <h2 className="text-xl font-bold text-[#292524] sm:text-2xl">이 이야기를 나만의 대화로 이어가 보세요</h2>
    <p className="mt-3 text-sm text-[#57534E]">관심사와 대화 목적이 미리 선택되며, 자유롭게 바꿀 수 있어요.</p>
    <a href={`https://www.dayotalk.com/?booking=open&post=${encodeURIComponent(postKey)}`} onClick={() => document.dispatchEvent(new CustomEvent("dayo:booking_cta_click", {detail:{post_id:postId}}))} className="mt-6 inline-flex max-w-full items-center justify-center rounded-full bg-[#5F7D63] px-6 py-3.5 text-sm font-bold text-white transition hover:bg-[#4C6650] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#5F7D63]">이 주제로 대화하기</a>
  </section>;
}
