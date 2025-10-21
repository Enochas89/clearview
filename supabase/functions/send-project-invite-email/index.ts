import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const APP_URL = Deno.env.get("APP_URL") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase service role configuration for edge function.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type ProjectInviteNotificationRequest = {
  memberId: string;
};

const sendViaResend = async ({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) => {
  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    console.warn("Resend configuration missing. Email send skipped.");
    return { skipped: true };
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to,
      subject,
      html,
      text,
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to send email via Resend: ${errorText}`);
  }
  return { skipped: false };
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  let payload: ProjectInviteNotificationRequest;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON payload" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!payload?.memberId) {
    return new Response(JSON.stringify({ error: "memberId is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: member, error } = await supabase
    .from("project_members")
    .select("id, email, full_name, projects(name, id)")
    .eq("id", payload.memberId)
    .single();

  if (error || !member) {
    console.error("Unable to load project member for notification:", error);
    return new Response(JSON.stringify({ error: "Project member not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const projectName = member.projects?.name ?? "a project";
  const projectUrl = `${APP_URL}/project/${member.projects?.id}`;

  const subject = `You've been invited to collaborate on ${projectName}`;
  const html = `
    <div style=\"font-family:Arial,sans-serif;line-height:1.5;color:#111827;\">
      <h2 style=\"margin-bottom:8px;\">You're invited!</h2>
      <p style=\"margin-top:0;\">You have been invited to collaborate on the project <strong>${projectName}</strong>.</p>
      <p><a href=\"${projectUrl}\" style=\"background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block;\">View Project</a></p>
      <p style=\"font-size:12px;color:#6b7280;\">If the button does not work, copy and paste this link into your browser: <a href=\"${projectUrl}\">${projectUrl}</a></p>
    </div>
  `;
  const text = `You have been invited to collaborate on the project ${projectName}. View the project here: ${projectUrl}`;

  try {
    const sendResult = await sendViaResend({
      to: member.email,
      subject,
      html,
      text,
    });
    return new Response(JSON.stringify({ sent: !sendResult.skipped }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (sendError) {
    console.error("Failed to send project invite email:", sendError);
    return new Response(JSON.stringify({ error: String(sendError) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});