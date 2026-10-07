"use client";
import { useState } from "react";
import resolver from "../../../public/profile-image-resolver.js";
export function ProfileImage({ avatarUrl, size = 40 }: { avatarUrl?: string | null; size?: number }) {
 const url = resolver.resolve(avatarUrl);
 const [failed, setFailed] = useState("");
 return <span className="inline-flex shrink-0 overflow-hidden rounded-full border border-[#E5DDD2] bg-[#F8F0E3]" style={{ width: size, height: size }} aria-label={url && failed !== url ? "프로필 사진" : "프로필 사진 없음"}>
  {url && failed !== url ? <img src={url} alt="프로필 사진" width={size} height={size} className="h-full w-full object-cover" onError={() => setFailed(url)} /> : null}
 </span>;
}
