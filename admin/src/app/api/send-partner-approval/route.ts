import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { buildPartnerApprovalMessage } from '@/lib/transactional-email';

// Sends the partner approval (welcome to the DayO team) email for one approved application.
// Only a signed-in admin may call it; the recipient always comes from the stored application, never the request.
export async function POST(req: NextRequest) {
  try {
    const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const apiKey = process.env.RESEND_API_KEY;
    if (!url || !anon || !service || !apiKey) return NextResponse.json({ error: 'Email sending is not configured' }, { status: 503 });

    const token = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return NextResponse.json({ error: 'Sign in as an admin' }, { status: 401 });
    const asCaller = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: 'Bearer ' + token } } });
    const admin = await asCaller.rpc('dayo_is_admin');
    if (admin.error || admin.data !== true) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { applicationId, signupLink } = await req.json();
    const link = String(signupLink || '').trim();
    if (!applicationId || !/^https:\/\/[^\s<>"']+$/i.test(link)) return NextResponse.json({ error: 'Application and a valid https link are required' }, { status: 400 });

    const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const found = await db.from('partner_applications').select('id,full_name,email,final_status').eq('id', applicationId).maybeSingle();
    if (found.error || !found.data) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    if (found.data.final_status !== 'approved') return NextResponse.json({ error: 'Only approved applications can receive this email' }, { status: 409 });

    const message = buildPartnerApprovalMessage({ name: found.data.full_name, email: found.data.email, signupLink: link }, process.env.RESEND_FROM);
    const resend = new Resend(apiKey);
    const sent = await resend.emails.send({
      from: message.from, to: found.data.email, replyTo: message.reply_to,
      subject: message.subject, html: message.html, text: message.text,
    }, { idempotencyKey: 'partner-approval:' + found.data.id });
    if (sent.error) return NextResponse.json({ error: 'Email could not be sent' }, { status: 502 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Email could not be sent' }, { status: 500 });
  }
}
