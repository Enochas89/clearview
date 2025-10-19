import { FormEvent, useEffect, useState } from "react";
import { Project } from "../types";
import logo from '../assets/logo.png';

type ProjectFormState = Omit<Project, "id" | "createdAt">;

type SidebarProps = {
  projects: Project[];
  selectedProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  onCreateProject: (input: ProjectFormState) => void;
  onUpdateProject: (projectId: string, input: ProjectFormState) => void;
  onDeleteProject: (projectId: string) => void;
  onSignOut: () => void;
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

const PROJECT_FORM_DRAFT_KEY = "projectFormDraft";
const Sidebar = ({
  projects,
  selectedProjectId,
  onSelectProject,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onSignOut,
}: SidebarProps) => {
  const readStoredProjectForm = (): ProjectFormState | null => {
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
        ...emptyProjectForm,
        ...parsed,
      };
    } catch (error) {
      console.error("Error reading project draft:", error);
      return null;
    }
  };
  const [projectForm, setProjectForm] = useState<ProjectFormState>(() => readStoredProjectForm() ?? emptyProjectForm);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [isProjectFormOpen, setIsProjectFormOpen] = useState(false);

  useEffect(() => {
    if (!isProjectFormOpen || editingProjectId) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(PROJECT_FORM_DRAFT_KEY, JSON.stringify(projectForm));
    } catch (error) {
      console.error("Error saving project draft:", error);
    }
  }, [projectForm, isProjectFormOpen, editingProjectId]);

  const resetProjectForm = () => {
    setProjectForm(emptyProjectForm);
    setEditingProjectId(null);
  };

  const closeProjectForm = () => {
    resetProjectForm();
    setIsProjectFormOpen(false);
  };

  const handleProjectButtonClick = () => {
    if (isProjectFormOpen || editingProjectId) {
      closeProjectForm();
    } else {
      resetProjectForm();
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
                    if (editingProjectId) {
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

      <div className="sidebar__section">
        <button type="button" className="sidebar__action" onClick={onSignOut}>
          Sign Out
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
