import { createClient } from "@supabase/supabase-js";
import { parseBearerToken } from "../../backend/inviteService.js";

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} = process.env;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

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
    throw new Error("You do not have permission to manage change orders for this project.");
  }

  if (membership.role !== "owner" && membership.role !== "editor") {
    throw new Error("You do not have permission to manage change orders for this project.");
  }

  return membership.role;
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const token = parseBearerToken(req.headers.authorization || "");
    if (!token) {
      return res.status(401).json({ error: "Missing or invalid authorization token." });
    }

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return res.status(401).json({ error: "Unable to authenticate the current user." });
    }

    const { changeOrderId } = req.body ?? {};
    if (!changeOrderId || typeof changeOrderId !== "string") {
      return res.status(400).json({ error: "A changeOrderId is required." });
    }

    const { data: changeOrder, error: loadError } = await supabaseAdmin
      .from("change_orders")
      .select("id, project_id")
      .eq("id", changeOrderId)
      .maybeSingle();

    if (loadError || !changeOrder) {
      return res.status(404).json({ error: "Change order not found." });
    }

    await assertOwnerOrEditor({
      projectId: changeOrder.project_id,
      userId: user.id,
    });

    const { error: linkDeleteError } = await supabaseAdmin
      .from("change_order_links")
      .delete()
      .eq("change_order_id", changeOrderId);

    if (linkDeleteError) {
      throw linkDeleteError;
    }

    const { error: deleteError } = await supabaseAdmin
      .from("change_orders")
      .delete()
      .eq("id", changeOrderId);

    if (deleteError) {
      throw deleteError;
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Error deleting change order via API:", err);
    return res.status(500).json({
      error: err?.message ?? "Failed to delete change order.",
    });
  }
}
