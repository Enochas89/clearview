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

const renderHtmlResponse = (options: {
  title: string;
  message: string;
  status?: number;
}) =>
  new Response(
    `<!doctype html>
    <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>${options.title}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; background: #f9fafb; color: #111827; }
        main { max-width: 520px; margin: 0 auto; background: #fff; padding: 32px; border-radius: 12px; box-shadow: 0 20px 25px -15px rgba(15, 23, 42, 0.3); }
        h1 { font-size: 28px; margin-bottom: 16px; }
        p { font-size: 16px; line-height: 1.6; }
      </style>
    </head>
    <body>
      <main>
        <h1>${options.title}</h1>
        <p>${options.message}</p>
      </main>
    </body>
    </html>`,
    {
      status: options.status ?? 200,
      headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
    },
  );

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

serve(async (req) => {
  const method = req.method.toUpperCase();

  if (method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const isHtmlPreferred = method === "GET" || (req.headers.get("accept") ?? "").includes("text/html");

  let token = "";
  let action = "";
  let note: string | null = null;

  if (method === "GET") {
    const url = new URL(req.url);
    token = url.searchParams.get("token") ?? "";
    action = url.searchParams.get("action") ?? "";
    note = url.searchParams.get("note");
  } else if (method === "POST") {
    try {
      const body = await req.json();
      token = body?.token ?? "";
      action = body?.action ?? "";
      note = body?.note ?? null;
    } catch {
      return isHtmlPreferred
        ? renderHtmlResponse({
            title: "Invalid Request",
            message: "We could not read the response data. Please try again.",
            status: 400,
          })
        : jsonResponse({ error: "Invalid JSON payload" }, 400);
    }
  } else {
    return isHtmlPreferred
      ? renderHtmlResponse({
          title: "Unsupported Method",
          message: "Please submit your response using the provided link.",
          status: 405,
        })
      : jsonResponse({ error: "Method not allowed" }, 405);
  }

  const trimmedToken = token.trim();
  const trimmedAction = action.trim() as ActionKey;

  if (!trimmedToken || !(trimmedAction in ACTION_STATUS_MAP)) {
    return isHtmlPreferred
      ? renderHtmlResponse({
          title: "Invalid Response Link",
          message: "The response link is missing required information.",
          status: 400,
        })
      : jsonResponse({ error: "Invalid token or action." }, 400);
  }

  const { data: recipient, error } = await supabase
    .from("change_order_recipients")
    .select("id, change_order_id, email, name, status, response_token, condition_note")
    .eq("response_token", trimmedToken)
    .maybeSingle();

  if (error || !recipient) {
    console.error("Unable to locate recipient for response token:", error);
    return isHtmlPreferred
      ? renderHtmlResponse({
          title: "Response Not Found",
          message:
            "We could not find a pending change order response for this link. The link may have already been used.",
          status: 404,
        })
      : jsonResponse({ error: "Recipient not found for token." }, 404);
  }

  if (recipient.status !== "pending") {
    return isHtmlPreferred
      ? renderHtmlResponse({
          title: "Already Responded",
          message: "This change order has already been responded to. No further action is required.",
        })
      : jsonResponse({ message: "Recipient already responded.", status: "noop" });
  }

  const nextStatus = ACTION_STATUS_MAP[trimmedAction];
  const sanitizedNote = note && String(note).trim().length > 0 ? String(note).trim() : null;
  const nowIso = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("change_order_recipients")
    .update({
      status: nextStatus,
      condition_note: sanitizedNote,
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
    responsePayload.response_message = sanitizedNote;
  } else {
    responsePayload.response_at = nowIso;
    responsePayload.response_message = sanitizedNote;
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
