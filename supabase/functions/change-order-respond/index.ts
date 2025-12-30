import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase configuration for change-order-respond function.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const ACTION_STATUS_MAP = {
  approve: "approved",
  approve_conditions: "approved_with_conditions",
  deny: "denied",
  needs_info: "needs_info",
} as const;

type ActionKey = keyof typeof ACTION_STATUS_MAP;
type RecipientRow = {
  id: string;
  change_order_id: string;
  email: string;
  name: string | null;
  status: string;
  response_token: string;
  condition_note: string | null;
};

type ChangeOrderStatus =
  | "pending"
  | "approved"
  | "approved_with_conditions"
  | "denied"
  | "needs_info";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const htmlResponse = (html: string, status = 200) => {
  // Ensure the browser renders the markup instead of showing it as plain text,
  // and explicitly override the platform defaults.
  const headers = new Headers({
    ...corsHeaders,
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": [
      "default-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "form-action 'self'",
      "frame-ancestors *",
      "sandbox allow-forms allow-same-origin allow-scripts allow-popups allow-top-navigation-by-user-activation",
    ].join("; "),
  });
  // Force content-type by using a Blob payload (avoids platform defaults on string bodies).
  const body = new Blob([html], { type: "text/html" });
  return new Response(body, { status, headers });
};

const renderHtmlResponse = (options: {
  title: string;
  message: string;
  status?: number;
}) => {
  const html = `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${options.title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <h1>${options.title}</h1>
    <p>${options.message}</p>
  </body>
  </html>`;
  return htmlResponse(html, options.status ?? 200);
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const determineChangeOrderStatus = (
  recipients: Array<{ status: string }>,
): ChangeOrderStatus => {
  const statuses = recipients.map((recipient) => recipient.status);
  if (statuses.some((status) => status === "pending")) {
    return "pending";
  }
  if (statuses.some((status) => status === "denied")) {
    return "denied";
  }
  if (statuses.some((status) => status === "needs_info")) {
    return "needs_info";
  }
  if (statuses.some((status) => status === "approved_with_conditions")) {
    return "approved_with_conditions";
  }
  return "approved";
};

const renderForm = ({
  token,
  preselectedAction,
  recipientLabel,
}: {
  token: string;
  preselectedAction: ActionKey | "";
  recipientLabel: string;
}) => {
  const checked = (value: ActionKey) => (preselectedAction === value ? "checked" : "");
  return `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Respond to change order</title>
  </head>
  <body>
    <h1>Respond to change order</h1>
    <p>for ${recipientLabel}</p>
    <form method="POST" action="">
      <input type="hidden" name="token" value="${token}" />
      <fieldset>
        <legend>Choose a response</legend>
        <label><input type="radio" name="action" value="approve" ${checked("approve")} /> Approve</label><br />
        <label><input type="radio" name="action" value="approve_conditions" ${checked(
          "approve_conditions",
        )} /> Approve with conditions</label><br />
        <label><input type="radio" name="action" value="deny" ${checked("deny")} /> Deny</label><br />
        <label><input type="radio" name="action" value="needs_info" ${checked("needs_info")} /> Needs more information</label>
      </fieldset>
      <p>
        <label for="note">Add a note (optional)</label><br />
        <textarea id="note" name="note" rows="4" cols="40"></textarea>
      </p>
      <button type="submit">Submit response</button>
      <p>Your response is recorded securely.</p>
    </form>
  </body>
  </html>`;
};

serve(async (req) => {
  const method = req.method.toUpperCase();

  if (method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const isHtmlPreferred = method === "GET" || (req.headers.get("accept") ?? "").includes("text/html");

  const url = new URL(req.url);
  const token = (url.searchParams.get("token") ?? "").trim();
  const preselectedAction = (url.searchParams.get("action") ?? "").trim() as ActionKey | "";

  if (!token) {
    return renderHtmlResponse({
      title: "Invalid Response Link",
      message: "The response link is missing required information.",
      status: 400,
    });
  }

  const { data: recipient, error } = await supabase
    .from("change_order_recipients")
    .select("id, change_order_id, email, name, status, response_token, condition_note")
    .eq("response_token", token)
    .maybeSingle();

  if (error || !recipient) {
    console.error("Unable to locate recipient for response token:", error);
    return renderHtmlResponse({
      title: "Response Not Found",
      message:
        "We could not find a pending change order response for this link. The link may have already been used.",
      status: 404,
    });
  }

  if (recipient.status !== "pending") {
    return renderHtmlResponse({
      title: "Already Responded",
      message: "This change order has already been responded to. No further action is required.",
    });
  }

  if (method === "GET") {
    const recipientLabel = recipient.name || recipient.email || "Recipient";
    const html = renderForm({ token, preselectedAction, recipientLabel });
    return htmlResponse(html, 200);
  }

  let action = preselectedAction;
  let note: string | null = null;
  let signature: string | null = null;

  try {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await req.json();
      action = (body?.action ?? action ?? "").trim();
      note = body?.note ?? null;
      signature = body?.signature ?? null;
    } else {
      const form = await req.formData();
      action = ((form.get("action") as string) ?? action ?? "").trim();
      note = (form.get("note") as string) ?? null;
      signature = (form.get("signature") as string) ?? null;
    }
  } catch (parseError) {
    console.error("Failed to parse response payload:", parseError);
    return isHtmlPreferred
      ? renderHtmlResponse({
          title: "Invalid Request",
          message: "We could not read the response data. Please try again.",
          status: 400,
        })
      : jsonResponse({ error: "Invalid payload" }, 400);
  }

  const trimmedAction = action as ActionKey;
  if (!(trimmedAction in ACTION_STATUS_MAP)) {
    return isHtmlPreferred
      ? renderHtmlResponse({
          title: "Invalid Response",
          message: "Please choose a valid response option.",
          status: 400,
        })
      : jsonResponse({ error: "Invalid action." }, 400);
  }

  const nextStatus = ACTION_STATUS_MAP[trimmedAction];
  const sanitizedNote = note && String(note).trim().length > 0 ? String(note).trim() : null;
  const sanitizedSignature =
    signature && typeof signature === "string" && signature.startsWith("data:image") ? signature : null;
  const combinedNote = [sanitizedNote, sanitizedSignature ? `Signature: ${sanitizedSignature}` : null]
    .filter(Boolean)
    .join("\n\n");
  const nowIso = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("change_order_recipients")
    .update({
      status: nextStatus,
      condition_note: combinedNote || null,
      responded_at: nowIso,
    })
    .eq("id", recipient.id);

  if (updateError) {
    console.error("Error updating recipient response:", updateError);
    return isHtmlPreferred
      ? renderHtmlResponse({
          title: "Response Failed",
          message: "We couldn't record your response. Please try again later.",
          status: 500,
        })
      : jsonResponse({ error: "Failed to update response." }, 500);
  }

  const { data: siblingRecipients, error: siblingsError } = await supabase
    .from("change_order_recipients")
    .select("status")
    .eq("change_order_id", recipient.change_order_id);

  if (siblingsError || !siblingRecipients) {
    console.error("Unable to load sibling recipient statuses:", siblingsError);
    return isHtmlPreferred
      ? renderHtmlResponse({
          title: "Response Recorded",
          message:
            "Your response was captured, but we could not update the overall request. The project team will review it shortly.",
        })
      : jsonResponse({ message: "Response recorded. Failed to refresh change order state." }, 200);
  }

  const overallStatus = determineChangeOrderStatus(siblingRecipients);
  const responsePayload: Record<string, unknown> = {
    status: overallStatus,
    updated_at: nowIso,
  };

  if (overallStatus === "pending") {
    responsePayload.response_at = null;
    responsePayload.response_message = combinedNote || null;
  } else {
    responsePayload.response_at = nowIso;
    responsePayload.response_message = combinedNote || null;
  }

  const { error: changeOrderError } = await supabase
    .from("change_orders")
    .update(responsePayload)
    .eq("id", recipient.change_order_id);

  if (changeOrderError) {
    console.error("Failed to update parent change order status:", changeOrderError);
  }

  const successMessage =
    trimmedAction === "approve"
      ? "Thanks! Your approval has been recorded."
      : trimmedAction === "approve_conditions"
      ? "Thanks! We've noted your conditional approval."
      : trimmedAction === "deny"
      ? "Your denial has been recorded."
      : "Thanks! The project team has been notified that you need more information.";

  return isHtmlPreferred
    ? renderHtmlResponse({ title: "Response submitted", message: successMessage })
    : jsonResponse({ message: successMessage, status: nextStatus });
});
