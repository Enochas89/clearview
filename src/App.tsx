import { useCallback, useEffect, useMemo, useState } from "react";
import CalendarView from "./components/CalendarView";
import ChangeOrders from "./components/ChangeOrders";
import GanttChart from "./components/GanttChart";
import Sidebar from "./components/Sidebar";
import {
  ChangeOrder,
  ChangeOrderLineItem,
  ChangeOrderRecipient,
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
} from "./types";
import "./App.css";
import { supabase } from "./supabaseClient";
import Auth from "./Auth";
import { Session } from "@supabase/supabase-js";

const DAY_MS = 86_400_000;
const DAILY_UPLOADS_BUCKET = "daily-uploads";

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
  change_order_recipients?: any[];
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

const mapProjectUpdateToRow = (input: Omit<Project, "id" | "createdAt">) => ({
  name: input.name,
  description: input.description,
  color: input.color,
  start_date: input.startDate,
  due_date: input.dueDate,
  reference_id: input.referenceId,
  cost: input.cost,
  address: input.address,
  project_manager: input.projectManager,
  user_id: input.userId,
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
  sentAt: row.sent_at ?? row.created_at ?? "",
  updatedAt: row.updated_at ?? row.sent_at ?? row.created_at ?? "",
  responseAt: row.response_at ?? null,
  responseMessage: row.response_message ?? null,
  createdBy: row.created_by ?? null,
  createdByName: row.created_by_name ?? null,
  respondedBy: row.responded_by ?? null,
  respondedByName: row.responded_by_name ?? null,
  lineItems: Array.isArray(row.line_items)
    ? (row.line_items as any[]).map((item) => ({
        id: typeof item?.id === "string" ? item.id : createId("item"),
        title: typeof item?.title === "string" ? item.title : "",
        description: typeof item?.description === "string" ? item.description : "",
        impactDays: Number.isFinite(item?.impactDays) ? Number(item.impactDays) : 0,
        cost: Number.isFinite(item?.cost) ? Number(item.cost) : 0,
      }))
    : [],
  recipients: Array.isArray(row.change_order_recipients)
    ? row.change_order_recipients.map((recipient: any) => ({
        id: recipient.id,
        changeOrderId: recipient.change_order_id ?? row.id,
        email: recipient.email ?? "",
        name: recipient.name ?? null,
        status: normalizeRecipientStatus(recipient.status),
        conditionNote: recipient.condition_note ?? null,
        respondedAt: recipient.responded_at ?? null,
      }))
    : [],
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

const parseISODate = (value: string) => new Date(`${value}T00:00:00`);

const differenceInDays = (start: Date, end: Date) => Math.round((end.getTime() - start.getTime()) / DAY_MS);

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

type TaskReminder = {
  id: string;
  name: string;
  dueDate: string;
  status: Task["status"];
  daysUntilDue: number;
};

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projectDayEntries, setProjectDayEntries] = useState<Map<string, DayEntry[]>>(new Map());
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeMainTab, setActiveMainTab] = useState<"timeline" | "changeOrders">("timeline");

  const loadDayEntries = useCallback(
    async (projectId: string) => {
      try {
        setError(null);
        const [
          { data: noteRows, error: notesError },
          { data: fileRows, error: filesError },
          { data: memberRows, error: membersError },
        ] = await Promise.all([
          supabase
            .from("notes")
            .select("id, note_date, body, created_at, user_id")
            .eq("project_id", projectId)
            .order("note_date", { ascending: true }),
          supabase
            .from("day_files")
            .select(
              "id, note_date, bucket_id, storage_path, file_name, file_size, content_type, created_at, note_id, uploaded_by"
            )
            .eq("project_id", projectId)
            .order("note_date", { ascending: true }),
          supabase
            .from("project_members")
            .select("user_id, full_name, email")
            .eq("project_id", projectId),
        ]);

        if (notesError) throw notesError;
        if (filesError) throw filesError;

        if (membersError) {
          console.warn("Unable to load project members:", membersError.message);
        }

        const memberLookup = new Map<string, { name?: string | null; email?: string | null }>();
        const effectiveMembers = membersError ? [] : memberRows ?? [];
        effectiveMembers.forEach((member) => {
          if (member.user_id) {
            memberLookup.set(member.user_id, { name: member.full_name, email: member.email });
          }
        });
        if (session?.user) {
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

        (noteRows ?? []).forEach((note) => {
          const entry = ensureEntry(note.note_date);
          const authorRecord = note.user_id ? memberLookup.get(note.user_id) : undefined;
          const authorName =
            authorRecord?.name ||
            authorRecord?.email ||
            (note.user_id && note.user_id === session?.user?.id ? "You" : null);
          entry.posts.push({
            id: note.id,
            message: note.body ?? "",
            createdAt: note.created_at ?? "",
            authorName,
            attachments: [],
          });
        });

        const fileRowsSafe = fileRows ?? [];
        const bucketGroups = new Map<string, string[]>();
        fileRowsSafe.forEach((file) => {
          const bucketId = file.bucket_id ?? DAILY_UPLOADS_BUCKET;
          if (!bucketGroups.has(bucketId)) {
            bucketGroups.set(bucketId, []);
          }
          bucketGroups.get(bucketId)!.push(file.storage_path);
        });

        const signedUrlMap = new Map<string, string>();
        for (const [bucketId, paths] of Array.from(bucketGroups.entries())) {
          if (paths.length === 0) continue;
          const { data, error: signedUrlError } = await supabase.storage.from(bucketId).createSignedUrls(paths, 60 * 60);
          if (signedUrlError) {
            console.error("Error creating signed URLs:", signedUrlError);
            continue;
          }
          if (Array.isArray(data)) {
            data.forEach((item) => {
              const path = item?.path ?? null;
              const signedUrl = item?.signedUrl ?? null;
              if (path && signedUrl) {
                signedUrlMap.set(path, signedUrl);
              }
            });
          }
        }

        fileRowsSafe.forEach((file) => {
          const entry = ensureEntry(file.note_date);
          const fileRecord: DayFile = {
            id: file.id,
            name: file.file_name,
            size: Number(file.file_size ?? 0),
            type: file.content_type ?? "",
            addedAt: file.created_at ?? "",
            url: signedUrlMap.get(file.storage_path) ?? "",
            storagePath: file.storage_path,
            bucketId: file.bucket_id ?? DAILY_UPLOADS_BUCKET,
            noteId: file.note_id ?? null,
            uploadedBy: file.uploaded_by ?? null,
            uploadedByName:
              (file.uploaded_by ? memberLookup.get(file.uploaded_by)?.name : undefined) ||
              (file.uploaded_by ? memberLookup.get(file.uploaded_by)?.email : undefined) ||
              null,
          };
          if (!fileRecord.uploadedByName && file.uploaded_by === session?.user?.id) {
            fileRecord.uploadedByName = "You";
          }

          if (fileRecord.noteId) {
            const post = entry.posts.find((item) => item.id === fileRecord.noteId);
            if (post) {
              if (!fileRecord.uploadedByName && post.authorName) {
                fileRecord.uploadedByName = post.authorName;
              }
              post.attachments.push(fileRecord);
              return;
            }
          }

          entry.files.push(fileRecord);
        });

        entriesByDate.forEach((entry) => {
          entry.posts.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
          entry.posts.forEach((post) => {
            post.attachments.sort((a, b) => (a.addedAt > b.addedAt ? -1 : 1));
          });
          entry.files.sort((a, b) => (a.addedAt > b.addedAt ? -1 : 1));
        });

        const orderedEntries = Array.from(entriesByDate.entries())
          .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
          .map(([, entry]) => entry);

        setProjectDayEntries((prev) => {
          const next = new Map(prev);
          next.set(projectId, orderedEntries);
          return next;
        });
      } catch (err: any) {
        console.error("Error loading daily updates:", err);
        setError(err.message ?? "Failed to load daily updates.");
      }
    },
    [session, setProjectDayEntries, setError]
  );

const loadChangeOrders = useCallback(
  async (projectId: string) => {
    try {
      const { data, error: changeOrdersError } = await supabase
        .from("change_orders")
        .select(
          "id, project_id, subject, body, recipient_name, recipient_email, status, sent_at, updated_at, response_at, response_message, created_by, created_by_name, responded_by, responded_by_name, created_at, line_items, change_order_recipients(id, change_order_id, email, name, status, condition_note, responded_at)"
        )
        .eq("project_id", projectId)
        .order("sent_at", { ascending: false });

      if (changeOrdersError) throw changeOrdersError;

      const mapped = (data ?? []).map((row) => mapChangeOrderFromRow(row as ChangeOrderRow));
      setChangeOrders((prev) => {
        if (selectedProjectId && selectedProjectId !== projectId) {
          return prev;
        }
        return mapped;
      });
    } catch (err: any) {
      console.error("Error loading change orders:", err);
      setError((prev) => prev ?? err.message ?? "Failed to load change orders.");
    }
  },
  [selectedProjectId]
);

const loadProjectMembers = useCallback(
  async (projectId: string) => {
    try {
      const { data, error: membersError } = await supabase
        .from("project_members")
        .select(
          "id, project_id, user_id, email, role, status, invited_by, invited_at, accepted_at, full_name"
        )
        .eq("project_id", projectId)
        .order("invited_at", { ascending: true });

      if (membersError) throw membersError;

      const mapped = (data ?? []).map((row) => mapMemberFromRow(row as ProjectMemberRow));
      setProjectMembers((prev) => {
        if (selectedProjectId && selectedProjectId !== projectId) {
          return prev;
        }
        return mapped;
      });
    } catch (err: any) {
      console.error("Error loading project members:", err);
      setError((prev) => prev ?? err.message ?? "Failed to load project members.");
    }
  },
  [selectedProjectId]
);

const notifyChangeOrder = useCallback(
  async (input: { changeOrderId: string; event: "created" | "status"; status?: ChangeOrderStatus }) => {
    try {
      await supabase.functions.invoke("send-change-order-email", {
        body: input,
      });
    } catch (notificationError) {
      console.error("Error sending change order notification:", notificationError);
    }
  },
  []
);

  const uploadDayFile = useCallback(
    async (noteDate: string, file: File, options?: { noteId?: string | null }) => {
      if (!selectedProjectId) {
        throw new Error("No project selected");
      }

      const projectId = selectedProjectId;
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
      const sessionUserId = session?.user?.id ?? sessionData.session?.user?.id ?? null;
      if (!sessionUserId) {
        await supabase.storage.from(DAILY_UPLOADS_BUCKET).remove([fileKey]);
        throw new Error("You must be signed in to upload files.");
      }

      const { data: insertedFiles, error: insertError } = await supabase
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
        ])
        .select("id");

      if (insertError) {
        await supabase.storage.from(DAILY_UPLOADS_BUCKET).remove([fileKey]);
        throw insertError;
      }

      return insertedFiles?.[0] ?? null;
    },
    [selectedProjectId, session?.user?.id]
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        setSession(session);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setProjects([]);
      setTasks([]);
      setSelectedProjectId(null);
      setProjectDayEntries(new Map());
      setChangeOrders([]);
      setProjectMembers([]);
      setActiveMainTab("timeline");
      setLoading(false); // Important: set loading to false if no session
      return;
    }

    const fetchProjectsAndTasks = async () => {
      setError(null);
      try {
        const { data: projectsData, error: projectsError } = await supabase
          .from('projects')
          .select(
            "id, name, description, color, created_at, start_date, due_date, reference_id, cost, address, project_manager, user_id"
          )
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: true });

        if (projectsError) throw projectsError;

        const mappedProjects = (projectsData ?? []).map((project) =>
          mapProjectFromRow(project as ProjectRow),
        );

        let mappedTasks: Task[] = [];
        if (mappedProjects.length > 0) {
          const projectIds = mappedProjects.map((project) => project.id);
          const { data: tasksData, error: tasksError } = await supabase
            .from('tasks')
            .select(
              "id, project_id, name, description, start_date, due_date, status, dependencies"
            )
            .in('project_id', projectIds);

          if (tasksError) throw tasksError;

          mappedTasks = (tasksData ?? []).map((task) =>
            mapTaskFromRow(task as TaskRow),
          );
        }

        setProjects(mappedProjects);
        setTasks(mappedTasks);
        if (mappedProjects.length > 0) {
          setSelectedProjectId((prev) => {
            if (prev && mappedProjects.some((project) => project.id === prev)) {
              return prev;
            }
            return mappedProjects[0].id;
          });
        } else {
          setSelectedProjectId(null); // No projects, so no selected project
        }
      } catch (err: any) {
        console.error("Error fetching data:", err);
        setError(err.message || "Failed to fetch data.");
      } finally {
        setLoading(false);
      }
    };

    fetchProjectsAndTasks();
  }, [session]);

  useEffect(() => {
    if (selectedProjectId) {
      loadDayEntries(selectedProjectId);
      loadChangeOrders(selectedProjectId);
      loadProjectMembers(selectedProjectId);
    } else {
      setChangeOrders([]);
      setProjectMembers([]);
    }
  }, [selectedProjectId, loadDayEntries, loadChangeOrders, loadProjectMembers]);

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setSession(null);
      setProjects([]);
      setTasks([]);
      setSelectedProjectId(null);
    } catch (err: any) {
      console.error("Error signing out:", err);
      setError(err.message || "Failed to sign out.");
    }
  };

  const visibleTasks = useMemo(() => {
    if (!selectedProjectId) {
      return tasks;
    }
    return tasks.filter((task) => task.projectId === selectedProjectId);
  }, [selectedProjectId, tasks]);

  const activeProject = useMemo(
    () =>
      selectedProjectId
        ? projects.find((project) => project.id === selectedProjectId) ?? null
        : null,
    [selectedProjectId, projects],
  );

  const visibleDays = useMemo(() => {
    if (!selectedProjectId) {
      return [];
    }

    const selectedProject = activeProject;
    const projectTasks = tasks.filter((task) => task.projectId === selectedProjectId);
    const projectDays = projectDayEntries.get(selectedProjectId) ?? [];

    let timelineStart: Date | null = null;
    let timelineEnd: Date | null = null;

    const considerDate = (value?: string | null) => {
      if (!value) {
        return;
      }
      const parsed = parseISODate(value);
      if (Number.isNaN(parsed.getTime())) {
        return;
      }
      if (!timelineStart || parsed < timelineStart) {
        timelineStart = parsed;
      }
      if (!timelineEnd || parsed > timelineEnd) {
        timelineEnd = parsed;
      }
    };

    considerDate(selectedProject?.startDate);
    considerDate(selectedProject?.dueDate);

    projectTasks.forEach((task) => {
      considerDate(task.startDate);
      considerDate(task.dueDate);
    });

    projectDays.forEach((day) => considerDate(day.date));

    if (!timelineStart || !timelineEnd) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      timelineStart = today;
      timelineEnd = today;
    }

    let ensuredStart = timelineStart as Date;
    let ensuredEnd = timelineEnd as Date;

    if (ensuredStart > ensuredEnd) {
      const temp = ensuredStart;
      ensuredStart = ensuredEnd;
      ensuredEnd = temp;
    }

    const totalDays = Math.max(1, differenceInDays(ensuredStart, ensuredEnd) + 1);
    const dayLookup = new Map(projectDays.map((day) => [day.date, day]));

    return Array.from({ length: totalDays }, (_, index) => {
      const date = new Date(ensuredStart);
      date.setDate(ensuredStart.getDate() + index);
      const isoDate = toISODate(date);
      const existingDay = dayLookup.get(isoDate);
      return {
        date: isoDate,
        files: existingDay?.files ?? [],
        posts: existingDay?.posts ?? [],
      };
    });
  }, [selectedProjectId, tasks, projectDayEntries, activeProject]);

  const upcomingTaskReminders = useMemo<TaskReminder[]>(() => {
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

  const membersForSelectedProject = useMemo(() => {
    if (!selectedProjectId) {
      return [];
    }
    return projectMembers.filter((member) => member.projectId === selectedProjectId);
  }, [projectMembers, selectedProjectId]);

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

      day.files.forEach((file) => {
        if (attachmentIds.has(file.id)) {
          return;
        }
        activities.push({
          id: file.id,
          type: "file",
          date: day.date,
          createdAt: file.addedAt,
          title: file.name,
          details: file.uploadedByName ? `Uploaded by ${file.uploadedByName}` : "File uploaded",
          authorName: file.uploadedByName ?? null,
          attachments: [file],
        });
      });

      posts.forEach((post) => {
        const trimmedMessage = post.message.trim();
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
    });

    return activities
      .filter((activity) => Boolean(activity.createdAt))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 15);
  }, [selectedProjectId, projectDayEntries]);

  const handleCreateProject = async (input: Omit<Project, "id" | "createdAt">) => {
    const project: Project = {
      id: createId("project"),
      createdAt: new Date().toISOString(),
      ...input,
      userId: input.userId ?? session?.user?.id ?? "",
    };
    try {
      const { data, error } = await supabase
        .from('projects')
        .insert([mapProjectToInsertRow(project)])
        .select(
          "id, name, description, color, created_at, start_date, due_date, reference_id, cost, address, project_manager, user_id"
        );
      if (error) throw error;
      const inserted = mapProjectFromRow((data as ProjectRow[])[0]);
      setProjects((prev) => [...prev, inserted]);
      setSelectedProjectId(inserted.id);
    } catch (err: any) {
      console.error("Error creating project:", err);
      setError(err.message || "Failed to create project.");
    }
  };

  const handleUpdateProject = async (projectId: string, input: Omit<Project, "id" | "createdAt">) => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .update(mapProjectUpdateToRow(input))
        .eq('id', projectId)
        .select(
          "id, name, description, color, created_at, start_date, due_date, reference_id, cost, address, project_manager, user_id"
        );
      if (error) throw error;
      const updated = mapProjectFromRow((data as ProjectRow[])[0]);
      setProjects((prev) =>
        prev.map((project) =>
          project.id === projectId
            ? updated
            : project,
        ),
      );
    } catch (err: any) {
      console.error("Error updating project:", err);
      setError(err.message || "Failed to update project.");
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId);
      if (error) throw error;

      setProjects((prev) => prev.filter((project) => project.id !== projectId));
      setTasks((prev) => prev.filter((task) => task.projectId !== projectId));
      setProjectDayEntries((prev) => {
        const newMap = new Map(prev);
        newMap.delete(projectId);
        return newMap;
      });
      if (selectedProjectId === projectId) {
        setSelectedProjectId(projects[0]?.id ?? null);
      }
    } catch (err: any) {
      console.error("Error deleting project:", err);
      setError(err.message || "Failed to delete project.");
    }
  };

  const handleCreateTask = async (input: {
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
    try {
      const { data, error } = await supabase
        .from('tasks')
        .insert([mapTaskToInsertRow(task)])
        .select(
          "id, project_id, name, description, start_date, due_date, status, dependencies"
        );
      if (error) throw error;
      const inserted = mapTaskFromRow((data as TaskRow[])[0]);
      setTasks((prev) => [...prev, inserted]);
    } catch (err: any) {
      console.error("Error creating task:", err);
      setError(err.message || "Failed to create task.");
    }
  };

  const handleUpdateTask = async (
    taskId: string,
    input: Partial<Task>,
  ) => {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .update(mapTaskUpdateToRow(input))
        .eq('id', taskId)
        .select(
          "id, project_id, name, description, start_date, due_date, status, dependencies"
        );
      if (error) throw error;
      const updated = mapTaskFromRow((data as TaskRow[])[0]);
      setTasks((prev) =>
        prev.map((task) =>
          task.id === taskId
            ? updated
            : task,
        ),
      );
    } catch (err: any) {
      console.error("Error updating task:", err);
      setError(err.message || "Failed to update task.");
    }
  };

  const handleAddFile = async (date: string, file: File) => {
    if (!selectedProjectId) return;
    try {
      setError(null);
      await uploadDayFile(date, file);
      await loadDayEntries(selectedProjectId);
    } catch (err: any) {
      console.error("Error uploading file:", err);
      setError(err.message || "Failed to upload file.");
    }
  };

  const handleRemoveFile = async (_date: string, fileId: string) => {
    if (!selectedProjectId) return;

    const projectDays = projectDayEntries.get(selectedProjectId) ?? [];
    let bucketId = DAILY_UPLOADS_BUCKET;
    let storagePath: string | undefined;

    outer: for (const entry of projectDays) {
      const directFile = entry.files.find((file) => file.id === fileId);
      if (directFile) {
        bucketId = directFile.bucketId ?? bucketId;
        storagePath = directFile.storagePath;
        break outer;
      }
      for (const post of entry.posts) {
        const attachment = post.attachments.find((file) => file.id === fileId);
        if (attachment) {
          bucketId = attachment.bucketId ?? bucketId;
          storagePath = attachment.storagePath;
          break outer;
        }
      }
    }

    try {
      setError(null);
      if (storagePath) {
        await supabase.storage.from(bucketId).remove([storagePath]);
      }
      const { error: deleteError } = await supabase.from("day_files").delete().eq("id", fileId);
      if (deleteError) {
        throw deleteError;
      }
      await loadDayEntries(selectedProjectId);
    } catch (err: any) {
      console.error("Error removing file:", err);
      setError(err.message || "Failed to remove file.");
    }
  };

  const handleCreatePost = async (input: { message: string; file?: File | null }) => {
    if (!selectedProjectId) {
      return;
    }

    const trimmedMessage = input.message.trim();
    const attachmentFile = input.file ?? null;

    if (!trimmedMessage && !attachmentFile) {
      return;
    }

    const todayIso = toISODate(new Date());

    try {
      setError(null);
      const { data: insertedNote, error: noteError } = await supabase
        .from("notes")
        .insert({
          project_id: selectedProjectId,
          note_date: todayIso,
          body: trimmedMessage || "",
          user_id: session?.user?.id ?? null,
        })
        .select("id")
        .single();

      if (noteError) {
        throw noteError;
      }

      if (attachmentFile) {
        await uploadDayFile(todayIso, attachmentFile, { noteId: insertedNote?.id });
      }

      await loadDayEntries(selectedProjectId);
    } catch (err: any) {
      console.error("Error creating update:", err);
      setError(err.message || "Failed to share update.");
    }
  };

  const handleUpdatePost = async (postId: string, message: string) => {
    if (!selectedProjectId) {
      return;
    }

    try {
      setError(null);
      const trimmed = message.trim();
      const { error: updateError } = await supabase
        .from("notes")
        .update({ body: trimmed })
        .eq("id", postId)
        .eq("project_id", selectedProjectId);

      if (updateError) {
        throw updateError;
      }

      await loadDayEntries(selectedProjectId);
    } catch (err: any) {
      console.error("Error updating post:", err);
      setError(err.message || "Failed to update post.");
      throw err;
    }
  };

  const handleDeletePost = async (postId: string, attachments: DayFile[]) => {
    if (!selectedProjectId) {
      return;
    }

    try {
      setError(null);

      const attachmentIds = attachments.map((attachment) => attachment.id);
      if (attachmentIds.length > 0) {
        const bucketMap = new Map<string, string[]>();
        attachments.forEach((attachment) => {
          const storagePath = attachment.storagePath;
          if (!storagePath) {
            return;
          }
          const bucketId = attachment.bucketId ?? DAILY_UPLOADS_BUCKET;
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
        .eq("project_id", selectedProjectId);

      if (deleteError) {
        throw deleteError;
      }

      await loadDayEntries(selectedProjectId);
    } catch (err: any) {
      console.error("Error deleting post:", err);
      setError(err.message || "Failed to delete post.");
      throw err;
    }
  };

  const handleCreateChangeOrder = async (input: {
    subject: string;
    description: string;
    recipientName: string;
    recipientEmail: string;
    lineItems: ChangeOrderLineItem[];
    recipients: Array<{ email: string; name?: string | null }>;
  }) => {
    if (!selectedProjectId) {
      throw new Error("No project selected");
    }

    try {
      setError(null);
      const nowIso = new Date().toISOString();
      const { data, error: insertError } = await supabase
        .from("change_orders")
        .insert([
          {
            id: createId("change"),
            project_id: selectedProjectId,
            subject: input.subject.trim(),
            body: input.description.trim(),
            recipient_name: input.recipientName.trim() || null,
            recipient_email: input.recipientEmail.trim(),
            status: "pending",
            sent_at: nowIso,
            updated_at: nowIso,
            response_at: null,
            response_message: null,
            created_by: session?.user?.id ?? null,
            created_by_name: session?.user?.user_metadata?.full_name ?? session?.user?.email ?? null,
            responded_by: null,
            responded_by_name: null,
            line_items: JSON.stringify(input.lineItems ?? []),
          },
        ])
        .select(
          "id, project_id, subject, body, recipient_name, recipient_email, status, sent_at, updated_at, response_at, response_message, created_by, created_by_name, responded_by, responded_by_name, created_at, line_items"
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

      if (selectedProjectId) {
        await loadChangeOrders(selectedProjectId);
      }
    } catch (err: any) {
      console.error("Error creating change order:", err);
      setError(err.message || "Failed to create change order.");
      throw err;
    }
  };

  const handleDeleteChangeOrder = async (orderId: string) => {
    try {
      setError(null);
      const { error: deleteError } = await supabase
        .from("change_orders")
        .delete()
        .eq("id", orderId);

      if (deleteError) throw deleteError;

      setChangeOrders((prev) => prev.filter((order) => order.id !== orderId));
    } catch (err: any) {
      console.error("Error deleting change order:", err);
      setError(err.message || "Failed to delete change order.");
      throw err;
    }
  };

  const handleChangeOrderStatus = async (
    orderId: string,
    status: ChangeOrderStatus,
    options?: { responseMessage?: string | null }
  ) => {
    try {
      setError(null);
      const nowIso = new Date().toISOString();
      const responseMessage = options?.responseMessage ?? null;
      const payload: Record<string, string | null> = {
        status,
        updated_at: nowIso,
        response_message: responseMessage,
        response_at: status === "pending" ? null : nowIso,
        responded_by: status === "pending" ? null : session?.user?.id ?? null,
        responded_by_name:
          status === "pending"
            ? null
            : session?.user?.user_metadata?.full_name ?? session?.user?.email ?? null,
      };

      const { data, error: updateError } = await supabase
        .from("change_orders")
        .update(payload)
        .eq("id", orderId)
        .select(
          "id, project_id, subject, body, recipient_name, recipient_email, status, sent_at, updated_at, response_at, response_message, created_by, created_by_name, responded_by, responded_by_name, created_at, line_items"
        )
        .single();

      if (updateError) throw updateError;

      const updated = mapChangeOrderFromRow(data as ChangeOrderRow);
      setChangeOrders((prev) =>
        prev.map((order) => (order.id === orderId ? updated : order)),
      );
      if (status !== "pending") {
        await notifyChangeOrder({ changeOrderId: updated.id, event: "status", status });
      }
      if (selectedProjectId) {
        await loadChangeOrders(selectedProjectId);
      }
    } catch (err: any) {
      console.error("Error updating change order status:", err);
      setError(err.message || "Failed to update change order status.");
      throw err;
    }
  };

  const handleInviteMember = async (input: {
    projectId: string;
    email: string;
    role: MemberRole;
    name: string;
  }): Promise<InviteMemberResult | undefined> => {
    if (!session) {
      setError("You must be signed in to invite a member.");
      return undefined;
    }

    const normalizedEmail = input.email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("A valid email address is required.");
      return undefined;
    }

    if (
      projectMembers.some(
        (member) =>
          member.projectId === input.projectId &&
          member.email.toLowerCase() === normalizedEmail
      )
    ) {
      setError("That email address is already associated with this project.");
      return undefined;
    }

    const displayName = input.name.trim();

    try {
      setError(null);
      const { data, error: insertError } = await supabase
        .from("project_members")
        .insert([
          {
            project_id: input.projectId,
            email: normalizedEmail,
            role: input.role,
            status: "pending",
            invited_by: session.user.id ?? null,
            invited_at: new Date().toISOString(),
            full_name: displayName || null,
          },
        ])
        .select(
          "id, project_id, user_id, email, role, status, invited_by, invited_at, accepted_at, full_name"
        )
        .single();

      if (insertError) throw insertError;

      const inserted = mapMemberFromRow(data as ProjectMemberRow);
      setProjectMembers((prev) => [...prev, inserted]);
      return { member: inserted };
    } catch (err: any) {
      console.error("Error inviting member:", err);
      setError(err.message || "Failed to invite project member.");
      return undefined;
    }
  };

  const handleUpdateMemberRole = async (memberId: string, role: MemberRole) => {
    try {
      setError(null);
      const { data, error: updateError } = await supabase
        .from("project_members")
        .update({ role })
        .eq("id", memberId)
        .select(
          "id, project_id, user_id, email, role, status, invited_by, invited_at, accepted_at, full_name"
        )
        .single();

      if (updateError) throw updateError;

      const updated = mapMemberFromRow(data as ProjectMemberRow);
      setProjectMembers((prev) =>
        prev.map((member) => (member.id === memberId ? updated : member))
      );
    } catch (err: any) {
      console.error("Error updating member role:", err);
      setError(err.message || "Failed to update member role.");
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    try {
      setError(null);
      const { error: deleteError } = await supabase
        .from("project_members")
        .delete()
        .eq("id", memberId);

      if (deleteError) throw deleteError;

      setProjectMembers((prev) => prev.filter((member) => member.id !== memberId));
    } catch (err: any) {
      console.error("Error removing member:", err);
      setError(err.message || "Failed to remove member.");
    }
  };

  if (loading) {
    return <div className="app-shell">Loading...</div>;
  }

  if (!session) {
    return <Auth />;
  }

  if (error) {
    return <div className="app-shell">Error: {error}</div>;
  }

  return (
    <div className="app-shell">
      <div className="app">
        <Sidebar
          projects={projects}
          selectedProjectId={selectedProjectId}
          members={membersForSelectedProject}
          currentUserId={session.user.id}
          currentUserEmail={session.user.email ?? null}
          memberInviteFallback
          onSelectProject={setSelectedProjectId}
          onCreateProject={handleCreateProject}
          onUpdateProject={handleUpdateProject}
          onDeleteProject={handleDeleteProject}
          onInviteMember={handleInviteMember}
          onUpdateMemberRole={handleUpdateMemberRole}
          onRemoveMember={handleRemoveMember}
          onSignOut={handleSignOut}
        />
        <main className="app__main">
          {projects.length > 0 ? (
            <>
              <div className="app__tabs" role="tablist" aria-label="Workspace view">
                <button
                  type="button"
                  className={`app__tab${activeMainTab === "timeline" ? " is-active" : ""}`}
                  role="tab"
                  aria-selected={activeMainTab === "timeline"}
                  onClick={() => setActiveMainTab("timeline")}
                >
                  Timeline
                </button>
                <button
                  type="button"
                  className={`app__tab${activeMainTab === "changeOrders" ? " is-active" : ""}`}
                  role="tab"
                  aria-selected={activeMainTab === "changeOrders"}
                  onClick={() => setActiveMainTab("changeOrders")}
                >
                  Change Orders
                </button>
              </div>
              {activeMainTab === "timeline" ? (
                <>
                  <CalendarView
                    activeProjectId={selectedProjectId}
                    days={visibleDays}
                    onAddFile={handleAddFile}
                    onRemoveFile={handleRemoveFile}
                    onCreatePost={handleCreatePost}
                    onUpdatePost={handleUpdatePost}
                    onDeletePost={handleDeletePost}
                    recentActivities={recentActivities}
                    upcomingDueTasks={upcomingTaskReminders}
                  />
                  <GanttChart
                    tasks={visibleTasks}
                    projects={projects}
                    selectedProjectId={selectedProjectId}
                    onCreateTask={handleCreateTask}
                    onUpdateTask={handleUpdateTask}
                  />
                </>
              ) : (
                <ChangeOrders
                  project={activeProject}
                  orders={changeOrders}
                  onCreate={handleCreateChangeOrder}
                  onDelete={handleDeleteChangeOrder}
                  onChangeStatus={handleChangeOrderStatus}
                  isLoading={loading}
                />
              )}
            </>
          ) : (
            <div className="app__empty-state">
              <h2>No projects yet!</h2>
              <p>Create a new project in the sidebar to get started.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
