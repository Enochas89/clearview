import { ChangeEvent, useCallback, useMemo, useRef, useState } from "react";
import GanttChart, { type GanttChartHandle, type StatusFilter } from "../../components/GanttChart";
import { useWorkspace } from "../../workspace/WorkspaceContext";

const DEFAULT_DAY_WIDTH = 72;

const formatDate = (iso?: string | null) => {
  if (!iso) {
    return "Not set";
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "Not set";
  }
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatRelative = (iso?: string | null) => {
  if (!iso) {
    return "";
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);
  const diffDays = Math.round((parsed.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    return "Today";
  }
  if (diffDays > 0) {
    return `In ${diffDays} day${diffDays === 1 ? "" : "s"}`;
  }
  const abs = Math.abs(diffDays);
  return `${abs} day${abs === 1 ? "" : "s"} ago`;
};

const STATUS_FILTERS: Array<{ label: string; value: StatusFilter }> = [
  { label: "All tasks", value: "all" },
  { label: "Not started", value: "todo" },
  { label: "In progress", value: "in-progress" },
  { label: "Completed", value: "done" },
];

const GanttView = () => {
  const {
    projects,
    tasks,
    selectedProjectId,
    setSelectedProjectId,
    handleCreateTask,
    handleUpdateTask,
  } = useWorkspace();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dayWidth, setDayWidth] = useState<number>(DEFAULT_DAY_WIDTH);
  const ganttRef = useRef<GanttChartHandle>(null);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const visibleTasks = useMemo(() => {
    if (!selectedProjectId) {
      return tasks;
    }
    return tasks.filter((task) => task.projectId === selectedProjectId);
  }, [selectedProjectId, tasks]);

  const metrics = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let inProgress = 0;
    let done = 0;
    let milestones = 0;
    let overdue = 0;

    visibleTasks.forEach((task) => {
      if (task.status === "in-progress") inProgress += 1;
      if (task.status === "done") done += 1;
      if ((task.dependencies?.length ?? 0) === 0) milestones += 1;
      const dueDate = new Date(`${task.dueDate}T00:00:00`);
      if (!Number.isNaN(dueDate.getTime()) && dueDate < today && task.status !== "done") {
        overdue += 1;
      }
    });

    const total = visibleTasks.length;
    const progress = total === 0 ? 0 : Math.round((done / total) * 100);
    const upcomingMilestone = visibleTasks
      .filter((task) => task.status !== "done")
      .map((task) => ({
        id: task.id,
        name: task.name,
        dueDate: task.dueDate,
      }))
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0] ?? null;

    return {
      total,
      inProgress,
      done,
      milestones,
      overdue,
      progress,
      upcomingMilestone,
    };
  }, [visibleTasks]);

  const filteredTasks = useMemo(() => {
    if (statusFilter === "all") {
      return visibleTasks;
    }
    return visibleTasks.filter((task) => task.status === statusFilter);
  }, [visibleTasks, statusFilter]);

  const handleProjectChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value || null;
      setSelectedProjectId(value);
    },
    [setSelectedProjectId],
  );

  const handleFilterChange = useCallback((value: StatusFilter) => {
    setStatusFilter(value);
  }, []);

  const handleZoomChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDayWidth(Number(event.target.value));
  };

  const handleCreateTaskClick = useCallback(() => {
    ganttRef.current?.openCreateTask();
  }, []);

  const handleScrollToday = useCallback(() => {
    ganttRef.current?.scrollToToday();
  }, []);

  const handleUpdateTaskForChart = useCallback(
    (taskId: string, input: Parameters<typeof handleCreateTask>[0]) => {
      void handleUpdateTask(taskId, input);
    },
    [handleUpdateTask],
  );

  const handleCreateTaskForChart = useCallback(
    (input: Parameters<typeof handleCreateTask>[0]) => {
      void handleCreateTask(input);
    },
    [handleCreateTask],
  );

  if (projects.length === 0) {
    return (
      <section className="schedule">
        <div className="schedule__empty">
          <h2>Add your first project</h2>
          <p>Spin up a project from the sidebar to start planning tasks on your timeline.</p>
          <button
            type="button"
            className="schedule__empty-action"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.dispatchEvent(new Event("cv:open-new-project"));
              }
            }}
          >
            Create a project
          </button>
        </div>
      </section>
    );
  }

  if (!selectedProjectId) {
    return (
      <section className="schedule">
        <div className="schedule__empty schedule__empty--select">
          <h2>Select a project</h2>
          <p>Choose a project to load its schedule, tasks, and dependencies.</p>
          <label className="schedule__select">
            <span>Project</span>
            <select value="" onChange={handleProjectChange}>
              <option value="" disabled>
                Pick a project
              </option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
    );
  }

  const heroDescription =
    activeProject?.description?.trim() ||
    "Coordinate milestones, owners, and dependencies so everyone ships on time.";
  const startLabel = formatDate(activeProject?.startDate);
  const dueLabel = formatDate(activeProject?.dueDate);
  const nextMilestoneName = metrics.upcomingMilestone?.name ?? "No upcoming tasks";
  const nextMilestoneDue = metrics.upcomingMilestone?.dueDate
    ? formatDate(metrics.upcomingMilestone.dueDate)
    : "TBD";
  const nextMilestoneRelative = metrics.upcomingMilestone?.dueDate
    ? formatRelative(metrics.upcomingMilestone.dueDate)
    : "";

  return (
    <section className="schedule">
      <header className="schedule__hero">
        <div className="schedule__intro">
          <span className="schedule__eyebrow">Project schedule</span>
          <h1>{activeProject?.name ?? "Project timeline"}</h1>
          <p>{heroDescription}</p>
        </div>
        <div className="schedule__snapshot">
          <div className="schedule__stat">
            <span>Start</span>
            <strong>{startLabel}</strong>
            <small>{formatRelative(activeProject?.startDate)}</small>
          </div>
          <div className="schedule__stat">
            <span>Due</span>
            <strong>{dueLabel}</strong>
            <small>{formatRelative(activeProject?.dueDate)}</small>
          </div>
          <div className="schedule__progress">
            <span>Progress</span>
            <div className="schedule__progress-bar" aria-label={`Project ${metrics.progress}% complete`}>
              <div
                className="schedule__progress-value"
                style={{ width: `${metrics.progress}%` }}
              />
            </div>
            <small>{metrics.progress}% complete</small>
          </div>
        </div>
      </header>

      <div className="schedule__toolbar">
        <label className="schedule__select">
          <span>Project</span>
          <select value={selectedProjectId} onChange={handleProjectChange}>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <div className="schedule__toolbar-actions">
          <button type="button" className="schedule__button" onClick={handleScrollToday}>
            Jump to today
          </button>
          <button type="button" className="schedule__button schedule__button--primary" onClick={handleCreateTaskClick}>
            New task
          </button>
        </div>
      </div>

      <div className="schedule__summary">
        <div className="schedule__card">
          <span>Total tasks</span>
          <strong>{metrics.total}</strong>
        </div>
        <div className="schedule__card">
          <span>In progress</span>
          <strong>{metrics.inProgress}</strong>
        </div>
        <div className="schedule__card">
          <span>Completed</span>
          <strong>{metrics.done}</strong>
        </div>
        <div className="schedule__card">
          <span>Milestones</span>
          <strong>{metrics.milestones}</strong>
        </div>
        <div className={`schedule__card${metrics.overdue > 0 ? " schedule__card--alert" : ""}`}>
          <span>Overdue</span>
          <strong>{metrics.overdue}</strong>
        </div>
        <div className="schedule__card schedule__card--wide">
          <span>Next milestone</span>
          <strong>{nextMilestoneName}</strong>
          <small>{nextMilestoneDue}{nextMilestoneRelative ? ` · ${nextMilestoneRelative}` : ""}</small>
        </div>
      </div>

      <div className="schedule__filters">
        <div className="schedule__chips" role="tablist" aria-label="Task status filter">
          {STATUS_FILTERS.map(({ label, value }) => (
            <button
              key={value}
              type="button"
              className={`schedule__chip${statusFilter === value ? " is-active" : ""}`}
              aria-pressed={statusFilter === value}
              onClick={() => handleFilterChange(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="schedule__slider">
          <span>Timeline zoom</span>
          <input
            type="range"
            min={48}
            max={128}
            step={4}
            value={dayWidth}
            onChange={handleZoomChange}
          />
        </label>
      </div>

      <div className="schedule__board">
        <GanttChart
          ref={ganttRef}
          className="schedule__chart"
          projects={projects}
          tasks={filteredTasks}
          selectedProjectId={selectedProjectId}
          onCreateTask={handleCreateTaskForChart}
          onUpdateTask={handleUpdateTaskForChart}
          showHeader={false}
          showControls={false}
          dayWidth={dayWidth}
          onDayWidthChange={setDayWidth}
          statusFilter={statusFilter}
        />
      </div>
    </section>
  );
};

export default GanttView;
