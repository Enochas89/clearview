import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const APP_URL = Deno.env.get("APP_URL") ?? "";
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

const renderLineItems = (raw: unknown): string => {
  if (!raw) return "";
  try {
    const parsed = Array.isArray(raw) ? raw : JSON.parse(String(raw));
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return "";
    }
    const lines = parsed
      .map((item: any, index: number) => {
        const title = typeof item?.title === "string" && item.title.trim().length > 0
          ? item.title.trim()
          : `Item ${index + 1}`;
        const description = typeof item?.description === "string" ? item.description.trim() : "";
        const impactDays = Number.isFinite(item?.impactDays)
          ? Number(item.impactDays)
          : Number.isFinite(item?.impact_days)
          ? Number(item.impact_days)
          : 0;
        const cost = Number.isFinite(item?.cost) ? Number(item.cost) : 0;
        return `<li><strong>${title}</strong><br />${description || "No description"}<br />Impact: ${impactDays} day(s) · Cost: $${cost.toFixed(2)}</li>`;
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
        const title = typeof item?.title === "string" && item.title.trim().length > 0
          ? item.title.trim()
          : `Item ${index + 1}`;
        const description = typeof item?.description === "string" ? item.description.trim() : "";
        const impactDays = Number.isFinite(item?.impactDays)
          ? Number(item.impactDays)
          : Number.isFinite(item?.impact_days)
          ? Number(item.impact_days)
          : 0;
        const cost = Number.isFinite(item?.cost) ? Number(item.cost) : 0;
        return `${title}\n${description || "No description"}\nImpact: ${impactDays} day(s) · Cost: $${cost.toFixed(
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
  if (!APP_URL) return "";
  const url = new URL("/change-order/respond", APP_URL);
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

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let payload: ChangeOrderNotificationRequest;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON payload" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!payload?.changeOrderId) {
    return new Response(JSON.stringify({ error: "changeOrderId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
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
    return new Response(JSON.stringify({ error: "Change order not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
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
    return new Response(JSON.stringify({ message: "No pending recipients to notify." }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const htmlLineItems = renderLineItems(row.line_items);
  const textLineItems = renderPlainLineItems(row.line_items);

  const responses = [];
  for (const recipient of pendingRecipients) {
    const htmlActions = ACTIONS.map((action) => {
      const url = buildActionUrl(recipient.response_token, action.action);
      const safeUrl = url || "#";
      return `<p><a href="${safeUrl}" style="background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block;">${action.label}</a></p>`;
    }).join("");

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;">
        <h2 style="margin-bottom:8px;">${projectName}</h2>
        <p style="margin-top:0;">You have a new change order to review.</p>
        <h3>${subject}</h3>
        ${row.body ? `<p>${row.body}</p>` : ""}
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

  return new Response(JSON.stringify({ sent: responses.length, results: responses }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
