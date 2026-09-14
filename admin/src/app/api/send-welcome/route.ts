import { Resend } from "resend";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: CORS });
}

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function welcomeHtml(nickname: string) {
  const name = escapeHtml(nickname || "회원");
  const cta = "https://dayotalk.com/#partners";
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DayO 웰컴 쿠폰</title>
</head>
<body style="margin:0;padding:0;background:#FFF8F3;font-family:'Apple SD Gothic Neo',Pretendard,sans-serif;color:#5C4A42;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FFF8F3;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#FFFCFA;border:1px solid #FFD1DC;border-radius:24px;overflow:hidden;">
          <tr>
            <td style="padding:28px 24px 18px;background:linear-gradient(135deg,#FFD1DC,#FFE5B4 55%,#FFF1D8);text-align:center;">
              <p style="margin:0;font-size:13px;letter-spacing:.08em;font-weight:800;color:#FF755E;">DAYO</p>
              <h1 style="margin:8px 0 0;font-size:28px;line-height:1.3;">DayO (돼요)</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px 8px;font-size:16px;line-height:1.7;">
              <p style="margin:0 0 16px;">안녕하세요, <strong>${name}</strong>님!</p>
              <p style="margin:0 0 16px;">평가받는 부담 없이, 친구와 카페에서 이야기 나누듯 편안한 1:1 대화 라운지 DayO입니다.</p>
              <p style="margin:0 0 20px;">가입해 주신 <strong>${name}</strong>님을 위해 신규 회원 전용 <strong>[첫 세션 9,900원 체험 할인권]</strong>을 계정 쿠폰함에 넣어드렸어요.</p>
              <p style="margin:0 0 8px;font-weight:800;">💡 DayO에서는 긴장하지 마세요</p>
              <ul style="margin:0 0 20px;padding-left:18px;line-height:1.7;">
                <li><strong>준비 없는 가벼운 대화:</strong> 교재나 문법 시험 대신, 관심사 카드와 함께 일상 이야기를 나눠요.</li>
                <li><strong>실시간 AI 보조:</strong> 단어가 생각나지 않아도 화면 속 AI 매니저가 자연스러운 표현 힌트를 띄워드려요.</li>
                <li><strong>깔끔한 복습:</strong> 25분 대화가 끝나면 모바일 5분 터치 퀴즈로 오늘 나눈 표현을 정리해요.</li>
              </ul>
              <p style="margin:0 0 24px;">지금 나와 잘 맞는 글로벌 파트너를 확인하고, 편안한 첫 대화를 예약해 보세요.</p>
              <p style="margin:0 0 28px;text-align:center;">
                <a href="${cta}" style="display:inline-block;background:#FF755E;color:#ffffff;text-decoration:none;font-weight:800;border-radius:999px;padding:14px 22px;">첫 세션 파트너 예약하기 ☕</a>
              </p>
              <p style="margin:0 0 8px;font-size:13px;color:#9A8580;">(내 스피킹 감각 진단은 마이페이지에서 언제든 무료로 이용하실 수 있습니다.)</p>
              <p style="margin:0;font-size:13px;color:#9A8580;">문의: support@dayotalk.com | DayO 팀 드림</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 28px;"></td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  try {
    const apiKey = String(process.env.RESEND_API_KEY || "").trim();
    if (!apiKey) {
      return json(500, { ok: false, error: "RESEND_API_KEY is not configured" });
    }

    const body = (await req.json().catch(() => ({}))) as { email?: string; nickname?: string };
    const email = String(body.email || "").trim().toLowerCase();
    const nickname = String(body.nickname || "회원").trim() || "회원";
    if (!isValidEmail(email)) {
      return json(400, { ok: false, error: "valid email is required" });
    }

    const from = String(process.env.RESEND_FROM || "").trim() || "DayO <onboarding@resend.dev>";
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from,
      to: email,
      subject: `[DayO] ${nickname}님, 첫 세션 9,900원 체험 할인권이 도착했습니다 ☕`,
      html: welcomeHtml(nickname),
    });

    if (result.error) {
      return json(502, { ok: false, error: result.error.message || "resend failed" });
    }
    return json(200, { ok: true, id: result.data?.id || null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "welcome email failed";
    return json(500, { ok: false, error: message });
  }
}
