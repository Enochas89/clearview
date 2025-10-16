import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  RESEND_API_KEY,
  CHANGE_ORDER_EMAIL_FROM,
  INVITE_EMAIL_FROM,
  CHANGE_ORDER_SIGNATURE_BUCKET,
} = process.env;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const resendClient = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

const bucketName = (CHANGE_ORDER_SIGNATURE_BUCKET || "change-order-signatures").trim();

const allowedDecisions = new Set(["approved", "denied", "needs_info"]);

const decodeSignatureImage = (dataUrl) => {
  if (typeof dataUrl !== "string") {
    return null;
  }
  const match = dataUrl.match(/^data:image\/(png|jpeg);base64,(.+)$/);
  if (!match) {
    return null;
  }
  const extension = match[1] === "jpeg" ? "jpg" : match[1];
  const buffer = Buffer.from(match[2], "base64");
  return { buffer, extension };
};

const getClientIp = (req) => {
  const header = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "";
  if (Array.isArray(header)) {
    return header[0];
  }
  if (typeof header === "string" && header.length > 0) {
    return header.split(",")[0].trim();
  }
  if (req.connection && req.connection.remoteAddress) {
    return req.connection.remoteAddress;
  }
  return null;
};

const sendTeamNotification = async ({ emails, subject, html, text }) => {
  if (!resendClient || !emails || emails.length === 0) {
    return;
  }
  const fromAddress = (CHANGE_ORDER_EMAIL_FROM || INVITE_EMAIL_FROM || "").trim();
  if (!fromAddress) {
    return;
  }

  await resendClient.emails.send({
    from: fromAddress,
    to: emails,
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

  const {
    token,
    decision,
    notes,
    signedName,
    signedEmail,
    signatureImage,
  } = req.body ?? {};

  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "Missing token." });
  }

  if (!allowedDecisions.has(decision)) {
    return res.status(400).json({ error: "Unsupported decision." });
  }

  if (!signedName || typeof signedName !== "string") {
    return res.status(400).json({ error: "A signer name is required." });
  }

  if (!signedEmail || typeof signedEmail !== "string") {
    return res.status(400).json({ error: "A signer email is required." });
  }

  if (decision === "needs_info" && (!notes || notes.trim().length === 0)) {
    return res.status(400).json({ error: "Please include details when requesting more information." });
  }

  try {
    const { data: link, error: linkError } = await supabaseAdmin
      .from("change_order_links")
      .select("*")
      .eq("token", token.trim())
      .maybeSingle();

    if (linkError || !link) {
      return res.status(404).json({ error: "This link is invalid or has expired." });
    }

    if (link.status && link.status !== "pending") {
      return res.status(410).json({ error: "This link has already been used." });
    }

    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
      return res.status(410).json({ error: "This link has expired." });
    }

    const changeOrderId = link.change_order_id;
    const { data: changeOrder, error: coError } = await supabaseAdmin
      .from("change_orders")
      .select("*")
      .eq("id", changeOrderId)
      .maybeSingle();

    if (coError || !changeOrder) {
      return res.status(404).json({ error: "Change order not found." });
    }

    const projectId = changeOrder.project_id;

    const { data: project, error: projectError } = await supabaseAdmin
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .maybeSingle();

    if (projectError || !project) {
      return res.status(404).json({ error: "Project not found." });
    }

    const { data: clientProfile } = await supabaseAdmin
      .from("client_profiles")
      .select("*")
      .eq("project_id", projectId)
      .maybeSingle();

    const nowIso = new Date().toISOString();
    let signatureUrl = null;

    const signaturePayload = decodeSignatureImage(signatureImage);
    if (signaturePayload) {
      const path = `${changeOrderId}/${link.id}.${signaturePayload.extension}`;
      const uploadResponse = await supabaseAdmin.storage
        .from(bucketName)
        .upload(path, signaturePayload.buffer, {
          contentType: signaturePayload.extension === "jpg" ? "image/jpeg" : "image/png",
          upsert: true,
        });

      if (!uploadResponse.error) {
        const { data: publicUrl } = supabaseAdmin.storage.from(bucketName).getPublicUrl(path);
        signatureUrl = publicUrl?.publicUrl ?? null;
      }
    }

    const nextStatus =
      decision === "approved" ? "approved" : decision === "denied" ? "denied" : "pending";

    const updatePayload = {
      status: nextStatus,
      decision_notes: nextStatus === "pending" ? changeOrder.decision_notes : notes ?? changeOrder.decision_notes,
      decision_at: nextStatus === "pending" ? changeOrder.decision_at : nowIso,
      client_signed_name: signedName.trim(),
      client_signed_email: signedEmail.trim().toLowerCase(),
      client_signed_at: nowIso,
      client_signed_ip: getClientIp(req),
      client_decision_notes: notes ?? null,
      client_decision_source: "magic_link",
      client_signature_url: signatureUrl ?? changeOrder.client_signature_url ?? null,
      last_notification_at: nowIso,
    };

    const { error: updateError } = await supabaseAdmin
      .from("change_orders")
      .update(updatePayload)
      .eq("id", changeOrderId);

    if (updateError) {
      console.error("Failed to update change order after client response", updateError);
      throw new Error("Unable to store client decision.");
    }

    const { error: linkUpdateError } = await supabaseAdmin
      .from("change_order_links")
      .update({
        status: "completed",
        decision: decision,
        decision_notes: notes ?? null,
        decision_at: nowIso,
      })
      .eq("id", link.id);

    if (linkUpdateError) {
      console.error("Failed to update change order link state", linkUpdateError);
    }

    const decisionLabel =
      decision === "approved"
        ? "approved"
        : decision === "denied"
        ? "denied"
        : "requested more information";

    const { data: ownerMembers } = await supabaseAdmin
      .from("project_members")
      .select("email, role, status")
      .eq("project_id", projectId)
      .eq("role", "owner")
      .eq("status", "accepted");

    const teamRecipients = new Set();
    if (ownerMembers && ownerMembers.length > 0) {
      ownerMembers
        .filter((member) => Boolean(member.email))
        .forEach((member) => teamRecipients.add(member.email.toLowerCase()));
    }

    if (project.user_id) {
      try {
        const { data: ownerUser } = await supabaseAdmin.auth.admin.getUserById(
          project.user_id
        );
        if (ownerUser?.user?.email) {
          teamRecipients.add(ownerUser.user.email.toLowerCase());
        }
      } catch (ownerLookupErr) {
        console.warn("Unable to resolve project owner email", ownerLookupErr);
      }
    }

    const recipientList = Array.from(teamRecipients);

    const summaryHtml = `
      <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
        <p><strong>${clientProfile?.company_name ?? clientProfile?.contact_name ?? "Client"}</strong> ${decisionLabel} change order <strong>${changeOrder.title}</strong>.</p>
        ${notes ? `<p><em>Client notes:</em> ${notes}</p>` : ""}
        <p>
          <a href="${req.headers["x-forwarded-proto"] || "https"}://${req.headers["x-forwarded-host"] || req.headers.host}/" style="color: #2563eb;">Open workspace</a>
        </p>
      </div>
    `;

    const summaryText = `${clientProfile?.company_name ?? clientProfile?.contact_name ?? "Client"} ${decisionLabel} change order "${changeOrder.title}".
${notes ? `Client notes: ${notes}` : ""}

Open workspace: ${req.headers["x-forwarded-proto"] || "https"}://${req.headers["x-forwarded-host"] || req.headers.host}/`;

    await sendTeamNotification({
      emails: recipientList,
      subject: `Client ${decisionLabel} change order: ${changeOrder.title}`,
      html: summaryHtml,
      text: summaryText,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Error completing change order decision", err);
    return res.status(500).json({
      error: err?.message ?? "Failed to store client decision.",
    });
  }
}
