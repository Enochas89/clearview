import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import crypto from "crypto";
import { parseBearerToken } from "../../backend/inviteService.js";

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  RESEND_API_KEY,
  CHANGE_ORDER_EMAIL_FROM,
  INVITE_EMAIL_FROM,
  CHANGE_ORDER_CLIENT_URL_BASE,
} = process.env;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const resendClient = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

const DEFAULT_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const buildClientUrl = (req, token) => {
  const trimmedBase = (CHANGE_ORDER_CLIENT_URL_BASE ?? "").trim().replace(/\/+$/, "");
  if (trimmedBase.length > 0) {
    return `${trimmedBase}?token=${encodeURIComponent(token)}`;
  }

  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const base = `${protocol}://${host}`;
  return `${base}/change-order-response.html?token=${encodeURIComponent(token)}`;
};

const assertOwnerOrEditor = async ({ projectId, userId }) => {
  const { data: project, error: projectError } = await supabaseAdmin
    .from("projects")
    .select("id, user_id")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError || !project) {
    throw new Error("Unable to locate project for change order.");
  }

  if (project.user_id === userId) {
    return "owner";
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("project_members")
    .select("role, status")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError) {
    throw new Error("Unable to verify project membership.");
  }

  if (!membership || membership.status !== "accepted") {
    throw new Error("You do not have permission to send change orders for this project.");
  }

  if (membership.role !== "owner" && membership.role !== "editor") {
    throw new Error("You do not have permission to send change orders for this project.");
  }

  return membership.role;
};

const loadChangeOrderBundle = async (changeOrderId) => {
  const { data: changeOrder, error: changeOrderError } = await supabaseAdmin
    .from("change_orders")
    .select("*")
    .eq("id", changeOrderId)
    .maybeSingle();

  if (changeOrderError || !changeOrder) {
    throw new Error("Unable to locate change order.");
  }

  const projectId = changeOrder.project_id;

  const [{ data: project, error: projectError }, { data: clientProfile, error: clientError }] =
    await Promise.all([
      supabaseAdmin.from("projects").select("*").eq("id", projectId).maybeSingle(),
      supabaseAdmin.from("client_profiles").select("*").eq("project_id", projectId).maybeSingle(),
    ]);

  if (projectError || !project) {
    throw new Error("Unable to load project details.");
  }

  if (clientError) {
    throw new Error("Unable to load client profile.");
  }

  return { changeOrder, project, clientProfile };
};

const sendClientEmail = async ({ to, subject, html, text }) => {
  if (!resendClient) {
    throw new Error(
      "Email delivery is not configured. Set RESEND_API_KEY to send change order messages."
    );
  }

  const fromAddress = (CHANGE_ORDER_EMAIL_FROM || INVITE_EMAIL_FROM || "").trim();

  if (!fromAddress) {
    throw new Error(
      "Specify CHANGE_ORDER_EMAIL_FROM (or INVITE_EMAIL_FROM) to send change order messages."
    );
  }

  await resendClient.emails.send({
    from: fromAddress,
    to,
    subject,
    html,
    text,
  });
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const token = parseBearerToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ error: "Missing or invalid authorization header." });
    }

    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: "The session token is invalid or expired." });
    }

    const { changeOrderId, email } = req.body ?? {};
    if (!changeOrderId || typeof changeOrderId !== "string") {
      return res.status(400).json({ error: "A valid changeOrderId is required." });
    }

    const { changeOrder, project, clientProfile } = await loadChangeOrderBundle(changeOrderId);

    await assertOwnerOrEditor({ projectId: project.id, userId: user.id });

    const clientEmail =
      typeof email === "string" && email.trim().length > 0
        ? email.trim()
        : clientProfile?.contact_email?.trim();

    if (!clientEmail) {
      return res.status(400).json({
        error: "A client email is required. Update the client profile before sending a change order.",
      });
    }

    const linkToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + DEFAULT_LINK_TTL_MS).toISOString();

    const respondUrl = buildClientUrl(req, linkToken);

    const { error: linkError } = await supabaseAdmin.from("change_order_links").insert([
      {
        change_order_id: changeOrderId,
        client_email: clientEmail,
        token: linkToken,
        expires_at: expiresAt,
      },
    ]);

    if (linkError) {
      console.error("Error inserting change order link", linkError);
      throw new Error("Failed to create secure client link.");
    }

    const amountDisplay =
      changeOrder.amount === null || changeOrder.amount === undefined
        ? "n/a"
        : new Intl.NumberFormat(undefined, {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 0,
          }).format(Number(changeOrder.amount));

    const emailSubject = `Change Order: ${changeOrder.title}`;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0f172a;">
        <p>Hello ${clientProfile?.contact_name ?? "there"},</p>
        <p>${project.name} has shared a new change order for your review.</p>
        <table style="margin: 16px 0; width: 100%; max-width: 520px; border-collapse: collapse;">
          <tbody>
            <tr>
              <td style="padding: 6px 10px; background: #f1f5f9; font-weight: bold;">Change</td>
              <td style="padding: 6px 10px; background: #f8fafc;">${changeOrder.title}</td>
            </tr>
            <tr>
              <td style="padding: 6px 10px; background: #f1f5f9; font-weight: bold;">Project</td>
              <td style="padding: 6px 10px; background: #f8fafc;">${project.name}</td>
            </tr>
            <tr>
              <td style="padding: 6px 10px; background: #f1f5f9; font-weight: bold;">Estimated Impact</td>
              <td style="padding: 6px 10px; background: #f8fafc;">${amountDisplay}</td>
            </tr>
            ${
              changeOrder.due_date
                ? `<tr><td style="padding: 6px 10px; background: #f1f5f9; font-weight: bold;">Requested Response</td><td style="padding: 6px 10px; background: #f8fafc;">${changeOrder.due_date}</td></tr>`
                : ""
            }
          </tbody>
        </table>
        <p>Please review the change and provide your decision.</p>
        <p style="margin: 24px 0;">
          <a href="${respondUrl}" style="display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 12px 18px; border-radius: 999px; font-weight: 600;">Open change order</a>
        </p>
        <p>If the button does not work, copy and paste this link into your browser:<br />
          <a href="${respondUrl}" style="color: #2563eb;">${respondUrl}</a>
        </p>
        <p style="margin-top: 24px;">Thank you,<br />${project.name} team</p>
      </div>
    `;

    const emailText = `Hello ${clientProfile?.contact_name ?? "there"},

${project.name} has shared a new change order for your review.

Change: ${changeOrder.title}
Estimated impact: ${amountDisplay}
${
  changeOrder.due_date ? `Requested response: ${changeOrder.due_date}\n` : ""
}
Review and sign: ${respondUrl}

Thank you,
${project.name} team`;

    await sendClientEmail({
      to: clientEmail,
      subject: emailSubject,
      html: emailHtml,
      text: emailText,
    });

    const { data: updatedChangeOrder, error: updateError } = await supabaseAdmin
      .from("change_orders")
      .update({
        client_last_sent_at: new Date().toISOString(),
        client_view_token_expires_at: expiresAt,
      })
      .eq("id", changeOrderId)
      .select("*")
      .maybeSingle();

    if (updateError) {
      console.error("Failed to update change order send metadata", updateError);
    }

    return res.status(200).json({
      success: true,
      changeOrder: updatedChangeOrder ?? changeOrder,
      respondUrl,
      clientEmail,
    });
  } catch (err) {
    console.error("Error sending change order", err);
    return res.status(500).json({
      error: err?.message ?? "Failed to send change order.",
    });
  }
}
