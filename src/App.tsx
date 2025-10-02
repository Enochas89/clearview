
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import CalendarView from "./components/CalendarView";
import GanttChart from "./components/GanttChart";
import Sidebar from "./components/Sidebar";
import AccountBanner from "./components/AccountBanner";
import { DayEntry, Project, Task, DayNote, TaskDraft } from "./types";
import "./App.css";
import Auth from './Auth';
import { useAuth } from "./hooks/useAuth";
import { useData } from "./hooks/useData";

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
  const { session, loading: authLoading, error: authError, handleSignOut, handleUpdateProfile } = useAuth();
  const {
    projects,
    tasks,
    notes,
    loading: dataLoading,
    error: dataError,
    handleCreateProject,
    handleUpdateProject,
    handleDeleteProject: doDeleteProject,
    handleCreateTask,
    handleUpdateTask,
    handleDeleteTask,
    handleCreateNote,
    handleUpdateNote,
    handleDeleteNote,
  } = useData(session);

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectDayEntries, setProjectDayEntries] = useState<Map<string, DayEntry[]>>(new Map());
  const objectUrls = useRef(new Map<string, string>());

  useEffect(() => {
    return () => {
      if (objectUrls.current.size > 0) {
        objectUrls.current.forEach(URL.revokeObjectURL);
        objectUrls.current.clear();
      }
    };
  }, [selectedProjectId]);

  const currentYear = new Date().getFullYear();

  useEffect(() => {
    if (!dataLoading && projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [dataLoading, projects, selectedProjectId]);

  const handleSignOutAndClearData = useCallback(async () => {
    await handleSignOut();
    setSelectedProjectId(null);
  }, [handleSignOut]);

  const handleDeleteProject = useCallback(async (projectId: string) => {
    await doDeleteProject(projectId);
    if (selectedProjectId === projectId) {
      const newSelectedProjectId = projects.find(p => p.id !== projectId)?.id ?? null;
      setSelectedProjectId(newSelectedProjectId);
    }
  }, [doDeleteProject, projects, selectedProjectId]);

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
        notes: notes.filter(note => note.date === isoDate && note.projectId === selectedProjectId),
      };
    });
  }, [selectedProjectId, tasks, projectDayEntries, projects, notes]);

  if (authLoading || dataLoading) {
    return <div className="app-shell">Loading...</div>;
  }

  if (!session) {
    return <Auth />;
  }

  if (authError || dataError) {
    return <div className="app-shell">Error: {authError || dataError}</div>;
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
            onSignOut={handleSignOutAndClearData}
          />
          {projects.length > 0 ? (
            <>
              <CalendarView
                days={visibleDays}
                selectedProjectId={selectedProjectId}
                onAddFile={handleAddFile}
                onRemoveFile={handleRemoveFile}
                onCreateNote={handleCreateNote}
                onUpdateNote={handleUpdateNote}
                onDeleteNote={handleDeleteNote}
              />
              <GanttChart
                tasks={visibleTasks}
                projects={projects}
                selectedProjectId={selectedProjectId}
                onCreateTask={handleCreateTask}
                onUpdateTask={handleUpdateTask}
                onDeleteTask={handleDeleteTask}
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
      <footer className="app__footer">
        &copy; {currentYear} Cereb Fast Think Tank. All rights reserved.
      </footer>
    </div>
  );
}

export default App;
