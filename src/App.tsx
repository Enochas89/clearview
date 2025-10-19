import { useEffect, useMemo, useRef, useState } from "react";
import CalendarView from "./components/CalendarView";
import GanttChart from "./components/GanttChart";
import Sidebar from "./components/Sidebar";
import { DayActivity, DayEntry, DayFile, Project, Task } from "./types";
import "./App.css";
import { supabase } from './supabaseClient';
import Auth from './Auth';
import { Session } from '@supabase/supabase-js';

const DAY_MS = 86_400_000;

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
  const objectUrls = useRef(new Map<string, string>());

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
          );

        if (projectsError) throw projectsError;

        const { data: tasksData, error: tasksError } = await supabase
          .from('tasks')
          .select(
            "id, project_id, name, description, start_date, due_date, status, dependencies"
          );

        if (tasksError) throw tasksError;

        const mappedProjects = (projectsData ?? []).map((project) =>
          mapProjectFromRow(project as ProjectRow),
        );
        const mappedTasks = (tasksData ?? []).map((task) =>
          mapTaskFromRow(task as TaskRow),
        );

        setProjects(mappedProjects);
        setTasks(mappedTasks);
        if (mappedProjects.length > 0) {
          setSelectedProjectId(mappedProjects[0].id);
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
          details: "File uploaded",
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

  const handleAddFile = (date: string, file: File) => {
    if (!selectedProjectId) return;

    const id = createId("file");
    const url = URL.createObjectURL(file);
    objectUrls.current.set(id, url);
    const addedAt = new Date().toISOString();
    const newFile: DayFile = {
      id,
      name: file.name,
      size: file.size,
      type: file.type,
      addedAt,
      url,
    };

    setProjectDayEntries((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(selectedProjectId);
      const projectDays = existing
        ? existing.map((day) => ({ ...day, posts: day.posts ?? [] }))
        : [];
      const existingDayIndex = projectDays.findIndex((day) => day.date === date);

      if (existingDayIndex > -1) {
        const day = projectDays[existingDayIndex];
        projectDays[existingDayIndex] = {
          ...day,
          files: [...day.files, newFile],
        };
      } else {
        projectDays.push({
          date,
          files: [newFile],
          posts: [],
        });
        projectDays.sort((a, b) => (a.date < b.date ? -1 : 1));
      }
      newMap.set(selectedProjectId, projectDays);
      return newMap;
    });
  };

  const handleRemoveFile = (date: string, fileId: string) => {
    if (!selectedProjectId) return;

    const url = objectUrls.current.get(fileId);
    if (url) {
      URL.revokeObjectURL(url);
      objectUrls.current.delete(fileId);
    }

    setProjectDayEntries((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(selectedProjectId);
      if (!existing) {
        return newMap;
      }
      const projectDays = existing.map((day) => ({ ...day, posts: day.posts ?? [] }));
      const existingDayIndex = projectDays.findIndex((day) => day.date === date);

      if (existingDayIndex > -1) {
        const day = projectDays[existingDayIndex];
        const filteredFiles = day.files.filter((file) => file.id !== fileId);
        const updatedPosts = day.posts
          .map((post) => ({
            ...post,
            attachments: post.attachments.filter((attachment) => attachment.id !== fileId),
          }))
          .filter(
            (post) => post.attachments.length > 0 || post.message.trim().length > 0,
          );

        const nextDay = {
          ...day,
          files: filteredFiles,
          posts: updatedPosts,
        };

        if (nextDay.files.length === 0 && nextDay.posts.length === 0) {
          projectDays.splice(existingDayIndex, 1);
        } else {
          projectDays[existingDayIndex] = nextDay;
        }
      }
      newMap.set(selectedProjectId, projectDays);
      return newMap;
    });
  };

  const handleCreatePost = (input: { message: string; file?: File | null }) => {
    if (!selectedProjectId) {
      return;
    }

    const trimmedMessage = input.message.trim();
    const attachmentFile = input.file ?? null;

    if (!trimmedMessage && !attachmentFile) {
      return;
    }

    const createdAt = new Date();
    const isoCreatedAt = createdAt.toISOString();
    const todayIso = toISODate(createdAt);

    const attachments: DayFile[] = [];
    if (attachmentFile) {
      const fileId = createId("file");
      const url = URL.createObjectURL(attachmentFile);
      objectUrls.current.set(fileId, url);
      attachments.push({
        id: fileId,
        name: attachmentFile.name,
        size: attachmentFile.size,
        type: attachmentFile.type,
        addedAt: isoCreatedAt,
        url,
      });
    }

    const postId = createId("post");

    setProjectDayEntries((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(selectedProjectId);
      const projectDays = existing
        ? existing.map((day) => ({ ...day, posts: day.posts ?? [] }))
        : [];
      const existingDayIndex = projectDays.findIndex((day) => day.date === todayIso);

      const post: DayEntry["posts"][number] = {
        id: postId,
        message: trimmedMessage,
        createdAt: isoCreatedAt,
        attachments,
      };

      if (existingDayIndex > -1) {
        const day = projectDays[existingDayIndex];
        projectDays[existingDayIndex] = {
          ...day,
          files: attachments.length > 0 ? [...day.files, ...attachments] : day.files,
          posts: [...day.posts, post],
        };
      } else {
        projectDays.push({
          date: todayIso,
          files: [...attachments],
          posts: [post],
        });
        projectDays.sort((a, b) => (a.date < b.date ? -1 : 1));
      }

      newMap.set(selectedProjectId, projectDays);
      return newMap;
    });
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
