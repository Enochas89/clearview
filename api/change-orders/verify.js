import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const sanitizeChangeOrder = (row) => ({
  id: row.id,
  projectId: row.project_id,
  title: row.title,
  description: row.description,
  amount: row.amount,
  requestedAt: row.requested_at,
  dueDate: row.due_date,
  status: row.status,
});

const sanitizeProject = (row) => ({
  id: row.id,
  name: row.name,
  referenceId: row.reference_id,
  color: row.color,
});

const sanitizeClientProfile = (row) => ({
  companyName: row?.company_name ?? "",
  contactName: row?.contact_name ?? "",
  contactEmail: row?.contact_email ?? "",
  contactPhone: row?.contact_phone ?? "",
  address: row?.address ?? "",
});

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = (req.query?.token ?? "").toString().trim();

  if (!token) {
    return res.status(400).json({ error: "Missing token." });
  }

  try {
    const { data: link, error: linkError } = await supabaseAdmin
      .from("change_order_links")
      .select("*")
      .eq("token", token)
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

    const [{ data: project, error: projectError }, { data: clientProfile, error: clientError }] =
      await Promise.all([
        supabaseAdmin.from("projects").select("*").eq("id", projectId).maybeSingle(),
        supabaseAdmin.from("client_profiles").select("*").eq("project_id", projectId).maybeSingle(),
      ]);

    if (projectError || !project) {
      return res.status(404).json({ error: "Project not found." });
    }

    if (clientError) {
      console.warn("Client profile lookup error", clientError);
    }

    await supabaseAdmin
      .from("change_order_links")
      .update({ last_viewed_at: new Date().toISOString() })
      .eq("id", link.id);

    return res.status(200).json({
      success: true,
      link: {
        id: link.id,
        expiresAt: link.expires_at,
        token: link.token,
      },
      changeOrder: sanitizeChangeOrder(changeOrder),
      project: sanitizeProject(project),
      clientProfile: sanitizeClientProfile(clientProfile),
    });
  } catch (err) {
    console.error("Error verifying change order link", err);
    return res.status(500).json({ error: "Failed to verify change order link." });
  }
}
