import { useCallback, useMemo } from "react";
import SidebarPanel from "../features/sidebar/SidebarPanel";
import { WorkspaceTabs, WorkspaceTab } from "./WorkspaceTabs";
import { useWorkspace } from "../workspace/WorkspaceContext";
import type { DayActivity } from "../types";
import logo from "../assets/logo.png";

type WorkspaceLayoutProps = {
  activeTab: WorkspaceTab;
  children: React.ReactNode;
};

const formatDueDate = (isoDate?: string | null) => {
  if (!isoDate) {
    return "No due date";
  }
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return "No due date";
  }
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};

const formatActivity = (activity: DayActivity) => {
  const date = new Date(activity.createdAt);
  const time = Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
  return {
    title: activity.title,
    time,
    type: activity.type,
  };
};

export const WorkspaceLayout = ({ activeTab, children }: WorkspaceLayoutProps) => {
  const {
    navigateTab,
    session,
    projects,
    selectedProjectId,
    recentActivities,
    upcomingDueTasks,
    handleSignOut,
    projectMembers,
  } = useWorkspace();

  const user = session?.user ?? null;
  const displayName =
    user?.user_metadata?.full_name?.trim() ||
    user?.email ||
    "Your profile";

  const avatarInitial =
    displayName && displayName.length > 0 ? displayName.charAt(0).toUpperCase() : "U";

  const activeProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const visibleActivities = useMemo(
    () => recentActivities.slice(0, 6).map(formatActivity),
    [recentActivities],
  );

  const visibleMembers = useMemo(() => {
    if (!selectedProjectId) {
      return [];
    }
    return projectMembers
      .filter((member) => member.projectId === selectedProjectId)
      .slice(0, 8);
  }, [projectMembers, selectedProjectId]);

  const handleOpenNewProject = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.dispatchEvent(new Event("cv:open-new-project"));
  }, []);

  return (
    <div className="app-shell">
      <header className="social-header">
        <div className="social-header__brand">
          <img src={logo} alt="Clear View Teams logo" className="social-header__logo" />
          <div className="social-header__text">
            <span className="social-header__title">Clear View Teams</span>
            <span className="social-header__subtitle">Collaborate with your crew</span>
          </div>
        </div>
        <div className="social-header__search">
          <input
            type="search"
            placeholder="Search updates, people, or projects"
            aria-label="Search workspace"
          />
        </div>
        <div className="social-header__actions">
          <button
            type="button"
            className="social-header__secondary"
            onClick={() => handleSignOut()}
          >
            Sign out
          </button>
        </div>
      </header>
      <div className="social-layout">
        <aside className="social-sidebar">
          <section className="social-profile-card" aria-label="Your profile">
            <div className="social-profile-card__avatar" aria-hidden="true">
              {avatarInitial}
            </div>
            <div className="social-profile-card__meta">
              <span className="social-profile-card__label">Logged in as</span>
              <span className="social-profile-card__name">{displayName}</span>
            </div>
          </section>

          <section aria-label="Workspace navigation">
            <div className="workspace-tabs">
              <WorkspaceTabs activeTab={activeTab} onSelect={navigateTab} />
              <button
                type="button"
                className="app__tab app__tab--cta"
                onClick={handleOpenNewProject}
              >
                + New Project
              </button>
            </div>
          </section>

          <section className="social-sidebar__manager" aria-label="Project manager">
            <header className="social-sidebar__manager-header">
              <h2>Your projects</h2>
              <p>Select, edit, or join the projects assigned to you.</p>
            </header>
            <SidebarPanel />
          </section>
        </aside>

        <main className="app__main social-main" aria-live="polite">
          {children}
        </main>

        <aside className="social-activity" aria-label="Workspace highlights">
          <section className="social-card">
            <header className="social-card__header">
              <h3>Upcoming milestones</h3>
              {activeProject?.dueDate && (
                <span className="social-card__badge">
                  Due {formatDueDate(activeProject.dueDate)}
                </span>
              )}
            </header>
            {upcomingDueTasks.length === 0 ? (
              <p className="social-card__empty">No deadlines on the horizon.</p>
            ) : (
              <ul className="social-card__list">
                {upcomingDueTasks.slice(0, 5).map((task) => (
                  <li key={task.id}>
                    <span className="social-card__item-title">{task.name}</span>
                    <span className="social-card__item-meta">
                      Due in {task.daysUntilDue} day{task.daysUntilDue === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="social-card">
            <header className="social-card__header">
              <h3>Recent activity</h3>
            </header>
            {visibleActivities.length === 0 ? (
              <p className="social-card__empty">Nothing new yet.</p>
            ) : (
              <ul className="social-card__list social-card__list--dense">
                {visibleActivities.map((activity, index) => (
                  <li key={`${activity.title}-${index}`}>
                    <span className={`social-card__pill social-card__pill--${activity.type}`}>
                      {activity.type === "post" ? "Post" : "File"}
                    </span>
                    <div className="social-card__item">
                      <span className="social-card__item-title">{activity.title}</span>
                      {activity.time && (
                        <span className="social-card__item-meta">{activity.time}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="social-card">
            <header className="social-card__header">
              <h3>Project team</h3>
            </header>
            {visibleMembers.length === 0 ? (
              <p className="social-card__empty">Invite teammates to collaborate.</p>
            ) : (
              <ul className="social-card__avatars">
                {visibleMembers.map((member) => {
                  const name = member.fullName || member.email || "Member";
                  return (
                    <li key={member.id} className="social-card__avatar" title={name}>
                      {name.charAt(0).toUpperCase()}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
};
