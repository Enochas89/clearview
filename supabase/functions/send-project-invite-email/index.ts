import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { SMTPClient } from "https://deno.land/x/denomailer/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const APP_URL = Deno.env.get("APP_URL") ?? "";
const BREVO_SMTP_HOST = Deno.env.get("BREVO_SMTP_HOST");
const BREVO_SMTP_PORT = Deno.env.get("BREVO_SMTP_PORT");
const BREVO_SMTP_USER = Deno.env.get("BREVO_SMTP_USER");
const BREVO_SMTP_PASSWORD = Deno.env.get("BREVO_SMTP_PASSWORD");
const BREVO_FROM_EMAIL = Deno.env.get("BREVO_FROM_EMAIL");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase service role configuration for edge function.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type ProjectInviteNotificationRequest = {
  memberId: string;
};

const sendViaBrevo = async ({
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
  if (
    !BREVO_SMTP_HOST ||
    !BREVO_SMTP_PORT ||
    !BREVO_SMTP_USER ||
    !BREVO_SMTP_PASSWORD ||
    !BREVO_FROM_EMAIL
  ) {
    console.warn("Brevo SMTP configuration missing. Email send skipped.");
    return { skipped: true };
  }

  const client = new SMTPClient({
    connection: {
      hostname: BREVO_SMTP_HOST,
      port: Number(BREVO_SMTP_PORT),
      tls: false,
      starttls: true,
      auth: {
        username: BREVO_SMTP_USER,
        password: BREVO_SMTP_PASSWORD,
      },
    },
  });

  await client.send({
    from: BREVO_FROM_EMAIL,
    to,
    subject,
    content: text,
    html,
  });

  await client.close();

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
      <p><a href=\"$\{projectUrl}\" style=\"background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block;\">View Project</a></p>
      <p style=\"font-size:12px;color:#6b7280;\">If the button does not work, copy and paste this link into your browser: <a href=\"$\{projectUrl}\">$\{projectUrl}</a></p>
    </div>
  `;
  const text = `You have been invited to collaborate on the project ${projectName}. View the project here: ${projectUrl}`;

  try {
    const sendResult = await sendViaBrevo({
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
