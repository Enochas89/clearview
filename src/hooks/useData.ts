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

const DAY_FILES_BUCKET = 'daily-uploads';
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

const mapMemberFromSupabase = (row: any): ProjectMember => ({
  id: row.id,
  projectId: row.projectId ?? row.project_id ?? "",
  userId: row.userId ?? row.user_id ?? null,
  email: (row.email ?? row.member_email ?? "").toLowerCase(),
  role: (row.role ?? row.member_role ?? "viewer") as MemberRole,
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
  if (input.role !== undefined) payload.role = input.role;
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

export function useData(session: Session | null) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<DayNote[]>([]);
  const [dayFiles, setDayFiles] = useState<DayFile[]>([]);
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const demoProjectSeededRef = useRef(false);

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

  const createDemoProjectForUser = useCallback(async (): Promise<boolean> => {
    if (!session) {
      return false;
    }

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startDate = toISODate(today);
      const dueDate = toISODate(new Date(today.getTime() + 7 * DAY_MS));
      const addDaysIso = (days: number) => toISODate(new Date(today.getTime() + days * DAY_MS));

      const demoProject: Project = {
        id: createId("project"),
        name: "Clearview Demo Project",
        description: "Explore how files, notes, and timelines work together.",
        color: "#3b82f6",
        createdAt: new Date().toISOString(),
        startDate,
        dueDate,
        referenceId: DEMO_PROJECT_REFERENCE_ID,
        cost: "$25,000",
        address: "123 Demo Street, Anywhere",
        projectManager: "Alex Demo",
        userId: session.user.id,
      };

      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .insert([mapProjectToSupabase(demoProject)])
        .select();

      if (projectError || !projectData || projectData.length === 0) {
        console.error("Error inserting demo project:", projectError);
        return false;
      }

      const insertedProject = mapProjectFromSupabase(projectData[0]);

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
        await supabase.from('project_members').insert([ownerPayload]);
      } catch (memberErr) {
        console.error("Error inserting demo project member:", memberErr);
      }

      const kickoffTaskId = createId("task");
      const designTaskId = createId("task");
      const buildTaskId = createId("task");
      const qaTaskId = createId("task");

      const demoTasks = [
        {
          id: kickoffTaskId,
          data: {
            projectId: insertedProject.id,
            name: "Kickoff meeting",
            description: "Review project goals and assign responsibilities.",
            startDate,
            dueDate: startDate,
            status: "done",
            dependencies: [],
            percentComplete: 100,
            assignee: "Project Sponsor",
            isMilestone: true,
            baselineStartDate: startDate,
            baselineDueDate: startDate,
            actualStartDate: startDate,
            actualDueDate: startDate,
          },
        },
        {
          id: designTaskId,
          data: {
            projectId: insertedProject.id,
            name: "Design sprint",
            description: "Sketch wireframes and collect approvals.",
            startDate: addDaysIso(1),
            dueDate: addDaysIso(5),
            status: "in-progress",
            dependencies: [kickoffTaskId],
            percentComplete: 60,
            assignee: "Design Team",
            baselineStartDate: addDaysIso(1),
            baselineDueDate: addDaysIso(4),
            actualStartDate: addDaysIso(1),
            actualDueDate: addDaysIso(5),
            notes: "Attach mockups in the calendar view.",
          },
        },
        {
          id: buildTaskId,
          data: {
            projectId: insertedProject.id,
            name: "Implementation window",
            description: "Develop core features and keep stakeholders updated.",
            startDate: addDaysIso(5),
            dueDate: addDaysIso(12),
            status: "todo",
            dependencies: [designTaskId],
            percentComplete: 20,
            assignee: "Engineering",
            baselineStartDate: addDaysIso(5),
            baselineDueDate: addDaysIso(11),
            actualStartDate: addDaysIso(6),
            actualDueDate: addDaysIso(12),
          },
        },
        {
          id: qaTaskId,
          data: {
            projectId: insertedProject.id,
            name: "QA & final review",
            description: "Run through the demo checklist and log findings.",
            startDate: addDaysIso(12),
            dueDate: addDaysIso(14),
            status: "todo",
            dependencies: [buildTaskId],
            percentComplete: 10,
            assignee: "QA Team",
            isMilestone: true,
            baselineStartDate: addDaysIso(12),
            baselineDueDate: addDaysIso(14),
          },
        },
      ];

      if (demoTasks.length > 0) {
        const taskPayloads = demoTasks.map(t => mapTaskToSupabase(t.data));
        const { error: taskError } = await supabase.from('tasks').insert(taskPayloads);
        if (taskError) {
          console.error("Error inserting demo tasks:", taskError);
        }
      }

      const notePayload = mapNoteToSupabase({
        projectId: insertedProject.id,
        date: startDate,
        text: "Welcome to Clearview! Use files for assets and notes for quick updates.",
        userId: session.user.id,
      });

      const { error: noteError } = await supabase.from('notes').insert([notePayload]);
      if (noteError) {
        console.error("Error inserting demo note:", noteError);
      }

      return true;
    } catch (err) {
      console.error("Error seeding demo project:", err);
      return false;
    }
  }, [session]);

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

  const fetchAllData = useCallback(async (): Promise<void> => {
    if (!session) {
      setProjects([]);
      setTasks([]);
      setNotes([]);
      setDayFiles([]);
      setProjectMembers([]);
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

      const mappedProjects = (projectsData ?? []).map(mapProjectFromSupabase);
      const mappedTasks = (tasksData ?? []).map(mapTaskFromSupabase);
      const mappedNotes = (notesData ?? []).map(mapNoteFromSupabase);
      const mappedFiles = await attachSignedUrls((filesData ?? []).map(mapDayFileFromSupabase));
      const mappedMembers = (membersData ?? []).map(mapMemberFromSupabase);

      const hasDemoProject = mappedProjects.some(
        (project) => project.referenceId === DEMO_PROJECT_REFERENCE_ID
      );

      if (session && !hasDemoProject && !demoProjectSeededRef.current) {
        demoProjectSeededRef.current = true;
        const created = await createDemoProjectForUser();
        if (created) {
          await fetchAllData();
          return;
        }
      }

      if (hasDemoProject) {
        demoProjectSeededRef.current = true;
      }

      setProjects(mappedProjects);
      setTasks(mappedTasks);
      setNotes(mappedNotes);
      setDayFiles(mappedFiles);
      setProjectMembers(mappedMembers);
    } catch (err: any) {
      console.error("Error fetching data:", err);
      setError(err.message || "Failed to fetch data.");
    } finally {
      setLoading(false);
    }
  }, [session, createDemoProjectForUser, attachSignedUrls]);

  useEffect(() => {
    void fetchAllData();
  }, [fetchAllData]);

  useEffect(() => {
    if (!session?.user?.email) {
      return;
    }

    let isCancelled = false;
    const linkPendingInvites = async () => {
      const normalizedEmail = session.user.email?.toLowerCase().trim();
      if (!normalizedEmail) {
        return;
      }

      try {
        const updatePayload = mapMemberUpdateToSupabase({
          userId: session.user.id,
          status: "accepted",
          acceptedAt: new Date().toISOString(),
          fullName: session.user.user_metadata?.full_name ?? session.user.email ?? null,
        });

        const { data, error } = await supabase
          .from('project_members')
          .update(updatePayload)
          .eq('email', normalizedEmail)
          .is('user_id', null)
          .eq('status', 'pending')
          .select();

        if (error) {
          throw error;
        }

        if (isCancelled || !data || data.length === 0) {
          return;
        }

        const mappedMembers = data.map(mapMemberFromSupabase);
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
  }, [session, dayFiles]);

  const handleCreateTask = useCallback(async (input: TaskDraft) => {
    if (!session) {
      setError("You must be signed in to create a task.");
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
  }, [session]);

  const handleUpdateTask = useCallback(async (taskId: string, input: TaskDraft) => {
    if (!session) {
      setError("You must be signed in to update a task.");
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
  }, [session]);

  const handleDeleteTask = useCallback(async (taskId: string) => {
    if (!session) {
      setError("You must be signed in to delete a task.");
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
  }, [session, tasks]);

  const handleCreateFile = useCallback(async ({ projectId, date, file }: { projectId: string; date: string; file: File; }) => {
    if (!session) {
      setError("You must be signed in to upload a file.");
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
  }, [session, attachSignedUrls]);

  const handleDeleteFile = useCallback(async (fileId: string) => {
    if (!session) {
      setError("You must be signed in to delete a file.");
      return;
    }

    const target = dayFiles.find((file) => file.id === fileId);
    if (!target) {
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
  }, [session, dayFiles]);

  const handleCreateNote = useCallback(async (input: Omit<DayNote, "id" | "createdAt" | "userId">) => {
    if (!session) return;
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
  }, [session]);

  const handleUpdateNote = useCallback(async (noteId: string, text: string) => {
    if (!session) {
      setError("You must be signed in to update a note.");
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
  }, [session]);

  const handleDeleteNote = useCallback(async (noteId: string) => {
    if (!session) {
      setError("You must be signed in to delete a note.");
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
  }, [session]);

  return {
    projects,
    tasks,
    notes,
    dayFiles,
    projectMembers,
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
    handleInviteMember,
    handleUpdateMemberRole,
    handleRemoveMember,
  };
}
