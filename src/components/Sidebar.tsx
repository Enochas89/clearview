import { useCallback, useEffect, useMemo, useState } from "react";
import { InviteMemberResult, Project, ProjectMember } from "../types";
import logo from "../assets/logo.png";
import ProjectMembersPanel from "./ProjectMembersPanel";
import ProjectFormCard from "../features/sidebar/ProjectFormCard";
import {
  defaultProjectFormValues,
  projectFormHasContent,
  mapProjectToFormValues,
  ProjectFormValues,
} from "../features/sidebar/projectForm";

type SidebarProps = {
  projects: Project[];
  selectedProjectId: string | null;
  members: ProjectMember[];
  currentUserId: string;
  currentUserEmail: string | null;
  memberInviteFallback?: boolean;
  onSelectProject: (projectId: string) => void;
  onCreateProject: (input: ProjectFormValues) => Promise<void> | void;
  onUpdateProject: (projectId: string, input: ProjectFormValues) => Promise<void> | void;
  onDeleteProject: (projectId: string) => Promise<void> | void;
  onInviteMember: (input: {
    projectId: string;
    email: string;
    role: "owner" | "editor" | "viewer";
    name: string;
  }) => Promise<InviteMemberResult | undefined>;
  onUpdateMemberRole: (memberId: string, role: "owner" | "editor" | "viewer") => Promise<void> | void;
  onRemoveMember: (memberId: string) => Promise<void> | void;
  onSignOut: () => void;
};

const PROJECT_FORM_DRAFT_KEY = "projectFormDraft";
const Sidebar = ({
  projects,
  selectedProjectId,
  members,
  currentUserId,
  currentUserEmail,
  memberInviteFallback = false,
  onSelectProject,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onInviteMember,
  onUpdateMemberRole,
  onRemoveMember,
  onSignOut,
}: SidebarProps) => {
  const writeStoredProjectForm = (value: ProjectFormValues) => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(PROJECT_FORM_DRAFT_KEY, JSON.stringify(value));
    } catch (error) {
      console.error("Error saving project draft:", error);
    }
  };

  const clearStoredProjectForm = () => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.removeItem(PROJECT_FORM_DRAFT_KEY);
    } catch (error) {
      console.error("Error clearing project draft:", error);
    }
  };

  const readStoredProjectForm = (): ProjectFormValues | null => {
    if (typeof window === "undefined") {
      return null;
    }
    try {
      const raw = window.localStorage.getItem(PROJECT_FORM_DRAFT_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return null;
      }
      return {
        ...defaultProjectFormValues,
        ...parsed,
      };
    } catch (error) {
      console.error("Error reading project draft:", error);
      return null;
    }
  };

  const initialProjectFormDraft = useMemo(() => readStoredProjectForm(), []);

  const [projectFormDefaults, setProjectFormDefaults] = useState<ProjectFormValues>(
    () => initialProjectFormDraft ?? defaultProjectFormValues,
  );
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [isProjectFormOpen, setIsProjectFormOpen] = useState(() => Boolean(initialProjectFormDraft));
  const [isMembersPanelOpen, setIsMembersPanelOpen] = useState(false);
  const memberCount = members.length;

  useEffect(() => {
    if (!selectedProjectId) {
      setIsMembersPanelOpen(false);
    }
  }, [selectedProjectId]);

  const closeProjectForm = () => {
    setIsProjectFormOpen(false);
    setEditingProjectId(null);
  };

  const finalizeProjectFormSubmission = () => {
    clearStoredProjectForm();
    setProjectFormDefaults(defaultProjectFormValues);
    setEditingProjectId(null);
    setIsProjectFormOpen(false);
  };

  const handleProjectButtonClick = () => {
    if (isProjectFormOpen || editingProjectId) {
      closeProjectForm();
      return;
    }
    const storedDraft = readStoredProjectForm();
    setProjectFormDefaults(storedDraft ?? defaultProjectFormValues);
    setEditingProjectId(null);
    setIsProjectFormOpen(true);
  };

  const handleProjectSubmit = useCallback(
    async (values: ProjectFormValues) => {
      if (editingProjectId) {
        await Promise.resolve(onUpdateProject(editingProjectId, values));
      } else {
        await Promise.resolve(onCreateProject(values));
      }
      finalizeProjectFormSubmission();
    },
    [editingProjectId, onCreateProject, onUpdateProject],
  );

  const handleProjectDelete = useCallback(async () => {
    if (!editingProjectId) {
      return;
    }
    try {
      await Promise.resolve(onDeleteProject(editingProjectId));
      finalizeProjectFormSubmission();
    } catch (error) {
      // Notification already handled upstream
      throw error;
    }
  }, [editingProjectId, onDeleteProject, finalizeProjectFormSubmission]);

  const handleDraftChange = useCallback(
    (draft: ProjectFormValues) => {
      if (editingProjectId) {
        return;
      }
      if (projectFormHasContent(draft)) {
        writeStoredProjectForm(draft);
      } else {
        clearStoredProjectForm();
      }
    },
    [editingProjectId],
  );

  const beginProjectEdit = (project: Project) => {
    setProjectFormDefaults(mapProjectToFormValues(project));
    setEditingProjectId(project.id);
    setIsProjectFormOpen(true);
  };

  return (
    <aside className="sidebar">
      <header className="sidebar__header">
        <div className="sidebar__brand">
          <img src={logo} alt="Clear View" className="sidebar__brand-mark" />
          <div>
            <h1 className="sidebar__title">Clear View</h1>
            <p className="sidebar__subtitle">Built by Project Managers for Project Managers</p>
          </div>
        </div>
      </header>

      <section className="sidebar__section sidebar__section--projects">
        <div className="sidebar__section-header">
          <div>
            <h2>Projects</h2>
            <p className="sidebar__section-subtitle">Stay aligned on every initiative.If it touches the project own the outcome!</p>
          </div>
          <div className="sidebar__section-actions">
            <span className="sidebar__count">{projects.length}</span>
            <button type="button" className="sidebar__action" onClick={handleProjectButtonClick}>
              {editingProjectId ? "Close editor" : isProjectFormOpen ? "Hide form" : "New project"}
            </button>
          </div>
        </div>
        <div className="sidebar__list">
          {projects.map((project) => (
            <div
              key={project.id}
              className={
                project.id === selectedProjectId
                  ? "sidebar__project sidebar__project--active"
                  : "sidebar__project"
              }
            >
              <button
                type="button"
                className="sidebar__project-main"
                onClick={() => onSelectProject(project.id)}
              >
                <span className="sidebar__project-color" style={{ backgroundColor: project.color }} />
                <span>
                  <strong>{project.name}</strong>
                  <small>{project.referenceId} - {project.projectManager}</small>
                  <small>{project.address}</small>
                  <small>Cost: {project.cost}</small>
                </span>
              </button>
              <button type="button" className="sidebar__muted" onClick={() => beginProjectEdit(project)}>
                Edit
              </button>
            </div>
          ))}
          {projects.length === 0 && <div className="sidebar__empty">Create your first project to get started.</div>}
        </div>
        {isProjectFormOpen && (
          <ProjectFormCard
            initialValues={projectFormDefaults}
            isEditing={Boolean(editingProjectId)}
            onSubmit={handleProjectSubmit}
            onDelete={editingProjectId ? handleProjectDelete : undefined}
            onCancel={closeProjectForm}
            onDraftChange={!editingProjectId ? handleDraftChange : undefined}
          />
        )}
      </section>

      {selectedProjectId && (
        <section className="sidebar__section sidebar__members-panel">
          <div className="sidebar__section-header">
            <div>
              <h2>Team</h2>
              <p className="sidebar__section-subtitle">Invite collaborators to this project.</p>
            </div>
            <div className="sidebar__section-actions">
              <span className="sidebar__count">{memberCount}</span>
              <button
                type="button"
                className="sidebar__action"
                onClick={() => setIsMembersPanelOpen((prev) => !prev)}
              >
                {isMembersPanelOpen ? "Hide team" : "Manage team"}
              </button>
            </div>
          </div>
          {isMembersPanelOpen && (
            <ProjectMembersPanel
              projectId={selectedProjectId}
              members={members}
              currentUserId={currentUserId}
              currentUserEmail={currentUserEmail}
              allowInviteFallback={memberInviteFallback}
              onInvite={onInviteMember}
              onUpdateRole={onUpdateMemberRole}
              onRemoveMember={onRemoveMember}
            />
          )}
        </section>
      )}

      <div className="sidebar__section">
        <button type="button" className="sidebar__action" onClick={onSignOut}>
          Sign Out
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
