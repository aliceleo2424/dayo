import type {
  ActivityFeedItem, AutomationRule, ChannelMetric, ClassReport, CmsBanner,
  CmsCopy, Coupon, DashboardKpi, PromoCode, PurposeMetric, ReferralRecord,
  SocialProofReview, SpeakingTestResult, Tutor, User, UserLifecycleEvent,
} from "./types";
import { UTM_LABELS } from "./types";

export const dashboardKpis: DashboardKpi[] = [
  { label: "실시간 매출", value: "₩12,840,000", change: 8.4, changeLabel: "전일 대비" },
  { label: "신규 가입자", value: "127", change: 12.1, changeLabel: "전주 대비" },
  { label: "10초 테스트 완료", value: "342", change: 5.7, changeLabel: "전일 대비" },
  { label: "CVR (전환율)", value: "18.6%", change: -1.2, changeLabel: "전주 대비" },
];

export const channelMetrics: ChannelMetric[] = [
  { source: "Instagram", visitors: 4200, conversions: 312, roas: 3.8 },
  { source: "YouTube", visitors: 2800, conversions: 198, roas: 4.2 },
  { source: "Google", visitors: 1900, conversions: 145, roas: 2.9 },
  { source: "Naver", visitors: 1500, conversions: 89, roas: 2.1 },
  { source: "TikTok", visitors: 980, conversions: 67, roas: 3.5 },
  { source: "Referral", visitors: 640, conversions: 112, roas: 5.1 },
];

export const purposeMetrics: PurposeMetric[] = [
  { purpose: "오픽", count: 420, fill: "#FF6B57" },
  { purpose: "워홀", count: 380, fill: "#64748B" },
  { purpose: "유학", count: 290, fill: "#94A3B8" },
  { purpose: "여행", count: 210, fill: "#CBD5E1" },
  { purpose: "비즈니스", count: 95, fill: "#E2E8F0" },
];

export const activityFeed: ActivityFeedItem[] = [
  { id: "a1", type: "payment", userName: "김서연", detail: "프리미엄 3개월 패키지 결제", amount: 297000, timestamp: "2026-07-28T18:42:00" },
  { id: "a2", type: "signup", userName: "이하늘", detail: "Instagram UTM 유입 가입", timestamp: "2026-07-28T18:38:00" },
  { id: "a3", type: "test", userName: "박지민", detail: "10초 스피킹 테스트 완료 (점수 78)", timestamp: "2026-07-28T18:35:00" },
  { id: "a4", type: "payment", userName: "최유진", detail: "오픽 집중 코스 결제", amount: 149000, timestamp: "2026-07-28T18:30:00" },
  { id: "a5", type: "signup", userName: "정민아", detail: "YouTube 인플루언서 코드 가입", timestamp: "2026-07-28T18:22:00" },
  { id: "a6", type: "test", userName: "한소희", detail: "10초 스피킹 테스트 완료 (점수 65)", timestamp: "2026-07-28T18:15:00" },
];

export const users: User[] = [
  { id: "u001", name: "김서연", email: "seoyeon.k@email.com", purpose: "opic", language: "english", utmSource: "instagram", utmCampaign: "opic_summer", testScore: 82, testCompleted: true, paymentStatus: "paid", totalSpent: 297000, joinedAt: "2026-07-15", lastActiveAt: "2026-07-28T18:42:00", phone: "010-1234-5678" },
  { id: "u002", name: "이하늘", email: "haneul.lee@email.com", purpose: "working_holiday", language: "english", utmSource: "youtube", utmCampaign: "wh_2026", testScore: 71, testCompleted: true, paymentStatus: "trial", totalSpent: 0, joinedAt: "2026-07-28", lastActiveAt: "2026-07-28T18:38:00" },
  { id: "u003", name: "박지민", email: "jimin.park@email.com", purpose: "study_abroad", language: "english", utmSource: "google", testScore: 78, testCompleted: true, paymentStatus: "unpaid", totalSpent: 0, joinedAt: "2026-07-27", lastActiveAt: "2026-07-28T18:35:00" },
  { id: "u004", name: "최유진", email: "yujin.choi@email.com", purpose: "opic", language: "english", utmSource: "naver", testScore: 88, testCompleted: true, paymentStatus: "paid", totalSpent: 149000, joinedAt: "2026-07-20", lastActiveAt: "2026-07-28T18:30:00" },
  { id: "u005", name: "정민아", email: "mina.jung@email.com", purpose: "travel", language: "french", utmSource: "youtube", utmCampaign: "travel_france", testScore: 65, testCompleted: true, paymentStatus: "unpaid", totalSpent: 0, joinedAt: "2026-07-28", lastActiveAt: "2026-07-28T18:22:00" },
  { id: "u006", name: "한소희", email: "sohee.han@email.com", purpose: "working_holiday", language: "english", utmSource: "tiktok", testScore: 65, testCompleted: true, paymentStatus: "unpaid", totalSpent: 0, joinedAt: "2026-07-28", lastActiveAt: "2026-07-28T18:15:00" },
  { id: "u007", name: "윤채원", email: "chaewon.yoon@email.com", purpose: "study_abroad", language: "japanese", utmSource: "instagram", testScore: 74, testCompleted: true, paymentStatus: "paid", totalSpent: 198000, joinedAt: "2026-07-10", lastActiveAt: "2026-07-28T17:50:00" },
  { id: "u008", name: "송다은", email: "daeun.song@email.com", purpose: "travel", language: "spanish", utmSource: "referral", testScore: null, testCompleted: false, paymentStatus: "unpaid", totalSpent: 0, joinedAt: "2026-07-28", lastActiveAt: "2026-07-28T17:30:00" },
  { id: "u009", name: "강예린", email: "yerin.kang@email.com", purpose: "opic", language: "english", utmSource: "direct", testScore: 91, testCompleted: true, paymentStatus: "paid", totalSpent: 445000, joinedAt: "2026-06-28", lastActiveAt: "2026-07-28T16:00:00" },
  { id: "u010", name: "임수빈", email: "subin.lim@email.com", purpose: "working_holiday", language: "english", utmSource: "instagram", testScore: 58, testCompleted: true, paymentStatus: "refunded", totalSpent: 99000, joinedAt: "2026-07-05", lastActiveAt: "2026-07-27T14:00:00" },
  { id: "u011", name: "오지우", email: "jiwoo.oh@email.com", purpose: "study_abroad", language: "german", utmSource: "google", testScore: 69, testCompleted: true, paymentStatus: "trial", totalSpent: 0, joinedAt: "2026-07-25", lastActiveAt: "2026-07-28T15:00:00" },
  { id: "u012", name: "배수아", email: "sua.bae@email.com", purpose: "travel", language: "vietnamese", utmSource: "naver", testScore: 72, testCompleted: true, paymentStatus: "paid", totalSpent: 89000, joinedAt: "2026-07-18", lastActiveAt: "2026-07-28T14:30:00" },
];

export const speakingTestResults: SpeakingTestResult[] = users
  .filter((u) => u.testCompleted && u.testScore !== null)
  .map((u) => ({
    userId: u.id,
    overallScore: u.testScore!,
    fluency: Math.min(100, u.testScore! + Math.floor(Math.random() * 10 - 5)),
    vocabulary: Math.min(100, u.testScore! - 5 + Math.floor(Math.random() * 8)),
    pronunciation: Math.min(100, u.testScore! - 3 + Math.floor(Math.random() * 6)),
    weakPoints: u.testScore! < 70 ? ["유창성", "어휘력"] : u.testScore! < 85 ? ["발음"] : [],
    recommendedCourse: u.purpose === "opic" ? "오픽 AL 집중 코스" : u.purpose === "working_holiday" ? "워홀 실전 회화 코스" : "1:1 맞춤 회화 코스",
    completedAt: u.lastActiveAt,
  }));

export const userLifecycleEvents: UserLifecycleEvent[] = [
  { id: "e1", userId: "u001", type: "signup", label: "Instagram UTM 유입 가입", timestamp: "2026-07-15T10:00:00" },
  { id: "e2", userId: "u001", type: "test_complete", label: "10초 스피킹 테스트 완료 (82점)", timestamp: "2026-07-15T10:05:00" },
  { id: "e3", userId: "u001", type: "coupon_received", label: "웰컴 쿠폰 WELCOME20 수령", timestamp: "2026-07-15T10:06:00" },
  { id: "e4", userId: "u001", type: "payment", label: "프리미엄 3개월 패키지 결제", timestamp: "2026-07-16T14:00:00" },
  { id: "e5", userId: "u001", type: "first_class", label: "Emma 튜터와 첫 1:1 대화 완료", timestamp: "2026-07-17T19:00:00" },
];

export const automationRules: AutomationRule[] = [
  { id: "r1", name: "가입 후 24시간 미결제 → 웰컴 쿠폰", trigger: "가입 후 24시간 내 미결제", action: "WELCOME20 쿠폰 자동 발송", channel: "alimtalk", isActive: true, triggeredCount: 342, lastTriggeredAt: "2026-07-28T17:00:00" },
  { id: "r2", name: "테스트 완료 후 1시간 → 맞춤 코스 추천", trigger: "10초 테스트 완료 후 1시간", action: "맞춤 코스 추천 Push 발송", channel: "push", isActive: true, triggeredCount: 128, lastTriggeredAt: "2026-07-28T16:30:00" },
  { id: "r3", name: "체험 종료 D-1 → 결제 유도", trigger: "체험 기간 종료 1일 전", action: "30% 할인 쿠폰 SMS 발송", channel: "sms", isActive: false, triggeredCount: 56 },
  { id: "r4", name: "7일 미접속 → 재방문 유도", trigger: "7일 이상 미접속", action: "무료 체험 수업 1회 지급", channel: "email", isActive: true, triggeredCount: 89, lastTriggeredAt: "2026-07-27T09:00:00" },
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
  { id: "b3", title: "10초 테스트 CTA 강조", imageUrl: "/banners/test-cta.jpg", linkUrl: "/test", targetAudience: "테스트 미완료", startDate: "2026-07-01", endDate: "2026-12-31", isActive: false, priority: 3 },
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
  { id: "cr1", tutorId: "t1", tutorName: "Emma Wilson", userName: "김서연", rating: 5, noShow: false, date: "2026-07-28" },
  { id: "cr2", tutorId: "t2", tutorName: "James Chen", userName: "이하늘", rating: 4, noShow: false, date: "2026-07-28" },
  { id: "cr3", tutorId: "t4", tutorName: "Carlos Rivera", userName: "박지민", rating: 0, noShow: true, issue: "학생 노쇼 — 연락 두절", date: "2026-07-27" },
  { id: "cr4", tutorId: "t3", tutorName: "Sakura Tanaka", userName: "윤채원", rating: 5, noShow: false, date: "2026-07-27" },
  { id: "cr5", tutorId: "t1", tutorName: "Emma Wilson", userName: "최유진", rating: 5, noShow: false, date: "2026-07-26" },
];

export function getUserById(id: string) {
  return users.find((u) => u.id === id);
}

export function getTestResultByUserId(userId: string) {
  return speakingTestResults.find((r) => r.userId === userId);
}

export function getLifecycleByUserId(userId: string) {
  if (userId === "u001") return userLifecycleEvents;
  const user = getUserById(userId);
  if (!user) return [];
  return [
    { id: "gen1", userId, type: "signup" as const, label: `${UTM_LABELS[user.utmSource]} 유입 가입`, timestamp: user.joinedAt + "T10:00:00" },
    ...(user.testCompleted ? [{ id: "gen2", userId, type: "test_complete" as const, label: `10초 테스트 완료 (${user.testScore}점)`, timestamp: user.lastActiveAt }] : []),
    ...(user.paymentStatus === "paid" ? [{ id: "gen3", userId, type: "payment" as const, label: "결제 완료", timestamp: user.lastActiveAt }] : []),
  ];
}
