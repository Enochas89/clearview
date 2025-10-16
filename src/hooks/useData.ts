import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import {
  Project,
  Task,
  DayNote,
  TaskDraft,
  DayFile,
  ProjectMember,
  MemberRole,
  MemberStatus,
  InviteMemberResult,
  ClientProfile,
  ClientContact,
  ChangeOrder,
  ChangeOrderDraft,
  ChangeOrderStatus,
} from '../types';
import { Session } from '@supabase/supabase-js';

const DAY_MS = 86_400_000;

const toISODate = (date: Date) => {
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  return clone.toISOString().slice(0, 10);
};

const createId = (prefix: string) => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const DEFAULT_DAY_FILES_BUCKET = 'daily-uploads';
const ENV_DAY_FILES_BUCKET = (import.meta.env.VITE_DAY_FILES_BUCKET ?? '').trim();
const DAY_FILES_BUCKET = ENV_DAY_FILES_BUCKET.length > 0 ? ENV_DAY_FILES_BUCKET : DEFAULT_DAY_FILES_BUCKET;
const SIGNED_URL_TTL_SECONDS = 3600;

const mapDayFileFromSupabase = (row: any): DayFile => ({
  id: row.id,
  projectId: row.projectId ?? row.project_id ?? '',
  date: row.date ?? row.note_date ?? '',
  bucketId: row.bucketId ?? row.bucket_id ?? DAY_FILES_BUCKET,
  path: row.path ?? row.storage_path ?? '',
  name: row.name ?? row.file_name ?? '',
  size: row.size ?? row.file_size ?? 0,
  type: row.type ?? row.content_type ?? 'application/octet-stream',
  addedAt: row.addedAt ?? row.created_at ?? row.createdAt ?? new Date().toISOString(),
  url: '',
  uploadedBy: row.uploadedBy ?? row.uploaded_by ?? row.user_id ?? undefined,
  expiresAt: undefined,
});

const mapDayFileToSupabase = (input: {
  id: string;
  projectId: string;
  date: string;
  bucketId: string;
  path: string;
  name: string;
  size: number;
  type: string;
  uploadedBy: string;
}) => ({
  id: input.id,
  project_id: input.projectId,
  note_date: input.date,
  bucket_id: input.bucketId,
  storage_path: input.path,
  file_name: input.name,
  file_size: input.size,
  content_type: input.type,
  uploaded_by: input.uploadedBy,
});

const buildStoragePath = (userId: string, projectId: string, isoDate: string, fileName: string) =>
  `${userId}/${projectId}/${isoDate}/${fileName}`;

const sanitizeFilename = (input: string) => input.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/_+/g, '_');

const mapProjectFromSupabase = (row: any): Project => ({
  id: row.id,
  name: row.name ?? "",
  description: row.description ?? "",
  color: row.color ?? "#2563eb",
  createdAt: row.createdAt ?? row.created_at ?? "",
  startDate: row.startDate ?? row.start_date ?? "",
  dueDate: row.dueDate ?? row.due_date ?? "",
  referenceId: row.referenceId ?? row.reference_id ?? "",
  cost: row.cost ?? "",
  address: row.address ?? "",
  projectManager: row.projectManager ?? row.project_manager ?? "",
  userId: row.userId ?? row.user_id ?? "",
});

const mapProjectToSupabase = (input: Partial<Project>): Record<string, unknown> => {
  const payload: Record<string, unknown> = {};

  if (input.id !== undefined) payload.id = input.id;
  if (input.createdAt !== undefined) payload.created_at = input.createdAt;
  if (input.name !== undefined) payload.name = input.name;
  if (input.description !== undefined) payload.description = input.description;
  if (input.color !== undefined) payload.color = input.color;
  if (input.referenceId !== undefined) payload.reference_id = input.referenceId;
  if (input.cost !== undefined) payload.cost = input.cost;
  if (input.address !== undefined) payload.address = input.address;
  if (input.projectManager !== undefined) payload.project_manager = input.projectManager;
  if (input.startDate !== undefined) payload.start_date = input.startDate;
  if (input.dueDate !== undefined) payload.due_date = input.dueDate;
  if (input.userId !== undefined) payload.user_id = input.userId;

  return payload;
};

const normalizeMemberRole = (value: unknown): MemberRole => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "owner" || normalized === "editor" || normalized === "viewer") {
      return normalized;
    }
  }
  return "viewer";
};

const mapMemberFromSupabase = (row: any): ProjectMember => ({
  id: row.id,
  projectId: row.projectId ?? row.project_id ?? "",
  userId: row.userId ?? row.user_id ?? null,
  email: (row.email ?? row.member_email ?? "").toLowerCase(),
  role: normalizeMemberRole(row.role ?? row.member_role ?? "viewer"),
  status: (row.status ?? row.member_status ?? "pending") as MemberStatus,
  invitedBy: row.invitedBy ?? row.invited_by ?? "",
  invitedAt: row.invitedAt ?? row.invited_at ?? row.created_at ?? new Date().toISOString(),
  acceptedAt: row.acceptedAt ?? row.accepted_at ?? row.joined_at ?? null,
  fullName: row.fullName ?? row.full_name ?? row.member_name ?? null,
});

const mapMemberUpdateToSupabase = (input: Partial<ProjectMember>): Record<string, unknown> => {
  const payload: Record<string, unknown> = {};

  if (input.projectId !== undefined) payload.project_id = input.projectId;
  if (input.userId !== undefined) payload.user_id = input.userId;
  if (input.email !== undefined) payload.email = input.email;
  if (input.role !== undefined) payload.role = normalizeMemberRole(input.role);
  if (input.status !== undefined) payload.status = input.status;
  if (input.invitedBy !== undefined) payload.invited_by = input.invitedBy;
  if (input.invitedAt !== undefined) payload.invited_at = input.invitedAt;
  if (input.acceptedAt !== undefined) payload.accepted_at = input.acceptedAt;
  if (input.fullName !== undefined) payload.full_name = input.fullName;

  return payload;
};

const mapTaskFromSupabase = (row: any): Task => ({
  id: row.id,
  projectId: row.projectId ?? row.project_id,
  name: row.name ?? "",
  description: row.description ?? "",
  startDate: row.startDate ?? row.start_date ?? "",
  dueDate: row.dueDate ?? row.due_date ?? "",
  status: (row.status as Task["status"]) ?? "todo",
  dependencies: Array.isArray(row.dependencies) ? [...row.dependencies] : [],
  baselineStartDate: row.baselineStartDate ?? row.baseline_start_date ?? undefined,
  baselineDueDate: row.baselineDueDate ?? row.baseline_due_date ?? undefined,
  actualStartDate: row.actualStartDate ?? row.actual_start_date ?? undefined,
  actualDueDate: row.actualDueDate ?? row.actual_due_date ?? undefined,
  percentComplete: row.percentComplete ?? row.percent_complete ?? 0,
  assignee: row.assignee ?? undefined,
  isMilestone: row.isMilestone ?? row.is_milestone ?? false,
  notes: row.notes ?? undefined,
});

const mapTaskToSupabase = (input: Partial<TaskDraft>): Record<string, unknown> => {
  const payload: Record<string, unknown> = {};

  if (input.projectId !== undefined) payload.project_id = input.projectId;
  if (input.name !== undefined) payload.name = input.name;
  if (input.description !== undefined) payload.description = input.description;
  if (input.startDate !== undefined) payload.start_date = input.startDate;
  if (input.dueDate !== undefined) payload.due_date = input.dueDate;
  if (input.status !== undefined) payload.status = input.status;
  if (input.dependencies !== undefined) payload.dependencies = input.dependencies;
  if (input.percentComplete !== undefined) payload.percent_complete = input.percentComplete;
  if (input.assignee !== undefined) payload.assignee = input.assignee;
  if (input.isMilestone !== undefined) payload.is_milestone = input.isMilestone;
  if (input.notes !== undefined) payload.notes = input.notes;
  if (input.baselineStartDate !== undefined) payload.baseline_start_date = input.baselineStartDate;
  if (input.baselineDueDate !== undefined) payload.baseline_due_date = input.baselineDueDate;
  if (input.actualStartDate !== undefined) payload.actual_start_date = input.actualStartDate;
  if (input.actualDueDate !== undefined) payload.actual_due_date = input.actualDueDate;

  return payload;
};

const mapNoteFromSupabase = (row: any): DayNote => ({
  id: row.id,
  projectId: row.projectId ?? row.project_id,
  date: row.date ?? row.note_date ?? "",
  text: row.text ?? row.body ?? "",
  userId: row.userId ?? row.user_id ?? "",
  createdAt: row.createdAt ?? row.created_at ?? "",
});

const mapNoteToSupabase = (note: { projectId: string; date: string; text: string; userId?: string }): Record<string, unknown> => {
  const payload: Record<string, unknown> = {
    project_id: note.projectId,
    note_date: note.date,
    body: note.text,
  };

  if (note.userId !== undefined) {
    payload.user_id = note.userId;
  }

  return payload;
};

const DEMO_PROJECT_REFERENCE_ID = "__clearview_demo__";
const SHOULD_PURGE_DEMO_PROJECTS = (() => {
  const rawValue = String(import.meta.env.VITE_PURGE_DEMO_PROJECTS ?? "").trim().toLowerCase();
  return rawValue === "true" || rawValue === "1";
})();

const mapClientProfileFromSupabase = (row: any): ClientProfile => ({
  id: row.id,
  projectId: row.projectId ?? row.project_id ?? "",
  companyName: row.companyName ?? row.company_name ?? "",
  contactName: row.contactName ?? row.contact_name ?? "",
  contactEmail: row.contactEmail ?? row.contact_email ?? "",
  contactPhone: row.contactPhone ?? row.contact_phone ?? "",
  address: row.address ?? "",
  createdAt: row.createdAt ?? row.created_at ?? new Date().toISOString(),
  updatedAt: row.updatedAt ?? row.updated_at ?? new Date().toISOString(),
});

const mapClientProfileToSupabase = (input: Partial<ClientProfile>): Record<string, unknown> => {
  const payload: Record<string, unknown> = {};

  if (input.id !== undefined) payload.id = input.id;
  if (input.projectId !== undefined) payload.project_id = input.projectId;
  if (input.companyName !== undefined) payload.company_name = input.companyName;
  if (input.contactName !== undefined) payload.contact_name = input.contactName;
  if (input.contactEmail !== undefined) payload.contact_email = input.contactEmail;
  if (input.contactPhone !== undefined) payload.contact_phone = input.contactPhone;
  if (input.address !== undefined) payload.address = input.address;
  if (input.createdAt !== undefined) payload.created_at = input.createdAt;
  if (input.updatedAt !== undefined) payload.updated_at = input.updatedAt;

  return payload;
};

const mapClientContactFromSupabase = (row: any): ClientContact => ({
  id: row.id,
  projectId: row.projectId ?? row.project_id ?? "",
  fullName: row.fullName ?? row.full_name ?? "",
  email: row.email ?? row.contact_email ?? "",
  phone: row.phone ?? row.contact_phone ?? null,
  role: row.role ?? row.contact_role ?? null,
  createdAt: row.createdAt ?? row.created_at ?? new Date().toISOString(),
  updatedAt: row.updatedAt ?? row.updated_at ?? new Date().toISOString(),
});

const mapClientContactToSupabase = (input: Partial<ClientContact>): Record<string, unknown> => {
  const payload: Record<string, unknown> = {};

  if (input.id !== undefined) payload.id = input.id;
  if (input.projectId !== undefined) payload.project_id = input.projectId;
  if (input.fullName !== undefined) payload.full_name = input.fullName;
  if (input.email !== undefined) payload.email = input.email;
  if (input.phone !== undefined) payload.phone = input.phone;
  if (input.role !== undefined) payload.role = input.role;
  if (input.createdAt !== undefined) payload.created_at = input.createdAt;
  if (input.updatedAt !== undefined) payload.updated_at = input.updatedAt;

  return payload;
};

const normalizeChangeOrderStatus = (value: unknown): ChangeOrderStatus => {
  if (value === "approved" || value === "denied" || value === "pending") {
    return value;
  }
  return "pending";
};

const mapChangeOrderFromSupabase = (row: any): ChangeOrder => ({
  id: row.id,
  projectId: row.projectId ?? row.project_id ?? "",
  title: row.title ?? "",
  description: row.description ?? "",
  amount: typeof row.amount === "number" ? row.amount : row.amount !== null && row.amount !== undefined ? Number(row.amount) : null,
  requestedBy: row.requestedBy ?? row.requested_by ?? "",
  requestedAt: row.requestedAt ?? row.requested_at ?? new Date().toISOString(),
  dueDate: row.dueDate ?? row.due_date ?? null,
  status: normalizeChangeOrderStatus(row.status),
  decisionBy: row.decisionBy ?? row.decision_by ?? null,
  decisionAt: row.decisionAt ?? row.decision_at ?? null,
  decisionNotes: row.decisionNotes ?? row.decision_notes ?? null,
  clientSignedName: row.clientSignedName ?? row.client_signed_name ?? null,
  clientSignedEmail: row.clientSignedEmail ?? row.client_signed_email ?? null,
  clientSignedAt: row.clientSignedAt ?? row.client_signed_at ?? null,
  clientSignedIp: row.clientSignedIp ?? row.client_signed_ip ?? null,
  clientDecisionNotes: row.clientDecisionNotes ?? row.client_decision_notes ?? null,
  clientDecisionSource: row.clientDecisionSource ?? row.client_decision_source ?? null,
  clientViewTokenExpiresAt: row.clientViewTokenExpiresAt ?? row.client_view_token_expires_at ?? null,
  clientLastSentAt: row.clientLastSentAt ?? row.client_last_sent_at ?? null,
  clientSignatureUrl: row.clientSignatureUrl ?? row.client_signature_url ?? null,
  lastNotificationAt: row.lastNotificationAt ?? row.last_notification_at ?? null,
});

const mapChangeOrderToSupabase = (input: Partial<ChangeOrder>): Record<string, unknown> => {
  const payload: Record<string, unknown> = {};

  if (input.id !== undefined) payload.id = input.id;
  if (input.projectId !== undefined) payload.project_id = input.projectId;
  if (input.title !== undefined) payload.title = input.title;
  if (input.description !== undefined) payload.description = input.description;
  if (input.amount !== undefined) payload.amount = input.amount;
  if (input.requestedBy !== undefined) payload.requested_by = input.requestedBy;
  if (input.requestedAt !== undefined) payload.requested_at = input.requestedAt;
  if (input.dueDate !== undefined) payload.due_date = input.dueDate;
  if (input.status !== undefined) payload.status = input.status;
  if (input.decisionBy !== undefined) payload.decision_by = input.decisionBy;
  if (input.decisionAt !== undefined) payload.decision_at = input.decisionAt;
  if (input.decisionNotes !== undefined) payload.decision_notes = input.decisionNotes;
  if (input.clientSignedName !== undefined) payload.client_signed_name = input.clientSignedName;
  if (input.clientSignedEmail !== undefined) payload.client_signed_email = input.clientSignedEmail;
  if (input.clientSignedAt !== undefined) payload.client_signed_at = input.clientSignedAt;
  if (input.clientSignedIp !== undefined) payload.client_signed_ip = input.clientSignedIp;
  if (input.clientDecisionNotes !== undefined) payload.client_decision_notes = input.clientDecisionNotes;
  if (input.clientDecisionSource !== undefined) payload.client_decision_source = input.clientDecisionSource;
  if (input.clientViewTokenExpiresAt !== undefined) payload.client_view_token_expires_at = input.clientViewTokenExpiresAt;
  if (input.clientLastSentAt !== undefined) payload.client_last_sent_at = input.clientLastSentAt;
  if (input.clientSignatureUrl !== undefined) payload.client_signature_url = input.clientSignatureUrl;
  if (input.lastNotificationAt !== undefined) payload.last_notification_at = input.lastNotificationAt;

  return payload;
};

export function useData(session: Session | null) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<DayNote[]>([]);
  const [dayFiles, setDayFiles] = useState<DayFile[]>([]);
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [clientProfiles, setClientProfiles] = useState<ClientProfile[]>([]);
  const [clientContacts, setClientContacts] = useState<ClientContact[]>([]);
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentUserId = session?.user?.id ?? null;
  const currentUserEmail = session?.user?.email?.toLowerCase() ?? null;

  const resolveRoleForProject = useCallback(
    (projectId: string): MemberRole => {
      if (!projectId || !currentUserId) {
        return "viewer";
      }

      const owningProject = projects.find((project) => project.id === projectId);
      if (owningProject && owningProject.userId === currentUserId) {
        return "owner";
      }

      const membership = projectMembers.find((member) => {
        if (member.projectId !== projectId || member.status !== "accepted") {
          return false;
        }
        if (member.userId && member.userId === currentUserId) {
          return true;
        }
        return Boolean(currentUserEmail) && member.email === currentUserEmail;
      });

      return membership?.role ?? "viewer";
    },
    [currentUserEmail, currentUserId, projectMembers, projects]
  );

  const canManageTasksForProject = useCallback(
    (projectId: string) => {
      const role = resolveRoleForProject(projectId);
      return role === "owner" || role === "editor";
    },
    [resolveRoleForProject]
  );

  const canManageProjectAsset = useCallback(
    (projectId: string, ownerId?: string | null) => {
      const role = resolveRoleForProject(projectId);
      if (role === "owner" || role === "editor") {
        return true;
      }

      if (!ownerId || !currentUserId) {
        return false;
      }

      return ownerId === currentUserId;
    },
    [currentUserId, resolveRoleForProject]
  );

  const isAcceptedProjectMember = useCallback(
    (projectId: string) => {
      if (!session?.user) {
        return false;
      }

      const project = projects.find((candidate) => candidate.id === projectId);
      if (project && project.userId === session.user.id) {
        return true;
      }

      const userId = session.user.id;
      const email = currentUserEmail;

      return projectMembers.some(
        (member) =>
          member.projectId === projectId &&
          member.status === "accepted" &&
          ((member.userId && member.userId === userId) ||
            (email && member.email === email))
      );
    },
    [currentUserEmail, projectMembers, projects, session?.user]
  );

  const attachSignedUrls = useCallback(async (files: DayFile[]): Promise<DayFile[]> => {
    if (files.length === 0) {
      return files;
    }

    const grouped = new Map<string, DayFile[]>();
    for (const file of files) {
      const existing = grouped.get(file.bucketId);
      if (existing) {
        existing.push(file);
      } else {
        grouped.set(file.bucketId, [file]);
      }
    }

    const signedUrlLookup = new Map<string, string>();

    for (const [bucketId, bucketFiles] of grouped.entries()) {
      const storage = supabase.storage.from(bucketId);
      const paths = bucketFiles.map((file) => file.path);
      try {
        const { data: signedData, error: signedError } = await storage.createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
        if (!signedError && signedData) {
          signedData.forEach((entry, index) => {
            const signedUrl = entry?.signedUrl;
            if (signedUrl) {
              signedUrlLookup.set(`${bucketId}:${paths[index]}`, signedUrl);
            }
          });
        }
      } catch (err) {
        console.error('Error creating signed URLs:', err);
      }

      bucketFiles.forEach((_file, index) => {
        const key = `${bucketId}:${paths[index]}`;
        if (!signedUrlLookup.has(key)) {
          const { data: publicData } = storage.getPublicUrl(paths[index]);
          if (publicData?.publicUrl) {
            signedUrlLookup.set(key, publicData.publicUrl);
          }
        }
      });
    }

    if (signedUrlLookup.size === 0) {
      return files;
    }

    const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString();

    return files.map((file) => {
      const key = `${file.bucketId}:${file.path}`;
      const url = signedUrlLookup.get(key);
      if (!url) {
        return file;
      }
      return {
        ...file,
        url,
        expiresAt,
      };
    });
  }, []);

const INVITE_SERVICE_BASE_URL = (() => {
  const rawValue = (import.meta.env.VITE_INVITE_SERVICE_URL ?? "").trim();
  if (rawValue) {
    return rawValue.replace(/\/+$/, "");
  }

  if (import.meta.env.DEV) {
    return null;
  }

  return "";
})();

  const handleInviteMember = useCallback(async (input: { projectId: string; email: string; role?: MemberRole; name: string }): Promise<InviteMemberResult | undefined> => {
    if (!session) {
      setError("You must be signed in to invite a member.");
      return undefined;
    }

    const normalizedEmail = input.email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("A valid email address is required.");
      return undefined;
    }
    const normalizedName = input.name.trim();
    if (!normalizedName) {
      setError("A name is required for each invite.");
      return undefined;
    }

    const role: MemberRole = input.role ?? "viewer";
    const alreadyInvited = projectMembers.some(
      (member) => member.projectId === input.projectId && member.email === normalizedEmail
    );

    if (alreadyInvited) {
      setError("This email is already associated with the project.");
      return undefined;
    }

    try {
      if (INVITE_SERVICE_BASE_URL !== null) {
        const baseUrl = INVITE_SERVICE_BASE_URL ?? "";
        const endpoint =
          baseUrl && baseUrl.length > 0
            ? `${baseUrl}/projects/${encodeURIComponent(input.projectId)}/invites`
            : `/api/projects/${encodeURIComponent(input.projectId)}/invites`;

        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            email: normalizedEmail,
            name: normalizedName,
            role,
          }),
        });

        let payload: any = null;
        try {
          payload = await response.json();
        } catch (_err) {
          payload = null;
        }

        if (!response.ok) {
          const errorMessage =
            (payload && typeof payload.error === "string" && payload.error) ||
            `Invite service returned ${response.status}.`;
          setError(errorMessage);
          return undefined;
        }

        if (!payload || typeof payload !== "object" || !payload.member) {
          setError("Invite service response was missing the new member record.");
          return undefined;
        }

        const insertedMember = mapMemberFromSupabase(payload.member);
        setProjectMembers((prev) => [...prev, insertedMember]);
        const warning =
          typeof payload.emailWarning === "string" && payload.emailWarning.trim().length > 0
            ? `Invite email delivery failed: ${payload.emailWarning.trim()}`
            : undefined;

        return {
          member: insertedMember,
          emailWarning: warning,
        };
      }

      const memberPayload: Partial<ProjectMember> = {
        projectId: input.projectId,
        email: normalizedEmail,
        role,
        status: "pending",
        invitedBy: session.user.id,
        invitedAt: new Date().toISOString(),
        fullName: normalizedName,
      };

      const insertPayload = mapMemberUpdateToSupabase(memberPayload);
      const { data, error } = await supabase
        .from('project_members')
        .insert([insertPayload])
        .select();

      if (error) {
        throw error;
      }

      if (data && data.length > 0) {
        const insertedMember = mapMemberFromSupabase(data[0]);
        setProjectMembers((prev) => [...prev, insertedMember]);
        return {
          member: insertedMember,
          emailWarning: undefined,
        };
      }
    } catch (err: any) {
      console.error("Error inviting member:", err);
      setError(err.message || "Failed to invite member.");
    }

    return undefined;
  }, [session, projectMembers]);

  const handleUpdateMemberRole = useCallback(async (memberId: string, role: MemberRole) => {
    if (!session) {
      setError("You must be signed in to update member roles.");
      return;
    }

    try {
      const updatePayload = mapMemberUpdateToSupabase({ role });
      const { data, error } = await supabase
        .from('project_members')
        .update(updatePayload)
        .eq('id', memberId)
        .select();

      if (error) {
        throw error;
      }

      if (data && data.length > 0) {
        const updatedMember = mapMemberFromSupabase(data[0]);
        setProjectMembers((prev) =>
          prev.map((member) => (member.id === memberId ? updatedMember : member))
        );
      }
    } catch (err: any) {
      console.error("Error updating member role:", err);
      setError(err.message || "Failed to update member role.");
    }
  }, [session]);

  const handleRemoveMember = useCallback(async (memberId: string) => {
    if (!session) {
      setError("You must be signed in to remove a member.");
      return;
    }

    const target = projectMembers.find((member) => member.id === memberId);
    if (!target) {
      return;
    }

    const ownersOnProject = projectMembers.filter(
      (member) => member.projectId === target.projectId && member.role === "owner"
    );

    if (target.role === "owner" && ownersOnProject.length <= 1) {
      setError("Projects must retain at least one owner.");
      return;
    }

    try {
      const { error } = await supabase
        .from('project_members')
        .delete()
        .eq('id', memberId);

      if (error) {
        throw error;
      }

      setProjectMembers((prev) => prev.filter((member) => member.id !== memberId));
    } catch (err: any) {
      console.error("Error removing member:", err);
      setError(err.message || "Failed to remove member.");
    }
  }, [session, projectMembers]);

  const handleSaveClientProfile = useCallback(
    async (
      projectId: string,
      input: {
        companyName: string;
        contactName: string;
        contactEmail: string;
        contactPhone: string;
        address: string;
      }
    ) => {
      if (!session) {
        setError("You must be signed in to manage client information.");
        return;
      }

      const normalized = {
        companyName: input.companyName.trim(),
        contactName: input.contactName.trim(),
        contactEmail: input.contactEmail.trim(),
        contactPhone: input.contactPhone.trim(),
        address: input.address.trim(),
      };

      if (!normalized.companyName || !normalized.contactName || !normalized.contactEmail) {
        setError("Company name, contact name, and email are required.");
        return;
      }

      const existing = clientProfiles.find((profile) => profile.projectId === projectId) ?? null;
      const now = new Date().toISOString();
      const profileId = existing?.id ?? createId("client");

      const payload = mapClientProfileToSupabase({
        id: profileId,
        projectId,
        companyName: normalized.companyName,
        contactName: normalized.contactName,
        contactEmail: normalized.contactEmail,
        contactPhone: normalized.contactPhone,
        address: normalized.address,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });

      try {
        const { data, error } = await supabase
          .from("client_profiles")
          .upsert([payload], { onConflict: "project_id" })
          .select();

        if (error) {
          throw error;
        }

        const saved =
          data && data.length > 0 ? mapClientProfileFromSupabase(data[0]) : mapClientProfileFromSupabase(payload);

        setClientProfiles((prev) => {
          const next = prev.filter((profile) => profile.projectId !== projectId);
          next.push(saved);
          return next;
        });
      } catch (err: any) {
        console.error("Error saving client profile:", err);
        setError(err.message || "Failed to save client profile.");
      }
    },
    [clientProfiles, session]
  );

  const handleCreateClientContact = useCallback(
    async (
      projectId: string,
      input: { fullName: string; email: string; phone?: string | null; role?: string | null }
    ) => {
      if (!session) {
        setError("You must be signed in to add a client contact.");
        return undefined;
      }

      if (!isAcceptedProjectMember(projectId)) {
        setError("You must belong to this project to manage client contacts.");
        return undefined;
      }

      const fullName = input.fullName.trim();
      const email = input.email.trim();
      const phone = input.phone?.trim() ?? "";
      const role = input.role?.trim() ?? "";

      if (!fullName || !email) {
        setError("A client contact must include a name and email.");
        return undefined;
      }

      const contactId = createId("client-contact");
      const now = new Date().toISOString();

      const payload = mapClientContactToSupabase({
        id: contactId,
        projectId,
        fullName,
        email,
        phone: phone.length > 0 ? phone : null,
        role: role.length > 0 ? role : null,
        createdAt: now,
        updatedAt: now,
      });

      try {
        const { data, error } = await supabase
          .from("client_contacts")
          .insert([payload])
          .select();

        if (error) {
          throw error;
        }

        const saved =
          data && data.length > 0
            ? mapClientContactFromSupabase(data[0])
            : {
                id: contactId,
                projectId,
                fullName,
                email,
                phone: phone.length > 0 ? phone : null,
                role: role.length > 0 ? role : null,
                createdAt: now,
                updatedAt: now,
              };

        setClientContacts((prev) => [...prev, saved]);
        return saved;
      } catch (err: any) {
        console.error("Error creating client contact:", err);
        setError(err.message || "Failed to create client contact.");
        return undefined;
      }
    },
    [isAcceptedProjectMember, session]
  );

  const handleDeleteClientProfile = useCallback(
    async (projectId: string) => {
      if (!session) {
        setError("You must be signed in to delete client information.");
        return false;
      }

      if (!isAcceptedProjectMember(projectId)) {
        setError("You must belong to this project to manage client information.");
        return false;
      }

      try {
        const { error } = await supabase.from("client_profiles").delete().eq("project_id", projectId);
        if (error) {
          throw error;
        }

        const { error: contactsError } = await supabase
          .from("client_contacts")
          .delete()
          .eq("project_id", projectId);

        if (contactsError) {
          throw contactsError;
        }

        setClientProfiles((prev) => prev.filter((profile) => profile.projectId !== projectId));
        setClientContacts((prev) => prev.filter((contact) => contact.projectId !== projectId));
        return true;
      } catch (err: any) {
        console.error("Error deleting client profile:", err);
        setError(err.message || "Failed to delete client profile.");
        return false;
      }
    },
    [isAcceptedProjectMember, session]
  );

  const handleUpdateClientContact = useCallback(
    async (
      contactId: string,
      input: { fullName: string; email: string; phone?: string | null; role?: string | null }
    ) => {
      if (!session) {
        setError("You must be signed in to update a client contact.");
        return false;
      }

      const existing = clientContacts.find((contact) => contact.id === contactId);
      if (!existing) {
        setError("Unable to locate the client contact you're trying to update.");
        return false;
      }

      if (!isAcceptedProjectMember(existing.projectId)) {
        setError("You must belong to this project to manage client contacts.");
        return false;
      }

      const fullName = input.fullName.trim();
      const email = input.email.trim();
      const phone = input.phone?.trim() ?? "";
      const role = input.role?.trim() ?? "";

      if (!fullName || !email) {
        setError("A client contact must include a name and email.");
        return false;
      }

      const now = new Date().toISOString();
      const payload = mapClientContactToSupabase({
        fullName,
        email,
        phone: phone.length > 0 ? phone : null,
        role: role.length > 0 ? role : null,
        updatedAt: now,
      });

      try {
        const { data, error } = await supabase
          .from("client_contacts")
          .update(payload)
          .eq("id", contactId)
          .select();

        if (error) {
          throw error;
        }

        const updated =
          data && data.length > 0
            ? mapClientContactFromSupabase(data[0])
            : {
                ...existing,
                fullName,
                email,
                phone: phone.length > 0 ? phone : null,
                role: role.length > 0 ? role : null,
                updatedAt: now,
              };

        setClientContacts((prev) =>
          prev.map((contact) => (contact.id === contactId ? updated : contact))
        );
        return true;
      } catch (err: any) {
        console.error("Error updating client contact:", err);
        setError(err.message || "Failed to update client contact.");
        return false;
      }
    },
    [clientContacts, isAcceptedProjectMember, session]
  );

  const handleDeleteClientContact = useCallback(
    async (contactId: string) => {
      if (!session) {
        setError("You must be signed in to remove a client contact.");
        return false;
      }

      const existing = clientContacts.find((contact) => contact.id === contactId);
      if (!existing) {
        return false;
      }

      if (!isAcceptedProjectMember(existing.projectId)) {
        setError("You must belong to this project to manage client contacts.");
        return false;
      }

      try {
        const { error } = await supabase.from("client_contacts").delete().eq("id", contactId);
        if (error) {
          throw error;
        }
        setClientContacts((prev) => prev.filter((contact) => contact.id !== contactId));
        return true;
      } catch (err: any) {
        console.error("Error removing client contact:", err);
        setError(err.message || "Failed to remove client contact.");
        return false;
      }
    },
    [clientContacts, isAcceptedProjectMember, session]
  );

  const handleDeleteChangeOrder = useCallback(
    async (changeOrderId: string) => {
      if (!session) {
        setError("You must be signed in to delete a change order.");
        return false;
      }

      const target = changeOrders.find((order) => order.id === changeOrderId);
      if (!target) {
        setError("Unable to locate the change order you are trying to delete.");
        return false;
      }

      if (!isAcceptedProjectMember(target.projectId)) {
        setError("You must belong to this project to delete change orders.");
        return false;
      }

      const role = resolveRoleForProject(target.projectId);
      if (role === "viewer") {
        setError("You do not have permission to delete change orders for this project.");
        return false;
      }

      try {
        const response = await fetch("/api/change-orders/delete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ changeOrderId }),
        });

        let payload: any = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }

        if (!response.ok) {
          const message =
            (payload && typeof payload.error === "string" && payload.error) ||
            `Failed to delete change order (${response.status}).`;
          throw new Error(message);
        }

        setChangeOrders((prev) => prev.filter((order) => order.id !== changeOrderId));
        return true;
      } catch (err: any) {
        console.error("Error deleting change order:", err);
        setError(err?.message ?? "Failed to delete change order.");
        return false;
      }
    },
    [changeOrders, resolveRoleForProject, session, isAcceptedProjectMember]
  );

  const handleCreateChangeOrder = useCallback(
    async (input: ChangeOrderDraft) => {
      if (!session) {
        setError("You must be signed in to create a change order.");
        return;
      }

      const title = input.title.trim();
      const description = input.description.trim();
      const projectId = input.projectId;

      if (!projectId) {
        setError("A project is required to create a change order.");
        return;
      }

      if (!title) {
        setError("Change orders must include a title.");
        return;
      }

      const createdAt = new Date().toISOString();
      const changeOrderId = createId("chg");

      const draft: ChangeOrder = {
        id: changeOrderId,
        projectId,
        title,
        description,
        amount:
          input.amount === null || input.amount === undefined || Number.isNaN(Number(input.amount))
            ? null
            : Number(input.amount),
        requestedBy: session.user.id,
        requestedAt: createdAt,
        dueDate: input.dueDate && input.dueDate.trim().length > 0 ? input.dueDate : null,
        status: "pending",
        decisionBy: null,
        decisionAt: null,
        decisionNotes: null,
      };

      try {
        const { data, error } = await supabase
          .from("change_orders")
          .insert([mapChangeOrderToSupabase(draft)])
          .select();

        if (error) {
          throw error;
        }

        const inserted = data && data.length > 0 ? mapChangeOrderFromSupabase(data[0]) : draft;

        setChangeOrders((prev) => [inserted, ...prev]);
      } catch (err: any) {
        console.error("Error creating change order:", err);
        setError(err.message || "Failed to create change order.");
      }
    },
    [session]
  );

  const handleSendChangeOrder = useCallback(
    async (changeOrderId: string, options?: { email?: string | null }) => {
      if (!session) {
        setError("You must be signed in to send a change order.");
        return;
      }

      try {
        setError(null);
        const response = await fetch("/api/change-orders/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            changeOrderId,
            email: options?.email ?? undefined,
          }),
        });

        let payload: any = null;
        try {
          payload = await response.json();
        } catch (parseErr) {
          payload = null;
        }

        if (!response.ok) {
          const message =
            (payload && typeof payload.error === "string" && payload.error) ||
            `Failed to send change order (${response.status}).`;
          throw new Error(message);
        }

        if (payload?.changeOrder) {
          const updatedOrder = mapChangeOrderFromSupabase(payload.changeOrder);
          setChangeOrders((prev) =>
            prev.map((order) => (order.id === updatedOrder.id ? updatedOrder : order))
          );
        }
      } catch (err: any) {
        console.error("Error sending change order:", err);
        setError(err?.message ?? "Failed to send change order.");
        throw err;
      }
    },
    [session]
  );

  const handleUpdateChangeOrderStatus = useCallback(
    async (
      changeOrderId: string,
      status: ChangeOrderStatus,
      options?: {
        notes?: string;
      }
    ) => {
      if (!session) {
        setError("You must be signed in to update a change order.");
        return;
      }

      const target = changeOrders.find((order) => order.id === changeOrderId);
      if (!target) {
        setError("Unable to locate the change order you are trying to update.");
        return;
      }

      const normalizedStatus = status === "approved" || status === "denied" ? status : "pending";
      const now = new Date().toISOString();
      const notes = options?.notes?.trim() ?? null;

      const updatePayload: Partial<ChangeOrder> = {
        id: changeOrderId,
        projectId: target.projectId,
        status: normalizedStatus,
        decisionNotes: normalizedStatus === "pending" ? null : notes,
        decisionAt: normalizedStatus === "pending" ? null : now,
        decisionBy: normalizedStatus === "pending" ? null : session.user.id,
      };

      try {
        const { data, error } = await supabase
          .from("change_orders")
          .update(mapChangeOrderToSupabase(updatePayload))
          .eq("id", changeOrderId)
          .select();

        if (error) {
          throw error;
        }

        const updated =
          data && data.length > 0
            ? mapChangeOrderFromSupabase(data[0])
            : {
                ...target,
                ...updatePayload,
              };

        setChangeOrders((prev) =>
          prev.map((order) => (order.id === changeOrderId ? updated : order))
        );
      } catch (err: any) {
        console.error("Error updating change order:", err);
        setError(err.message || "Failed to update change order.");
      }
    },
    [changeOrders, session]
  );

  const purgeDemoProjects = useCallback(
    async (demoProjects: Project[], files: DayFile[]): Promise<boolean> => {
      if (!SHOULD_PURGE_DEMO_PROJECTS || demoProjects.length === 0) {
        return false;
      }

      let purgedAny = false;

      for (const project of demoProjects) {
        try {
          const relatedFiles = files.filter((file) => file.projectId === project.id);

          if (relatedFiles.length > 0) {
            const groupedPaths = new Map<string, string[]>();
            for (const file of relatedFiles) {
              const existing = groupedPaths.get(file.bucketId);
              if (existing) {
                existing.push(file.path);
              } else {
                groupedPaths.set(file.bucketId, [file.path]);
              }
            }

            for (const [bucketId, paths] of groupedPaths.entries()) {
              try {
                await supabase.storage.from(bucketId).remove(paths);
              } catch (storageErr) {
                console.warn("Failed to remove demo project files from storage:", storageErr);
              }
            }

            await supabase.from("day_files").delete().eq("project_id", project.id);
          }

          await supabase.from("notes").delete().eq("project_id", project.id);
          await supabase.from("tasks").delete().eq("project_id", project.id);
          await supabase.from("project_members").delete().eq("project_id", project.id);
          await supabase.from("projects").delete().eq("id", project.id);
          purgedAny = true;
        } catch (err) {
          console.warn("Failed to fully purge demo project:", err);
        }
      }

      return purgedAny;
    },
    []
  );

  const fetchAllData = useCallback(async (): Promise<void> => {
    if (!session) {
      setProjects([]);
      setTasks([]);
      setNotes([]);
      setDayFiles([]);
      setProjectMembers([]);
      setClientProfiles([]);
      setClientContacts([]);
      setChangeOrders([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select('*');

      if (projectsError) throw projectsError;

      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('*');

      if (tasksError) throw tasksError;

      const { data: notesData, error: notesError } = await supabase
        .from('notes')
        .select('*');

      if (notesError) throw notesError;

      const { data: filesData, error: filesError } = await supabase
        .from('day_files')
        .select('*');

      if (filesError) throw filesError;

      const { data: membersData, error: membersError } = await supabase
        .from('project_members')
        .select('*');

      if (membersError) throw membersError;

      const { data: clientProfilesData, error: clientProfilesError } = await supabase
        .from('client_profiles')
        .select('*');

      if (clientProfilesError) throw clientProfilesError;

      const { data: clientContactsData, error: clientContactsError } = await supabase
        .from('client_contacts')
        .select('*');

      if (clientContactsError) {
        console.error("Error fetching client contacts:", clientContactsError);
      }

      const { data: changeOrdersData, error: changeOrdersError } = await supabase
        .from('change_orders')
        .select('*')
        .order('requested_at', { ascending: false });

      if (changeOrdersError) throw changeOrdersError;

      let projectsList = (projectsData ?? []).map(mapProjectFromSupabase);
      let tasksList = (tasksData ?? []).map(mapTaskFromSupabase);
      let notesList = (notesData ?? []).map(mapNoteFromSupabase);
      let filesList = (filesData ?? []).map(mapDayFileFromSupabase);
      let membersList = (membersData ?? []).map(mapMemberFromSupabase);
      let clientProfilesList = (clientProfilesData ?? []).map(mapClientProfileFromSupabase);
      let clientContactsList =
        clientContactsError ? [] : (clientContactsData ?? []).map(mapClientContactFromSupabase);
      let changeOrdersList = (changeOrdersData ?? []).map(mapChangeOrderFromSupabase);

      if (SHOULD_PURGE_DEMO_PROJECTS) {
        const demoProjects = projectsList.filter(
          (project) => project.referenceId === DEMO_PROJECT_REFERENCE_ID
        );

        if (demoProjects.length > 0) {
          const purged = await purgeDemoProjects(demoProjects, filesList);
          if (purged) {
            const demoProjectIds = new Set(demoProjects.map((project) => project.id));
            projectsList = projectsList.filter((project) => !demoProjectIds.has(project.id));
            tasksList = tasksList.filter((task) => !demoProjectIds.has(task.projectId));
            notesList = notesList.filter((note) => !demoProjectIds.has(note.projectId));
            filesList = filesList.filter((file) => !demoProjectIds.has(file.projectId));
            membersList = membersList.filter((member) => !demoProjectIds.has(member.projectId));
            clientProfilesList = clientProfilesList.filter((profile) => !demoProjectIds.has(profile.projectId));
            changeOrdersList = changeOrdersList.filter((changeOrder) => !demoProjectIds.has(changeOrder.projectId));
          }
        }
      }

      const sessionUserId = session.user.id;
      const sessionUserEmail = session.user.email?.toLowerCase() ?? null;
      const accessibleProjectIds = new Set<string>();

      for (const project of projectsList) {
        if (project.userId === sessionUserId) {
          accessibleProjectIds.add(project.id);
        }
      }

      for (const member of membersList) {
        const matchesCurrentUser =
          (member.userId && member.userId === sessionUserId) ||
          (sessionUserEmail && member.email === sessionUserEmail);
        if (matchesCurrentUser) {
          accessibleProjectIds.add(member.projectId);
        }
      }

      const restrictToAccessibleProjects = <T extends { projectId: string }>(items: T[]) =>
        items.filter((item) => item.projectId && accessibleProjectIds.has(item.projectId));

      if (accessibleProjectIds.size === 0) {
        projectsList = [];
        tasksList = [];
        notesList = [];
        filesList = [];
        membersList = [];
        clientProfilesList = [];
        clientContactsList = [];
        changeOrdersList = [];
      } else {
        projectsList = projectsList.filter((project) => accessibleProjectIds.has(project.id));
        tasksList = restrictToAccessibleProjects(tasksList);
        notesList = restrictToAccessibleProjects(notesList);
        filesList = restrictToAccessibleProjects(filesList);
        membersList = restrictToAccessibleProjects(membersList);
        clientProfilesList = restrictToAccessibleProjects(clientProfilesList);
        clientContactsList = restrictToAccessibleProjects(clientContactsList);
        changeOrdersList = restrictToAccessibleProjects(changeOrdersList);
      }

      const hydratedFiles = await attachSignedUrls(filesList);

      setProjects(projectsList);
      setTasks(tasksList);
      setNotes(notesList);
      setDayFiles(hydratedFiles);
      setProjectMembers(membersList);
      setClientProfiles(clientProfilesList);
      setClientContacts(clientContactsList);
      setChangeOrders(changeOrdersList);
    } catch (err: any) {
      console.error("Error fetching data:", err);
      setError(err.message || "Failed to fetch data.");
    } finally {
      setLoading(false);
    }
  }, [session, attachSignedUrls, purgeDemoProjects]);

  useEffect(() => {
    void fetchAllData();
  }, [fetchAllData]);

  useEffect(() => {
    if (!session?.user?.email) {
      return;
    }

    let isCancelled = false;
    const linkPendingInvites = async () => {
      try {
        const baseUrl = INVITE_SERVICE_BASE_URL ?? "";
        const endpoint =
          baseUrl && baseUrl.length > 0
            ? `${baseUrl}/invites/accept`
            : "/api/invites/accept";

        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        let payload: any = null;
        try {
          payload = await response.json();
        } catch (_err) {
          payload = null;
        }

        if (!response.ok) {
          const message =
            (payload && typeof payload.error === "string" && payload.error) ||
            `Failed to accept invites (${response.status}).`;
          throw new Error(message);
        }

        if (isCancelled || !payload || !Array.isArray(payload.members) || payload.members.length === 0) {
          return;
        }

        const mappedMembers = payload.members.map(mapMemberFromSupabase);
        setProjectMembers((prev) => {
          const next = [...prev];
          let changed = false;
          for (const member of mappedMembers) {
            const idx = next.findIndex((existing) => existing.id === member.id);
            if (idx >= 0) {
              next[idx] = member;
            } else {
              next.push(member);
            }
            changed = true;
          }
          return changed ? next : prev;
        });

        await fetchAllData();
      } catch (err: any) {
        console.error("Error accepting project invite:", err);
        setError(err?.message ?? "Failed to accept project invite.");
      }
    };

    void linkPendingInvites();

    return () => {
      isCancelled = true;
    };
  }, [
    session?.user?.id,
    session?.user?.email,
    session?.user?.user_metadata?.full_name,
    fetchAllData,
  ]);

  const handleCreateProject = useCallback(async (input: Omit<Project, "id" | "createdAt" | "userId">) => {
    if (!session) {
      setError("You must be signed in to create a project.");
      return;
    }

    const newProject: Project = {
      id: createId("project"),
      createdAt: new Date().toISOString(),
      userId: session.user.id,
      ...input,
    };

    try {
      const { data, error } = await supabase
        .from('projects')
        .insert([mapProjectToSupabase(newProject)])
        .select();
      if (error) throw error;
      if (data && data.length > 0) {
        const insertedProject = mapProjectFromSupabase(data[0]);
        setProjects((prev) => [...prev, insertedProject]);
        try {
          const ownerPayload = mapMemberUpdateToSupabase({
            projectId: insertedProject.id,
            userId: session.user.id,
            email: session.user.email ?? "",
            role: "owner",
            status: "accepted",
            invitedBy: session.user.id,
            invitedAt: new Date().toISOString(),
            acceptedAt: new Date().toISOString(),
            fullName: session.user.user_metadata?.full_name ?? session.user.email ?? null,
          });
          const { data: memberData, error: memberError } = await supabase
            .from('project_members')
            .insert([ownerPayload])
            .select();

          if (memberError) {
            throw memberError;
          }

          if (memberData && memberData.length > 0) {
            const ownerMember = mapMemberFromSupabase(memberData[0]);
            setProjectMembers((prev) => [...prev, ownerMember]);
          }
        } catch (memberErr) {
          console.error("Error creating project owner membership:", memberErr);
          setProjectMembers((prev) => [
            ...prev,
            {
              id: `local-${insertedProject.id}`,
              projectId: insertedProject.id,
              userId: session.user.id,
              email: session.user.email ?? "",
              role: 'owner',
              status: 'accepted',
              invitedBy: session.user.id,
              invitedAt: new Date().toISOString(),
              acceptedAt: new Date().toISOString(),
              fullName: session.user.user_metadata?.full_name ?? session.user.email ?? null,
            },
          ]);
        }
        return insertedProject;
      }
    } catch (err: any) {
      console.error("Error creating project:", err);
      setError(err.message || "Failed to create project.");
    }
    return undefined;
  }, [session]);

  const handleUpdateProject = useCallback(async (projectId: string, input: Omit<Project, "id" | "createdAt" | "userId">) => {
    if (!session) {
      setError("You must be signed in to update a project.");
      return;
    }
    try {
      const { data, error } = await supabase
        .from('projects')
        .update(mapProjectToSupabase(input))
        .eq('id', projectId)
        .select();
      if (error) throw error;
      if (data && data.length > 0) {
        const updatedProject = mapProjectFromSupabase(data[0]);
        setProjects((prev) =>
          prev.map((project) =>
            project.id === projectId
              ? updatedProject
              : project,
          ),
        );
      }
    } catch (err: any) {
      console.error("Error updating project:", err);
      setError(err.message || "Failed to update project.");
    }
  }, [session]);

  const handleDeleteProject = useCallback(async (projectId: string) => {
    if (!session) {
      setError("You must be signed in to delete a project.");
      return;
    }

    const role = resolveRoleForProject(projectId);
    if (role !== "owner") {
      setError("You do not have permission to delete this project.");
      return;
    }
    try {
      const projectFiles = dayFiles.filter((file) => file.projectId === projectId);
      if (projectFiles.length > 0) {
        const groupedPaths = new Map<string, string[]>();
        for (const file of projectFiles) {
          const existing = groupedPaths.get(file.bucketId);
          if (existing) {
            existing.push(file.path);
          } else {
            groupedPaths.set(file.bucketId, [file.path]);
          }
        }

        for (const [bucketId, paths] of groupedPaths.entries()) {
          const { error: storageError } = await supabase.storage
            .from(bucketId)
            .remove(paths);
          if (storageError) {
            throw storageError;
          }
        }

        const { error: fileDeleteError } = await supabase
          .from('day_files')
          .delete()
          .eq('project_id', projectId);
        if (fileDeleteError) {
          throw fileDeleteError;
        }
      }

      const { error: memberDeleteError } = await supabase
        .from('project_members')
        .delete()
        .eq('project_id', projectId);
      if (memberDeleteError) {
        throw memberDeleteError;
      }

      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId);
      if (error) throw error;

      setProjects((prev) => prev.filter((project) => project.id !== projectId));
      setTasks((prev) => prev.filter((task) => task.projectId !== projectId));
      setDayFiles((prev) => prev.filter((file) => file.projectId !== projectId));
      setProjectMembers((prev) => prev.filter((member) => member.projectId !== projectId));
    } catch (err: any) {
      console.error("Error deleting project:", err);
      setError(err.message || "Failed to delete project.");
    }
  }, [session, dayFiles, resolveRoleForProject]);

  const handleCreateTask = useCallback(async (input: TaskDraft) => {
    if (!session) {
      setError("You must be signed in to create a task.");
      return;
    }

    if (!canManageTasksForProject(input.projectId)) {
      setError("You do not have permission to create tasks for this project.");
      return;
    }

    const taskId = createId("task");
    const payload = {
      id: taskId,
      ...mapTaskToSupabase(input),
    };

    try {
      const { data, error } = await supabase.from('tasks').insert([payload]).select();
      if (error) throw error;
      if (data && data.length > 0) {
        const insertedTask = mapTaskFromSupabase(data[0]);
        setTasks((prev) => [...prev, insertedTask]);
      }
    } catch (err: any) {
      console.error("Error creating task:", err);
      setError(err.message || "Failed to create task.");
    }
  }, [canManageTasksForProject, session]);

  const handleUpdateTask = useCallback(async (taskId: string, input: TaskDraft) => {
    if (!session) {
      setError("You must be signed in to update a task.");
      return;
    }

    const existingTask = tasks.find((task) => task.id === taskId);
    const targetProjectId = input.projectId ?? existingTask?.projectId;
    if (!targetProjectId) {
      setError("Unable to locate the task you are trying to update.");
      return;
    }

    if (!canManageTasksForProject(targetProjectId)) {
      setError("You do not have permission to update tasks for this project.");
      return;
    }

    try {
      const payload = mapTaskToSupabase(input);
      const { data, error } = await supabase
        .from('tasks')
        .update(payload)
        .eq('id', taskId)
        .select();
      if (error) throw error;
      if (data && data.length > 0) {
        const updatedTask = mapTaskFromSupabase(data[0]);
        setTasks((prev) =>
          prev.map((task) =>
            task.id === taskId
              ? updatedTask
              : task,
          ),
        );
      }
    } catch (err: any) {
      console.error("Error updating task:", err);
      setError(err.message || "Failed to update task.");
    }
  }, [canManageTasksForProject, session, tasks]);

  const handleDeleteTask = useCallback(async (taskId: string) => {
    if (!session) {
      setError("You must be signed in to delete a task.");
      return;
    }

    const targetTask = tasks.find((task) => task.id === taskId);
    if (!targetTask) {
      setError("Unable to locate the task you are trying to delete.");
      return;
    }

    if (!canManageTasksForProject(targetTask.projectId)) {
      setError("You do not have permission to delete tasks for this project.");
      return;
    }

    try {
      const dependentTasks = tasks.filter((task) => task.dependencies.includes(taskId));

      for (const dependent of dependentTasks) {
        const nextDependencies = dependent.dependencies.filter((dependencyId) => dependencyId !== taskId);
        const { error: dependencyError } = await supabase
          .from('tasks')
          .update(mapTaskToSupabase({ dependencies: nextDependencies }))
          .eq('id', dependent.id);
        if (dependencyError) {
          throw dependencyError;
        }
      }

      const { error } = await supabase.from('tasks').delete().eq('id', taskId);
      if (error) throw error;

      setTasks((prev) =>
        prev
          .filter((task) => task.id !== taskId)
          .map((task) =>
            task.dependencies.includes(taskId)
              ? { ...task, dependencies: task.dependencies.filter((dependencyId) => dependencyId !== taskId) }
              : task,
          ),
      );
    } catch (err: any) {
      console.error("Error deleting task:", err);
      setError(err.message || "Failed to delete task.");
    }
  }, [canManageTasksForProject, session, tasks]);

  const handleCreateFile = useCallback(async ({ projectId, date, file }: { projectId: string; date: string; file: File; }) => {
    if (!session) {
      setError("You must be signed in to upload a file.");
      return;
    }

    if (!isAcceptedProjectMember(projectId)) {
      setError("You must belong to this project to upload files.");
      return;
    }

    const fileId = createId("file");
    const originalName = file.name?.trim() || "upload";
    const sanitizedName = sanitizeFilename(originalName) || `file-${Date.now()}`;
    const storageFileName = `${fileId}-${sanitizedName}`;
    const storagePath = buildStoragePath(session.user.id, projectId, date, storageFileName);
    const bucketId = DAY_FILES_BUCKET;
    const contentType = file.type || 'application/octet-stream';

    try {
      const { error: uploadError } = await supabase.storage
        .from(bucketId)
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType,
        });

      if (uploadError) {
        throw uploadError;
      }

      const payload = mapDayFileToSupabase({
        id: fileId,
        projectId,
        date,
        bucketId,
        path: storagePath,
        name: file.name,
        size: file.size,
        type: contentType,
        uploadedBy: session.user.id,
      });

      const { data, error: insertError } = await supabase
        .from('day_files')
        .insert([payload])
        .select();

      if (insertError || !data || data.length === 0) {
        await supabase.storage.from(bucketId).remove([storagePath]);
        throw insertError || new Error('Failed to store file metadata.');
      }

      const storedFile = mapDayFileFromSupabase(data[0]);
      const [hydratedFile] = await attachSignedUrls([storedFile]);
      const nextFile = hydratedFile ?? storedFile;
      setDayFiles((prev) => [...prev, nextFile]);
      return nextFile;
    } catch (err: any) {
      console.error("Error uploading file:", err);
      const errorMessage = err.message || "An unknown error occurred during file upload.";
      setError(errorMessage);
      
      if (err.details) {
        console.error("Error details:", err.details);
      }
      
      alert(`Failed to upload file: ${errorMessage}`);
      
      return undefined;
    }
  }, [session, attachSignedUrls, isAcceptedProjectMember]);

  const handleDeleteFile = useCallback(async (fileId: string) => {
    if (!session) {
      setError("You must be signed in to delete a file.");
      return;
    }

    const target = dayFiles.find((file) => file.id === fileId);
    if (!target) {
      return;
    }

    if (!canManageProjectAsset(target.projectId, target.uploadedBy)) {
      setError("You do not have permission to delete this file.");
      return;
    }

    try {
      const { error: storageError } = await supabase.storage
        .from(target.bucketId)
        .remove([target.path]);

      if (storageError) {
        throw storageError;
      }

      const { error: deleteError } = await supabase
        .from('day_files')
        .delete()
        .eq('id', fileId);

      if (deleteError) {
        throw deleteError;
      }

      setDayFiles((prev) => prev.filter((file) => file.id !== fileId));
    } catch (err: any) {
      console.error("Error deleting file:", err);
      setError(err?.message ?? "Failed to delete file.");
    }
  }, [canManageProjectAsset, session, dayFiles]);

  const handleCreateNote = useCallback(async (input: Omit<DayNote, "id" | "createdAt" | "userId">) => {
    if (!session) {
      setError("You must be signed in to create a note.");
      return;
    }

    if (!isAcceptedProjectMember(input.projectId)) {
      setError("You must belong to this project to create notes.");
      return;
    }
    const notePayload = mapNoteToSupabase({
      projectId: input.projectId,
      date: input.date,
      text: input.text,
      userId: session.user.id,
    });
    try {
      const { data, error } = await supabase.from("notes").insert([notePayload]).select();
      if (error) throw error;
      if (data && data.length > 0) {
        const newNote = mapNoteFromSupabase(data[0]);
        setNotes((prev) => [...prev, newNote]);
      }
    } catch (err: any) {
      console.error("Error creating note:", err);
      setError(err.message || "Failed to create note.");
    }
  }, [isAcceptedProjectMember, session]);

  const handleUpdateNote = useCallback(async (noteId: string, text: string) => {
    if (!session) {
      setError("You must be signed in to update a note.");
      return;
    }

    const targetNote = notes.find((note) => note.id === noteId);
    if (!targetNote) {
      setError("Unable to locate the note you are trying to update.");
      return;
    }

    if (!canManageProjectAsset(targetNote.projectId, targetNote.userId)) {
      setError("You do not have permission to update this note.");
      return;
    }

    try {
      const { data, error } = await supabase
        .from("notes")
        .update({ body: text })
        .eq("id", noteId)
        .select();
      if (error) throw error;
      if (data && data.length > 0) {
        const updatedNote = mapNoteFromSupabase(data[0]);
        setNotes((prev) =>
          prev.map((note) =>
            note.id === noteId ? updatedNote : note
          )
        );
      }
    } catch (err: any) {
      console.error("Error updating note:", err);
      setError(err.message || "Failed to update note.");
    }
  }, [canManageProjectAsset, notes, session]);

  const handleDeleteNote = useCallback(async (noteId: string) => {
    if (!session) {
      setError("You must be signed in to delete a note.");
      return;
    }

    const targetNote = notes.find((note) => note.id === noteId);
    if (!targetNote) {
      return;
    }

    if (!canManageProjectAsset(targetNote.projectId, targetNote.userId)) {
      setError("You do not have permission to delete this note.");
      return;
    }

    try {
      const { error } = await supabase.from("notes").delete().eq("id", noteId);
      if (error) throw error;
      setNotes((prev) => prev.filter((note) => note.id !== noteId));
    } catch (err: any) {
      console.error("Error deleting note:", err);
      setError(err.message || "Failed to delete note.");
    }
  }, [canManageProjectAsset, notes, session]);

  return {
    projects,
    tasks,
    notes,
    dayFiles,
    projectMembers,
    clientProfiles,
    clientContacts,
    changeOrders,
    loading,
    error,
    handleCreateProject,
    handleUpdateProject,
    handleDeleteProject,
    handleCreateTask,
    handleUpdateTask,
    handleDeleteTask,
    handleCreateNote,
    handleUpdateNote,
    handleDeleteNote,
    handleCreateFile,
    handleDeleteFile,
    handleSaveClientProfile,
    handleDeleteClientProfile,
    handleCreateClientContact,
    handleUpdateClientContact,
    handleDeleteClientContact,
    handleCreateChangeOrder,
    handleSendChangeOrder,
    handleDeleteChangeOrder,
    handleUpdateChangeOrderStatus,
    handleInviteMember,
    handleUpdateMemberRole,
    handleRemoveMember,
  };
}
