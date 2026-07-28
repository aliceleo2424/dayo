export type TargetPurpose = "opic" | "working_holiday" | "study_abroad" | "travel" | "business";
export type Language = "english" | "japanese" | "chinese" | "spanish" | "french" | "german" | "vietnamese";
export type PaymentStatus = "paid" | "trial" | "unpaid" | "refunded";
export type UtmSource = "instagram" | "youtube" | "google" | "naver" | "referral" | "direct" | "tiktok";
export type DiscountType = "percent" | "fixed";
export type CrmChannel = "alimtalk" | "push" | "sms" | "email";
export type TutorStatus = "active" | "on_leave" | "inactive";

export interface User {
  id: string;
  name: string;
  email: string;
  purpose: TargetPurpose;
  language: Language;
  utmSource: UtmSource;
  utmCampaign?: string;
  testScore: number | null;
  testCompleted: boolean;
  paymentStatus: PaymentStatus;
  totalSpent: number;
  joinedAt: string;
  lastActiveAt: string;
  phone?: string;
}

export interface UserLifecycleEvent {
  id: string;
  userId: string;
  type: "signup" | "test_complete" | "coupon_received" | "first_class" | "payment" | "referral";
  label: string;
  timestamp: string;
  metadata?: Record<string, string>;
}

export interface SpeakingTestResult {
  userId: string;
  overallScore: number;
  fluency: number;
  vocabulary: number;
  pronunciation: number;
  weakPoints: string[];
  recommendedCourse: string;
  completedAt: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  trigger: string;
  action: string;
  channel: CrmChannel;
  isActive: boolean;
  triggeredCount: number;
  lastTriggeredAt?: string;
}

export interface Coupon {
  id: string;
  name: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  targetCondition: string;
  maxQuantity: number;
  issuedCount: number;
  usedCount: number;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
}

export interface PromoCode {
  id: string;
  code: string;
  influencer: string;
  platform: string;
  signups: number;
  conversions: number;
  revenue: number;
  createdAt: string;
}

export interface ReferralRecord {
  id: string;
  referrerName: string;
  referrerEmail: string;
  referredName: string;
  referredEmail: string;
  rewardGiven: boolean;
  rewardAmount: number;
  createdAt: string;
}

export interface CmsBanner {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string;
  targetAudience: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  priority: number;
}

export interface CmsCopy {
  id: string;
  key: string;
  label: string;
  value: string;
  languages?: string[];
}

export interface SocialProofReview {
  id: string;
  emoji: string;
  content: string;
  author: string;
  category: TargetPurpose;
  isApproved: boolean;
  priority: number;
}

export interface Tutor {
  id: string;
  name: string;
  languages: Language[];
  nationality: string;
  status: TutorStatus;
  rating: number;
  totalClasses: number;
  noShowRate: number;
  avatarInitial: string;
}

export interface ClassReport {
  id: string;
  tutorId: string;
  tutorName: string;
  userName: string;
  rating: number;
  noShow: boolean;
  issue?: string;
  date: string;
}

export interface DashboardKpi {
  label: string;
  value: string;
  change: number;
  changeLabel: string;
}

export interface ChannelMetric {
  source: string;
  visitors: number;
  conversions: number;
  roas: number;
}

export interface PurposeMetric {
  purpose: string;
  count: number;
  fill: string;
}

export interface ActivityFeedItem {
  id: string;
  type: "signup" | "payment" | "test";
  userName: string;
  detail: string;
  amount?: number;
  timestamp: string;
}

export const PURPOSE_LABELS: Record<TargetPurpose, string> = {
  opic: "오픽",
  working_holiday: "워홀",
  study_abroad: "유학",
  travel: "여행",
  business: "비즈니스",
};

export const LANGUAGE_LABELS: Record<Language, string> = {
  english: "영어",
  japanese: "일본어",
  chinese: "중국어",
  spanish: "스페인어",
  french: "프랑스어",
  german: "독일어",
  vietnamese: "베트남어",
};

export const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  paid: "결제완료",
  trial: "체험중",
  unpaid: "미결제",
  refunded: "환불",
};

export const UTM_LABELS: Record<UtmSource, string> = {
  instagram: "Instagram",
  youtube: "YouTube",
  google: "Google",
  naver: "Naver",
  referral: "Referral",
  direct: "Direct",
  tiktok: "TikTok",
};
