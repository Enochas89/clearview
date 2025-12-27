import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SUPABASE_URL = normalizeBaseUrl(Deno.env.get("SUPABASE_URL") ?? "");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const APP_URL = normalizeBaseUrl(Deno.env.get("APP_URL") ?? "");
const CONFIGURED_RESPONSE_BASE = normalizeBaseUrl(
  Deno.env.get("CHANGE_ORDER_RESPONSE_BASE_URL") ?? "",
);
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? Deno.env.get("EMAIL_FROM");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase service role configuration for edge function.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type ChangeOrderNotificationRequest = {
  changeOrderId: string;
  event: "created" | "status";
  status?: string;
};

type ChangeOrderRecipientRow = {
  id: string;
  email: string;
  name: string | null;
  status: string;
  condition_note: string | null;
  response_token: string;
};

type ChangeOrderRow = {
  id: string;
  subject: string | null;
  body: string | null;
  status: string | null;
  project_id: string;
  line_items: unknown;
  projects?: { name: string | null } | null;
  change_order_recipients: ChangeOrderRecipientRow[];
};

const ACTIONS = [
  { label: "Approve", action: "approve" },
  { label: "Approve w/ conditions", action: "approve_conditions" },
  { label: "Deny", action: "deny" },
  { label: "Needs info", action: "needs_info" },
] as const;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

const renderLineItems = (raw: unknown): string => {
  if (!raw) return "";
  try {
    const parsed = Array.isArray(raw) ? raw : JSON.parse(String(raw));
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return "";
    }
    const lines = parsed
      .map((item: any, index: number) => {
        const rawTitle = typeof item?.title === "string" && item.title.trim().length > 0
          ? item.title.trim()
          : `Item ${index + 1}`;
        const rawDescription = typeof item?.description === "string" ? item.description.trim() : "";
        const impactDays = Number.isFinite(item?.impactDays)
          ? Number(item.impactDays)
          : Number.isFinite(item?.impact_days)
          ? Number(item.impact_days)
          : 0;
        const cost = Number.isFinite(item?.cost) ? Number(item.cost) : 0;
        const title = escapeHtml(rawTitle);
        const description = escapeHtml(rawDescription || "No description");
        return `<li><strong>${title}</strong><br />${description}<br />Impact: ${impactDays} day(s) - Cost: $${cost.toFixed(2)}</li>`;
      })
      .join("");
    return `<h3>Line items</h3><ul>${lines}</ul>`;
  } catch (_error) {
    console.warn("Unable to parse line items payload.");
    return "";
  }
};

const renderPlainLineItems = (raw: unknown): string => {
  if (!raw) return "";
  try {
    const parsed = Array.isArray(raw) ? raw : JSON.parse(String(raw));
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return "";
    }
    const lines = parsed
      .map((item: any, index: number) => {
        const rawTitle = typeof item?.title === "string" && item.title.trim().length > 0
          ? item.title.trim()
          : `Item ${index + 1}`;
        const rawDescription = typeof item?.description === "string" ? item.description.trim() : "";
        const impactDays = Number.isFinite(item?.impactDays)
          ? Number(item.impactDays)
          : Number.isFinite(item?.impact_days)
          ? Number(item.impact_days)
          : 0;
        const cost = Number.isFinite(item?.cost) ? Number(item.cost) : 0;
        const title = rawTitle;
        const description = rawDescription || "No description";
        return `${title}\n${description}\nImpact: ${impactDays} day(s) - Cost: $${cost.toFixed(
          2,
        )}`;
      })
      .join("\n\n");
    return `\n\nLine items:\n${lines}`;
  } catch (_error) {
    return "";
  }
};

const buildActionUrl = (token: string, action: string) => {
  const responseBase =
    CONFIGURED_RESPONSE_BASE ||
    (SUPABASE_URL ? `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/change-order-respond` : "") ||
    APP_URL;

  if (!responseBase) return "";

  const url = new URL(responseBase);
  if (!url.pathname || url.pathname === "/") {
    url.pathname = "/functions/v1/change-order-respond";
  }
  url.searchParams.set("token", token);
  url.searchParams.set("action", action);
  return url.toString();
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
    throw new Error("Resend configuration missing (RESEND_API_KEY or RESEND_FROM_EMAIL).");
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  let payload: ChangeOrderNotificationRequest;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }

  if (!payload?.changeOrderId) {
    return jsonResponse({ error: "changeOrderId is required" }, 400);
  }

  const { data: changeOrder, error } = await supabase
    .from("change_orders")
    .select(
      "id, subject, body, status, project_id, line_items, projects(name), change_order_recipients(id, email, name, status, condition_note, response_token)",
    )
    .eq("id", payload.changeOrderId)
    .single();

  if (error || !changeOrder) {
    console.error("Unable to load change order for notification:", error);
    return jsonResponse({ error: "Change order not found" }, 404);
  }

  const row = changeOrder as ChangeOrderRow;
  const projectName = row.projects?.name ?? "Project";
  const subject =
    row.subject && row.subject.trim().length > 0
      ? row.subject.trim()
      : `Change order ${row.id.slice(0, 8)}`;
  const pendingRecipients = row.change_order_recipients.filter(
    (recipient) => recipient.status === "pending",
  );

  if (pendingRecipients.length === 0) {
    return jsonResponse({ message: "No pending recipients to notify." });
  }

  const htmlLineItems = renderLineItems(row.line_items);
  const textLineItems = renderPlainLineItems(row.line_items);

  const responses = [];
  for (const recipient of pendingRecipients) {
    const safeProjectName = escapeHtml(projectName);
    const safeSubject = escapeHtml(subject);
    const safeBody = row.body ? escapeHtml(row.body) : "";
    const htmlActions = ACTIONS.map((action) => {
      const url = buildActionUrl(recipient.response_token, action.action);
      const safeUrl = url || "#";
      return `<p><a href="${safeUrl}" style="background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block;">${action.label}</a></p>`;
    }).join("");

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;">
        <h2 style="margin-bottom:8px;">${safeProjectName}</h2>
        <p style="margin-top:0;">You have a new change order to review.</p>
        <h3>${safeSubject}</h3>
        ${row.body ? `<p>${safeBody}</p>` : ""}
        ${htmlLineItems}
        <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;" />
        <p>Please choose an option to respond:</p>
        ${htmlActions}
        <p style="font-size:12px;color:#6b7280;">If the buttons do not work, copy and paste these links:</p>
        <ul style="font-size:12px;color:#6b7280;">
          ${ACTIONS.map((action) => {
            const url = buildActionUrl(recipient.response_token, action.action);
            return `<li>${action.label}: <a href="${url}">${url}</a></li>`;
          }).join("")}
        </ul>
      </div>
    `;

    const text = `${projectName}

You have a new change order to review: ${subject}
${row.body ? `\n${row.body}\n` : ""}
Respond with one of the options below:

${ACTIONS.map((action) => {
      const url = buildActionUrl(recipient.response_token, action.action);
      return `${action.label}: ${url}`;
    }).join("\n")}
${textLineItems}
`;

    try {
      const sendResult = await sendViaResend({
        to: recipient.email,
        subject: `[Change Order] ${subject}`,
        html,
        text,
      });
      responses.push({ recipient: recipient.email, skipped: sendResult.skipped ?? false });
    } catch (sendError) {
      console.error("Failed to send change order email:", sendError);
      responses.push({ recipient: recipient.email, error: String(sendError) });
    }
  }

  return jsonResponse({ sent: responses.length, results: responses });
});
