import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const { email, nickname } = await req.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const targetName = nickname || '회원';
    const fromAddress = process.env.RESEND_FROM || 'DayO <hello@dayotalk.com>';

    const htmlContent = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DayO 웰컴 할인권</title>
</head>
<body style="margin: 0; padding: 24px 12px; background-color: #FAF8F5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 560px; background-color: #FFFFFF; border-radius: 20px; border: 1px solid #EFEAE4; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.04);">
    
    <!-- 상단 브랜딩 헤더 -->
    <tr>
      <td style="padding: 32px 32px 24px; text-align: center; border-bottom: 1px solid #FAF4EF; background: linear-gradient(180deg, #FFF9F6 0%, #FFFFFF 100%);">
        <div style="font-size: 11px; font-weight: 800; color: #FF755E; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 6px;">
          1:1 Global Culture · Conversation Lounge
        </div>
        <div style="font-size: 24px; font-weight: 900; color: #2D2420; letter-spacing: -0.02em;">
          DayO (돼요)
        </div>
      </td>
    </tr>

    <!-- 본문 내용 -->
    <tr>
      <td style="padding: 32px; color: #3A322D; font-size: 15px; line-height: 1.75;">
        <p style="margin: 0 0 16px; font-size: 16px; font-weight: 700; color: #1F1916;">
          안녕하세요, ${targetName}님!
        </p>
        <p style="margin: 0 0 16px;">
          약정 없이 가볍게, 친구와 카페에서 이야기 나누듯 편안한 1:1 글로벌 캐주얼 라운지 <strong>DayO</strong>입니다.
        </p>
        <p style="margin: 0 0 24px; background-color: #FFF6F3; padding: 14px 16px; border-radius: 12px; border-left: 4px solid #FF755E; color: #9E3827; font-size: 14.5px;">
          가입해 주신 <strong>${targetName}</strong>님을 위해 신규 회원 전용 <strong>[첫 세션 9,900원 체험 할인권]</strong>을 계정 쿠폰함에 넣어드렸어요. (예약 결제 시 자동 적용됩니다)
        </p>

        <!-- 핵심 차별점 안내 -->
        <div style="background-color: #FBF9F7; border: 1px solid #F0ECE8; border-radius: 14px; padding: 20px; margin-bottom: 28px;">
          <div style="font-weight: 800; font-size: 15px; margin-bottom: 12px; color: #2D2420;">
            💡 DayO는 이렇게 가볍고 편안해요
          </div>
          <div style="margin-bottom: 10px; font-size: 14px; color: #524741;">
            • <strong>약정 없이 가볍게:</strong> 큰 비용 묶이는 장기 약정 없이, 깔끔한 1회 티켓과 산뜻한 3회 패키지로 필요한 만큼만 충전해요.
          </div>
          <div style="margin-bottom: 10px; font-size: 14px; color: #524741;">
            • <strong>다양한 파트너, 다양한 언어:</strong> 여러 나라에서 온 현지 파트너들과 취향과 일상을 다채로운 언어로 자유롭게 나눠보세요.
          </div>
          <div style="font-size: 14px; color: #524741;">
            • <strong>실시간 AI 매니저:</strong> 대화 중 단어가 생각나지 않아도 화면 속 AI 매니저가 자연스러운 표현 힌트를 살짝 띄워드려요.
          </div>
        </div>

        <p style="margin: 0 0 24px; font-size: 14.5px; text-align: center; color: #4A403A;">
          지금 나와 관심사가 맞는 글로벌 파트너를 확인하고, 편안한 첫 대화를 예약해 보세요.
        </p>

        <!-- 듀얼 CTA 버튼 영역 -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 16px;">
          <!-- 메인 버튼 -->
          <tr>
            <td align="center" style="padding-bottom: 10px;">
              <a href="https://dayotalk.com/#partners" target="_blank" style="display: block; width: 100%; box-sizing: border-box; background-color: #FF755E; color: #FFFFFF; text-decoration: none; font-size: 16px; font-weight: 800; text-align: center; padding: 14px 20px; border-radius: 12px; box-shadow: 0 4px 12px rgba(255, 117, 94, 0.28);">
                첫 세션 파트너 예약하기 ☕
              </a>
            </td>
          </tr>
          <!-- 서브 버튼 -->
          <tr>
            <td align="center">
              <a href="https://dayotalk.com/mypage.html" target="_blank" style="display: block; width: 100%; box-sizing: border-box; background-color: #FFF5F2; border: 1px solid #FF8E7A; color: #E0533C; text-decoration: none; font-size: 14.5px; font-weight: 700; text-align: center; padding: 12px 20px; border-radius: 12px;">
                내 스피킹 감각 무료 진단하기 ✨
              </a>
            </td>
          </tr>
        </table>

      </td>
    </tr>

    <!-- 하단 푸터 -->
    <tr>
      <td style="padding: 20px 32px; background-color: #FAF8F5; border-top: 1px solid #EFEAE4; text-align: center; font-size: 12px; color: #8A7E75; line-height: 1.6;">
        문의: <a href="mailto:dayo.speak@gmail.com" style="color: #61564D; font-weight: 600; text-decoration: underline;">dayo.speak@gmail.com</a> | DayO 팀 드림<br>
        <span style="font-size: 11px; color: #ABA095;">본 메일은 DayO 회원가입 혜택 안내를 위해 발송되었습니다.</span>
      </td>
    </tr>

  </table>
</body>
</html>
    `;

    const data = await resend.emails.send({
      from: fromAddress,
      to: email,
      reply_to: 'dayo.speak@gmail.com',
      subject: `[DayO] ${targetName}님, 첫 세션 9,900원 체험 할인권이 도착했습니다 ☕`,
      html: htmlContent,
    });

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Welcome email sending failed:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}