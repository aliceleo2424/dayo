import Link from "next/link";

export default function MagazineArticleNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FFFCF9] px-4 text-center text-[#292524]">
      <div>
        <div className="text-5xl">☕</div>
        <h1 className="mt-5 text-2xl font-bold">아티클을 찾을 수 없습니다</h1>
        <p className="mt-3 text-sm leading-6 text-[#78716C]">
          삭제되었거나 아직 공개되지 않은 매거진 글입니다.
        </p>
        <Link href="https://dayotalk.com" className="mt-7 inline-flex rounded-full bg-[#FF755E] px-5 py-3 text-sm font-bold text-white">
          ← DayO 홈으로 돌아가기
        </Link>
      </div>
    </main>
  );
}
