import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? Deno.env.get("EMAIL_FROM");
const APP_URL = Deno.env.get("APP_URL") ?? "";
const RESPONSE_BASE_URL =
  Deno.env.get("CHANGE_ORDER_RESPOND_BASE_URL") ||
  APP_URL ||
  (SUPABASE_URL ? `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1` : "");

const RESPONSE_ROUTE = "change-order/respond";
const PDF_BUCKET = "change-order-pdfs";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase configuration for create-change-order function.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type LineItem = {
  title?: string;
  description?: string;
  impactDays?: number;
  cost?: number;
};

type CreateChangeOrderPayload = {
  projectId: string;
  subject: string;
  description: string;
  recipientName: string;
  recipientEmail: string;
  lineItems: LineItem[];
  recipients: Array<{ email: string; name?: string | null }>;
  actor?: { id?: string | null; name?: string | null; email?: string | null };
};

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

const buildActionUrl = (token: string, action: string) => {
  if (!RESPONSE_BASE_URL) return "";
  const base = /^https?:\/\//i.test(RESPONSE_BASE_URL)
    ? RESPONSE_BASE_URL
    : `https://${RESPONSE_BASE_URL}`;
  const url = new URL(base);
  const isFunctionsHost = url.pathname.includes("/functions");
  const responsePath = isFunctionsHost ? "change-order-respond" : RESPONSE_ROUTE;
  const normalizedBase = url.pathname.replace(/\/$/, "");
  const alreadyIncludesPath =
    normalizedBase.endsWith(`/${responsePath}`) || normalizedBase === `/${responsePath}`;
  url.pathname = alreadyIncludesPath ? normalizedBase : `${normalizedBase}/${responsePath}`;
  url.searchParams.set("token", token);
  url.searchParams.set("action", action);
  return url.toString();
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const renderPdf = async ({
  subject,
  description,
  projectName,
  lineItems,
  changeOrderId,
}: {
  subject: string;
  description: string;
  projectName: string;
  lineItems: LineItem[];
  changeOrderId: string;
}) => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // US Letter
  const { height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = height - 60;
  const left = 50;

  const drawText = (text: string, options?: { size?: number; bold?: boolean }) => {
    const size = options?.size ?? 12;
    page.drawText(text, { x: left, y, size, font: options?.bold ? bold : font, color: rgb(0, 0, 0) });
    y -= size + 6;
  };

  drawText(projectName || "Project", { size: 16, bold: true });
  drawText(`Change Order: ${subject}`, { size: 14, bold: true });
  drawText(`ID: ${changeOrderId}`);
  drawText("");
  drawText("Description:", { bold: true });
  description
    .split(/\r?\n/)
    .filter(Boolean)
    .forEach((line) => drawText(line));

  y -= 8;
  drawText("Line Items", { bold: true });

  let totalCost = 0;
  lineItems.forEach((item, index) => {
    const title = item.title?.trim() || `Item ${index + 1}`;
    const cost = Number(item.cost) || 0;
    totalCost += cost;
    const impact = Number(item.impactDays) || 0;
    drawText(`${title} - Impact: ${impact} day(s) - Cost: $${cost.toFixed(2)}`, { bold: true });
    const descriptionLines = (item.description ?? "").trim().split(/\r?\n/).filter(Boolean);
    descriptionLines.forEach((line) => drawText(line));
    y -= 4;
  });

  y -= 6;
  drawText(`Total Cost: $${totalCost.toFixed(2)}`, { bold: true, size: 13 });

  const pdfBytes = await pdfDoc.save();
  return { pdfBytes, totalCost };
};

const sendEmail = async ({
  to,
  subject,
  html,
  text,
  pdfBase64,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
  pdfBase64: string | null;
}) => {
  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    console.warn("Resend configuration missing. Email send skipped.");
    return { skipped: true };
  }
  const body: Record<string, unknown> = {
    from: RESEND_FROM_EMAIL,
    to,
    subject,
    html,
    text,
  };
  if (pdfBase64) {
    body.attachments = [
      {
        filename: "change-order.pdf",
        content: pdfBase64,
      },
    ];
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to send email via Resend: ${errorText}`);
  }
  return { skipped: false };
};

const renderLineItemsHtml = (lineItems: LineItem[]) => {
  if (!lineItems.length) return "";
  const rows = lineItems
    .map((item, idx) => {
      const title = escapeHtml(item.title?.trim() || `Item ${idx + 1}`);
      const description = escapeHtml(item.description?.trim() || "No description");
      const impact = Number(item.impactDays) || 0;
      const cost = Number(item.cost) || 0;
      return `<li><strong>${title}</strong><br />${description}<br />Impact: ${impact} day(s) - Cost: $${cost.toFixed(
        2,
      )}</li>`;
    })
    .join("");
  return `<h3>Line items</h3><ul>${rows}</ul>`;
};

const renderLineItemsText = (lineItems: LineItem[]) => {
  if (!lineItems.length) return "";
  return `\n\nLine items:\n${lineItems
    .map((item, idx) => {
      const title = item.title?.trim() || `Item ${idx + 1}`;
      const description = item.description?.trim() || "No description";
      const impact = Number(item.impactDays) || 0;
      const cost = Number(item.cost) || 0;
      return `${title}\n${description}\nImpact: ${impact} day(s) - Cost: $${cost.toFixed(2)}`;
    })
    .join("\n\n")}`;
};

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  let payload: CreateChangeOrderPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }

  if (
    !payload?.projectId ||
    !payload?.subject?.trim() ||
    !payload?.recipientEmail?.trim() ||
    !Array.isArray(payload?.lineItems)
  ) {
    return jsonResponse({ error: "Missing required fields" }, 400);
  }

  const changeOrderId = crypto.randomUUID();
  const lineItems = payload.lineItems ?? [];
  const nowIso = new Date().toISOString();

  const { data: projectRow } = await supabase
    .from("projects")
    .select("name")
    .eq("id", payload.projectId)
    .maybeSingle();
  const projectName = (projectRow?.name as string | null) ?? "Project";

  const { error: insertError } = await supabase.from("change_orders").insert([
    {
      id: changeOrderId,
      project_id: payload.projectId,
      subject: payload.subject.trim(),
      body: payload.description.trim(),
      recipient_name: payload.recipientName?.trim() || null,
      recipient_email: payload.recipientEmail.trim().toLowerCase(),
      status: "pending",
      sent_at: nowIso,
      updated_at: nowIso,
      response_at: null,
      response_message: null,
      created_by: payload.actor?.id ?? null,
      created_by_name: payload.actor?.name ?? payload.actor?.email ?? null,
      responded_by: null,
      responded_by_name: null,
      line_items: lineItems,
      total_amount: lineItems.reduce((sum, item) => sum + (Number(item.cost) || 0), 0),
    },
  ]);

  if (insertError) {
    console.error("Failed to insert change order:", insertError);
    return jsonResponse({ error: "Failed to create change order." }, 500);
  }

  // Recipients (dedupe by email)
  const recipientRecords: Array<{ email: string; name: string | null; response_token: string }> = [];
  const addRecipient = (email?: string | null, name?: string | null) => {
    const cleaned = email?.trim().toLowerCase();
    if (!cleaned) return;
    if (recipientRecords.some((r) => r.email === cleaned)) return;
    recipientRecords.push({
      email: cleaned,
      name: name?.trim() || null,
      response_token: crypto.randomUUID(),
    });
  };

  addRecipient(payload.recipientEmail, payload.recipientName);
  (payload.recipients ?? []).forEach((r) => addRecipient(r.email, r.name ?? null));

  if (recipientRecords.length > 0) {
    const { error: recipientsError } = await supabase.from("change_order_recipients").insert(
      recipientRecords.map((rec) => ({
        change_order_id: changeOrderId,
        email: rec.email,
        name: rec.name,
        status: "pending",
        response_token: rec.response_token,
      })),
    );
    if (recipientsError) {
      console.error("Failed to insert change order recipients:", recipientsError);
    }
  }

  // Build PDF
  let pdfBase64: string | null = null;
  let signedUrl: string | null = null;
  try {
    const { pdfBytes } = await renderPdf({
      subject: payload.subject.trim(),
      description: payload.description.trim(),
      projectName,
      lineItems,
      changeOrderId,
    });
    pdfBase64 = toBase64(pdfBytes);

    // Upload for download via signed URL
    const filePath = `change_orders/${changeOrderId}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from(PDF_BUCKET)
      .upload(filePath, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (uploadError) {
      console.error("Failed to upload change order PDF:", uploadError);
    } else {
      const { data: signed } = await supabase.storage
        .from(PDF_BUCKET)
        .createSignedUrl(filePath, 60 * 60 * 24 * 7); // 7 days
      signedUrl = signed?.signedUrl ?? null;
    }
  } catch (pdfError) {
    console.error("Failed to generate/upload PDF:", pdfError);
  }

  // Send emails
  const htmlLineItems = renderLineItemsHtml(lineItems);
  const textLineItems = renderLineItemsText(lineItems);

  for (const recipient of recipientRecords) {
    const urlApprove = buildActionUrl(recipient.response_token, "approve");
    const urlApproveCond = buildActionUrl(recipient.response_token, "approve_conditions");
    const urlDeny = buildActionUrl(recipient.response_token, "deny");
    const urlNeedsInfo = buildActionUrl(recipient.response_token, "needs_info");

    const safeProject = escapeHtml(projectName);
    const safeSubject = escapeHtml(payload.subject.trim());
    const safeBody = escapeHtml(payload.description.trim());

    const attachmentNote = signedUrl
      ? `<p style="margin:12px 0 0;font-size:12px;color:#6b7280;">PDF: <a href="${signedUrl}">Download</a></p>`
      : "";

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;">
        <h2 style="margin-bottom:8px;">${safeProject}</h2>
        <p style="margin-top:0;">You have a new change order to review.</p>
        <h3>${safeSubject}</h3>
        ${payload.description ? `<p>${safeBody}</p>` : ""}
        ${htmlLineItems}
        ${attachmentNote}
        <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;" />
        <p>Please choose an option to respond:</p>
        <p><a href="${urlApprove}" style="background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block;">Approve</a></p>
        <p><a href="${urlApproveCond}" style="background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block;">Approve w/ conditions</a></p>
        <p><a href="${urlDeny}" style="background:#ef4444;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block;">Deny</a></p>
        <p><a href="${urlNeedsInfo}" style="background:#0ea5e9;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block;">Needs info</a></p>
        <p style="font-size:12px;color:#6b7280;">If the buttons do not work, copy and paste these links:</p>
        <ul style="font-size:12px;color:#6b7280;">
          <li>Approve: <a href="${urlApprove}">${urlApprove}</a></li>
          <li>Approve w/ conditions: <a href="${urlApproveCond}">${urlApproveCond}</a></li>
          <li>Deny: <a href="${urlDeny}">${urlDeny}</a></li>
          <li>Needs info: <a href="${urlNeedsInfo}">${urlNeedsInfo}</a></li>
        </ul>
      </div>
    `;

    const text = `${projectName}

You have a new change order to review: ${payload.subject}
${payload.description ? `\n${payload.description}\n` : ""}
Respond with one of the options below:

Approve: ${urlApprove}
Approve w/ conditions: ${urlApproveCond}
Deny: ${urlDeny}
Needs info: ${urlNeedsInfo}
${signedUrl ? `\nDownload PDF: ${signedUrl}\n` : ""}
${textLineItems}
`;

    try {
      await sendEmail({
        to: recipient.email,
        subject: `[Change Order] ${payload.subject}`,
        html,
        text,
        pdfBase64,
      });
    } catch (sendError) {
      console.error("Failed to send change order email:", sendError);
    }
  }

  return jsonResponse({ changeOrderId: changeOrderId, recipients: recipientRecords.map((r) => r.email) }, 200);
});
