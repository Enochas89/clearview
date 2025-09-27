import { useEffect, useMemo, useRef, useState } from "react";
import CalendarView from "./components/CalendarView";
import GanttChart from "./components/GanttChart";
import Sidebar from "./components/Sidebar";
import AccountBanner from "./components/AccountBanner";
import { DayEntry, Project, Task } from "./types";
import "./App.css";
import { supabase } from './supabaseClient';
import Auth from './Auth';
import { Session } from '@supabase/supabase-js';

const DAY_MS = 86_400_000;

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
          .select('*');

        if (projectsError) throw projectsError;

        const { data: tasksData, error: tasksError } = await supabase
          .from('tasks')
          .select('*');

        if (tasksError) throw tasksError;

        setProjects(projectsData as Project[]);
        setTasks(tasksData as Task[]);
        if (projectsData && projectsData.length > 0) {
          setSelectedProjectId(projectsData[0].id);
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

  const handleUpdateProfile = async (input: { email: string; fullName: string }) => {
    if (!session) {
      throw new Error("You must be signed in to update your profile.");
    }

    const trimmedEmail = input.email.trim();
    const trimmedName = input.fullName.trim();

    if (!trimmedEmail) {
      throw new Error("Email is required.");
    }

    if (!trimmedName) {
      throw new Error("Name is required.");
    }

    const updatePayload: {
      email?: string;
      data?: Record<string, unknown>;
    } = {};

    if (trimmedEmail !== session.user.email) {
      updatePayload.email = trimmedEmail;
    }

    updatePayload.data = {
      ...(session.user.user_metadata ?? {}),
      full_name: trimmedName,
    };

    const { data, error } = await supabase.auth.updateUser(updatePayload);
    if (error) {
      throw new Error(error.message);
    }

    if (data?.user) {
      setSession((prev) => (prev ? { ...prev, user: data.user } : prev));
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

    const selectedProject = projects.find(p => p.id === selectedProjectId);
    const projectTasks = tasks.filter((task) => task.projectId === selectedProjectId);

    let timelineStart: Date;
    let timelineEnd: Date;

    if (selectedProject?.startDate && selectedProject?.dueDate) {
      timelineStart = parseISODate(selectedProject.startDate);
      timelineEnd = parseISODate(selectedProject.dueDate);
    } else if (projectTasks.length > 0) {
      timelineStart = projectTasks.reduce((earliest, task) => {
        const taskStart = parseISODate(task.startDate);
        return taskStart < earliest ? taskStart : earliest;
      }, parseISODate(projectTasks[0].startDate));

      timelineEnd = projectTasks.reduce((latest, task) => {
        const taskEnd = parseISODate(task.dueDate);
        return taskEnd > latest ? taskEnd : latest;
      }, parseISODate(projectTasks[0].dueDate));
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      timelineStart = today;
      timelineEnd = new Date(today.setDate(today.getDate() + 13)); // Default 14 days
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    timelineStart = timelineStart < today ? timelineStart : today;

    const totalDays = Math.max(14, differenceInDays(timelineStart, timelineEnd) + 5);

    return Array.from({ length: totalDays }, (_, index) => {
      const date = new Date(timelineStart);
      date.setDate(timelineStart.getDate() + index);
      const isoDate = toISODate(date);
      return {
        date: isoDate,
        files: projectDayEntries.get(selectedProjectId)?.find(day => day.date === isoDate)?.files || [],
      };
    });
  }, [selectedProjectId, tasks, projectDayEntries, projects]);

  const handleCreateProject = async (input: Omit<Project, "id" | "createdAt">) => {
    const project: Project = {
      id: createId("project"),
      createdAt: new Date().toISOString(),
      ...input,
    };
    try {
      const { data, error } = await supabase.from('projects').insert([project]).select();
      if (error) throw error;
      setProjects((prev) => [...prev, data[0] as Project]);
      setSelectedProjectId(data[0].id);
    } catch (err: any) {
      console.error("Error creating project:", err);
      setError(err.message || "Failed to create project.");
    }
  };

  const handleUpdateProject = async (projectId: string, input: Omit<Project, "id" | "createdAt">) => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .update(input)
        .eq('id', projectId)
        .select();
      if (error) throw error;
      setProjects((prev) =>
        prev.map((project) =>
          project.id === projectId
            ? { ...project, ...input }
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
      const { data, error } = await supabase.from('tasks').insert([task]).select();
      if (error) throw error;
      setTasks((prev) => [...prev, data[0] as Task]);
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
        .update(input)
        .eq('id', taskId)
        .select();
      if (error) throw error;
      setTasks((prev) =>
        prev.map((task) =>
          task.id === taskId
            ? { ...task, ...data[0] }
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

    setProjectDayEntries((prev) => {
      const newMap = new Map(prev);
      const currentProjectDays = newMap.get(selectedProjectId) || [];
      const existingDayIndex = currentProjectDays.findIndex((day) => day.date === date);

      if (existingDayIndex > -1) {
        const updatedDay = {
          ...currentProjectDays[existingDayIndex],
          files: [
            ...currentProjectDays[existingDayIndex].files,
            { id, name: file.name, size: file.size, type: file.type, addedAt: new Date().toISOString(), url },
          ],
        };
        currentProjectDays[existingDayIndex] = updatedDay;
      } else {
        currentProjectDays.push({
          date,
          files: [{ id, name: file.name, size: file.size, type: file.type, addedAt: new Date().toISOString(), url }],
        });
        currentProjectDays.sort((a, b) => (a.date < b.date ? -1 : 1));
      }
      newMap.set(selectedProjectId, currentProjectDays);
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
      const currentProjectDays = newMap.get(selectedProjectId) || [];
      const existingDayIndex = currentProjectDays.findIndex((day) => day.date === date);

      if (existingDayIndex > -1) {
        const updatedDay = {
          ...currentProjectDays[existingDayIndex],
          files: currentProjectDays[existingDayIndex].files.filter((file) => file.id !== fileId),
        };
        currentProjectDays[existingDayIndex] = updatedDay;
      }
      newMap.set(selectedProjectId, currentProjectDays);
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
        />
        <main className="app__main">
          <AccountBanner
            user={session?.user ?? null}
            onUpdateProfile={handleUpdateProfile}
            onSignOut={handleSignOut}
          />
          {projects.length > 0 ? (
            <>
              <CalendarView days={visibleDays} onAddFile={handleAddFile} onRemoveFile={handleRemoveFile} />
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
