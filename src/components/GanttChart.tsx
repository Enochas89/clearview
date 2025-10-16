import type { ChangeEvent } from "react";
import { useMemo, useState, useRef, useEffect } from "react";
import { Project, Task, TaskDraft, TaskStatus } from "../types";
import "./GanttChart.css";

type GanttChartProps = {
  projects: Project[];
  tasks: Task[];
  selectedProjectId: string | null;
  canManageTasks: boolean;
  onCreateTask: (input: TaskDraft) => void;
  onUpdateTask: (taskId: string, input: TaskDraft) => void;
  onDeleteTask: (taskId: string) => void;
};

type TaskFormState = TaskDraft & {
  percentComplete: number;
};

const DAY_MS = 86_400_000;

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "Not started",
  "in-progress": "In progress",
  done: "Done",
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const derivePercentFromStatus = (status: TaskStatus, fallback?: number) => {
  if (typeof fallback === "number") {
    return clampPercent(fallback);
  }
  switch (status) {
    case "done":
      return 100;
    case "in-progress":
      return 55;
    default:
      return 0;
  }
};

const parseISODate = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  date.setHours(0, 0, 0, 0);
  return date;
};

const formatDate = (value: number) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
};

const createEmptyDraft = (projectId: string): TaskFormState => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const inFiveDays = new Date(today);
  inFiveDays.setDate(inFiveDays.getDate() + 5);

  const toISO = (date: Date) => date.toISOString().slice(0, 10);

  return {
    projectId,
    name: "",
    description: "",
    startDate: toISO(today),
    dueDate: toISO(inFiveDays),
    status: "todo",
    dependencies: [],
    baselineStartDate: toISO(today),
    baselineDueDate: toISO(inFiveDays),
    actualStartDate: undefined,
    actualDueDate: undefined,
    percentComplete: 0,
    assignee: "",
    isMilestone: false,
    notes: "",
  };
};

const computeMetrics = (tasks: Task[]) => {
  const total = tasks.length;
  const done = tasks.filter((task) => task.status === "done").length;
  const active = tasks.filter((task) => task.status === "in-progress").length;
  const milestones = tasks.filter((task) => task.isMilestone).length;
  const late = tasks.filter((task) => {
    if (task.status === "done") {
      return false;
    }
    const due = parseISODate(task.dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return due < today;
  }).length;
  return {
    total,
    done,
    active,
    milestones,
    late,
  };
};

const TaskForm = ({
  title,
  projects,
  tasks,
  editingId,
  form,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  title: string;
  projects: Project[];
  tasks: Task[];
  editingId?: string | null;
  form: TaskFormState;
  onChange: (next: TaskFormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
}) => {
  const handleField =
    (field: keyof TaskFormState) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const target = event.target as HTMLInputElement;
      const value = target.type === "checkbox" ? target.checked : target.value;
      onChange({
        ...form,
        [field]: value,
      });
    };

  const handleDependencies = (event: ChangeEvent<HTMLSelectElement>) => {
    const selection = Array.from(event.target.selectedOptions).map((option) => option.value);
    onChange({
      ...form,
      dependencies: selection,
    });
  };

  return (
    <div className="gantt__dialog">
      <div className="gantt__dialog-header">
        <h3>{title}</h3>
      </div>
      <div className="gantt__dialog-body">
        <label className="gantt__field">
          <span>Project</span>
          <select value={form.projectId} onChange={handleField("projectId")}>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label className="gantt__field">
          <span>Task name</span>
          <input type="text" value={form.name} onChange={handleField("name")} required />
        </label>
        <label className="gantt__field">
          <span>Description</span>
          <textarea value={form.description} onChange={handleField("description")} rows={3} />
        </label>
        <div className="gantt__field-grid">
          <label className="gantt__field">
            <span>Start</span>
            <input type="date" value={form.startDate} onChange={handleField("startDate")} required />
          </label>
          <label className="gantt__field">
            <span>Due</span>
            <input type="date" value={form.dueDate} onChange={handleField("dueDate")} required />
          </label>
          <label className="gantt__field">
            <span>Status</span>
            <select value={form.status} onChange={handleField("status")}>
              <option value="todo">{STATUS_LABELS.todo}</option>
              <option value="in-progress">{STATUS_LABELS["in-progress"]}</option>
              <option value="done">{STATUS_LABELS.done}</option>
            </select>
          </label>
          <label className="gantt__field">
            <span>Progress %</span>
            <input
              type="number"
              min={0}
              max={100}
              value={form.percentComplete}
              onChange={(event) =>
                onChange({
                  ...form,
                  percentComplete: clampPercent(Number(event.target.value) || 0),
                })
              }
            />
          </label>
        </div>
        <div className="gantt__field-grid">
          <label className="gantt__field">
            <span>Assignee</span>
            <input type="text" value={form.assignee ?? ""} onChange={handleField("assignee")} />
          </label>
          <label className="gantt__field gantt__field--checkbox">
            <input type="checkbox" checked={Boolean(form.isMilestone)} onChange={handleField("isMilestone")} />
            <span>Milestone</span>
          </label>
        </div>
        <label className="gantt__field">
          <span>Dependencies</span>
          <select multiple value={form.dependencies} onChange={handleDependencies}>
            {tasks
              .filter((task) => !editingId || task.id !== editingId)
              .map((task) => (
                <option key={task.id} value={task.id}>
                  {task.name}
                </option>
              ))}
          </select>
        </label>
        <label className="gantt__field">
          <span>Notes</span>
          <textarea value={form.notes ?? ""} onChange={handleField("notes")} rows={3} />
        </label>
      </div>
      <div className="gantt__dialog-footer">
        <button type="button" className="gantt__secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="gantt__primary" onClick={onSubmit}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
};

const GanttChart = ({
  projects,
  tasks,
  selectedProjectId,
  canManageTasks,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
}: GanttChartProps) => {
  const [statusFilter, setStatusFilter] = useState<"all" | TaskStatus>("all");
  const [dayWidth, setDayWidth] = useState(72);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const [formState, setFormState] = useState<TaskFormState | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport) {
      const handleWheel = (event: WheelEvent) => {
        if (event.deltaY !== 0) {
          event.preventDefault();
          viewport.scrollLeft += event.deltaY;
        }
      };
      viewport.addEventListener("wheel", handleWheel);
      return () => {
        viewport.removeEventListener("wheel", handleWheel);
      };
    }
  }, []);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (selectedProjectId && task.projectId !== selectedProjectId) {
        return false;
      }
      if (statusFilter !== "all" && task.status !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [tasks, selectedProjectId, statusFilter]);

  const metrics = useMemo(() => computeMetrics(filteredTasks), [filteredTasks]);

  const openCreate = () => {
    if (!canManageTasks) {
      return;
    }
    const defaultProject = selectedProjectId ?? projects[0]?.id ?? "";
    setFormState(createEmptyDraft(defaultProject));
    setEditTaskId(null);
    setIsDialogOpen(true);
  };

  const openEdit = (task: Task) => {
    if (!canManageTasks) {
      return;
    }
    setFormState({
      projectId: task.projectId,
      name: task.name,
      description: task.description,
      startDate: task.startDate,
      dueDate: task.dueDate,
      status: task.status,
      dependencies: task.dependencies ?? [],
      baselineStartDate: task.baselineStartDate ?? task.startDate,
      baselineDueDate: task.baselineDueDate ?? task.dueDate,
      actualStartDate: task.actualStartDate,
      actualDueDate: task.actualDueDate,
      percentComplete: derivePercentFromStatus(task.status, task.percentComplete),
      assignee: task.assignee ?? "",
      isMilestone: Boolean(task.isMilestone),
      notes: task.notes ?? "",
    });
    setEditTaskId(task.id);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditTaskId(null);
    setFormState(null);
  };

  const handleSubmit = () => {
    if (!formState || !canManageTasks) {
      return;
    }
    const payload: TaskDraft = {
      projectId: formState.projectId,
      name: formState.name.trim(),
      description: formState.description?.trim() ?? "",
      startDate: formState.startDate,
      dueDate: formState.dueDate,
      status: formState.status,
      dependencies: formState.dependencies ?? [],
      baselineStartDate: formState.baselineStartDate,
      baselineDueDate: formState.baselineDueDate,
      actualStartDate: formState.actualStartDate,
      actualDueDate: formState.actualDueDate,
      percentComplete: clampPercent(formState.percentComplete),
      assignee: formState.assignee?.trim() ?? "",
      isMilestone: formState.isMilestone ?? false,
      notes: formState.notes ?? "",
    };

    if (editTaskId) {
      onUpdateTask(editTaskId, payload);
    } else {
      onCreateTask(payload);
    }
    closeDialog();
  };

  const handleDelete = (taskId: string) => {
    if (!taskId || !canManageTasks) {
      return;
    }
    if (window.confirm("Remove this task?")) {
      onDeleteTask(taskId);
      setSelectedTaskId("");
    }
  };

  const selectedTask = useMemo(() => tasks.find((task) => task.id === selectedTaskId) ?? null, [tasks, selectedTaskId]);

  const currentProjectName = selectedProjectId
    ? projects.find((project) => project.id === selectedProjectId)?.name ?? "Project"
    : "All projects";

  const { timelineStart, timelineEnd, totalDays } = useMemo(() => {
    if (filteredTasks.length === 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const timelineStart = new Date(today);
      const timelineEnd = new Date(today);
      timelineEnd.setDate(timelineEnd.getDate() + 14);
      return { timelineStart, timelineEnd, totalDays: 14 };
    }

    const startDates = filteredTasks.map((task) => parseISODate(task.startDate).getTime());
    const endDates = filteredTasks.map((task) => parseISODate(task.dueDate).getTime());

    const timelineStart = new Date(Math.min(...startDates));
    const timelineEnd = new Date(Math.max(...endDates));

    const totalDays = Math.round((timelineEnd.getTime() - timelineStart.getTime()) / DAY_MS) + 1;

    return { timelineStart, timelineEnd, totalDays };
  }, [filteredTasks]);

  const days = useMemo(() => {
    return Array.from({ length: totalDays }, (_, i) => {
      const date = new Date(timelineStart);
      date.setDate(date.getDate() + i);
      return date;
    });
  }, [timelineStart, totalDays]);

  return (
    <section className="gantt">
      <header className="gantt__header">
        <div className="gantt__title">
          <h2>{currentProjectName}</h2>
          <p>A native React Gantt chart implementation.</p>
        </div>
        <div className="gantt__metrics">
          <div className="gantt__metric">
            <span>Total</span>
            <strong>{metrics.total}</strong>
          </div>
          <div className="gantt__metric">
            <span>In progress</span>
            <strong>{metrics.active}</strong>
          </div>
          <div className="gantt__metric">
            <span>Done</span>
            <strong>{metrics.done}</strong>
          </div>
          <div className="gantt__metric">
            <span>Milestones</span>
            <strong>{metrics.milestones}</strong>
          </div>
          <div className={`gantt__metric${metrics.late > 0 ? " gantt__metric--alert" : ""}`}>
            <span>Overdue</span>
            <strong>{metrics.late}</strong>
          </div>
        </div>
      </header>

      <div className="gantt__controls">
        <div className="gantt__filters">
          {(["all", "todo", "in-progress", "done"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`gantt__chip${statusFilter === value ? " is-active" : ""}`}
              onClick={() => setStatusFilter(value)}
            >
              {value === "all" ? "All tasks" : STATUS_LABELS[value as TaskStatus]}
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
              onChange={(event) => setDayWidth(Number(event.target.value))}
            />
          </label>
          <div className="gantt__select-group">
            <select value={selectedTaskId} onChange={(event) => setSelectedTaskId(event.target.value)}>
              <option value="">Select a task...</option>
              {filteredTasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.name}
                </option>
              ))}
            </select>
            {canManageTasks && (
              <>
                <button
                  type="button"
                  onClick={() => selectedTask && openEdit(selectedTask)}
                  disabled={!selectedTask}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => selectedTask && handleDelete(selectedTask.id)}
                  disabled={!selectedTask}
                >
                  Delete
                </button>
              </>
            )}
          </div>
          {canManageTasks && (
            <button
              type="button"
              className="gantt__primary"
              onClick={openCreate}
              disabled={projects.length === 0}
            >
              New task
            </button>
          )}
        </div>
      </div>

      <div ref={viewportRef} className="gantt__viewport" style={{ "--gantt-day-width": `${dayWidth}px` } as React.CSSProperties}>
        <div className="gantt__table">
          <div className="gantt__table-header" style={{ gridTemplateColumns: `200px repeat(${totalDays}, ${dayWidth}px)` }}>
            <div className="gantt__head-label">Task</div>
            {days.map((day) => (
              <div key={day.getTime()} className="gantt__head-day">
                {day.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
              </div>
            ))}
          </div>
          <div className="gantt__table-body">
            {filteredTasks.map((task) => {
              const taskStart = parseISODate(task.startDate);
              const taskEnd = parseISODate(task.dueDate);
              const startOffset = Math.round((taskStart.getTime() - timelineStart.getTime()) / DAY_MS);
              const duration = Math.round((taskEnd.getTime() - taskStart.getTime()) / DAY_MS) + 1;

              return (
                <div
                  key={task.id}
                  className="gantt__table-row"
                  style={{ gridTemplateColumns: `200px repeat(${totalDays}, ${dayWidth}px)` }}
                >
                  <div className="gantt__row-label">
                    <strong>{task.name}</strong>
                    <small>{task.assignee}</small>
                  </div>
                  <div
                    className="gantt__row-track"
                    style={{
                      gridColumn: `${startOffset + 2} / span ${duration}`,
                    }}
                  >
                    <div className={`gantt__bar gantt__bar--${task.status}`}>
                      <div className="gantt__bar-progress" style={{ width: `${task.percentComplete}%` }} />
                      <div className="gantt__bar-content">
                        <span>{task.name}</span>
                        <span>{task.percentComplete}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {isDialogOpen && formState && (
        <div className="gantt__dialog-backdrop" role="dialog" aria-modal="true">
          <TaskForm
            title={editTaskId ? "Edit task" : "Create task"}
            projects={projects}
            tasks={tasks}
            editingId={editTaskId}
            form={formState}
            onChange={setFormState}
            onSubmit={handleSubmit}
            onCancel={closeDialog}
            submitLabel={editTaskId ? "Save changes" : "Create task"}
          />
        </div>
      )}
    </section>
  );
};

export default GanttChart;
