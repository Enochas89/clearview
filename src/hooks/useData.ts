import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { Project, Task, DayNote, TaskDraft } from '../types';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const demoProjectSeededRef = useRef(false);

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

  useEffect(() => {
    if (!session) {
      setProjects([]);
      setTasks([]);
      setNotes([]);
      setLoading(false);
      return;
    }

    const fetchProjectsAndTasks = async (): Promise<void> => {
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

        const mappedProjects = (projectsData ?? []).map(mapProjectFromSupabase);
        const mappedTasks = (tasksData ?? []).map(mapTaskFromSupabase);
        const mappedNotes = (notesData ?? []).map(mapNoteFromSupabase);

        const hasDemoProject = mappedProjects.some(
          (project) => project.referenceId === DEMO_PROJECT_REFERENCE_ID
        );

        if (session && !hasDemoProject && !demoProjectSeededRef.current) {
          demoProjectSeededRef.current = true;
          const created = await createDemoProjectForUser();
          if (created) {
            await fetchProjectsAndTasks();
            return;
          }
        }

        if (hasDemoProject) {
          demoProjectSeededRef.current = true;
        }

        setProjects(mappedProjects);
        setTasks(mappedTasks);
        setNotes(mappedNotes);
      } catch (err: any) {
        console.error("Error fetching data:", err);
        setError(err.message || "Failed to fetch data.");
      } finally {
        setLoading(false);
      }
    };

    fetchProjectsAndTasks();
  }, [session, createDemoProjectForUser]);

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
        return insertedProject;
      }
    } catch (err: any) {
      console.error("Error creating project:", err);
      setError(err.message || "Failed to create project.");
    }
    return undefined;
  }, [session]);

  const handleUpdateProject = useCallback(async (projectId: string, input: Omit<Project, "id" | "createdAt" | "userId">) => {
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
  }, []);

  const handleDeleteProject = useCallback(async (projectId: string) => {
    try {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId);
      if (error) throw error;

      setProjects((prev) => prev.filter((project) => project.id !== projectId));
      setTasks((prev) => prev.filter((task) => task.projectId !== projectId));
    } catch (err: any) {
      console.error("Error deleting project:", err);
      setError(err.message || "Failed to delete project.");
    }
  }, []);

  const handleCreateTask = useCallback(async (input: TaskDraft) => {
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
  }, []);

  const handleUpdateTask = useCallback(async (taskId: string, input: TaskDraft) => {
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
  }, []);

  const handleDeleteTask = useCallback(async (taskId: string) => {
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
  }, [tasks]);

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
  }, []);

  const handleDeleteNote = useCallback(async (noteId: string) => {
    try {
      const { error } = await supabase.from("notes").delete().eq("id", noteId);
      if (error) throw error;
      setNotes((prev) => prev.filter((note) => note.id !== noteId));
    } catch (err: any) {
      console.error("Error deleting note:", err);
      setError(err.message || "Failed to delete note.");
    }
  }, []);

  return {
    projects,
    tasks,
    notes,
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
  };
}