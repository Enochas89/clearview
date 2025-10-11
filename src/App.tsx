
import { useEffect, useMemo, useState, useCallback } from "react";
import CalendarView from "./components/CalendarView";
import GanttChart from "./components/GanttChart";
import Sidebar from "./components/Sidebar";
import AccountBanner from "./components/AccountBanner";
import { DayEntry, Project, Task, DayNote, TaskDraft, DayFile } from "./types";
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

function App() {
  const { session, loading: authLoading, error: authError, handleSignOut, handleUpdateProfile } = useAuth();
  const {
    projects,
    tasks,
    notes,
    dayFiles,
    projectMembers,
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
    handleCreateFile,
    handleDeleteFile,
    handleInviteMember,
    handleUpdateMemberRole,
    handleRemoveMember,
  } = useData(session);

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
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

  const handleAddFile = useCallback((date: string, file: File) => {
    if (!selectedProjectId) {
      return;
    }

    void handleCreateFile({ projectId: selectedProjectId, date, file });
  }, [selectedProjectId, handleCreateFile]);

  const handleRemoveFile = useCallback((_date: string, fileId: string) => {
    if (!selectedProjectId) {
      return;
    }

    void handleDeleteFile(fileId);
  }, [selectedProjectId, handleDeleteFile]);

  const selectedProject = useMemo(() => {
    if (!selectedProjectId) {
      return null;
    }
    return projects.find((project) => project.id === selectedProjectId) ?? null;
  }, [projects, selectedProjectId]);

  const currentUserOwnsSelectedProject = Boolean(
    selectedProject && session?.user?.id && selectedProject.userId === session.user.id
  );

  const visibleTasks = useMemo(() => {
    if (!selectedProjectId) {
      return tasks;
    }
    return tasks.filter((task) => task.projectId === selectedProjectId);
  }, [selectedProjectId, tasks]);

  const visibleDays = useMemo<DayEntry[]>(() => {
    if (!selectedProjectId) {
      return [];
    }

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

    const filesByDate = new Map<string, DayFile[]>();
    dayFiles.forEach((file) => {
      if (file.projectId !== selectedProjectId) {
        return;
      }
      const existing = filesByDate.get(file.date);
      if (existing) {
        existing.push(file);
      } else {
        filesByDate.set(file.date, [file]);
      }
    });

    filesByDate.forEach((list) => {
      list.sort((a, b) => (a.addedAt < b.addedAt ? -1 : 1));
    });

    return Array.from({ length: totalDays }, (_, index) => {
      const date = new Date(timelineStart);
      date.setDate(timelineStart.getDate() + index);
      const isoDate = toISODate(date);
      return {
        date: isoDate,
        files: filesByDate.get(isoDate) ?? [],
        notes: notes.filter(note => note.date === isoDate && note.projectId === selectedProjectId),
      };
    });
  }, [selectedProjectId, selectedProject, tasks, notes, dayFiles]);

  const membersForSelectedProject = useMemo(() => {
    if (!selectedProjectId) {
      return [];
    }
    return projectMembers.filter((member) => member.projectId === selectedProjectId);
  }, [projectMembers, selectedProjectId]);

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
          members={membersForSelectedProject}
          currentUserId={session.user.id}
          currentUserEmail={session.user.email ?? null}
          memberInviteFallback={currentUserOwnsSelectedProject}
          onSelectProject={setSelectedProjectId}
          onCreateProject={handleCreateProject}
          onUpdateProject={handleUpdateProject}
          onDeleteProject={handleDeleteProject}
          onInviteMember={handleInviteMember}
          onUpdateMemberRole={handleUpdateMemberRole}
          onRemoveMember={handleRemoveMember}
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
