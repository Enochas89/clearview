
import { useCallback, useEffect, useMemo, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChangeOrder,
  ChangeOrderLineItem,
  ChangeOrderRecipientStatus,
  ChangeOrderStatus,
  DayActivity,
  DayEntry,
  DayFile,
  InviteMemberResult,
  MemberRole,
  Project,
  ProjectMember,
  Task,
} from "../types";
import { supabase } from "../supabaseClient";
import { ProjectFormValues } from "../features/sidebar/projectForm";
import { differenceInDays, parseISODate, toISODate } from "../utils/date";
import { TaskReminder } from "./WorkspaceContext";

const DAILY_UPLOADS_BUCKET = "daily-uploads";
const resolveBucketId = (value?: string | null) => (value ?? "").trim() || DAILY_UPLOADS_BUCKET;

const extractErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) {
    return error.message || fallback;
  }
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: string }).message;
    return message || fallback;
  }
  return fallback;
};

type ProjectRow = {
  id: string;
  name: string | null;
  description: string | null;
  color: string | null;
  created_at: string | null;
  start_date: string | null;
  due_date: string | null;
  reference_id: string | null;
  cost: string | null;
  address: string | null;
  project_manager: string | null;
  user_id: string | null;
};

type TaskRow = {
  id: string;
  project_id: string;
  name: string | null;
  description: string | null;
  start_date: string | null;
  due_date: string | null;
  status: string | null;
  dependencies: string[] | null;
};

type ChangeOrderRow = {
  id: string;
  project_id: string;
  subject: string | null;
  body: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  status: string | null;
  sent_at: string | null;
  updated_at: string | null;
  response_at: string | null;
  response_message: string | null;
  created_by: string | null;
  created_by_name: string | null;
  responded_by: string | null;
  responded_by_name: string | null;
  created_at: string | null;
  line_items: any;
  change_order_recipients?: Array<{
    id: string;
    email: string;
    name: string | null;
    status: string | null;
    condition_note: string | null;
    responded_at: string | null;
  }>;
};

type ProjectMemberRow = {
  id: string;
  project_id: string;
  user_id: string | null;
  email: string | null;
  role: string | null;
  status: string | null;
  invited_by: string | null;
  invited_at: string | null;
  accepted_at: string | null;
  full_name: string | null;
};

const normalizeChangeOrderStatus = (status: string | null): ChangeOrderStatus => {
  switch (status) {
    case "approved":
    case "approved_with_conditions":
    case "denied":
    case "needs_info":
      return status;
    case "needs-info":
      return "needs_info";
    case "approved-with-conditions":
      return "approved_with_conditions";
    default:
      return "pending";
  }
};

const normalizeRecipientStatus = (
  status: string | null,
): ChangeOrderRecipientStatus => {
  switch (status) {
    case "approved":
    case "approved_with_conditions":
    case "denied":
    case "needs_info":
      return status;
    case "needs-info":
      return "needs_info";
    case "approved-with-conditions":
      return "approved_with_conditions";
    default:
      return "pending";
  }
};

const mapProjectFromRow = (row: ProjectRow): Project => ({
  id: row.id,
  name: row.name ?? "",
  description: row.description ?? "",
  color: row.color ?? "#2563eb",
  createdAt: row.created_at ?? "",
  startDate: row.start_date ?? "",
  dueDate: row.due_date ?? "",
  referenceId: row.reference_id ?? "",
  cost: row.cost ?? "",
  address: row.address ?? "",
  projectManager: row.project_manager ?? "",
  userId: row.user_id ?? "",
});

const mapProjectToInsertRow = (project: Project) => ({
  id: project.id,
  name: project.name,
  description: project.description,
  color: project.color,
  created_at: project.createdAt,
  start_date: project.startDate,
  due_date: project.dueDate,
  reference_id: project.referenceId,
  cost: project.cost,
  address: project.address,
  project_manager: project.projectManager,
  user_id: project.userId,
});

const mapProjectUpdateToRow = (input: ProjectFormValues) => ({
  name: input.name,
  description: input.description,
  color: input.color,
  start_date: input.startDate,
  due_date: input.dueDate,
  reference_id: input.referenceId,
  cost: input.cost,
  address: input.address,
  project_manager: input.projectManager,
});

const mapTaskFromRow = (row: TaskRow): Task => ({
  id: row.id,
  projectId: row.project_id,
  name: row.name ?? "",
  description: row.description ?? "",
  startDate: row.start_date ?? "",
  dueDate: row.due_date ?? "",
  status: (row.status ?? "todo") as Task["status"],
  dependencies: row.dependencies ?? [],
});

const mapTaskToInsertRow = (task: Task) => ({
  id: task.id,
  project_id: task.projectId,
  name: task.name,
  description: task.description,
  start_date: task.startDate,
  due_date: task.dueDate,
  status: task.status,
  dependencies: task.dependencies,
});

const mapTaskUpdateToRow = (input: Partial<Task>) => ({
  ...(input.projectId !== undefined ? { project_id: input.projectId } : {}),
  ...(input.name !== undefined ? { name: input.name } : {}),
  ...(input.description !== undefined ? { description: input.description } : {}),
  ...(input.startDate !== undefined ? { start_date: input.startDate } : {}),
  ...(input.dueDate !== undefined ? { due_date: input.dueDate } : {}),
  ...(input.status !== undefined ? { status: input.status } : {}),
  ...(input.dependencies !== undefined ? { dependencies: input.dependencies } : {}),
});

const mapChangeOrderFromRow = (row: ChangeOrderRow): ChangeOrder => ({
  id: row.id,
  projectId: row.project_id,
  subject: row.subject ?? "",
  description: row.body ?? "",
  recipientName: row.recipient_name ?? "",
  recipientEmail: row.recipient_email ?? "",
  status: normalizeChangeOrderStatus(row.status),
  sentAt: row.sent_at ?? "",
  updatedAt: row.updated_at ?? "",
  responseAt: row.response_at ?? "",
  responseMessage: row.response_message ?? "",
  createdBy: row.created_by ?? "",
  createdByName: row.created_by_name ?? "",
  respondedBy: row.responded_by ?? "",
  respondedByName: row.responded_by_name ?? "",
  createdAt: row.created_at ?? "",
  lineItems: Array.isArray(row.line_items)
    ? row.line_items
    : typeof row.line_items === "string"
    ? JSON.parse(row.line_items)
    : [],
  recipients: (row.change_order_recipients ?? []).map((recipient) => ({
    id: recipient.id,
    email: recipient.email,
    name: recipient.name ?? "",
    status: normalizeRecipientStatus(recipient.status ?? null),
    conditionNote: recipient.condition_note ?? "",
    respondedAt: recipient.responded_at ?? "",
  })),
});

const mapMemberFromRow = (row: ProjectMemberRow): ProjectMember => ({
  id: row.id,
  projectId: row.project_id,
  userId: row.user_id,
  email: row.email ?? "",
  role:
    row.role === "owner" || row.role === "editor" || row.role === "viewer"
      ? row.role
      : "viewer",
  status: row.status === "accepted" ? "accepted" : "pending",
  invitedBy: row.invited_by,
  invitedAt: row.invited_at,
  acceptedAt: row.accepted_at,
  fullName: row.full_name,
});

const createId = (_prefix: string) => {
  if (typeof globalThis !== "undefined") {
    const { crypto: globalCrypto } = globalThis as { crypto?: Crypto };
    if (globalCrypto) {
      if (typeof globalCrypto.randomUUID === "function") {
        return globalCrypto.randomUUID();
      }
      if (typeof globalCrypto.getRandomValues === "function") {
        const bytes = new Uint8Array(16);
        globalCrypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"))
          .join("")
          .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
      }
    }
  }

  let timestamp = Date.now();
  let performanceTime =
    typeof performance !== "undefined" && performance.now
      ? performance.now()
      : 0;
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    let random = Math.random() * 16;
    if (timestamp > 0) {
      random = (timestamp + random) % 16 | 0;
      timestamp = Math.floor(timestamp / 16);
    } else {
      random = (performanceTime + random) % 16 | 0;
      performanceTime = Math.floor(performanceTime / 16);
    }
    if (char === "x") {
      return random.toString(16);
    }
    return ((random & 0x3) | 0x8).toString(16);
  });
};

const fetchProjectsAndTasks = async (session: Session) => {
  const memberFilters = [`user_id.eq.${session.user.id}`];
  if (session.user.email) {
    const trimmedEmail = session.user.email.trim();
    const normalizedEmail = trimmedEmail.toLowerCase();
    memberFilters.push(`email.eq.${normalizedEmail}`);
    if (normalizedEmail !== trimmedEmail) {
      memberFilters.push(`email.eq.${trimmedEmail}`);
    }
  }

  let memberQuery = supabase.from("project_members").select("project_id");
  if (memberFilters.length === 1) {
    memberQuery = memberQuery.eq("user_id", session.user.id);
  } else {
    memberQuery = memberQuery.or(memberFilters.join(","));
  }

  const { data: memberRows, error: membersError } = await memberQuery;
  if (membersError) throw membersError;

  const projectIds = (memberRows ?? []).map((row) => row.project_id);
  const projectSelect =
    "id, name, description, color, created_at, start_date, due_date, reference_id, cost, address, project_manager, user_id";

  const projectRows: ProjectRow[] = [];
  if (projectIds.length > 0) {
    const { data: memberProjects, error: memberProjectsError } = await supabase
      .from("projects")
      .select(projectSelect)
      .in("id", projectIds);
    if (memberProjectsError) throw memberProjectsError;
    projectRows.push(...((memberProjects ?? []) as ProjectRow[]));
  }

  const { data: ownedProjects, error: ownedProjectsError } = await supabase
    .from("projects")
    .select(projectSelect)
    .eq("user_id", session.user.id);

  if (ownedProjectsError) throw ownedProjectsError;
  projectRows.push(...((ownedProjects ?? []) as ProjectRow[]));

  const uniqueProjects = Array.from(new Map(projectRows.map((row) => [row.id, row])).values());
  uniqueProjects.sort((a, b) => {
    const createdA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const createdB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return createdA - createdB;
  });

  const projects = uniqueProjects.map((project) => mapProjectFromRow(project as ProjectRow));

  let tasks: Task[] = [];
  if (projects.length > 0) {
    const taskProjectIds = projects.map((project) => project.id);
    const { data: tasksData, error: tasksError } = await supabase
      .from("tasks")
      .select("id, project_id, name, description, start_date, due_date, status, dependencies")
      .in("project_id", taskProjectIds);
    if (tasksError) throw tasksError;
    tasks = (tasksData ?? []).map((task) => mapTaskFromRow(task as TaskRow));
  }

  return { projects, tasks };
};

const fetchProjectDayEntries = async (session: Session, projectId: string): Promise<DayEntry[]> => {
  const [noteResult, fileResult, memberResult] = await Promise.all([
    supabase
      .from("notes")
      .select("id, note_date, body, created_at, user_id")
      .eq("project_id", projectId)
      .order("note_date", { ascending: true }),
    supabase
      .from("day_files")
      .select(
        "id, note_date, bucket_id, storage_path, file_name, file_size, content_type, created_at, note_id, uploaded_by",
      )
      .eq("project_id", projectId)
      .order("note_date", { ascending: true }),
    supabase
      .from("project_members")
      .select("user_id, full_name, email")
      .eq("project_id", projectId),
  ]);

  if (noteResult.error) throw noteResult.error;
  if (fileResult.error) throw fileResult.error;

  const noteRows = (noteResult.data ?? []) as Array<{
    id: string;
    note_date: string;
    body: string | null;
    created_at: string | null;
    user_id: string | null;
  }>;

  const membersError = memberResult.error;
  if (membersError) {
    console.warn("Unable to load project members:", membersError.message);
  }

  const memberLookup = new Map<string, { name?: string | null; email?: string | null }>();
  const effectiveMembers = membersError ? [] : memberResult.data ?? [];
  effectiveMembers.forEach((member) => {
    if (member.user_id) {
      memberLookup.set(member.user_id, { name: member.full_name, email: member.email });
    }
  });
  if (session.user) {
    memberLookup.set(session.user.id, {
      name: session.user.user_metadata?.full_name ?? session.user.email ?? null,
      email: session.user.email ?? null,
    });
  }

  const entriesByDate = new Map<string, DayEntry>();
  const ensureEntry = (isoDate: string) => {
    if (!entriesByDate.has(isoDate)) {
      entriesByDate.set(isoDate, {
        date: isoDate,
        files: [],
        posts: [],
      });
    }
    return entriesByDate.get(isoDate)!;
  };

  noteRows.forEach((note) => {
    const entry = ensureEntry(note.note_date);
    const authorRecord = note.user_id ? memberLookup.get(note.user_id) : undefined;
    const authorName =
      authorRecord?.name ||
      authorRecord?.email ||
      (note.user_id && note.user_id === session.user?.id ? "You" : null);

    entry.posts.push({
      id: note.id,
      message: note.body ?? "",
      createdAt: note.created_at ?? "",
      authorName,
      attachments: [],
    });
  });

  const fileRows = fileResult.data ?? [];

  const inferContentType = (name?: string | null, provided?: string | null) => {
    const cleanProvided = (provided ?? "").trim();
    if (cleanProvided) return cleanProvided;
    const raw = name ?? "";
    const lastDot = raw.lastIndexOf(".");
    if (lastDot === -1) return "";
    const ext = raw.slice(lastDot + 1).toLowerCase().trim();
    if (!ext) return "";
    if (["jpg", "jpeg", "png", "gif", "bmp", "svg", "webp", "heic", "heif"].includes(ext)) {
      return ext === "jpg" ? "image/jpeg" : `image/${ext}`;
    }
    if (ext === "pdf") return "application/pdf";
    return "";
  };

  const buildFileUrl = async (bucketId: string, storagePath: string) => {
    const trySignedUrl = async (targetBucket: string) => {
      const { data, error } = await supabase.storage.from(targetBucket).createSignedUrl(storagePath, 60 * 60);
      if (error) {
        console.error("Error creating signed URL", {
          bucket: targetBucket,
          path: storagePath,
          message: (error as { message?: string })?.message ?? String(error),
          status: (error as { status?: number; statusCode?: number })?.status ?? (error as { statusCode?: number })?.statusCode,
          details: (error as { error?: string })?.error,
        });
        return null;
      }
      return data?.signedUrl ?? null;
    };

    const tryPublicUrl = (targetBucket: string) => {
      const { data: publicUrlData } = supabase.storage.from(targetBucket).getPublicUrl(storagePath);
      return publicUrlData?.publicUrl ?? null;
    };

    let finalBucket = bucketId;
    let fileUrl = await trySignedUrl(finalBucket);

    if (!fileUrl && finalBucket !== DAILY_UPLOADS_BUCKET) {
      finalBucket = DAILY_UPLOADS_BUCKET;
      fileUrl = await trySignedUrl(finalBucket);
    }

    if (!fileUrl) {
      fileUrl = tryPublicUrl(finalBucket);
      if (!fileUrl && finalBucket !== DAILY_UPLOADS_BUCKET) {
        finalBucket = DAILY_UPLOADS_BUCKET;
        fileUrl = tryPublicUrl(finalBucket);
      }
    }

    return { fileUrl: fileUrl ?? "", finalBucket };
  };

  for (const file of fileRows) {
    const storagePath = (file.storage_path ?? "").trim();
    const bucketId = resolveBucketId(file.bucket_id);
    const effectiveType = inferContentType(file.file_name, file.content_type) || inferContentType(storagePath, null);
    const effectiveName = file.file_name || storagePath;
    const entry = ensureEntry(file.note_date);
    const { fileUrl, finalBucket } = await buildFileUrl(bucketId, storagePath);
    const fileRecord: DayFile = {
      id: file.id,
      name: effectiveName,
      size: Number(file.file_size ?? 0),
      type: effectiveType,
      addedAt: file.created_at ?? "",
      url: fileUrl,
      storagePath: storagePath || undefined,
      bucketId: finalBucket,
      noteId: file.note_id ?? null,
      uploadedBy: file.uploaded_by ?? null,
      uploadedByName:
        (file.uploaded_by ? memberLookup.get(file.uploaded_by)?.name : undefined) ||
        (file.uploaded_by ? memberLookup.get(file.uploaded_by)?.email : undefined) ||
        null,
    };
    if (!fileRecord.uploadedByName && file.uploaded_by === session.user?.id) {
      fileRecord.uploadedByName = "You";
    }

    if (fileRecord.noteId) {
      const post = entry.posts.find((item) => item.id === fileRecord.noteId);
      if (post) {
        if (!fileRecord.uploadedByName && post.authorName) {
          fileRecord.uploadedByName = post.authorName;
        }
        post.attachments.push(fileRecord);
        continue;
      }
    }

    entry.files.push(fileRecord);
  }

  entriesByDate.forEach((entry) => {
    entry.posts.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
    entry.posts.forEach((post) => {
      post.attachments.sort((a, b) => (a.addedAt > b.addedAt ? -1 : 1));
    });
    entry.files.sort((a, b) => (a.addedAt > b.addedAt ? -1 : 1));
  });

  return Array.from(entriesByDate.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([, entry]) => entry);
};

const fetchChangeOrders = async (projectId: string): Promise<ChangeOrder[]> => {
  const { data, error } = await supabase
    .from("change_orders")
    .select(
      "id, project_id, subject, body, recipient_name, recipient_email, status, sent_at, updated_at, response_at, response_message, created_by, created_by_name, responded_by, responded_by_name, created_at, line_items, change_order_recipients(id, change_order_id, email, name, status, condition_note, responded_at)",
    )
    .eq("project_id", projectId)
    .order("sent_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapChangeOrderFromRow(row as ChangeOrderRow));
};

const fetchProjectMembers = async (projectId: string): Promise<ProjectMember[]> => {
  const { data, error } = await supabase
    .from("project_members")
    .select(
      "id, project_id, user_id, email, role, status, invited_by, invited_at, accepted_at, full_name",
    )
    .eq("project_id", projectId)
    .order("invited_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => mapMemberFromRow(row as ProjectMemberRow));
};

const notifyChangeOrder = async (input: { changeOrderId: string; event: "created" | "status"; status?: ChangeOrderStatus }) => {
  try {
    await supabase.functions.invoke("send-change-order-email", { body: input });
  } catch (error) {
    console.error("Error sending change order notification:", error);
  }
};

const uploadDayFile = async (
  session: Session,
  projectId: string,
  noteDate: string,
  file: File,
  options?: { noteId?: string | null },
) => {
  const extension = file.name.includes(".") ? `.${file.name.split(".").pop()}` : "";
  const fileKey = `${projectId}/${noteDate}/${createId("file")}${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(DAILY_UPLOADS_BUCKET)
    .upload(fileKey, file, {
      contentType: file.type || "application/octet-stream",
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const sessionUserId = session.user.id ?? sessionData.session?.user?.id ?? null;
  if (!sessionUserId) {
    await supabase.storage.from(DAILY_UPLOADS_BUCKET).remove([fileKey]);
    throw new Error("You must be signed in to upload files.");
  }

  const { error: insertError } = await supabase
    .from("day_files")
    .insert([
      {
        project_id: projectId,
        note_date: noteDate,
        bucket_id: DAILY_UPLOADS_BUCKET,
        storage_path: fileKey,
        file_name: file.name,
        file_size: file.size,
        content_type: file.type || "application/octet-stream",
        uploaded_by: sessionUserId,
        note_id: options?.noteId ?? null,
      },
    ]);

  if (insertError) {
    await supabase.storage.from(DAILY_UPLOADS_BUCKET).remove([fileKey]);
    throw insertError;
  }
};

type WorkspaceStoreOptions = {
  session: Session;
  onSessionChange: (session: Session | null) => void;
  notifyError: (message: string) => void;
  notifySuccess: (message: string) => void;
};

export type WorkspaceStoreValue = {
  loading: boolean;
  fatalError: string | null;
  projects: Project[];
  tasks: Task[];
  changeOrders: ChangeOrder[];
  projectMembers: ProjectMember[];
  projectDayEntries: Map<string, DayEntry[]>;
  selectedProjectId: string | null;
  setSelectedProjectId: (projectId: string | null) => void;
  recentActivities: DayActivity[];
  upcomingDueTasks: TaskReminder[];
  accountUpdateError: string | null;
  accountUpdateSuccess: string | null;
  isUpdatingAccount: boolean;
  handleCreateProject: (input: ProjectFormValues) => Promise<void>;
  handleUpdateProject: (projectId: string, input: ProjectFormValues) => Promise<void>;
  handleDeleteProject: (projectId: string) => Promise<void>;
  handleInviteMember: (input: {
    projectId: string;
    email: string;
    role: MemberRole;
    name: string;
  }) => Promise<InviteMemberResult | undefined>;
  handleUpdateMemberRole: (memberId: string, role: MemberRole) => Promise<void>;
  handleRemoveMember: (memberId: string) => Promise<void>;
  handleSignOut: () => Promise<void>;
  handleCreateTask: (input: {
    projectId: string;
    name: string;
    description: string;
    startDate: string;
    dueDate: string;
    status: string;
    dependencies: string[];
  }) => Promise<void>;
  handleUpdateTask: (taskId: string, input: Partial<Task>) => Promise<void>;
  handleAddFile: (date: string, file: File, options?: { noteId?: string | null }) => Promise<void>;
  handleRemoveFile: (date: string, fileId: string) => Promise<void>;
  handleCreatePost: (input: { message: string; file?: File | null }) => Promise<void>;
  handleUpdatePost: (postId: string, message: string) => Promise<void>;
  handleDeletePost: (postId: string, attachments: DayFile[]) => Promise<void>;
  handleCreateChangeOrder: (input: {
    subject: string;
    description: string;
    recipientName: string;
    recipientEmail: string;
    lineItems: ChangeOrderLineItem[];
    recipients: Array<{ email: string; name?: string | null }>;
  }) => Promise<void>;
  handleDeleteChangeOrder: (orderId: string) => Promise<void>;
  handleChangeOrderStatus: (
    orderId: string,
    status: ChangeOrderStatus,
    options?: { responseMessage?: string | null },
  ) => Promise<void>;
  handleUpdateAccount: (input: { fullName: string }) => Promise<void>;
  clearAccountFeedback: () => void;
};

export const useWorkspaceStore = ({
  session,
  onSessionChange,
  notifyError,
  notifySuccess,
}: WorkspaceStoreOptions): WorkspaceStoreValue => {
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [accountUpdateError, setAccountUpdateError] = useState<string | null>(null);
  const [accountUpdateSuccess, setAccountUpdateSuccess] = useState<string | null>(null);
  const [isUpdatingAccount, setIsUpdatingAccount] = useState(false);

  const projectsQuery = useQuery({
    queryKey: ["workspace", "projects", session.user.id],
    queryFn: () => fetchProjectsAndTasks(session),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  const projects = projectsQuery.data?.projects ?? [];
  const tasks = projectsQuery.data?.tasks ?? [];
  const fatalError = projectsQuery.isError
    ? extractErrorMessage(projectsQuery.error, "Failed to fetch data.")
    : null;

  useEffect(() => {
    if (projects.length === 0) {
      setSelectedProjectId(null);
      return;
    }
    setSelectedProjectId((prev) => {
      if (prev && projects.some((project) => project.id === prev)) {
        return prev;
      }
      return projects[0].id;
    });
  }, [projects]);

  useEffect(() => {
    if (projectsQuery.isError) {
      notifyError(extractErrorMessage(projectsQuery.error, "Failed to fetch data."));
    }
  }, [projectsQuery.isError, projectsQuery.error, notifyError]);

  const dayEntriesQuery = useQuery({
    queryKey: ["workspace", "dayEntries", session.user.id, selectedProjectId],
    queryFn: () => fetchProjectDayEntries(session, selectedProjectId!),
    enabled: Boolean(selectedProjectId),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  useEffect(() => {
    if (dayEntriesQuery.isError) {
      notifyError(extractErrorMessage(dayEntriesQuery.error, "Failed to load daily updates."));
    }
  }, [dayEntriesQuery.isError, dayEntriesQuery.error, notifyError]);

  const changeOrdersQuery = useQuery({
    queryKey: ["workspace", "changeOrders", selectedProjectId],
    queryFn: () => fetchChangeOrders(selectedProjectId!),
    enabled: Boolean(selectedProjectId),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  useEffect(() => {
    if (changeOrdersQuery.isError) {
      notifyError(extractErrorMessage(changeOrdersQuery.error, "Failed to load change orders."));
    }
  }, [changeOrdersQuery.isError, changeOrdersQuery.error, notifyError]);

  const projectMembersQuery = useQuery({
    queryKey: ["workspace", "members", selectedProjectId],
    queryFn: () => fetchProjectMembers(selectedProjectId!),
    enabled: Boolean(selectedProjectId),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  useEffect(() => {
    if (projectMembersQuery.isError) {
      notifyError(extractErrorMessage(projectMembersQuery.error, "Failed to load project members."));
    }
  }, [projectMembersQuery.isError, projectMembersQuery.error, notifyError]);

  useEffect(() => {
    if (!accountUpdateSuccess) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    const timer = window.setTimeout(() => {
      setAccountUpdateSuccess(null);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [accountUpdateSuccess]);

  const projectDayEntries = useMemo(() => {
    const entries = new Map<string, DayEntry[]>();
    const cached = queryClient.getQueriesData<DayEntry[]>({
      queryKey: ["workspace", "dayEntries", session.user.id],
    });
    cached.forEach(([key, data]) => {
      if (!Array.isArray(key)) {
        return;
      }
      const projectKey = key[3];
      if (typeof projectKey === "string" && data) {
        entries.set(projectKey, data);
      }
    });
    return entries;
  }, [queryClient, dayEntriesQuery.data, session.user.id]);

  const changeOrders = changeOrdersQuery.data ?? [];
  const projectMembers = projectMembersQuery.data ?? [];

  const upcomingDueTasks = useMemo<TaskReminder[]>(() => {
    if (!selectedProjectId) {
      return [];
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + 7);

    return tasks
      .filter((task) => task.projectId === selectedProjectId && task.dueDate)
      .map<TaskReminder | null>((task) => {
        if (!task.dueDate) {
          return null;
        }
        const dueDate = parseISODate(task.dueDate);
        if (Number.isNaN(dueDate.getTime())) {
          return null;
        }
        if (dueDate < today || dueDate > horizon) {
          return null;
        }

        return {
          id: task.id,
          name: task.name || "Untitled task",
          dueDate: task.dueDate,
          status: task.status,
          daysUntilDue: Math.max(0, differenceInDays(today, dueDate)),
        };
      })
      .filter((reminder): reminder is TaskReminder => Boolean(reminder))
      .sort((a, b) =>
        a.daysUntilDue === b.daysUntilDue
          ? a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
          : a.daysUntilDue - b.daysUntilDue,
      )
      .slice(0, 5);
  }, [selectedProjectId, tasks]);

  const recentActivities = useMemo<DayActivity[]>(() => {
    if (!selectedProjectId) {
      return [];
    }

    const projectDays = projectDayEntries.get(selectedProjectId) ?? [];
    const activities: DayActivity[] = [];

    projectDays.forEach((day) => {
      const posts = day.posts ?? [];
      const attachmentIds = new Set<string>();
      posts.forEach((post) => {
        post.attachments.forEach((attachment) => attachmentIds.add(attachment.id));
      });

      posts.forEach((post) => {
        const trimmedMessage = post.message?.trim() ?? "";
        activities.push({
          id: post.id,
          type: "post",
          date: day.date,
          createdAt: post.createdAt,
          title: trimmedMessage || "Shared an update",
          details: trimmedMessage ? undefined : "Shared an update",
          attachments: post.attachments,
          authorName: post.authorName ?? null,
        });
      });

      day.files
        .filter((file) => !attachmentIds.has(file.id))
        .forEach((file) => {
          activities.push({
            id: file.id,
            type: "file",
            date: day.date,
            createdAt: file.addedAt,
            title: file.name,
            details: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
            attachments: [],
            authorName: file.uploadedByName ?? null,
          });
        });
    });

    return activities
      .filter((activity) => Boolean(activity.createdAt))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 15);
  }, [projectDayEntries, selectedProjectId]);

  const loading =
    projectsQuery.isPending ||
    (Boolean(selectedProjectId) &&
      (dayEntriesQuery.isPending || changeOrdersQuery.isPending || projectMembersQuery.isPending));

  const invalidateProjects = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["workspace", "projects", session.user.id] });
  }, [queryClient, session.user.id]);

  const invalidateDayEntries = useCallback(
    (projectId: string | null) => {
      if (!projectId) return;
      queryClient.invalidateQueries({
        queryKey: ["workspace", "dayEntries", session.user.id, projectId],
      });
    },
    [queryClient, session.user.id],
  );

  const invalidateChangeOrders = useCallback(
    (projectId: string | null) => {
      if (!projectId) return;
      queryClient.invalidateQueries({ queryKey: ["workspace", "changeOrders", projectId] });
    },
    [queryClient],
  );

  const invalidateMembers = useCallback(
    (projectId: string | null) => {
      if (!projectId) return;
      queryClient.invalidateQueries({ queryKey: ["workspace", "members", projectId] });
    },
    [queryClient],
  );

  const createProjectMutation = useMutation({
    mutationFn: async (input: ProjectFormValues) => {
      if (!session.user?.id) {
        throw new Error("You must be signed in to create a project.");
      }
      const project: Project = {
        id: createId("project"),
        createdAt: new Date().toISOString(),
        name: input.name.trim(),
        description: input.description,
        color: input.color,
        referenceId: input.referenceId.trim(),
        cost: input.cost,
        address: input.address,
        projectManager: input.projectManager.trim(),
        startDate: input.startDate,
        dueDate: input.dueDate,
        userId: session.user.id,
      };
      const { data, error } = await supabase
        .from("projects")
        .insert([mapProjectToInsertRow(project)])
        .select(
          "id, name, description, color, created_at, start_date, due_date, reference_id, cost, address, project_manager, user_id",
        );
      if (error) throw error;
      return mapProjectFromRow((data as ProjectRow[])[0]);
    },
    onSuccess: (project) => {
      notifySuccess("Project created.");
      setSelectedProjectId(project.id);
      invalidateProjects();
    },
    onError: (error) => {
      notifyError(extractErrorMessage(error, "Failed to create project."));
    },
  });

  const updateProjectMutation = useMutation({
    mutationFn: async ({ projectId, input }: { projectId: string; input: ProjectFormValues }) => {
      const { data, error } = await supabase
        .from("projects")
        .update(mapProjectUpdateToRow(input))
        .eq("id", projectId)
        .select(
          "id, name, description, color, created_at, start_date, due_date, reference_id, cost, address, project_manager, user_id",
        );
      if (error) throw error;
      return mapProjectFromRow((data as ProjectRow[])[0]);
    },
    onSuccess: () => {
      notifySuccess("Project updated.");
      invalidateProjects();
    },
    onError: (error) => {
      notifyError(extractErrorMessage(error, "Failed to update project."));
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const { error } = await supabase.from("projects").delete().eq("id", projectId);
      if (error) throw error;
      return projectId;
    },
    onSuccess: (projectId) => {
      notifySuccess("Project deleted.");
      invalidateProjects();
      invalidateDayEntries(projectId);
      invalidateChangeOrders(projectId);
      invalidateMembers(projectId);
    },
    onError: (error) => {
      notifyError(extractErrorMessage(error, "Failed to delete project."));
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async (input: {
      projectId: string;
      name: string;
      description: string;
      startDate: string;
      dueDate: string;
      status: string;
      dependencies: string[];
    }) => {
      const task: Task = {
        id: createId("task"),
        projectId: input.projectId,
        name: input.name,
        description: input.description,
        startDate: input.startDate,
        dueDate: input.dueDate,
        status: input.status as Task["status"],
        dependencies: input.dependencies,
      };
      const { error } = await supabase.from("tasks").insert([mapTaskToInsertRow(task)]);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateProjects();
    },
    onError: (error) => {
      notifyError(extractErrorMessage(error, "Failed to create task."));
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, input }: { taskId: string; input: Partial<Task> }) => {
      const { error } = await supabase
        .from("tasks")
        .update(mapTaskUpdateToRow(input))
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateProjects();
    },
    onError: (error) => {
      notifyError(extractErrorMessage(error, "Failed to update task."));
    },
  });

  const createPostMutation = useMutation({
    mutationFn: async ({
      projectId,
      message,
      file,
    }: {
      projectId: string;
      message: string;
      file?: File | null;
    }) => {
      const trimmedMessage = message.trim();
      if (!trimmedMessage && !file) {
        return;
      }
      const todayIso = toISODate(new Date());
      const { data: insertedNote, error: noteError } = await supabase
        .from("notes")
        .insert({
          project_id: projectId,
          note_date: todayIso,
          body: trimmedMessage || "",
          user_id: session.user.id ?? null,
        })
        .select("id")
        .single();
      if (noteError) throw noteError;
      if (file) {
        await uploadDayFile(session, projectId, todayIso, file, { noteId: insertedNote?.id });
      }
    },
    onSuccess: (_, variables) => {
      invalidateDayEntries(variables.projectId);
    },
    onError: (error) => {
      notifyError(extractErrorMessage(error, "Failed to share update."));
    },
  });

  const updatePostMutation = useMutation({
    mutationFn: async ({ projectId, postId, message }: { projectId: string; postId: string; message: string }) => {
      const trimmed = message.trim();
      const { error } = await supabase
        .from("notes")
        .update({ body: trimmed })
        .eq("id", postId)
        .eq("project_id", projectId);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      invalidateDayEntries(variables.projectId);
    },
    onError: (error) => {
      notifyError(extractErrorMessage(error, "Failed to update post."));
    },
  });

  const deletePostMutation = useMutation({
    mutationFn: async ({
      projectId,
      postId,
      attachments,
    }: {
      projectId: string;
      postId: string;
      attachments: DayFile[];
    }) => {
      const attachmentIds = attachments.map((attachment) => attachment.id);
      if (attachmentIds.length > 0) {
        const bucketMap = new Map<string, string[]>();
        attachments.forEach((attachment) => {
          const storagePath = attachment.storagePath;
          if (!storagePath) {
            return;
          }
          const bucketId = resolveBucketId(attachment.bucketId);
          if (!bucketMap.has(bucketId)) {
            bucketMap.set(bucketId, []);
          }
          bucketMap.get(bucketId)!.push(storagePath);
        });

        for (const [bucketId, paths] of bucketMap) {
          if (paths.length === 0) continue;
          const { error: storageError } = await supabase.storage.from(bucketId).remove(paths);
          if (storageError) {
            throw storageError;
          }
        }

        const { error: attachmentsError } = await supabase
          .from("day_files")
          .delete()
          .in("id", attachmentIds);

        if (attachmentsError) {
          throw attachmentsError;
        }
      }

      const { error: deleteError } = await supabase
        .from("notes")
        .delete()
        .eq("id", postId)
        .eq("project_id", projectId);

      if (deleteError) {
        throw deleteError;
      }
    },
    onSuccess: (_, variables) => {
      invalidateDayEntries(variables.projectId);
    },
    onError: (error) => {
      notifyError(extractErrorMessage(error, "Failed to delete post."));
    },
  });

  const addFileMutation = useMutation({
    mutationFn: async ({ projectId, date, file, options }: { projectId: string; date: string; file: File; options?: { noteId?: string | null } }) => {
      await uploadDayFile(session, projectId, date, file, options);
    },
    onSuccess: (_, variables) => {
      invalidateDayEntries(variables.projectId);
    },
    onError: (error) => {
      notifyError(extractErrorMessage(error, "Failed to upload file."));
    },
  });

  const removeFileMutation = useMutation({
    mutationFn: async ({ projectId, fileId }: { projectId: string; fileId: string }) => {
      const dayEntries = await fetchProjectDayEntries(session, projectId);
      let bucketId = DAILY_UPLOADS_BUCKET;
      let storagePath: string | undefined;

      outer: for (const entry of dayEntries) {
        const directFile = entry.files.find((file) => file.id === fileId);
        if (directFile) {
          bucketId = resolveBucketId(directFile.bucketId);
          storagePath = directFile.storagePath;
          break outer;
        }
        for (const post of entry.posts) {
          const attachment = post.attachments.find((file) => file.id === fileId);
          if (attachment) {
            bucketId = resolveBucketId(attachment.bucketId);
            storagePath = attachment.storagePath;
            break outer;
          }
        }
      }

      if (storagePath) {
        await supabase.storage.from(bucketId).remove([storagePath]);
      }
      const { error } = await supabase.from("day_files").delete().eq("id", fileId);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      invalidateDayEntries(variables.projectId);
    },
    onError: (error) => {
      notifyError(extractErrorMessage(error, "Failed to remove file."));
    },
  });

  const createChangeOrderMutation = useMutation({
    mutationFn: async ({
      projectId,
      input,
    }: {
      projectId: string;
      input: {
        subject: string;
        description: string;
        recipientName: string;
        recipientEmail: string;
        lineItems: ChangeOrderLineItem[];
        recipients: Array<{ email: string; name?: string | null }>;
      };
    }) => {
      const nowIso = new Date().toISOString();
      const { data, error: insertError } = await supabase
        .from("change_orders")
        .insert([
          {
            id: createId("change"),
            project_id: projectId,
            subject: input.subject.trim(),
            body: input.description.trim(),
            recipient_name: input.recipientName.trim() || null,
            recipient_email: input.recipientEmail.trim(),
            status: "pending",
            sent_at: nowIso,
            updated_at: nowIso,
            response_at: null,
            response_message: null,
            created_by: session.user.id ?? null,
            created_by_name: session.user.user_metadata?.full_name ?? session.user.email ?? null,
            responded_by: null,
            responded_by_name: null,
            line_items: JSON.stringify(input.lineItems ?? []),
          },
        ])
        .select(
          "id, project_id, subject, body, recipient_name, recipient_email, status, sent_at, updated_at, response_at, response_message, created_by, created_by_name, responded_by, responded_by_name, created_at, line_items",
        )
        .single();

      if (insertError) throw insertError;

      const inserted = data as ChangeOrderRow;

      const recipientRows = (input.recipients ?? [])
        .map((recipient) => {
          const email = recipient.email?.trim().toLowerCase();
          if (!email) {
            return null;
          }
          return {
            change_order_id: inserted.id,
            email,
            name: recipient.name?.trim() || null,
          };
        })
        .filter(Boolean) as Array<{ change_order_id: string; email: string; name: string | null }>;

      if (recipientRows.length > 0) {
        const { error: recipientsError } = await supabase
          .from("change_order_recipients")
          .insert(recipientRows);
        if (recipientsError) {
          throw recipientsError;
        }
      }

      await notifyChangeOrder({ changeOrderId: inserted.id, event: "created" });
      return projectId;
    },
    onSuccess: (projectId) => {
      notifySuccess("Change order sent.");
      invalidateChangeOrders(projectId);
    },
    onError: (error) => {
      notifyError(extractErrorMessage(error, "Failed to create change order."));
    },
  });

  const deleteChangeOrderMutation = useMutation({
    mutationFn: async ({ projectId, orderId }: { projectId: string; orderId: string }) => {
      const { error: deleteError } = await supabase
        .from("change_orders")
        .delete()
        .eq("id", orderId);

      if (deleteError) throw deleteError;

      return projectId;
    },
    onSuccess: (projectId) => {
      notifySuccess("Change order deleted.");
      invalidateChangeOrders(projectId);
    },
    onError: (error) => {
      notifyError(extractErrorMessage(error, "Failed to delete change order."));
    },
  });

  const changeOrderStatusMutation = useMutation({
    mutationFn: async ({
      projectId,
      orderId,
      status,
      responseMessage,
    }: {
      projectId: string;
      orderId: string;
      status: ChangeOrderStatus;
      responseMessage?: string | null;
    }) => {
      const nowIso = new Date().toISOString();
      const payload: Record<string, string | null> = {
        status,
        updated_at: nowIso,
        response_message: responseMessage ?? null,
        response_at: status === "pending" ? null : nowIso,
        responded_by: status === "pending" ? null : session.user.id ?? null,
        responded_by_name:
          status === "pending"
            ? null
            : session.user.user_metadata?.full_name ?? session.user.email ?? null,
      };

      const { data, error: updateError } = await supabase
        .from("change_orders")
        .update(payload)
        .eq("id", orderId)
        .select(
          "id, project_id, subject, body, recipient_name, recipient_email, status, sent_at, updated_at, response_at, response_message, created_by, created_by_name, responded_by, responded_by_name, created_at, line_items",
        )
        .single();

      if (updateError) throw updateError;

      const updated = mapChangeOrderFromRow(data as ChangeOrderRow);
      if (status !== "pending") {
        await notifyChangeOrder({ changeOrderId: updated.id, event: "status", status });
      }

      return { projectId, status };
    },
    onSuccess: ({ projectId, status }) => {
      const statusMessage =
        status === "approved"
          ? "Change order approved."
          : status === "approved_with_conditions"
          ? "Change order approved with conditions."
          : status === "denied"
          ? "Change order denied."
          : status === "needs_info"
          ? "Requested more information for change order."
          : "Change order updated.";
      notifySuccess(statusMessage);
      invalidateChangeOrders(projectId);
    },
    onError: (error) => {
      notifyError(extractErrorMessage(error, "Failed to update change order status."));
    },
  });

  const inviteMemberMutation = useMutation({
    mutationFn: async ({
      projectId,
      email,
      role,
      name,
    }: {
      projectId: string;
      email: string;
      role: MemberRole;
      name: string;
    }): Promise<InviteMemberResult | undefined> => {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail) {
        throw new Error("A valid email address is required.");
      }

      const existingMember = projectMembers.find(
        (member) =>
          member.projectId === projectId && member.email.toLowerCase() === normalizedEmail,
      );

      const displayName = name.trim();

      if (existingMember) {
        if (existingMember.status !== "pending") {
          throw new Error("That email address is already associated with this project.");
        }

        const { data, error: updateError } = await supabase
          .from("project_members")
          .update({
            role,
            invited_at: new Date().toISOString(),
            invited_by: session.user.id ?? null,
            full_name: displayName || existingMember.fullName || null,
          })
          .eq("id", existingMember.id)
          .select(
            "id, project_id, user_id, email, role, status, invited_by, invited_at, accepted_at, full_name",
          )
          .single();

        if (updateError) throw updateError;

        const updated = mapMemberFromRow(data as ProjectMemberRow);
        try {
          await supabase.functions.invoke("send-project-invite-email", {
            body: { memberId: updated.id },
          });
        } catch (notificationError) {
          console.error("Error resending project invite notification:", notificationError);
        }

        return { member: updated, emailWarning: "Invite resent to pending member." };
      }

      const { data, error: insertError } = await supabase
        .from("project_members")
        .insert([
          {
            project_id: projectId,
            email: normalizedEmail,
            role,
            status: "pending",
            invited_by: session.user.id ?? null,
            invited_at: new Date().toISOString(),
            full_name: displayName || null,
          },
        ])
        .select(
          "id, project_id, user_id, email, role, status, invited_by, invited_at, accepted_at, full_name",
        )
        .single();

      if (insertError) throw insertError;

      const inserted = mapMemberFromRow(data as ProjectMemberRow);
      try {
        await supabase.functions.invoke("send-project-invite-email", {
          body: { memberId: inserted.id },
        });
      } catch (notificationError) {
        console.error("Error sending project invite notification:", notificationError);
      }

      return { member: inserted };
    },
    onSuccess: (_, variables) => {
      invalidateMembers(variables.projectId);
    },
    onError: (error) => {
      notifyError(extractErrorMessage(error, "Failed to invite project member."));
    },
  });

  const updateMemberRoleMutation = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: MemberRole }) => {
      const { error: updateError } = await supabase
        .from("project_members")
        .update({ role })
        .eq("id", memberId);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      invalidateMembers(selectedProjectId);
    },
    onError: (error) => {
      notifyError(extractErrorMessage(error, "Failed to update member role."));
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async ({ projectId, memberId }: { projectId: string; memberId: string }) => {
      const { error: deleteError } = await supabase
        .from("project_members")
        .delete()
        .eq("id", memberId);

      if (deleteError) throw deleteError;

      return projectId;
    },
    onSuccess: (projectId) => {
      invalidateMembers(projectId);
    },
    onError: (error) => {
      notifyError(extractErrorMessage(error, "Failed to remove member."));
    },
  });

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error && !error.message?.includes("Auth session missing")) {
        throw error;
      }
      onSessionChange(null);
      setSelectedProjectId(null);
      await queryClient.invalidateQueries();
    } catch (error) {
      notifyError(extractErrorMessage(error, "Failed to sign out."));
    }
  };

  const handleUpdateAccount = async ({ fullName }: { fullName: string }) => {
    if (!session.user) {
      return;
    }
    const trimmed = fullName.trim();
    if (!trimmed) {
      setAccountUpdateError(null);
      setAccountUpdateSuccess(null);
      return;
    }
    const currentName = session.user.user_metadata?.full_name ?? "";
    if (currentName === trimmed) {
      setAccountUpdateError(null);
      setAccountUpdateSuccess("You're already using this name.");
      return;
    }

    setIsUpdatingAccount(true);
    setAccountUpdateError(null);
    setAccountUpdateSuccess(null);

    try {
      const { data, error } = await supabase.auth.updateUser({
        data: { full_name: trimmed },
      });
      if (error) {
        throw error;
      }
      if (data?.user) {
        onSessionChange({ ...session, user: data.user });
      }
      setAccountUpdateSuccess("Profile updated.");
      notifySuccess("Profile updated.");
    } catch (error) {
      setAccountUpdateError(extractErrorMessage(error, "Failed to update profile."));
    } finally {
      setIsUpdatingAccount(false);
    }
  };

  const clearAccountFeedback = useCallback(() => {
    setAccountUpdateError(null);
    setAccountUpdateSuccess(null);
  }, []);

  return {
    loading,
    fatalError,
    projects,
    tasks,
    changeOrders,
    projectMembers,
    projectDayEntries,
    selectedProjectId,
    setSelectedProjectId,
    recentActivities,
    upcomingDueTasks,
    accountUpdateError,
    accountUpdateSuccess,
    isUpdatingAccount,
    handleCreateProject: async (input) => {
      await createProjectMutation.mutateAsync(input);
    },
    handleUpdateProject: async (projectId, input) => {
      await updateProjectMutation.mutateAsync({ projectId, input });
    },
    handleDeleteProject: async (projectId) => {
      await deleteProjectMutation.mutateAsync(projectId);
    },
    handleInviteMember: async (input) => {
      return inviteMemberMutation.mutateAsync(input);
    },
    handleUpdateMemberRole: async (memberId, role) => {
      await updateMemberRoleMutation.mutateAsync({ memberId, role });
    },
    handleRemoveMember: async (memberId) => {
      if (!selectedProjectId) {
        throw new Error("No project selected");
      }
      const memberToRemove = projectMembers.find((m) => m.id === memberId);
      if (memberToRemove?.role === "owner") {
        const owners = projectMembers.filter((m) => m.role === "owner");
        if (owners.length <= 1) {
          throw new Error("Cannot remove the last owner of a project.");
        }
      }
      await removeMemberMutation.mutateAsync({ projectId: selectedProjectId, memberId });
    },
    handleSignOut,
    handleCreateTask: async (input) => {
      await createTaskMutation.mutateAsync(input);
    },
    handleUpdateTask: async (taskId, input) => {
      await updateTaskMutation.mutateAsync({ taskId, input });
    },
    handleAddFile: async (date, file, options) => {
      if (!selectedProjectId) {
        throw new Error("No project selected");
      }
      await addFileMutation.mutateAsync({ projectId: selectedProjectId, date, file, options });
    },
    handleRemoveFile: async (_date, fileId) => {
      if (!selectedProjectId) {
        throw new Error("No project selected");
      }
      await removeFileMutation.mutateAsync({ projectId: selectedProjectId, fileId });
    },
    handleCreatePost: async (input) => {
      if (!selectedProjectId) {
        throw new Error("No project selected");
      }
      await createPostMutation.mutateAsync({ projectId: selectedProjectId, ...input });
    },
    handleUpdatePost: async (postId, message) => {
      if (!selectedProjectId) {
        throw new Error("No project selected");
      }
      await updatePostMutation.mutateAsync({ projectId: selectedProjectId, postId, message });
    },
    handleDeletePost: async (postId, attachments) => {
      if (!selectedProjectId) {
        throw new Error("No project selected");
      }
      await deletePostMutation.mutateAsync({ projectId: selectedProjectId, postId, attachments });
    },
    handleCreateChangeOrder: async (input) => {
      if (!selectedProjectId) {
        throw new Error("No project selected");
      }
      await createChangeOrderMutation.mutateAsync({ projectId: selectedProjectId, input });
    },
    handleDeleteChangeOrder: async (orderId) => {
      if (!selectedProjectId) {
        throw new Error("No project selected");
      }
      await deleteChangeOrderMutation.mutateAsync({ projectId: selectedProjectId, orderId });
    },
    handleChangeOrderStatus: async (orderId, status, options) => {
      if (!selectedProjectId) {
        throw new Error("No project selected");
      }
      await changeOrderStatusMutation.mutateAsync({
        projectId: selectedProjectId,
        orderId,
        status,
        responseMessage: options?.responseMessage ?? null,
      });
    },
    handleUpdateAccount,
    clearAccountFeedback,
  };
};
