import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authorization = request.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const webhookUrl = Deno.env.get("SAFETY_ALERT_WEBHOOK_URL") || "";
    const admin = createClient(supabaseUrl, serviceKey);
    const auth = await admin.auth.getUser(token);
    const user = auth.data.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await request.json();
    const reportId = String(body.reportId || "");
    const report = await admin
      .from("safety_reports")
      .select("id, session_id, reporter_id, target_id, reason, created_at")
      .eq("id", reportId)
      .eq("reporter_id", user.id)
      .single();

    if (report.error || !report.data) {
      return new Response(JSON.stringify({ error: "Safety report not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!webhookUrl) {
      return new Response(JSON.stringify({ queued: true, webhookConfigured: false }), {
        status: 202,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const text = [
      "🚨 [비상 신고 접수]",
      `세션 ID: ${report.data.session_id}`,
      `신고 사유: ${report.data.reason}`,
      `신고자: ${report.data.reporter_id}`,
      `대상자: ${report.data.target_id || "미확인"}`,
    ].join(" / ");
    const webhookResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text, text }),
    });

    if (!webhookResponse.ok) {
      throw new Error(`Webhook returned ${webhookResponse.status}`);
    }

    return new Response(JSON.stringify({ sent: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
