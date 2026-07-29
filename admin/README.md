# DayO Admin — Marketing & CRM Backend

Next.js App Router 기반 DayO 마케팅 어드민 시스템.

## Tech Stack

- Next.js 15 (App Router)
- TypeScript (Strict)
- Tailwind CSS + shadcn/ui
- Recharts, Zustand, Lucide React

## Getting Started

```bash
cd admin
npm install
npm run dev
```

Open [http://localhost:3000/admin/dashboard](http://localhost:3000/admin/dashboard)

## Pages

| Route | Description |
|-------|-------------|
| `/admin/dashboard` | KPI, Charts, Activity Feed |
| `/admin/users` | 회원 CRM 테이블 |
| `/admin/users/[id]` | 회원 상세 & 진단 리포트 |
| `/admin/users/automation` | CRM 자동화 Rule Engine |
| `/admin/promotions` | 쿠폰, 제휴코드, Referral |
| `/admin/cms` | 배너, 카피, 후기 CMS |
| `/admin/tutors` | 대화 파트너 & 클래스 리포트 |

## Mock Data

All data is in `src/lib/mockData.ts` for pre-API development.
