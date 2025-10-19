import { useCallback, useEffect, useMemo, useState } from "react";
import CalendarView from "./components/CalendarView";
import GanttChart from "./components/GanttChart";
import Sidebar from "./components/Sidebar";
import { DayActivity, DayEntry, DayFile, Project, Task } from "./types";
import "./App.css";
import { supabase } from './supabaseClient';
import Auth from './Auth';
import { Session } from '@supabase/supabase-js';

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
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        for (const [bucketId, paths] of bucketGroups) {
          if (paths.length === 0) continue;
          const { data, error: signedUrlError } = await supabase.storage.from(bucketId).createSignedUrls(paths, 60 * 60);
          if (signedUrlError) {
            console.error("Error creating signed URLs:", signedUrlError);
            continue;
          }
          data?.forEach((item) => {
            if (item.signedUrl) {
              signedUrlMap.set(item.path, item.signedUrl);
            }
          });
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
            uploaded_by: session?.user?.id ?? null,
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setProjects([]);
      setTasks([]);
      setSelectedProjectId(null);
      setProjectDayEntries(new Map());
      setLoading(false); // Important: set loading to false if no session
      return;
    }

    const fetchProjectsAndTasks = async () => {
      setLoading(true);
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
    }
  }, [selectedProjectId, loadDayEntries]);

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

  const visibleDays = useMemo(() => {
    if (!selectedProjectId) {
      return [];
    }

    const selectedProject = projects.find((p) => p.id === selectedProjectId);
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
  }, [selectedProjectId, tasks, projectDayEntries, projects]);

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
          onSelectProject={setSelectedProjectId}
          onCreateProject={handleCreateProject}
          onUpdateProject={handleUpdateProject}
          onDeleteProject={handleDeleteProject}
          onSignOut={handleSignOut}
        />
        <main className="app__main">
          {projects.length > 0 ? (
            <>
              <CalendarView
                days={visibleDays}
                onAddFile={handleAddFile}
                onRemoveFile={handleRemoveFile}
                onCreatePost={handleCreatePost}
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
