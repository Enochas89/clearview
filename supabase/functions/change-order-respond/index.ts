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
    <style>
      :root { color-scheme: light; }
      body { font-family: Arial, sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
      .shell { max-width: 640px; margin: 32px auto; background: #fff; padding: 28px; border-radius: 16px; box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12); }
      h1 { margin: 0 0 12px; font-size: 24px; }
      p { margin: 0 0 16px; line-height: 1.5; }
      .field { margin-bottom: 18px; }
      .label { display: block; font-weight: 600; margin-bottom: 8px; }
      .options { display: grid; gap: 10px; }
      .option { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 10px; }
      textarea { width: 100%; min-height: 96px; padding: 10px 12px; border-radius: 10px; border: 1px solid #cbd5e1; font-family: inherit; font-size: 14px; }
      canvas { width: 100%; max-width: 100%; height: 160px; border: 1px dashed #cbd5e1; border-radius: 10px; background: #f8fafc; }
      .sig-actions { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; font-size: 12px; color: #475569; }
      button[type="submit"] { width: 100%; padding: 14px 16px; font-weight: 700; border: none; border-radius: 999px; background: linear-gradient(135deg, #2563eb, #3b82f6); color: #fff; cursor: pointer; }
      button[type="button"] { padding: 8px 12px; border-radius: 10px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer; }
      .note { font-size: 13px; color: #475569; }
      .error { color: #b91c1c; margin-bottom: 12px; }
      .success { color: #0f766e; margin-bottom: 12px; }
    </style>
  </head>
  <body>
    <div class="shell">
      <h1>Respond to change order</h1>
      <p>for ${recipientLabel}</p>
      <div id="message"></div>
      <form id="response-form">
        <input type="hidden" name="token" value="${token}" />
        <div class="field">
          <span class="label">Choose a response</span>
          <div class="options">
            <label class="option"><input type="radio" name="action" value="approve" ${checked(
              "approve",
            )} /> Approve</label>
            <label class="option"><input type="radio" name="action" value="approve_conditions" ${checked(
              "approve_conditions",
            )} /> Approve with conditions</label>
            <label class="option"><input type="radio" name="action" value="deny" ${checked(
              "deny",
            )} /> Deny</label>
            <label class="option"><input type="radio" name="action" value="needs_info" ${checked(
              "needs_info",
            )} /> Needs more information</label>
          </div>
        </div>
        <div class="field">
          <label class="label" for="note">Add a note (optional)</label>
          <textarea id="note" name="note" placeholder="Add context or conditions"></textarea>
        </div>
        <div class="field">
          <span class="label">Signature (optional)</span>
          <canvas id="sig-pad"></canvas>
          <div class="sig-actions">
            <span>Draw with your mouse or finger.</span>
            <button type="button" id="clear-sig">Clear</button>
          </div>
        </div>
        <button type="submit">Submit response</button>
        <p class="note">Your response is recorded securely.</p>
      </form>
    </div>
    <script>
      (function() {
        const canvas = document.getElementById("sig-pad");
        const clearBtn = document.getElementById("clear-sig");
        const form = document.getElementById("response-form");
        const messageBox = document.getElementById("message");
        const ctx = canvas.getContext("2d");
        let drawing = false;

        const resize = () => {
          const data = canvas.toDataURL();
          const { width } = canvas.getBoundingClientRect();
          canvas.width = width;
          canvas.height = 160;
          ctx.lineWidth = 2;
          ctx.lineCap = "round";
          ctx.strokeStyle = "#0f172a";
          if (data) {
            const img = new Image();
            img.onload = () => ctx.drawImage(img, 0, 0);
            img.src = data;
          }
        };
        window.addEventListener("resize", resize);
        resize();

        const getPoint = (e) => {
          if (e.touches?.length) {
            const rect = canvas.getBoundingClientRect();
            return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
          }
          return { x: e.offsetX, y: e.offsetY };
        };

        const start = (e) => { drawing = true; const { x, y } = getPoint(e); ctx.beginPath(); ctx.moveTo(x, y); };
        const move = (e) => { if (!drawing) return; const { x, y } = getPoint(e); ctx.lineTo(x, y); ctx.stroke(); };
        const end = () => { drawing = false; };

        canvas.addEventListener("mousedown", start);
        canvas.addEventListener("mousemove", move);
        canvas.addEventListener("mouseup", end);
        canvas.addEventListener("mouseout", end);
        canvas.addEventListener("touchstart", (e) => { start(e); e.preventDefault(); }, { passive: false });
        canvas.addEventListener("touchmove", (e) => { move(e); e.preventDefault(); }, { passive: false });
        canvas.addEventListener("touchend", end);

        clearBtn.addEventListener("click", () => { ctx.clearRect(0, 0, canvas.width, canvas.height); });

        const setMessage = (text, type) => {
          messageBox.innerHTML = text ? '<p class="' + type + '">' + text + "</p>" : "";
        };

        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          setMessage("Submitting...", "note");
          const formData = new FormData(form);
          const payload = {
            token: formData.get("token"),
            action: formData.get("action"),
            note: formData.get("note"),
            signature: canvas.toDataURL("image/png"),
          };
          try {
            const res = await fetch(window.location.href.split("?")[0], {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            const contentType = res.headers.get("content-type") || "";
            if (!res.ok) {
              const text = contentType.includes("application/json") ? (await res.json())?.error : await res.text();
              throw new Error(text || "Failed to submit response.");
            }
            const text = contentType.includes("application/json") ? (await res.json())?.message : await res.text();
            setMessage(text || "Response submitted.", "success");
            form.style.display = "none";
          } catch (err) {
            setMessage(err?.message || "Unable to submit response. Please try again.", "error");
          }
        });
      })();
    </script>
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
    return isHtmlPreferred
      ? renderHtmlResponse({
          title: "Invalid Response Link",
          message: "The response link is missing required information.",
          status: 400,
        })
      : jsonResponse({ error: "Invalid token." }, 400);
  }

  const { data: recipient, error } = await supabase
    .from("change_order_recipients")
    .select("id, change_order_id, email, name, status, response_token, condition_note")
    .eq("response_token", token)
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

  if (method === "GET") {
    const recipientLabel = recipient.name || recipient.email || "Recipient";
    return new Response(renderForm({ token, preselectedAction, recipientLabel }), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
    });
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
    ? jsonResponse({ message: successMessage, status: nextStatus })
    : jsonResponse({ message: successMessage, status: nextStatus });
});
