
import {
  CSSProperties,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Project, Task, TaskStatus, TaskDraft } from "../types";

type TaskFormState = Omit<TaskDraft, "percentComplete"> & {
  percentComplete: number;
};

type GanttChartProps = {
  projects: Project[];
  tasks: Task[];
  selectedProjectId: string | null;
  onCreateTask: (input: TaskDraft) => void;
  onUpdateTask: (taskId: string, input: TaskDraft) => void;
};

const DAY_MS = 86_400_000;
const BASE_DAY_WIDTH = 110;
const LABEL_WIDTH = 220;
const ROW_HEIGHT = 78;
const DAY_WIDTH_MIN = 48;
const DAY_WIDTH_MAX = 168;
const MIN_TIMELINE_DAYS = 14;

const parseISODate = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  date.setHours(0, 0, 0, 0);
  return date;
};

const parseOptionalDate = (value?: string) => (value ? parseISODate(value) : undefined);

const differenceInDays = (start: Date, end: Date) =>
  Math.round((end.getTime() - start.getTime()) / DAY_MS);

const toISODate = (date: Date) => {
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  return clone.toISOString().slice(0, 10);
};

const formatTimelineLabel = (date: Date) =>
  date.toLocaleDateString(undefined, { month: "short", day: "numeric" });

const clampPercent = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

const derivePercentFromStatus = (status: TaskStatus) => {
  switch (status) {
    case "done":
      return 100;
    case "in-progress":
      return 55;
    default:
      return 0;
  }
};

const ensureEndAfterStart = (start: Date, end: Date) => {
  if (end < start) {
    return new Date(start);
  }
  return end;
};

const createDefaultTaskForm = (projectId: string): TaskFormState => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(today);
  due.setDate(due.getDate() + 6);

  return {
    projectId,
    name: "",
    description: "",
    startDate: toISODate(today),
    dueDate: toISODate(due),
    status: "todo",
    dependencies: [],
    baselineStartDate: toISODate(today),
    baselineDueDate: toISODate(due),
    actualStartDate: undefined,
    actualDueDate: undefined,
    percentComplete: derivePercentFromStatus("todo"),
    assignee: "",
    isMilestone: false,
    notes: "",
  };
};
type Timeline = {
  start: Date;
  end: Date;
  totalDays: number;
  days: Date[];
};

type TaskRow = {
  task: Task;
  project?: Project;
  plannedStart: Date;
  plannedEnd: Date;
  baselineStart: Date;
  baselineEnd: Date;
  actualStart?: Date;
  actualEnd?: Date;
  plannedDuration: number;
  baselineDuration: number;
  actualDuration?: number;
  plannedOffset: number;
  plannedSpan: number;
  baselineOffset: number;
  baselineSpan: number;
  actualOffset?: number;
  actualSpan?: number;
  percentComplete: number;
  assigneeLabel: string;
  isLate: boolean;
};

const buildTimeline = (tasks: Task[]): Timeline => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (tasks.length === 0) {
    const start = new Date(today);
    const end = new Date(today);
    end.setDate(end.getDate() + (MIN_TIMELINE_DAYS - 1));
    const days = Array.from({ length: MIN_TIMELINE_DAYS }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });

    return { start, end, totalDays: MIN_TIMELINE_DAYS, days };
  }

  const startCandidates: number[] = [];
  const endCandidates: number[] = [];

  tasks.forEach((task) => {
    const plannedStart = parseISODate(task.startDate);
    const plannedEnd = parseISODate(task.dueDate);
    startCandidates.push(plannedStart.getTime());
    endCandidates.push(plannedEnd.getTime());

    const baselineStart = parseOptionalDate(task.baselineStartDate);
    const baselineEnd = parseOptionalDate(task.baselineDueDate);
    if (baselineStart) startCandidates.push(baselineStart.getTime());
    if (baselineEnd) endCandidates.push(baselineEnd.getTime());

    const actualStart = parseOptionalDate(task.actualStartDate);
    const actualEnd = parseOptionalDate(task.actualDueDate);
    if (actualStart) startCandidates.push(actualStart.getTime());
    if (actualEnd) endCandidates.push(actualEnd.getTime());
  });

  const minTime = Math.min(...startCandidates, today.getTime());
  const maxTime = Math.max(...endCandidates, today.getTime());

  const start = new Date(minTime);
  const end = new Date(maxTime);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  start.setDate(start.getDate() - 1);
  end.setDate(end.getDate() + 1);

  const totalDays = Math.max(MIN_TIMELINE_DAYS, differenceInDays(start, end) + 1);
  const days = Array.from({ length: totalDays }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });

  return { start, end, totalDays, days };
};

const buildRows = (tasks: Task[], timeline: Timeline, projects: Project[]): TaskRow[] => {
  if (tasks.length === 0) {
    return [];
  }

  const projectMap = new Map(projects.map((project) => [project.id, project]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return tasks
    .map((task) => {
      const plannedStart = parseISODate(task.startDate);
      const plannedEnd = ensureEndAfterStart(plannedStart, parseISODate(task.dueDate));

      const baselineStart = parseOptionalDate(task.baselineStartDate) ?? plannedStart;
      const baselineEnd = ensureEndAfterStart(baselineStart, parseOptionalDate(task.baselineDueDate) ?? plannedEnd);

      const actualStart = parseOptionalDate(task.actualStartDate);
      const actualEnd = actualStart
        ? ensureEndAfterStart(actualStart, parseOptionalDate(task.actualDueDate) ?? actualStart)
        : undefined;

      const plannedDuration = Math.max(1, differenceInDays(plannedStart, plannedEnd) + 1);
      const baselineDuration = Math.max(1, differenceInDays(baselineStart, baselineEnd) + 1);
      const actualDuration =
        actualStart && actualEnd ? Math.max(1, differenceInDays(actualStart, actualEnd) + 1) : undefined;

      const plannedOffsetRaw = differenceInDays(timeline.start, plannedStart);
      const plannedEndOffsetRaw = differenceInDays(timeline.start, plannedEnd);
      const plannedOffset = Math.max(0, plannedOffsetRaw);
      const plannedEndOffset = Math.min(timeline.totalDays - 1, plannedEndOffsetRaw);
      const plannedSpan = Math.max(1, plannedEndOffset - plannedOffset + 1);

      const baselineOffsetRaw = differenceInDays(timeline.start, baselineStart);
      const baselineEndOffsetRaw = differenceInDays(timeline.start, baselineEnd);
      const baselineOffset = Math.max(0, baselineOffsetRaw);
      const baselineEndOffset = Math.min(timeline.totalDays - 1, baselineEndOffsetRaw);
      const baselineSpan = Math.max(1, baselineEndOffset - baselineOffset + 1);

      const actualOffset =
        actualStart !== undefined ? Math.max(0, differenceInDays(timeline.start, actualStart)) : undefined;
      const actualEndOffset =
        actualEnd !== undefined ? Math.min(timeline.totalDays - 1, differenceInDays(timeline.start, actualEnd)) : undefined;
      const actualSpan =
        actualOffset !== undefined && actualEndOffset !== undefined
          ? Math.max(1, actualEndOffset - actualOffset + 1)
          : undefined;

      const percentComplete = clampPercent(task.percentComplete ?? derivePercentFromStatus(task.status));
      const assigneeLabel = task.assignee?.trim() || "Unassigned";
      const isLate = percentComplete < 100 && plannedEnd < today;

      return {
        task,
        project: projectMap.get(task.projectId),
        plannedStart,
        plannedEnd,
        baselineStart,
        baselineEnd,
        actualStart,
        actualEnd,
        plannedDuration,
        baselineDuration,
        actualDuration,
        plannedOffset,
        plannedSpan,
        baselineOffset,
        baselineSpan,
        actualOffset,
        actualSpan,
        percentComplete,
        assigneeLabel,
        isLate,
      };
    })
    .sort((a, b) => a.plannedStart.getTime() - b.plannedStart.getTime());
};
const computeCriticalPath = (rows: TaskRow[]): Set<string> => {
  if (rows.length === 0) {
    return new Set();
  }

  const tasksById = new Map(rows.map((row) => [row.task.id, row]));
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  const longest = new Map<string, number>();
  const predecessor = new Map<string, string | null>();

  rows.forEach((row) => {
    const id = row.task.id;
    adjacency.set(id, []);
    indegree.set(id, 0);
    longest.set(id, row.plannedDuration);
    predecessor.set(id, null);
  });

  rows.forEach((row) => {
    const targetId = row.task.id;
    (row.task.dependencies ?? []).forEach((depId) => {
      if (!tasksById.has(depId)) {
        return;
      }
      adjacency.get(depId)?.push(targetId);
      indegree.set(targetId, (indegree.get(targetId) ?? 0) + 1);
    });
  });

  const queue: string[] = [];
  indegree.forEach((value, id) => {
    if (value === 0) {
      queue.push(id);
    }
  });

  const processed: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    processed.push(current);

    const currentDuration = longest.get(current) ?? 0;
    (adjacency.get(current) ?? []).forEach((neighbor) => {
      const candidate = currentDuration + (tasksById.get(neighbor)?.plannedDuration ?? 0);
      if (candidate > (longest.get(neighbor) ?? 0)) {
        longest.set(neighbor, candidate);
        predecessor.set(neighbor, current);
      }

      const nextInDegree = (indegree.get(neighbor) ?? 0) - 1;
      indegree.set(neighbor, nextInDegree);
      if (nextInDegree === 0) {
        queue.push(neighbor);
      }
    });
  }

  if (processed.length !== rows.length) {
    return new Set();
  }

  let maxTaskId = processed[0];
  let maxDuration = longest.get(maxTaskId) ?? 0;

  processed.forEach((id) => {
    const duration = longest.get(id) ?? 0;
    if (duration > maxDuration) {
      maxDuration = duration;
      maxTaskId = id;
    }
  });

  const path = new Set<string>();
  let cursor: string | null = maxTaskId;
  while (cursor) {
    path.add(cursor);
    cursor = predecessor.get(cursor) ?? null;
  }

  return path;
};

const formatDateRange = (start: string, end: string) => (start === end ? start : `${start} ? ${end}`);

type DependencyArrowProps = {
  rows: TaskRow[];
  dayWidth: number;
  totalDays: number;
};

const DependencyArrows = ({ rows, dayWidth, totalDays }: DependencyArrowProps) => {
  const positions = useMemo(() => {
    const map = new Map<
      string,
      {
        offset: number;
        span: number;
        y: number;
      }
    >();

    rows.forEach((row, index) => {
      map.set(row.task.id, {
        offset: row.plannedOffset,
        span: row.plannedSpan,
        y: index * ROW_HEIGHT + ROW_HEIGHT / 2,
      });
    });

    return map;
  }, [rows]);

  const arrows = useMemo(() => {
    const list: { id: string; path: string }[] = [];

    rows.forEach((row) => {
      const sources = row.task.dependencies ?? [];
      sources.forEach((sourceId) => {
        const from = positions.get(sourceId);
        const to = positions.get(row.task.id);

        if (!from || !to) {
          return;
        }

        const x1 = from.offset * dayWidth + from.span * dayWidth;
        const y1 = from.y;
        const x2 = to.offset * dayWidth;
        const y2 = to.y;

        const elbowX = Math.min(x1 + dayWidth * 0.6, totalDays * dayWidth);
        const path = `M ${x1} ${y1} L ${elbowX} ${y1} L ${elbowX} ${y2} L ${x2} ${y2}`;
        list.push({ id: `${sourceId}-${row.task.id}`, path });
      });
    });

    return list;
  }, [rows, positions, dayWidth, totalDays]);

  if (arrows.length === 0) {
    return null;
  }

  return (
    <svg
      className="gantt__arrows"
      style={{
        position: "absolute",
        top: 0,
        left: LABEL_WIDTH,
        width: totalDays * dayWidth,
        height: rows.length * ROW_HEIGHT,
        pointerEvents: "none",
      }}
    >
      <defs>
        <marker id="gantt-arrowhead" markerWidth="10" markerHeight="10" refX="10" refY="5" orient="auto">
          <polygon points="0 0, 10 5, 0 10" />
        </marker>
      </defs>
      {arrows.map((arrow) => (
        <path key={arrow.id} d={arrow.path} fill="none" stroke="#4f46e5" strokeWidth="1.5" markerEnd="url(#gantt-arrowhead)" />
      ))}
    </svg>
  );
};
const GanttChart = ({ projects, tasks, selectedProjectId, onCreateTask, onUpdateTask: onUpdateTaskProp }: GanttChartProps) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [dayWidth, setDayWidth] = useState(BASE_DAY_WIDTH);
  const [statusFilters, setStatusFilters] = useState<Record<TaskStatus, boolean>>({
    todo: true,
    "in-progress": true,
    done: true,
  });
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [milestoneOnly, setMilestoneOnly] = useState(false);
  const [showBaselines, setShowBaselines] = useState(true);
  const [showActuals, setShowActuals] = useState(true);
  const [showDependencies, setShowDependencies] = useState(true);
  const [highlightCriticalPath, setHighlightCriticalPath] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const defaultProjectId = selectedProjectId ?? projects[0]?.id ?? "";
  const [taskForm, setTaskForm] = useState<TaskFormState>(() => createDefaultTaskForm(defaultProjectId));

  const onUpdateTask = useCallback(
    (taskId: string, input: TaskDraft) => {
      setIsUpdating(true);
      onUpdateTaskProp(taskId, input);
    },
    [onUpdateTaskProp],
  );

  useEffect(() => {
    if (!isUpdating) {
      return;
    }
    const timer = window.setTimeout(() => setIsUpdating(false), 800);
    return () => window.clearTimeout(timer);
  }, [isUpdating]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
        return;
      }
      event.preventDefault();
      viewport.scrollLeft += event.deltaY;
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, []);

  const toggleStatus = (status: TaskStatus) => {
    setStatusFilters((prev) => {
      const next = { ...prev, [status]: !prev[status] };
      const isAnyActive = Object.values(next).some(Boolean);
      return isAnyActive ? next : prev;
    });
  };

  const projectScopedTasks = useMemo(() => {
    if (selectedProjectId) {
      return tasks.filter((task) => task.projectId === selectedProjectId);
    }
    return tasks;
  }, [tasks, selectedProjectId]);

  const assigneeOptions = useMemo(() => {
    const unique = new Set<string>();
    projectScopedTasks.forEach((task) => {
      if (task.assignee && task.assignee.trim().length > 0) {
        unique.add(task.assignee.trim());
      }
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [projectScopedTasks]);

  const filteredTasks = useMemo(() => {
    return projectScopedTasks.filter((task) => {
      if (!statusFilters[task.status]) {
        return false;
      }

      if (milestoneOnly && !task.isMilestone) {
        return false;
      }

      if (assigneeFilter !== "all") {
        const label = task.assignee?.trim() || "Unassigned";
        if (label !== assigneeFilter) {
          return false;
        }
      }

      return true;
    });
  }, [projectScopedTasks, statusFilters, assigneeFilter, milestoneOnly]);

  const timeline = useMemo(() => buildTimeline(filteredTasks), [filteredTasks]);

  const rows = useMemo(() => buildRows(filteredTasks, timeline, projects), [filteredTasks, timeline, projects]);

  const criticalPathIds = useMemo(
    () => (highlightCriticalPath ? computeCriticalPath(rows) : new Set<string>()),
    [rows, highlightCriticalPath],
  );

  const totalPlannedDuration = useMemo(
    () => rows.reduce((sum, row) => sum + row.plannedDuration, 0),
    [rows],
  );

  const weightedProgress = useMemo(
    () => rows.reduce((sum, row) => sum + row.plannedDuration * row.percentComplete, 0),
    [rows],
  );

  const averageProgress = totalPlannedDuration > 0 ? Math.round(weightedProgress / totalPlannedDuration) : 0;
  const completedCount = rows.filter((row) => row.percentComplete >= 100 || row.task.status === "done").length;
  const lateCount = rows.filter((row) => row.isLate).length;
  const milestoneCount = rows.filter((row) => row.task.isMilestone).length;
  const criticalCount = criticalPathIds.size;

  const timelineWidth = timeline.totalDays * dayWidth;
  const totalWidth = LABEL_WIDTH + timelineWidth;

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
    [timeline.totalDays, dayWidth, totalWidth],
  );

  const trackStyle = useMemo(
    () =>
      ({
        gridTemplateColumns: `repeat(${timeline.totalDays}, ${dayWidth}px)`,
        width: `${timelineWidth}px`,
        minWidth: `${timelineWidth}px`,
      }) as CSSProperties,
    [timeline.totalDays, dayWidth, timelineWidth],
  );
  const openCreateModal = () => {
    const defaultId = selectedProjectId ?? projects[0]?.id ?? "";
    setTaskForm(createDefaultTaskForm(defaultId));
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
      dependencies: task.dependencies ?? [],
      baselineStartDate: task.baselineStartDate ?? task.startDate,
      baselineDueDate: task.baselineDueDate ?? task.dueDate,
      actualStartDate: task.actualStartDate ?? undefined,
      actualDueDate: task.actualDueDate ?? undefined,
      percentComplete: task.percentComplete ?? derivePercentFromStatus(task.status),
      assignee: task.assignee ?? "",
      isMilestone: Boolean(task.isMilestone),
      notes: task.notes ?? "",
    });
    setEditingTaskId(task.id);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const buildDraftFromForm = (form: TaskFormState): TaskDraft => ({
    projectId: form.projectId,
    name: form.name.trim(),
    description: form.description,
    startDate: form.startDate,
    dueDate: form.dueDate,
    status: form.status,
    dependencies: form.dependencies,
    baselineStartDate: form.baselineStartDate,
    baselineDueDate: form.baselineDueDate,
    actualStartDate: form.actualStartDate || undefined,
    actualDueDate: form.actualDueDate || undefined,
    percentComplete: clampPercent(form.percentComplete),
    assignee: form.assignee?.trim() || undefined,
    isMilestone: form.isMilestone ?? false,
    notes: form.notes?.trim() || undefined,
  });

  const handleTaskSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!taskForm.projectId || !taskForm.name.trim() || !taskForm.startDate || !taskForm.dueDate) {
      return;
    }

    const draft = buildDraftFromForm(taskForm);

    if (editingTaskId) {
      onUpdateTask(editingTaskId, draft);
    } else {
      onCreateTask(draft);
    }

    setIsModalOpen(false);
  };

  const handleDependencyChange = (selectedOptions: HTMLCollectionOf<HTMLOptionElement>) => {
    const dependencies = Array.from(selectedOptions).map((option) => option.value);
    setTaskForm((prev) => ({ ...prev, dependencies }));
  };

  useEffect(() => {
    if (isUpdating || taskForm.dependencies.length === 0) {
      return;
    }

    const latestDependencyEnd = taskForm.dependencies.reduce<Date | undefined>((latest, depId) => {
      const dependency = tasks.find((item) => item.id === depId);
      if (!dependency) {
        return latest;
      }
      const due = parseISODate(dependency.dueDate);
      return !latest || due > latest ? due : latest;
    }, undefined);

    if (!latestDependencyEnd) {
      return;
    }

    const nextStart = new Date(latestDependencyEnd);
    nextStart.setDate(nextStart.getDate() + 1);
    const nextStartIso = toISODate(nextStart);

    if (nextStartIso > taskForm.startDate) {
      setTaskForm((prev) => ({
        ...prev,
        startDate: nextStartIso,
        baselineStartDate:
          prev.baselineStartDate && prev.baselineStartDate > nextStartIso
            ? prev.baselineStartDate
            : nextStartIso,
      }));
    }
  }, [taskForm.dependencies, taskForm.startDate, taskForm.baselineStartDate, tasks, isUpdating]);

  useEffect(() => {
    if (taskForm.isMilestone && taskForm.dueDate !== taskForm.startDate) {
      setTaskForm((prev) => ({ ...prev, dueDate: prev.startDate }));
    }
  }, [taskForm.isMilestone, taskForm.startDate, taskForm.dueDate]);

  useEffect(() => {
    if (taskForm.baselineStartDate && taskForm.baselineDueDate && taskForm.baselineDueDate < taskForm.baselineStartDate) {
      setTaskForm((prev) => ({ ...prev, baselineDueDate: prev.baselineStartDate }));
    }
  }, [taskForm.baselineStartDate, taskForm.baselineDueDate]);

  useEffect(() => {
    if (taskForm.actualStartDate && taskForm.actualDueDate && taskForm.actualDueDate < taskForm.actualStartDate) {
      setTaskForm((prev) => ({ ...prev, actualDueDate: prev.actualStartDate }));
    }
  }, [taskForm.actualStartDate, taskForm.actualDueDate]);

  const noTasksMatchFilters = rows.length === 0;
  return (
    <section className="gantt">
      <header className="gantt__header">
        <div>
          <h2>Project timeline</h2>
          <p>Track baseline plans, actuals, and critical dependencies across your projects.</p>
        </div>
        <div className="gantt__metrics">
          <button type="button" className="gantt__primary" onClick={openCreateModal} disabled={projects.length === 0}>
            + New task
          </button>
          <div className="gantt__metric">
            <span>Completion</span>
            <strong>{averageProgress}%</strong>
          </div>
          <div className="gantt__metric">
            <span>Done</span>
            <strong>{completedCount}</strong>
          </div>
          <div className="gantt__metric">
            <span>Critical path</span>
            <strong>{criticalCount}</strong>
          </div>
          <div className="gantt__metric">
            <span>Milestones</span>
            <strong>{milestoneCount}</strong>
          </div>
          <div className={`gantt__metric${lateCount > 0 ? " gantt__metric--alert" : ""}`}>
            <span>Late</span>
            <strong>{lateCount}</strong>
          </div>
        </div>
      </header>

      <div className="gantt__toolbar">
        <div className="gantt__filter-group">
          {(["todo", "in-progress", "done"] as TaskStatus[]).map((status) => (
            <button
              key={status}
              type="button"
              className={`gantt__filter-chip${statusFilters[status] ? " is-active" : ""}`}
              onClick={() => toggleStatus(status)}
            >
              {status.replace("-", " ")}
            </button>
          ))}
        </div>
        <div className="gantt__toolbar-controls">
          <label className="gantt__field">
            <span>Assignee</span>
            <select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}>
              <option value="all">All</option>
              <option value="Unassigned">Unassigned</option>
              {assigneeOptions.map((assignee) => (
                <option key={assignee} value={assignee}>
                  {assignee}
                </option>
              ))}
            </select>
          </label>
          <label className="gantt__field gantt__field--checkbox">
            <input
              type="checkbox"
              checked={milestoneOnly}
              onChange={(event) => setMilestoneOnly(event.target.checked)}
            />
            <span>Milestones only</span>
          </label>
          <label className="gantt__field gantt__field--checkbox">
            <input
              type="checkbox"
              checked={showBaselines}
              onChange={(event) => setShowBaselines(event.target.checked)}
            />
            <span>Show baselines</span>
          </label>
          <label className="gantt__field gantt__field--checkbox">
            <input
              type="checkbox"
              checked={showActuals}
              onChange={(event) => setShowActuals(event.target.checked)}
            />
            <span>Show actuals</span>
          </label>
          <label className="gantt__field gantt__field--checkbox">
            <input
              type="checkbox"
              checked={showDependencies}
              onChange={(event) => setShowDependencies(event.target.checked)}
            />
            <span>Dependencies</span>
          </label>
          <label className="gantt__field gantt__field--checkbox">
            <input
              type="checkbox"
              checked={highlightCriticalPath}
              onChange={(event) => setHighlightCriticalPath(event.target.checked)}
            />
            <span>Highlight critical path</span>
          </label>
          <label className="gantt__field gantt__field--slider">
            <span>Zoom</span>
            <input
              type="range"
              min={DAY_WIDTH_MIN}
              max={DAY_WIDTH_MAX}
              step={8}
              value={dayWidth}
              onChange={(event) => setDayWidth(Number(event.target.value))}
            />
          </label>
        </div>
      </div>
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
          <div className="gantt__table-body" style={{ position: "relative" }}>
            {noTasksMatchFilters ? (
              <div className="gantt__table-empty" style={{ width: `${totalWidth}px` }}>
                {tasks.length === 0
                  ? "Create tasks to populate the timeline."
                  : "No tasks match the current filters."}
              </div>
            ) : (
              rows.map((row) => (
                <div key={row.task.id} className="gantt__table-row" style={gridColumnsStyle}>
                  <div className="gantt__row-label">
                    <div className="gantt__row-title">
                      <strong>{row.task.name}</strong>
                      {row.task.isMilestone && <span className="gantt__row-badge">Milestone</span>}
                      {row.assigneeLabel && (
                        <span className="gantt__assignee" title={`Assigned to ${row.assigneeLabel}`}>
                          {row.assigneeLabel}
                        </span>
                      )}
                    </div>
                    <small>{row.project?.name ?? "No project"} · {formatDateRange(row.task.startDate, row.task.dueDate)}</small>
                    <small>{row.percentComplete}% complete · {row.task.status.replace("-", " ")}</small>
                    <button type="button" className="gantt__row-edit" onClick={() => openEditModal(row.task)}>
                      Edit task
                    </button>
                  </div>
                  <div className="gantt__row-track" style={trackStyle}>
                    {showBaselines && (
                      <div
                        className="gantt__baseline"
                        style={{ gridColumn: `${row.baselineOffset + 1} / span ${row.baselineSpan}` }}
                      />
                    )}
                    <div
                      className={`gantt__bar gantt__bar--${row.task.status}${
                        highlightCriticalPath && criticalPathIds.has(row.task.id) ? " gantt__bar--critical" : ""
                      }${row.isLate ? " gantt__bar--late" : ""}${row.task.isMilestone ? " gantt__bar--milestone" : ""}`}
                      style={{ gridColumn: `${row.plannedOffset + 1} / span ${row.plannedSpan}` }}
                    >
                      <div className="gantt__bar-progress" style={{ width: `${row.percentComplete}%` }} />
                      <div className="gantt__bar-content">
                        <span>{row.task.status.replace("-", " ")}</span>
                        <span>{row.percentComplete}%</span>
                      </div>
                    </div>
                    {showActuals && row.actualOffset !== undefined && row.actualSpan !== undefined && (
                      <div
                        className="gantt__bar gantt__bar--actual"
                        style={{ gridColumn: `${row.actualOffset + 1} / span ${row.actualSpan}` }}
                      >
                        <span>Actual</span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            {showDependencies && !noTasksMatchFilters && (
              <DependencyArrows rows={rows} dayWidth={dayWidth} totalDays={timeline.totalDays} />
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
                  Planned start
                  <input
                    type="date"
                    value={taskForm.startDate}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, startDate: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Planned due
                  <input
                    type="date"
                    value={taskForm.dueDate}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                    required
                  />
                </label>
              </div>


              <div className="modal__grid">
                <label>
                  Actual start
                  <input
                    type="date"
                    value={taskForm.actualStartDate ?? ""}
                    onChange={(event) =>
                      setTaskForm((prev) => ({ ...prev, actualStartDate: event.target.value || undefined }))
                    }
                  />
                </label>
                <label>
                  Actual due
                  <input
                    type="date"
                    value={taskForm.actualDueDate ?? ""}
                    onChange={(event) =>
                      setTaskForm((prev) => ({ ...prev, actualDueDate: event.target.value || undefined }))
                    }
                  />
                </label>
              </div>

              <label>
                Status
                <select
                  value={taskForm.status}
                  onChange={(event) => {
                    const nextStatus = event.target.value as TaskStatus;
                    setTaskForm((prev) => ({
                      ...prev,
                      status: nextStatus,
                      percentComplete:
                        nextStatus === "done"
                          ? 100
                          : nextStatus === "todo"
                          ? 0
                          : prev.percentComplete === 0
                          ? derivePercentFromStatus("in-progress")
                          : prev.percentComplete,
                    }));
                  }}
                >
                  <option value="todo">To do</option>
                  <option value="in-progress">In progress</option>
                  <option value="done">Done</option>
                </select>
              </label>

              <label>
                Percent complete
                <div className="modal__slider">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={taskForm.percentComplete}
                    onChange={(event) =>
                      setTaskForm((prev) => ({ ...prev, percentComplete: clampPercent(Number(event.target.value)) }))
                    }
                  />
                  <span>{taskForm.percentComplete}%</span>
                </div>
              </label>

              <label>
                Assignee
                <input
                  type="text"
                  value={taskForm.assignee ?? ""}
                  onChange={(event) => setTaskForm((prev) => ({ ...prev, assignee: event.target.value }))}
                  placeholder="Who owns this task?"
                />
              </label>

              <label className="modal__checkbox">
                <input
                  type="checkbox"
                  checked={Boolean(taskForm.isMilestone)}
                  onChange={(event) => setTaskForm((prev) => ({ ...prev, isMilestone: event.target.checked }))}
                />
                <span>Mark as milestone</span>
              </label>

              <label>
                Notes
                <textarea
                  value={taskForm.notes ?? ""}
                  onChange={(event) => setTaskForm((prev) => ({ ...prev, notes: event.target.value }))}
                  placeholder="Add context or risks"
                  rows={2}
                />
              </label>

              <label>
                Dependencies
                <select
                  multiple
                  value={taskForm.dependencies}
                  onChange={(event) => handleDependencyChange(event.target.selectedOptions)}
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


