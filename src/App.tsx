
import { useEffect, useMemo, useState, useCallback } from "react";
import type { ReactNode } from "react";
import CalendarView from "./components/CalendarView";
import GanttChart from "./components/GanttChart";
import Sidebar from "./components/Sidebar";
import AccountBanner from "./components/AccountBanner";
import OffCanvas from "./components/OffCanvas";
import BottomTabs, { TabKey } from "./components/BottomTabs";
import ChangeOrdersView from "./components/ChangeOrdersView";
import OnboardingTour from "./components/OnboardingTour";
import LoadingScreen from "./components/LoadingScreen";
import MobileHomeFeed from "./components/MobileHomeFeed";
import MobileStoriesView from "./components/MobileStoriesView";
import MobileMessagesHub from "./components/MobileMessagesHub";
import MobileDocsGallery from "./components/MobileDocsGallery";
import MobileProfilePane from "./components/MobileProfilePane";
import { buildFeedData } from "./feed";
import {
  DayEntry,
  Project,
  Task,
  DayNote,
  TaskDraft,
  DayFile,
  MemberRole,
  ClientProfile,
  ClientContact,
  ChangeOrder,
} from "./types";
import "./App.css";
import Auth from "./Auth";
import { useAuth } from "./hooks/useAuth";
import { useData } from "./hooks/useData";
import { useMediaQuery } from "./hooks/useMediaQuery";

const DAY_MS = 86_400_000;

const parseISODate = (value: string) => new Date(`${value}T00:00:00`);

const differenceInDays = (start: Date, end: Date) => Math.floor((end.getTime() - start.getTime()) / DAY_MS);

const toISODate = (date: Date) => {
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  return clone.toISOString().slice(0, 10);
};

const TUTORIAL_STORAGE_KEY = "clearview:onboarding:v1";

function App() {
  const { session, loading: authLoading, error: authError, handleSignOut, handleUpdateProfile } = useAuth();
  const {
    projects,
    tasks,
    notes,
    dayFiles,
    projectMembers,
    clientProfiles,
    clientContacts,
    changeOrders,
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
  } = useData(session);

  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<TabKey>("home");
  const [shouldHighlightComposer, setShouldHighlightComposer] = useState(false);
  const [hasLoadedInitialData, setHasLoadedInitialData] = useState(false);
  const [hasSeenTour, setHasSeenTour] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    const stored = window.localStorage.getItem(TUTORIAL_STORAGE_KEY);
    return stored === "completed" || stored === "dismissed";
  });
  const [isTourOpen, setIsTourOpen] = useState(false);
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    if (isDesktop) {
      setIsSidebarOpen(false);
      setActiveMobileTab("home");
    }
  }, [isDesktop]);

  useEffect(() => {
    if (!dataLoading && projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [dataLoading, projects, selectedProjectId]);

  useEffect(() => {
    if (session && !hasSeenTour) {
      setIsTourOpen(true);
    }
  }, [session, hasSeenTour]);

  useEffect(() => {
    if (activeMobileTab !== "home" && shouldHighlightComposer) {
      setShouldHighlightComposer(false);
    }
  }, [activeMobileTab, shouldHighlightComposer]);

  const handleSignOutAndClearData = useCallback(async () => {
    await handleSignOut();
    setSelectedProjectId(null);
    setSelectedDay(null);
  }, [handleSignOut]);

  const handleDeleteProject = useCallback(async (projectId: string) => {
    await doDeleteProject(projectId);
    if (selectedProjectId === projectId) {
      const newSelectedProjectId = projects.find(p => p.id !== projectId)?.id ?? null;
      setSelectedProjectId(newSelectedProjectId);
      setSelectedDay(null);
    }
  }, [doDeleteProject, projects, selectedProjectId]);

  const handleTourRequestClose = useCallback((completed: boolean) => {
    setIsTourOpen(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TUTORIAL_STORAGE_KEY, completed ? "completed" : "dismissed");
    }
    setHasSeenTour(true);
  }, []);

  const handleStartTutorial = useCallback(() => {
    setIsTourOpen(true);
  }, []);

  const handleSelectProject = useCallback((projectId: string) => {
    setSelectedProjectId(projectId);
    setSelectedDay(null);
    if (!isDesktop) {
      setIsSidebarOpen(false);
    }
  }, [isDesktop]);

  const handleAddFile = useCallback(
    (date: string, file: File) => {
      if (!selectedProjectId) {
        return Promise.resolve();
      }

      return handleCreateFile({ projectId: selectedProjectId, date, file });
    },
    [selectedProjectId, handleCreateFile]
  );

  const handleRemoveFile = useCallback((_date: string, fileId: string) => {
    if (!selectedProjectId) {
      return;
    }

    void handleDeleteFile(fileId);
  }, [selectedProjectId, handleDeleteFile]);

  const handleRemoveDocFile = useCallback((fileId: string) => {
    void handleDeleteFile(fileId);
  }, [handleDeleteFile]);

  const handleOpenComposer = useCallback(() => {
    setActiveMobileTab("home");
    setShouldHighlightComposer(true);
  }, []);

  const handleComposerSettled = useCallback(() => {
    setShouldHighlightComposer(false);
  }, []);

  const selectedProject = useMemo(() => {
    if (!selectedProjectId) {
      return null;
    }
    return projects.find((project) => project.id === selectedProjectId) ?? null;
  }, [projects, selectedProjectId]);

  const clientProfileForSelectedProject = useMemo<ClientProfile | null>(() => {
    if (!selectedProjectId) {
      return null;
    }
    return clientProfiles.find((profile) => profile.projectId === selectedProjectId) ?? null;
  }, [clientProfiles, selectedProjectId]);

  const clientContactsForSelectedProject = useMemo<ClientContact[]>(() => {
    if (!selectedProjectId) {
      return [];
    }
    return clientContacts.filter((contact) => contact.projectId === selectedProjectId);
  }, [clientContacts, selectedProjectId]);

  const changeOrdersForSelectedProject = useMemo<ChangeOrder[]>(() => {
    if (!selectedProjectId) {
      return [];
    }
    return changeOrders.filter((order) => order.projectId === selectedProjectId);
  }, [changeOrders, selectedProjectId]);

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

    const parseDateOrNull = (value?: string | null) => {
      if (!value) {
        return null;
      }
      const date = parseISODate(value);
      return Number.isNaN(date.getTime()) ? null : date;
    };

    let timelineStart = parseDateOrNull(selectedProject?.startDate);
    let timelineEnd = parseDateOrNull(selectedProject?.dueDate);

    projectTasks.forEach((task) => {
      const taskStart = parseDateOrNull(task.startDate);
      if (taskStart && (!timelineStart || taskStart < timelineStart)) {
        timelineStart = taskStart;
      }

      const taskEnd = parseDateOrNull(task.dueDate);
      if (taskEnd && (!timelineEnd || taskEnd > timelineEnd)) {
        timelineEnd = taskEnd;
      }
    });

    const DEFAULT_RANGE_DAYS = 14;
    if (!timelineStart || !timelineEnd) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      timelineStart = today;
      timelineEnd = new Date(today);
      timelineEnd.setDate(timelineStart.getDate() + (DEFAULT_RANGE_DAYS - 1));
    }

    if (timelineStart > timelineEnd) {
      const tmp = timelineStart;
      timelineStart = timelineEnd;
      timelineEnd = tmp;
    }

    const totalDays = Math.max(1, differenceInDays(timelineStart, timelineEnd) + 1);

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

  useEffect(() => {
    if (visibleDays.length === 0) {
      if (selectedDay !== null) {
        setSelectedDay(null);
      }
      return;
    }

    if (selectedDay && visibleDays.some((day) => day.date === selectedDay)) {
      return;
    }

    const todayIso = toISODate(new Date());
    const todayEntry = visibleDays.find((day) => day.date === todayIso);
    const nextSelection = todayEntry?.date ?? visibleDays[0]?.date ?? null;
    if (nextSelection !== selectedDay) {
      setSelectedDay(nextSelection);
    }
  }, [selectedDay, visibleDays]);

  const membersForSelectedProject = useMemo(() => {
    if (!selectedProjectId) {
      return [];
    }
    return projectMembers.filter((member) => member.projectId === selectedProjectId);
  }, [projectMembers, selectedProjectId]);

  const memberDirectory = useMemo<Record<string, string>>(() => {
    const directory = new Map<string, string>();
    membersForSelectedProject.forEach((member) => {
      if (!member.userId) {
        return;
      }
      const label = member.fullName?.trim() || member.email;
      if (label) {
        directory.set(member.userId, label);
      }
    });
    if (session?.user) {
      const fullName = (session.user.user_metadata?.full_name as string | undefined)?.trim();
      const fallbackEmail = session.user.email ?? "";
      const displayName = fullName && fullName.length > 0 ? fullName : fallbackEmail;
      if (displayName) {
        directory.set(session.user.id, displayName);
      }
    }
    return Object.fromEntries(directory);
  }, [membersForSelectedProject, session]);

  const currentMemberForSelectedProject = useMemo(() => {
    if (!session?.user || !selectedProjectId) {
      return null;
    }

    const userId = session.user.id;
    const email = session.user.email?.toLowerCase() ?? null;

    return (
      membersForSelectedProject.find(
        (member) =>
          (member.userId && member.userId === userId) ||
          (email && member.email === email)
      ) ?? null
    );
  }, [membersForSelectedProject, selectedProjectId, session]);

  const currentProjectRole: MemberRole = useMemo(() => {
    if (currentMemberForSelectedProject) {
      return currentMemberForSelectedProject.role;
    }

    if (currentUserOwnsSelectedProject) {
      return "owner";
    }

    return "viewer";
  }, [currentMemberForSelectedProject, currentUserOwnsSelectedProject]);

  const canManageTasks = currentProjectRole === "owner" || currentProjectRole === "editor";
  const canManageFiles = currentProjectRole !== "viewer";
  const canSubmitChangeOrders = currentProjectRole !== "viewer";
  const canReviewChangeOrders = currentProjectRole === "owner";
  const canEditClientProfile = currentProjectRole === "owner";
  const filesForSelectedProject = useMemo(() => {
    if (!selectedProjectId) {
      return [];
    }
    return dayFiles.filter((file) => file.projectId === selectedProjectId);
  }, [dayFiles, selectedProjectId]);
  const notesForSelectedProject = useMemo(() => {
    if (!selectedProjectId) {
      return [];
    }
    return notes.filter((note) => note.projectId === selectedProjectId);
  }, [notes, selectedProjectId]);
  const hasProjects = projects.length > 0;

  const socialFeed = useMemo(
    () =>
      buildFeedData({
        projectId: selectedProjectId,
        projects,
        tasks,
        notes,
        changeOrders,
        files: dayFiles,
        members: projectMembers,
      }),
    [changeOrders, dayFiles, notes, projectMembers, projects, selectedProjectId, tasks]
  );

  const accountBanner = (
    <AccountBanner
      user={session?.user ?? null}
      onUpdateProfile={handleUpdateProfile}
      onSignOut={handleSignOutAndClearData}
      onStartTutorial={handleStartTutorial}
    />
  );

  const emptyState = (
    <div className="app__empty-state">
      <h2>No projects yet!</h2>
      <p>Create a new project in the navigation to get started.</p>
    </div>
  );

  const renderMobileTab = (tab: TabKey): ReactNode => {
    const homeView = hasProjects ? (
      <MobileHomeFeed
        projectName={selectedProject?.name ?? null}
        projectReference={selectedProject?.referenceId ?? null}
        stories={socialFeed.stories}
        activities={socialFeed.activities}
        highlightComposer={shouldHighlightComposer}
        onComposerSettled={handleComposerSettled}
        onRequestCompose={handleOpenComposer}
      />
    ) : (
      <div className="mobile-tab mobile-tab--empty" data-tab={tab}>
        {accountBanner}
        {emptyState}
      </div>
    );

    const storiesView = hasProjects ? (
      <MobileStoriesView
        stories={socialFeed.stories}
        onSelectStory={handleOpenComposer}
      />
    ) : (
      <div className="mobile-tab mobile-tab--empty" data-tab={tab}>
        {emptyState}
      </div>
    );

    const messagesView = hasProjects ? (
      <MobileMessagesHub
        projectName={selectedProject?.name ?? null}
        notes={notesForSelectedProject}
        changeOrders={changeOrdersForSelectedProject}
        members={membersForSelectedProject}
      />
    ) : (
      <div className="mobile-tab mobile-tab--empty" data-tab={tab}>
        {emptyState}
      </div>
    );

    const docsView = hasProjects ? (
      <MobileDocsGallery
        files={filesForSelectedProject}
        canManageFiles={canManageFiles}
        onRemoveFile={canManageFiles ? handleRemoveDocFile : undefined}
      />
    ) : (
      <div className="mobile-tab mobile-tab--empty" data-tab={tab}>
        {emptyState}
      </div>
    );

    const profileView = (
      <div className="mobile-profile-pane" data-tab={tab}>
        {accountBanner}
        <MobileProfilePane
          user={session?.user ?? null}
          totalProjects={projects.length}
          totalChangeOrders={changeOrders.length}
          totalNotes={notes.length}
        />
      </div>
    );

    switch (tab) {
      case "home":
        return homeView;
      case "stories":
        return storiesView;
      case "messages":
        return messagesView;
      case "files":
        return docsView;
      case "profile":
        return profileView;
      default:
        return homeView;
    }
  };

  useEffect(() => {
    if (!dataLoading) {
      setHasLoadedInitialData(true);
    }
  }, [dataLoading]);

  const isInitialLoading = (authLoading || dataLoading) && !hasLoadedInitialData;

  if (isInitialLoading) {
    return <LoadingScreen />;
  }

  if (!session) {
    return <Auth />;
  }

  if (authError || dataError) {
    return <div className="app-shell">Error: {authError || dataError}</div>;
  }

  return (
    <div className="app-shell" data-layout={isDesktop ? "desktop" : "mobile"}>
      <div className={`app ${isDesktop ? "app--desktop" : "app--mobile"}`}>
        {isDesktop ? (
          <Sidebar
            projects={projects}
            selectedProjectId={selectedProjectId}
            members={membersForSelectedProject}
            currentUserId={session.user.id}
            currentUserEmail={session.user.email ?? null}
            memberInviteFallback={currentUserOwnsSelectedProject}
            onSelectProject={handleSelectProject}
            onCreateProject={handleCreateProject}
            onUpdateProject={handleUpdateProject}
            onDeleteProject={handleDeleteProject}
            onInviteMember={handleInviteMember}
            onUpdateMemberRole={handleUpdateMemberRole}
            onRemoveMember={handleRemoveMember}
          />
        ) : (
          <OffCanvas
            isOpen={isSidebarOpen}
            onClose={() => setIsSidebarOpen(false)}
            titleId="mobile-navigation-title"
          >
            <Sidebar
              projects={projects}
              selectedProjectId={selectedProjectId}
              members={membersForSelectedProject}
              currentUserId={session.user.id}
              currentUserEmail={session.user.email ?? null}
              memberInviteFallback={currentUserOwnsSelectedProject}
              onSelectProject={handleSelectProject}
              onCreateProject={handleCreateProject}
              onUpdateProject={handleUpdateProject}
              onDeleteProject={handleDeleteProject}
              onInviteMember={handleInviteMember}
              onUpdateMemberRole={handleUpdateMemberRole}
              onRemoveMember={handleRemoveMember}
            />
          </OffCanvas>
        )}
        <main className="app__main" id="main-content">
          {!isDesktop && (
            <header className="mobile-header" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
                            <button
                type="button"
                className="mobile-header__nav"
                onClick={() => setIsSidebarOpen(true)}
                aria-controls="mobile-navigation-title"
                aria-expanded={isSidebarOpen}
              >
                <span className="mobile-header__icon" aria-hidden="true">
                  <span className="mobile-header__icon-line" />
                  <span className="mobile-header__icon-line" />
                  <span className="mobile-header__icon-line" />
                </span>
                <span className="mobile-header__label">Menu</span>
              </button>
              <div className="mobile-header__project">
                <strong>{selectedProject?.name ?? "Projects"}</strong>
                {selectedProject?.referenceId && (
                  <span>{selectedProject.referenceId}</span>
                )}
              </div>
            </header>
          )}
          {isDesktop ? (
            <>
              {accountBanner}
              {hasProjects ? (
                <>
                  <CalendarView
                    days={visibleDays}
                    selectedProjectId={selectedProjectId}
                    selectedDay={selectedDay}
                    currentUserId={session.user.id}
                    currentUserRole={currentProjectRole}
                    memberDirectory={memberDirectory}
                    onAddFile={handleAddFile}
                    onRemoveFile={handleRemoveFile}
                    onCreateNote={handleCreateNote}
                    onUpdateNote={handleUpdateNote}
                    onDeleteNote={handleDeleteNote}
                    onSelectDay={(date) => setSelectedDay(date)}
                  />
                  <GanttChart
                    tasks={visibleTasks}
                    projects={projects}
                    selectedProjectId={selectedProjectId}
                    canManageTasks={canManageTasks}
                    onCreateTask={handleCreateTask}
                    onUpdateTask={handleUpdateTask}
                    onDeleteTask={handleDeleteTask}
                  />
                  <ChangeOrdersView
                    project={selectedProject}
                    clientProfile={clientProfileForSelectedProject}
                    clientContacts={clientContactsForSelectedProject}
                    changeOrders={changeOrdersForSelectedProject}
                    canEditClientProfile={canEditClientProfile}
                    canSubmitChangeOrders={canSubmitChangeOrders}
                    canReviewChangeOrders={canReviewChangeOrders}
                    onSaveClientProfile={handleSaveClientProfile}
                    onDeleteClientProfile={handleDeleteClientProfile}
                    onCreateClientContact={handleCreateClientContact}
                    onUpdateClientContact={handleUpdateClientContact}
                    onDeleteClientContact={handleDeleteClientContact}
                    onCreateChangeOrder={handleCreateChangeOrder}
                    onSendChangeOrder={handleSendChangeOrder}
                    onDeleteChangeOrder={handleDeleteChangeOrder}
                    onUpdateChangeOrderStatus={handleUpdateChangeOrderStatus}
                  />
                </>
              ) : (
                emptyState
              )}
            </>
          ) : (
            renderMobileTab(activeMobileTab)
          )}
        </main>
      </div>
      {!isDesktop && (
        <BottomTabs
          activeTab={activeMobileTab}
          onChange={setActiveMobileTab}
          onCompose={handleOpenComposer}
        />
      )}
      <footer className="app__footer" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}>
        &copy; {currentYear} Cereb Fast Think Tank. All rights reserved.
      </footer>
      <OnboardingTour isOpen={isTourOpen} onRequestClose={handleTourRequestClose} />
    </div>
  );
}

export default App;



