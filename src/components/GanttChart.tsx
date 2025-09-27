import { CSSProperties, FormEvent, useCallback, useMemo, useRef, useState, type WheelEvent, useEffect } from "react";
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
const DAY_WIDTH = 110;
const LABEL_WIDTH = 200;
const ROW_HEIGHT = 70; // Assuming a fixed row height

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

const DependencyArrows = ({ rows, tasks, timeline }) => {
  const taskPositions = useMemo(() => {
    const positions = new Map();
    rows.forEach((row, index) => {
      positions.set(row.task.id, {
        y: index * ROW_HEIGHT + ROW_HEIGHT / 2,
        startOffset: row.startOffset,
        duration: row.duration,
      });
    });
    return positions;
  }, [rows]);

  const arrows = useMemo(() => {
    const arrowPaths = [];
    tasks.forEach(task => {
      if (task.dependencies) {
        task.dependencies.forEach(depId => {
          const fromTaskPos = taskPositions.get(depId);
          const toTaskPos = taskPositions.get(task.id);

          if (fromTaskPos && toTaskPos) {
            const x1 = fromTaskPos.startOffset * DAY_WIDTH + fromTaskPos.duration * DAY_WIDTH;
            const y1 = fromTaskPos.y;
            const x2 = toTaskPos.startOffset * DAY_WIDTH;
            const y2 = toTaskPos.y;

            const path = `M ${x1} ${y1} L ${x1 + 20} ${y1} L ${x1 + 20} ${y2} L ${x2} ${y2}`;
            arrowPaths.push({ id: `${depId}-${task.id}`, path });
          }
        });
      }
    });
    return arrowPaths;
  }, [tasks, taskPositions]);

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: LABEL_WIDTH,
        width: timeline.totalDays * DAY_WIDTH,
        height: rows.length * ROW_HEIGHT,
        pointerEvents: 'none',
      }}
    >
      <defs>
        <marker
          id="arrowhead"
          markerWidth="10"
          markerHeight="7"
          refX="0"
          refY="3.5"
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" />
        </marker>
      </defs>
      {arrows.map(arrow => (
        <path
          key={arrow.id}
          d={arrow.path}
          fill="none"
          stroke="#ff4e4e"
          strokeWidth="2"
          markerEnd="url(#arrowhead)"
        />
      ))}
    </svg>
  );
};

const GanttChart = ({ projects, tasks, selectedProjectId, onCreateTask, onUpdateTask: onUpdateTaskProp }: GanttChartProps) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [isUpdating, setIsUpdating] = useState(false);

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

    const selectedProject = projects.find(p => p.id === selectedProjectId);

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

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    timelineStart = timelineStart < today ? timelineStart : today;

    const totalDays = Math.max(14, differenceInDays(timelineStart, timelineEnd) + 5);

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
  }, [tasks, projects, selectedProjectId]);

  const rows = useMemo(() => {
    return tasks
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

        return {
          task,
          startOffset,
          duration,
          project,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
  }, [projects, tasks, timeline]);

  const timelineWidth = useMemo(() => timeline.totalDays * DAY_WIDTH, [timeline.totalDays]);
  const totalWidth = useMemo(() => LABEL_WIDTH + timelineWidth, [timelineWidth]);

  const tableVars = useMemo(() => {
    const vars: CSSProperties & Record<string, string> = {
      width: `${totalWidth}px`,
      minWidth: `${totalWidth}px`,
    };
    vars["--gantt-label-width"] = `${LABEL_WIDTH}px`;
    vars["--gantt-day-width"] = `${DAY_WIDTH}px`;
    return vars;
  }, [totalWidth]);

  const gridColumnsStyle = useMemo(
    () =>
      ({
        gridTemplateColumns: `${LABEL_WIDTH}px repeat(${timeline.totalDays}, ${DAY_WIDTH}px)`,
        width: `${totalWidth}px`,
        minWidth: `${totalWidth}px`,
      }) as CSSProperties,
    [timeline.totalDays, totalWidth],
  );

  const trackStyle = useMemo(
    () =>
      ({
        gridTemplateColumns: `repeat(${timeline.totalDays}, ${DAY_WIDTH}px)`,
        width: `${timelineWidth}px`,
        minWidth: `${timelineWidth}px`,
      }) as CSSProperties,
    [timeline.totalDays, timelineWidth],
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

  const activeProjectCount = useMemo(() => {
    const ids = new Set(rows.map((row) => row.project?.id ?? row.task.projectId));
    return ids.size;
  }, [rows]);

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
        <div>
          <h2>Project timeline</h2>
          <p>Scroll horizontally to inspect schedules across Clear View projects.</p>
        </div>
        <div className="gantt__metrics">
          <button type="button" className="gantt__primary" onClick={openCreateModal} disabled={projects.length === 0}>
            + New task
          </button>
          <div className="gantt__metric">
            <span>Tasks</span>
            <strong>{tasks.length}</strong>
          </div>
          <div className="gantt__metric">
            <span>Days</span>
            <strong>{timeline.totalDays}</strong>
          </div>
          <div className="gantt__metric">
            <span>Projects</span>
            <strong>{activeProjectCount}</strong>
          </div>
        </div>
      </header>

      <div className="gantt__viewport" ref={viewportRef}>
        <div className="gantt__table" style={tableVars}>
          <div className="gantt__table-header" style={gridColumnsStyle}>
            <div className="gantt__head-label">Workstream</div>
            {timeline.days.map((date) => (
              <div key={date.toISOString()} className="gantt__head-day">
                {formatTimelineLabel(date)}
              </div>
            ))}
          </div>
          <div className="gantt__table-body" style={{ position: 'relative' }}>
            {hasRows ? (
              rows.map(({ task, startOffset, duration, project }) => (
                <div key={task.id} className="gantt__table-row" style={gridColumnsStyle}>
                  <div className="gantt__row-label">
                    <strong>{task.name}</strong>
                    <small>{project?.name ?? "No project"}</small>
                    <small>
                      {task.startDate} – {task.dueDate}
                    </small>
                    <button type="button" className="gantt__row-edit" onClick={() => openEditModal(task)}>
                      Edit task
                    </button>
                  </div>
                  <div className="gantt__row-track" style={trackStyle}>
                    <div
                      className={`gantt__bar gantt__bar--${task.status}`}
                      style={{ gridColumn: `${startOffset + 1} / span ${duration}` }}
                    >
                      <span>{task.status.replace("-", " ")}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="gantt__table-empty" style={{ width: `${totalWidth}px` }}>
                Create tasks to populate the timeline.
              </div>
            )}
            {hasRows && <DependencyArrows rows={rows} tasks={tasks} timeline={timeline} />}
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
                    .filter(task => task.projectId === taskForm. projectId && task.id !== editingTaskId)
                    .map(task => (
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