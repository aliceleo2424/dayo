import type {
  AutomationRule, ClassReport, CmsBanner,
  CmsCopy, Coupon, PromoCode, ReferralRecord,
  SocialProofReview, Tutor,
} from "./types";

export const automationRules: AutomationRule[] = [
  { id: "r1", name: "가입 후 24시간 미결제 → 웰컴 쿠폰", trigger: "가입 후 24시간 내 미결제", action: "WELCOME20 쿠폰 자동 발송", channel: "alimtalk", isActive: true, triggeredCount: 342, lastTriggeredAt: "2026-07-28T17:00:00" },
  { id: "r2", name: "테스트 완료 후 1시간 → 맞춤 코스 추천", trigger: "스피킹 테스트 완료 후 1시간", action: "맞춤 코스 추천 Push 발송", channel: "push", isActive: true, triggeredCount: 128, lastTriggeredAt: "2026-07-28T16:30:00" },
  { id: "r3", name: "체험 종료 D-1 → 결제 유도", trigger: "체험 기간 종료 1일 전", action: "30% 할인 쿠폰 SMS 발송", channel: "sms", isActive: false, triggeredCount: 56 },
  { id: "r4", name: "7일 미접속 → 재방문 유도", trigger: "7일 이상 미접속", action: "무료 체험 세션 1회 지급", channel: "email", isActive: true, triggeredCount: 89, lastTriggeredAt: "2026-07-27T09:00:00" },
];

export const coupons: Coupon[] = [
  { id: "c1", name: "신규 가입 웰컴", code: "WELCOME20", discountType: "percent", discountValue: 20, targetCondition: "신규 가입자", maxQuantity: 1000, issuedCount: 342, usedCount: 128, validFrom: "2026-01-01", validUntil: "2026-12-31", isActive: true },
  { id: "c2", name: "오픽 집중 할인", code: "OPIC30", discountType: "percent", discountValue: 30, targetCondition: "오픽 목적 수강생", maxQuantity: 200, issuedCount: 89, usedCount: 45, validFrom: "2026-07-01", validUntil: "2026-08-31", isActive: true },
  { id: "c3", name: "워홀 준비생 정액", code: "WH50000", discountType: "fixed", discountValue: 50000, targetCondition: "워홀 목적 + 영어 수강", maxQuantity: 100, issuedCount: 34, usedCount: 12, validFrom: "2026-06-01", validUntil: "2026-09-30", isActive: true },
  { id: "c4", name: "여름 시즌 특별", code: "SUMMER15", discountType: "percent", discountValue: 15, targetCondition: "전체", maxQuantity: 500, issuedCount: 210, usedCount: 98, validFrom: "2026-07-01", validUntil: "2026-07-31", isActive: false },
];

export const promoCodes: PromoCode[] = [
  { id: "p1", code: "DAYO_YT_MINJI", influencer: "민지의 영어일기", platform: "YouTube", signups: 198, conversions: 67, revenue: 8940000, createdAt: "2026-05-01" },
  { id: "p2", code: "DAYO_IG_SORA", influencer: "소라의 워홀로그", platform: "Instagram", signups: 156, conversions: 52, revenue: 6820000, createdAt: "2026-06-01" },
  { id: "p3", code: "DAYO_TT_HANNA", influencer: "하나의 오픽탈출", platform: "TikTok", signups: 89, conversions: 28, revenue: 3560000, createdAt: "2026-07-01" },
];

export const referralRecords: ReferralRecord[] = [
  { id: "ref1", referrerName: "김서연", referrerEmail: "seoyeon.k@email.com", referredName: "이하늘", referredEmail: "haneul.lee@email.com", rewardGiven: true, rewardAmount: 10000, createdAt: "2026-07-28" },
  { id: "ref2", referrerName: "최유진", referrerEmail: "yujin.choi@email.com", referredName: "정민아", referredEmail: "mina.jung@email.com", rewardGiven: false, rewardAmount: 10000, createdAt: "2026-07-28" },
  { id: "ref3", referrerName: "강예린", referrerEmail: "yerin.kang@email.com", referredName: "윤채원", referredEmail: "chaewon.yoon@email.com", rewardGiven: true, rewardAmount: 10000, createdAt: "2026-07-10" },
];

export const cmsBanners: CmsBanner[] = [
  { id: "b1", title: "여름 오픽 집중 코스", imageUrl: "/banners/summer-opic.jpg", linkUrl: "/promo/opic", targetAudience: "오픽 목적 미결제자", startDate: "2026-07-01", endDate: "2026-08-31", isActive: true, priority: 1 },
  { id: "b2", title: "워홀 준비생 웰컴 팝업", imageUrl: "/banners/wh-welcome.jpg", linkUrl: "/promo/wh", targetAudience: "워홀 목적 신규", startDate: "2026-07-15", endDate: "2026-09-30", isActive: true, priority: 2 },
  { id: "b3", title: "스피킹 테스트 CTA 강조", imageUrl: "/banners/test-cta.jpg", linkUrl: "/test", targetAudience: "테스트 미완료", startDate: "2026-07-01", endDate: "2026-12-31", isActive: false, priority: 3 },
];

export const cmsCopies: CmsCopy[] = [
  { id: "copy1", key: "hero_title_suffix", label: "히어로 타이틀 접미", value: ", 이제 돼요!" },
  { id: "copy2", key: "hero_subtitle", label: "히어로 서브 카피", value: "오픽부터 워홀까지, 눈 맞추며 시작하는 1:1 라이브 대화" },
  { id: "copy3", key: "cta_button", label: "메인 CTA 버튼", value: "🍰 내 스피킹 감각 무료로 테스트하기 >" },
  { id: "copy4", key: "rolling_languages", label: "언어 롤링 텍스트", value: "베트남어,스페인어,러시아어,영어,중국어,일본어,이탈리아어,프랑스어,독일어", languages: ["베트남어","스페인어","러시아어","영어","중국어","일본어","이탈리아어","프랑스어","독일어"] },
];

export const socialProofReviews: SocialProofReview[] = [
  { id: "sp1", emoji: "🎓", content: "워홀 가기 전 한 달 동안 했는데 외국인 울렁증 완전 사라졌어요!", author: "워홀 준비생 20대 K님", category: "working_holiday", isApproved: true, priority: 1 },
  { id: "sp2", emoji: "🎯", content: "오픽 AL 한 번에 달성! 막힐 때 AI 코파일럿이 살려준 덕분이에요", author: "취준생 20대 L님", category: "opic", isApproved: true, priority: 2 },
  { id: "sp3", emoji: "✈️", content: "해외 여행 가서 현지인 카페 주문 완벽 성공! 진짜 돼요!", author: "직장인 30대 P님", category: "travel", isApproved: true, priority: 3 },
  { id: "sp4", emoji: "📚", content: "유학 전 IELTS 스피킹 점수 0.5 올랐어요", author: "대학원 준비생 20대 J님", category: "study_abroad", isApproved: false, priority: 4 },
];

export const tutors: Tutor[] = [
  { id: "t1", name: "Emma Wilson", languages: ["english", "french"], nationality: "UK", status: "active", rating: 4.9, totalClasses: 342, noShowRate: 1.2, avatarInitial: "E" },
  { id: "t2", name: "James Chen", languages: ["english", "chinese"], nationality: "USA", status: "active", rating: 4.8, totalClasses: 289, noShowRate: 2.1, avatarInitial: "J" },
  { id: "t3", name: "Sakura Tanaka", languages: ["japanese", "english"], nationality: "Japan", status: "active", rating: 4.95, totalClasses: 198, noShowRate: 0.8, avatarInitial: "S" },
  { id: "t4", name: "Carlos Rivera", languages: ["spanish", "english"], nationality: "Spain", status: "on_leave", rating: 4.7, totalClasses: 156, noShowRate: 3.5, avatarInitial: "C" },
  { id: "t5", name: "Anna Müller", languages: ["german", "english"], nationality: "Germany", status: "active", rating: 4.85, totalClasses: 124, noShowRate: 1.5, avatarInitial: "A" },
];

export const classReports: ClassReport[] = [
  { id: "cr1", tutorId: "t1", tutorName: "Emma Wilson", userName: "학습자", rating: 5, noShow: false, date: "2026-07-28" },
  { id: "cr2", tutorId: "t2", tutorName: "James Chen", userName: "학습자", rating: 4, noShow: false, date: "2026-07-28" },
  { id: "cr3", tutorId: "t4", tutorName: "Carlos Rivera", userName: "학습자", rating: 0, noShow: true, issue: "학생 노쇼 — 연락 두절", date: "2026-07-27" },
  { id: "cr4", tutorId: "t3", tutorName: "Sakura Tanaka", userName: "학습자", rating: 5, noShow: false, date: "2026-07-27" },
  { id: "cr5", tutorId: "t1", tutorName: "Emma Wilson", userName: "학습자", rating: 5, noShow: false, date: "2026-07-26" },
];
