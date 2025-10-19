import {
  ChangeEvent,
  CSSProperties,
  FormEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
} from "react";
import { Project, Task, TaskStatus } from "../types";

type TaskFormState = {
  projectId: string;
  name: string;
  description: string;
  startDate: string;
  dueDate: string;
  status: TaskStatus;
  dependencies: string[];
};

type GanttChartProps = {
  projects: Project[];
  tasks: Task[];
  selectedProjectId: string | null;
  onCreateTask: (input: TaskFormState) => void;
  onUpdateTask: (taskId: string, input: TaskFormState) => void;
};

const DAY_MS = 86_400_000;
const DEFAULT_DAY_WIDTH = 72;
const LABEL_WIDTH = 200;
const MIN_TIMELINE_DAYS = 14;
const TIMELINE_BUFFER_DAYS = 3;
type StatusFilter = "all" | TaskStatus;
const STATUS_PROGRESS: Record<TaskStatus, number> = {
  todo: 0,
  "in-progress": 50,
  done: 100,
};

const parseISODate = (value: string) => new Date(`${value}T00:00:00`);

const differenceInDays = (start: Date, end: Date) => Math.round((end.getTime() - start.getTime()) / DAY_MS);

const formatTimelineLabel = (date: Date) =>
  date.toLocaleDateString(undefined, { month: "short", day: "numeric" });

const toISODate = (date: Date) => {
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  return clone.toISOString().slice(0, 10);
};

const createDefaultTaskForm = (projectId: string): TaskFormState => {
  const today = new Date();
  const due = new Date(today);
  due.setDate(today.getDate() + 3);
  return {
    projectId,
    name: "",
    description: "",
    startDate: toISODate(today),
    dueDate: toISODate(due),
    status: "todo",
    dependencies: [],
  };
};

const GanttChart = ({ projects, tasks, selectedProjectId, onCreateTask, onUpdateTask: onUpdateTaskProp }: GanttChartProps) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dayWidth, setDayWidth] = useState(DEFAULT_DAY_WIDTH);
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [isUpdating, setIsUpdating] = useState(false);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const metrics = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let inProgress = 0;
    let done = 0;
    let milestones = 0;
    let overdue = 0;

    tasks.forEach((task) => {
      if (task.status === "in-progress") inProgress += 1;
      if (task.status === "done") done += 1;
      if ((task.dependencies?.length ?? 0) === 0) milestones += 1;
      const dueDate = parseISODate(task.dueDate);
      if (dueDate < today && task.status !== "done") {
        overdue += 1;
      }
    });

    return {
      total: tasks.length,
      inProgress,
      done,
      milestones,
      overdue,
    };
  }, [tasks]);

  const filteredTasks = useMemo(
    () => (statusFilter === "all" ? tasks : tasks.filter((task) => task.status === statusFilter)),
    [tasks, statusFilter],
  );

  const taskLookup = useMemo(() => {
    const map = new Map<string, Task>();
    tasks.forEach((task) => {
      map.set(task.id, task);
    });
    return map;
  }, [tasks]);

  useEffect(() => {
    if (!selectedTaskId) return;
    const exists = tasks.some((task) => task.id === selectedTaskId);
    if (!exists) {
      setSelectedTaskId("");
    }
  }, [tasks, selectedTaskId]);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );

  const filterOptions: Array<{ label: string; value: StatusFilter }> = [
    { label: "All tasks", value: "all" },
    { label: "Not started", value: "todo" },
    { label: "In progress", value: "in-progress" },
    { label: "Done", value: "done" },
  ];

  const handleDayWidthChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDayWidth(Number(event.target.value));
  };

  const handleTaskSelectChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedTaskId(event.target.value);
  };

  const onUpdateTask = useCallback((taskId: string, input: TaskFormState) => {
    setIsUpdating(true);
    onUpdateTaskProp(taskId, input);
  }, [onUpdateTaskProp]);

  useEffect(() => {
    if (isUpdating) {
      const timer = setTimeout(() => setIsUpdating(false), 1000); // Reset after 1 second
      return () => clearTimeout(timer);
    }
  }, [isUpdating]);

  const timeline = useMemo(() => {
    let timelineStart: Date;
    let timelineEnd: Date;
    if (selectedProject?.startDate && selectedProject?.dueDate) {
      timelineStart = parseISODate(selectedProject.startDate);
      timelineEnd = parseISODate(selectedProject.dueDate);
    } else if (tasks.length > 0) {
      timelineStart = tasks.reduce((earliest, task) => {
        const taskStart = parseISODate(task.startDate);
        return taskStart < earliest ? taskStart : earliest;
      }, parseISODate(tasks[0].startDate));

      timelineEnd = tasks.reduce((latest, task) => {
        const taskEnd = parseISODate(task.dueDate);
        return taskEnd > latest ? taskEnd : latest;
      }, parseISODate(tasks[0].dueDate));
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      timelineStart = today;
      timelineEnd = new Date(today.setDate(today.getDate() + 13)); // Default 14 days
    }

    const totalDays = Math.max(
      MIN_TIMELINE_DAYS,
      Math.max(0, differenceInDays(timelineStart, timelineEnd)) + TIMELINE_BUFFER_DAYS,
    );

    const days = Array.from({ length: totalDays }, (_, index) => {
      const date = new Date(timelineStart);
      date.setDate(timelineStart.getDate() + index);
      return date;
    });

    return {
      start: timelineStart,
      totalDays,
      days,
    };
  }, [tasks, selectedProject]);

  const rows = useMemo(() => {
    return filteredTasks
      .map((task) => {
        const start = parseISODate(task.startDate);
        const end = parseISODate(task.dueDate);
        const rawStartOffset = differenceInDays(timeline.start, start);
        const rawEndOffset = differenceInDays(timeline.start, end);

        if (rawEndOffset < 0 || rawStartOffset > timeline.totalDays - 1) {
          return null;
        }

        const startOffset = Math.max(0, rawStartOffset);
        const endOffset = Math.min(timeline.totalDays - 1, rawEndOffset);
        const duration = Math.max(1, endOffset - startOffset + 1);
        const project = projects.find((item) => item.id === task.projectId);
        const dependencyTasks = (task.dependencies ?? [])
          .map((depId) => taskLookup.get(depId))
          .filter((dep): dep is Task => Boolean(dep));

        return {
          task,
          startOffset,
          duration,
          project,
          dependencies: dependencyTasks,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
  }, [projects, filteredTasks, timeline, taskLookup]);

  const timelineWidth = useMemo(() => timeline.totalDays * dayWidth, [timeline.totalDays, dayWidth]);
  const totalWidth = useMemo(() => LABEL_WIDTH + timelineWidth, [timelineWidth]);

  const tableVars = useMemo(() => {
    const vars: CSSProperties & Record<string, string> = {
      width: `${totalWidth}px`,
      minWidth: `${totalWidth}px`,
    };
    vars["--gantt-label-width"] = `${LABEL_WIDTH}px`;
    vars["--gantt-day-width"] = `${dayWidth}px`;
    return vars;
  }, [totalWidth, dayWidth]);

  const gridColumnsStyle = useMemo(
    () =>
      ({
        gridTemplateColumns: `${LABEL_WIDTH}px repeat(${timeline.totalDays}, ${dayWidth}px)`,
        width: `${totalWidth}px`,
        minWidth: `${totalWidth}px`,
      }) as CSSProperties,
    [timeline.totalDays, totalWidth, dayWidth],
  );

  const trackStyle = useMemo(
    () =>
      ({
        gridTemplateColumns: `repeat(${timeline.totalDays}, ${dayWidth}px)`,
        width: `${timelineWidth}px`,
        minWidth: `${timelineWidth}px`,
      }) as CSSProperties,
    [timeline.totalDays, timelineWidth, dayWidth],
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheel = (event: globalThis.WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
        return;
      }
      event.preventDefault();
      viewport.scrollLeft += event.deltaY;
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      viewport.removeEventListener("wheel", handleWheel);
    };
  }, []);

  const hasRows = rows.length > 0;

  const resolveDefaultProjectId = () => selectedProjectId ?? (projects[0]?.id ?? "");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState<TaskFormState>(() => createDefaultTaskForm(resolveDefaultProjectId()));

  const openCreateModal = () => {
    const defaultProject = resolveDefaultProjectId();
    setTaskForm(createDefaultTaskForm(defaultProject));
    setEditingTaskId(null);
    setIsModalOpen(true);
  };

  const openEditModal = (task: Task) => {
    setTaskForm({
      projectId: task.projectId,
      name: task.name,
      description: task.description,
      startDate: task.startDate,
      dueDate: task.dueDate,
      status: task.status,
      dependencies: task.dependencies || [],
    });
    setEditingTaskId(task.id);
    setIsModalOpen(true);
  };

  const handleEditSelectedTask = () => {
    if (selectedTask) {
      openEditModal(selectedTask);
    }
  };

  const { total, inProgress, done, milestones, overdue } = metrics;
  const projectTitle = selectedProject?.name ?? "Project timeline";
  const trimmedDescription = selectedProject?.description?.trim();
  const projectSubtitle =
    trimmedDescription && trimmedDescription.length > 0
      ? trimmedDescription
      : "A native React Gantt chart implementation.";
  const canEditSelectedTask = Boolean(selectedTask);
  const viewportStyle = useMemo(
    () =>
      ({
        "--gantt-day-width": `${dayWidth}px`,
      }) as CSSProperties,
    [dayWidth],
  );

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const handleTaskSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!taskForm.projectId || !taskForm.name.trim() || !taskForm.startDate || !taskForm.dueDate) {
      return;
    }

    if (editingTaskId) {
      onUpdateTask(editingTaskId, taskForm);
    } else {
      onCreateTask(taskForm);
    }
    setIsModalOpen(false);
  };

  const handleDependencyChange = (selectedOptions: HTMLCollectionOf<HTMLOptionElement>) => {
    const dependencies = Array.from(selectedOptions).map(option => option.value);
    setTaskForm(prev => ({ ...prev, dependencies }));
  };

  useEffect(() => {
    if (isUpdating) return;
    if (taskForm.dependencies.length > 0) {
      const latestDependencyDueDate = taskForm.dependencies.reduce((latestDate, depId) => {
        const dependency = tasks.find(task => task.id === depId);
        if (dependency) {
          const depDueDate = parseISODate(dependency.dueDate);
          if (depDueDate > latestDate) {
            return depDueDate;
          }
        }
        return latestDate;
      }, new Date(0));

      if (latestDependencyDueDate > new Date(0)) {
        const newStartDate = new Date(latestDependencyDueDate);
        newStartDate.setDate(newStartDate.getDate() + 1);
        setTaskForm(prev => ({ ...prev, startDate: toISODate(newStartDate) }));
      }
    }
  }, [taskForm.dependencies, tasks, isUpdating]);

  return (
    <section className="gantt">
      <header className="gantt__header">
        <div className="gantt__title">
          <h2>{projectTitle}</h2>
          <p>{projectSubtitle}</p>
        </div>
        <div className="gantt__metrics">
          <div className="gantt__metric">
            <span>Total</span>
            <strong>{total}</strong>
          </div>
          <div className="gantt__metric">
            <span>In progress</span>
            <strong>{inProgress}</strong>
          </div>
          <div className="gantt__metric">
            <span>Done</span>
            <strong>{done}</strong>
          </div>
          <div className="gantt__metric">
            <span>Milestones</span>
            <strong>{milestones}</strong>
          </div>
          <div className={`gantt__metric${overdue > 0 ? " gantt__metric--alert" : ""}`}>
            <span>Overdue</span>
            <strong>{overdue}</strong>
          </div>
        </div>
      </header>

      <div className="gantt__controls">
        <div className="gantt__filters">
          {filterOptions.map(({ label, value }) => (
            <button
              key={value}
              type="button"
              className={`gantt__chip${statusFilter === value ? " is-active" : ""}`}
              aria-pressed={statusFilter === value}
              onClick={() => setStatusFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="gantt__actions">
          <label className="gantt__slider">
            <span>Day width</span>
            <input
              type="range"
              min={48}
              max={128}
              step={4}
              value={dayWidth}
              onChange={handleDayWidthChange}
            />
          </label>
          <div className="gantt__select-group">
            <select value={selectedTaskId} onChange={handleTaskSelectChange}>
              <option value="">Select a task...</option>
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.name}
                </option>
              ))}
            </select>
            <button type="button" onClick={handleEditSelectedTask} disabled={!canEditSelectedTask}>
              Edit
            </button>
            <button type="button" className="danger" disabled>
              Delete
            </button>
          </div>
          <button
            type="button"
            className="gantt__primary"
            onClick={openCreateModal}
            disabled={projects.length === 0}
          >
            New task
          </button>
        </div>
      </div>

      <div className="gantt__viewport" ref={viewportRef} style={viewportStyle}>
        <div className="gantt__table" style={tableVars}>
          <div className="gantt__table-header" style={gridColumnsStyle}>
            <div className="gantt__head-label">Task</div>
            {timeline.days.map((date) => (
              <div key={date.toISOString()} className="gantt__head-day">
                {formatTimelineLabel(date)}
              </div>
            ))}
          </div>
          <div className="gantt__table-body" style={{ position: "relative" }}>
            {hasRows ? (
              rows.map(({ task, startOffset, duration, project, dependencies }) => {
                const progress = STATUS_PROGRESS[task.status] ?? 0;
                const progressLabel = `${progress}%`;
                return (
                  <div key={task.id} className="gantt__table-row" style={gridColumnsStyle}>
                    <div className="gantt__row-label">
                      <strong>{task.name}</strong>
                      <small>{project?.name ?? "Unassigned"}</small>
                      {dependencies.length > 0 ? (
                        <div className="gantt__row-dependencies">
                          <span>Depends on</span>
                          <div className="gantt__dependency-list">
                            {dependencies.map((dependency) => (
                              <span key={dependency.id} className="gantt__dependency-badge">
                                {dependency.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="gantt__row-dependencies gantt__row-dependencies--empty">
                          <span>No dependencies</span>
                        </div>
                      )}
                    </div>
                    <div className="gantt__row-track" style={trackStyle}>
                      <div
                        className={`gantt__bar gantt__bar--${task.status}`}
                        style={{ gridColumn: `${startOffset + 1} / span ${duration}` }}
                      >
                        <div className="gantt__bar-progress" style={{ width: `${progress}%` }} />
                        <div className="gantt__bar-content">
                          <span>{task.name}</span>
                          <span>{progressLabel}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="gantt__table-empty" style={{ width: `${totalWidth}px` }}>
                Create tasks to populate the timeline.
              </div>
            )}
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="modal">
          <div className="modal__backdrop" onClick={closeModal} />
          <div className="modal__dialog" role="dialog" aria-modal="true">
            <form className="modal__form" onSubmit={handleTaskSubmit}>
              <header className="modal__header">
                <h3>{editingTaskId ? "Edit task" : "Add task"}</h3>
                <button type="button" className="modal__close" onClick={closeModal} aria-label="Close task form">
                  ×
                </button>
              </header>
              <label>
                Project
                <select
                  value={taskForm.projectId}
                  onChange={(event) => setTaskForm((prev) => ({ ...prev, projectId: event.target.value }))}
                  required
                >
                  <option value="" disabled>
                    Select a project
                  </option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Name
                <input
                  type="text"
                  value={taskForm.name}
                  onChange={(event) => setTaskForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Task title"
                  required
                />
              </label>
              <label>
                Description
                <textarea
                  value={taskForm.description}
                  onChange={(event) => setTaskForm((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Task details"
                  rows={3}
                />
              </label>
              <div className="modal__grid">
                <label>
                  Start
                  <input
                    type="date"
                    value={taskForm.startDate}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, startDate: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Due
                  <input
                    type="date"
                    value={taskForm.dueDate}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                    required
                  />
                </label>
              </div>
              <label>
                Status
                <select
                  value={taskForm.status}
                  onChange={(event) => setTaskForm((prev) => ({ ...prev, status: event.target.value as TaskStatus }))}
                >
                  <option value="todo">To do</option>
                  <option value="in-progress">In progress</option>
                  <option value="done">Done</option>
                </select>
              </label>
              <label>
                Dependencies
                <select
                  multiple
                  value={taskForm.dependencies}
                  onChange={(e) => handleDependencyChange(e.target.selectedOptions)}
                >
                  {tasks
                    .filter((task) => task.projectId === taskForm.projectId && task.id !== editingTaskId)
                    .map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.name}
                      </option>
                    ))}
                </select>
              </label>
              <div className="modal__actions">
                <button type="button" className="modal__secondary" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="modal__primary">
                  {editingTaskId ? "Save changes" : "Create task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

export default GanttChart;
