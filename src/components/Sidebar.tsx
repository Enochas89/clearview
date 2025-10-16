import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { InviteMemberResult, MemberRole, Project, ProjectMember } from "../types";
import logo from "../assets/logo.png";
import ProjectMembersPanel from "./ProjectMembersPanel";

type ProjectFormState = Omit<Project, "id" | "createdAt" | "userId">;

type SidebarProps = {
  projects: Project[];
  selectedProjectId: string | null;
  members: ProjectMember[];
  currentUserId: string;
  currentUserEmail: string | null;
  memberInviteFallback: boolean;
  onSelectProject: (projectId: string) => void;
  onCreateProject: (input: ProjectFormState) => void;
  onUpdateProject: (projectId: string, input: ProjectFormState) => void;
  onDeleteProject: (projectId: string) => void;
  onInviteMember: (input: { projectId: string; email: string; role: MemberRole; name: string }) => Promise<InviteMemberResult | undefined>;
  onUpdateMemberRole: (memberId: string, role: MemberRole) => Promise<void> | void;
  onRemoveMember: (memberId: string) => Promise<void> | void;
};

const emptyProjectForm: ProjectFormState = {
  name: "",
  description: "",
  color: "#2563eb",
  referenceId: "",
  cost: "",
  address: "",
  projectManager: "",
  startDate: "",
  dueDate: "",
};

const PROJECT_FORM_STORAGE_KEY = "clearview:sidebar:projectForm";
const PROJECT_FORM_OPEN_KEY = "clearview:sidebar:projectFormOpen";
const PROJECT_FORM_EDITING_KEY = "clearview:sidebar:editingProjectId";

type PersistedProjectFormState = {
  form: ProjectFormState;
  editingId: string | null;
  isOpen: boolean;
};

const readProjectFormStateFromSession = (): PersistedProjectFormState => {
  if (typeof window === "undefined") {
    return { form: emptyProjectForm, editingId: null, isOpen: false };
  }

  try {
    const formRaw = window.sessionStorage.getItem(PROJECT_FORM_STORAGE_KEY);
    const editingRaw = window.sessionStorage.getItem(PROJECT_FORM_EDITING_KEY);
    const openRaw = window.sessionStorage.getItem(PROJECT_FORM_OPEN_KEY);

    const sanitizedForm: ProjectFormState = { ...emptyProjectForm };

    if (formRaw) {
      const parsed = JSON.parse(formRaw) as Record<string, unknown>;
      (Object.keys(sanitizedForm) as (keyof ProjectFormState)[]).forEach((key) => {
        const value = parsed[key];
        if (typeof value === "string") {
          sanitizedForm[key] = value;
        }
      });
    }

    const editingId = editingRaw && editingRaw.length > 0 ? editingRaw : null;
    const isOpen = openRaw === "true" || Boolean(editingId);

    return { form: sanitizedForm, editingId, isOpen };
  } catch {
    return { form: emptyProjectForm, editingId: null, isOpen: false };
  }
};

const Sidebar = ({
  projects,
  selectedProjectId,
  members,
  currentUserId,
  currentUserEmail,
  memberInviteFallback,
  onSelectProject,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onInviteMember,
  onUpdateMemberRole,
  onRemoveMember,
}: SidebarProps) => {
  const persistedFormState = useMemo(() => readProjectFormStateFromSession(), []);
  const [projectForm, setProjectForm] = useState<ProjectFormState>(persistedFormState.form);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(persistedFormState.editingId);
  const [isProjectFormOpen, setIsProjectFormOpen] = useState(persistedFormState.isOpen);

  const clearPersistedProjectForm = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.sessionStorage.removeItem(PROJECT_FORM_STORAGE_KEY);
      window.sessionStorage.removeItem(PROJECT_FORM_OPEN_KEY);
      window.sessionStorage.removeItem(PROJECT_FORM_EDITING_KEY);
    } catch {
      // Ignore storage unavailability.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!isProjectFormOpen) {
      clearPersistedProjectForm();
      return;
    }

    try {
      window.sessionStorage.setItem(PROJECT_FORM_STORAGE_KEY, JSON.stringify(projectForm));
      window.sessionStorage.setItem(PROJECT_FORM_OPEN_KEY, "true");
      if (editingProjectId) {
        window.sessionStorage.setItem(PROJECT_FORM_EDITING_KEY, editingProjectId);
      } else {
        window.sessionStorage.removeItem(PROJECT_FORM_EDITING_KEY);
      }
    } catch {
      // Ignore storage write failures.
    }
  }, [projectForm, isProjectFormOpen, editingProjectId, clearPersistedProjectForm]);

  useEffect(() => {
    if (!editingProjectId) {
      return;
    }

    const projectExists = projects.some((project) => project.id === editingProjectId);
    if (projectExists) {
      return;
    }

    setEditingProjectId(null);
    setProjectForm(emptyProjectForm);
    setIsProjectFormOpen(false);
    clearPersistedProjectForm();
  }, [projects, editingProjectId, clearPersistedProjectForm]);

  useEffect(() => {
    const { form, editingId, isOpen } = readProjectFormStateFromSession();
    setProjectForm(form);
    setEditingProjectId(editingId);
    setIsProjectFormOpen(isOpen);
  }, []);

  const resetProjectForm = useCallback(() => {
    setProjectForm(emptyProjectForm);
    setEditingProjectId(null);
    clearPersistedProjectForm();
  }, [clearPersistedProjectForm]);

  const closeProjectForm = useCallback(() => {
    resetProjectForm();
    setIsProjectFormOpen(false);
  }, [resetProjectForm]);

  const handleProjectButtonClick = () => {
    if (editingProjectId || isProjectFormOpen) {
      closeProjectForm();
    } else {
      setIsProjectFormOpen(true);
    }
  };

  const handleProjectSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !projectForm.name.trim() ||
      !projectForm.referenceId.trim() ||
      !projectForm.address.trim() ||
      !projectForm.projectManager.trim() ||
      !projectForm.cost.trim() ||
      !projectForm.startDate.trim() ||
      !projectForm.dueDate.trim()
    ) {
      return;
    }

    if (editingProjectId) {
      onUpdateProject(editingProjectId, projectForm);
    } else {
      onCreateProject(projectForm);
    }

    closeProjectForm();
  };

  const beginProjectEdit = (project: Project) => {
    setProjectForm({
      name: project.name,
      description: project.description,
      color: project.color,
      referenceId: project.referenceId,
      cost: project.cost,
      address: project.address,
      projectManager: project.projectManager,
      startDate: project.startDate,
      dueDate: project.dueDate,
    });
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
            <p className="sidebar__section-subtitle" style={{ fontStyle: 'italic', color: '#6b7280' }}>If it touches the project own the outcome!</p>
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
              className={`sidebar__project${selectedProjectId === project.id ? " sidebar__project--active" : ""}`}
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
        {selectedProjectId && (
          <div className="sidebar__members-panel">
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
          </div>
        )}
        {isProjectFormOpen && (
          <form className="sidebar__form sidebar__form--card" onSubmit={handleProjectSubmit}>
            <h3>{editingProjectId ? "Edit project" : "Add project"}</h3>
            <label>
              Project ID
              <input
                type="text"
                value={projectForm.referenceId}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, referenceId: event.target.value }))}
                placeholder="PRJ-1000"
                required
              />
            </label>
            <label>
              Name
              <input
                type="text"
                value={projectForm.name}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Project name"
                required
              />
            </label>
            <label>
              Description
              <input
                type="text"
                value={projectForm.description}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="What are we building?"
              />
            </label>
            <label>
              Address
              <input
                type="text"
                value={projectForm.address}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, address: event.target.value }))}
                placeholder="123 Main Street, City, State"
                required
              />
            </label>
            <label>
              Project Manager
              <input
                type="text"
                value={projectForm.projectManager}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, projectManager: event.target.value }))}
                placeholder="Who is leading this?"
                required
              />
            </label>
            <div className="sidebar__form-grid">
              <label>
                Start Date
                <input
                  type="date"
                  value={projectForm.startDate}
                  onChange={(event) => setProjectForm((prev) => ({ ...prev, startDate: event.target.value }))}
                  required
                />
              </label>
              <label>
                Due Date
                <input
                  type="date"
                  value={projectForm.dueDate}
                  onChange={(event) => setProjectForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                  required
                />
              </label>
              <label>
                Cost
                <input
                  type="text"
                  value={projectForm.cost}
                  onChange={(event) => setProjectForm((prev) => ({ ...prev, cost: event.target.value }))}
                  placeholder="$10,000"
                  required
                />
              </label>
              <label>
                Accent color
                <input
                  type="color"
                  value={projectForm.color}
                  onChange={(event) => setProjectForm((prev) => ({ ...prev, color: event.target.value }))}
                />
              </label>
            </div>
            <div className="sidebar__form-actions">
              {editingProjectId && (
                <button
                  type="button"
                  className="sidebar__danger"
                  onClick={() => {
                    if (editingProjectId && window.confirm("Are you sure you want to delete this project?")) {
                      onDeleteProject(editingProjectId);
                      closeProjectForm();
                    }
                  }}
                >
                  Delete project
                </button>
              )}
              <button type="submit" className="sidebar__primary">
                {editingProjectId ? "Save changes" : "Create project"}
              </button>
            </div>
          </form>
        )}
      </section>
    </aside>
  );
};

export default Sidebar;
