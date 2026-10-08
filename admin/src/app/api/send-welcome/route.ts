import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { buildWelcomeMessage, recipientLocale } from '@/lib/transactional-email';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const { email, nickname, locale } = await req.json();
    if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    // Read recipient preferences only; preserve the existing requested recipient.
    let role = 'user';
    let metadata = {};
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    try { if (url && key) {
      const service = createClient(url, key, {auth: {persistSession: false, autoRefreshToken: false}});
      const profile = await service.from('profiles').select('id,role').eq('email', email).maybeSingle();
      if (!profile.error && profile.data) {
        role = profile.data.role || 'user';
        const account = await service.auth.admin.getUserById(profile.data.id);
        if (!account.error) metadata = account.data.user?.user_metadata || {};
      }
    }
    } catch (_) { /* Unknown interface locale uses the existing User KO default. */ }
    const message = buildWelcomeMessage(nickname || '회원', role, recipientLocale(role, metadata, locale), process.env.RESEND_FROM);
    const data = await resend.emails.send({
      from: message.from, to: email, replyTo: message.reply_to,
      subject: message.subject, html: message.html, text: message.text,
    });
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Welcome email sending failed:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
