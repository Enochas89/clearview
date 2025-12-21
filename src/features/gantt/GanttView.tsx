import { useMemo, useRef, useState } from "react";
import GanttChart, { GanttChartHandle, StatusFilter } from "../../components/GanttChart";
import { useWorkspace } from "../../workspace/WorkspaceContext";
import { Task } from "../../types";

const GanttView = () => {
  const {
    projects,
    tasks,
    selectedProjectId,
    setSelectedProjectId,
    handleCreateTask,
    handleUpdateTask,
  } = useWorkspace();

  const chartRef = useRef<GanttChartHandle>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>(undefined);

  const scopedTasks = useMemo(
    () => (selectedProjectId ? tasks.filter((task) => task.projectId === selectedProjectId) : tasks),
    [tasks, selectedProjectId],
  );

  const roadmap = useMemo(() => {
    const total = scopedTasks.length;
    const inProgress = scopedTasks.filter((t) => t.status === "in-progress").length;
    const done = scopedTasks.filter((t) => t.status === "done").length;
    const overdue = scopedTasks.filter(
      (t) => new Date(t.dueDate) < new Date() && t.status !== "done",
    ).length;
    return { total, inProgress, done, overdue };
  }, [scopedTasks]);

  const handleSelectTask = (taskId: string) => {
    setSelectedTaskId(taskId);
    chartRef.current?.openEditTask(taskId);
  };

  const renderTaskTable = (taskList: Task[]) => (
    <div className="gantt-grid__table">
      <header className="gantt-grid__table-header">
        <span>Task</span>
        <span>Start</span>
        <span>Due</span>
        <span>Status</span>
        <span>Dependencies</span>
      </header>
      {taskList.length === 0 ? (
        <div className="gantt-grid__empty">No tasks yet. Create one to get started.</div>
      ) : (
        taskList.map((task) => (
          <button
            key={task.id}
            type="button"
            className={`gantt-grid__row${selectedTaskId === task.id ? " is-active" : ""}`}
            onClick={() => handleSelectTask(task.id)}
          >
            <div>
              <strong>{task.name}</strong>
              {task.description && <small>{task.description}</small>}
            </div>
            <span>{task.startDate || "—"}</span>
            <span>{task.dueDate || "—"}</span>
            <span className={`gantt-grid__pill status-${task.status}`}>{task.status}</span>
            <span className="gantt-grid__dependencies">
              {task.dependencies && task.dependencies.length > 0
                ? task.dependencies.length === 1
                  ? "1 link"
                  : `${task.dependencies.length} links`
                : "None"}
            </span>
          </button>
        ))
      )}
    </div>
  );

  return (
    <div className="gantt-grid">
      <header className="gantt-grid__hero">
        <div>
          <p className="gantt-grid__eyebrow">Schedule</p>
          <h1>Microsoft Project style Gantt</h1>
          <p className="gantt-grid__lede">
            Plan, track, and reschedule tasks with dependencies, zoom controls, and a live
            timeline.
          </p>
        </div>
        <div className="gantt-grid__hero-actions">
          <label className="gantt-grid__select">
            <span>Project</span>
            <select
              value={selectedProjectId ?? ""}
              onChange={(event) => setSelectedProjectId(event.target.value || null)}
            >
              <option value="">All projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <div className="gantt-grid__hero-buttons">
            <button
              type="button"
              className="gantt__primary"
              onClick={() => chartRef.current?.openCreateTask()}
            >
              + New task
            </button>
            <button type="button" onClick={() => chartRef.current?.scrollToToday()}>
              Today
            </button>
          </div>
        </div>
      </header>

      <div className="gantt-grid__summary">
        <div>
          <span>Tasks</span>
          <strong>{roadmap.total}</strong>
        </div>
        <div>
          <span>In progress</span>
          <strong>{roadmap.inProgress}</strong>
        </div>
        <div>
          <span>Done</span>
          <strong>{roadmap.done}</strong>
        </div>
        <div className={roadmap.overdue > 0 ? "is-alert" : ""}>
          <span>Overdue</span>
          <strong>{roadmap.overdue}</strong>
        </div>
      </div>

      <div className="gantt-grid__content">
        <section className="gantt-grid__panel">
          <header className="gantt-grid__panel-header">
            <h2>Work breakdown</h2>
            <div className="gantt-grid__filters">
              <button
                type="button"
                className={statusFilter === "all" ? "is-active" : ""}
                onClick={() => setStatusFilter("all")}
              >
                All
              </button>
              <button
                type="button"
                className={statusFilter === "todo" ? "is-active" : ""}
                onClick={() => setStatusFilter("todo")}
              >
                Not started
              </button>
              <button
                type="button"
                className={statusFilter === "in-progress" ? "is-active" : ""}
                onClick={() => setStatusFilter("in-progress")}
              >
                In progress
              </button>
              <button
                type="button"
                className={statusFilter === "done" ? "is-active" : ""}
                onClick={() => setStatusFilter("done")}
              >
                Done
              </button>
            </div>
          </header>
          {renderTaskTable(
            statusFilter === "all"
              ? scopedTasks
              : scopedTasks.filter((task) => task.status === statusFilter),
          )}
        </section>

        <section className="gantt-grid__panel gantt-grid__panel--timeline">
          <GanttChart
            ref={chartRef}
            projects={projects}
            tasks={tasks}
            selectedProjectId={selectedProjectId}
            onCreateTask={handleCreateTask}
            onUpdateTask={(taskId, input) => handleUpdateTask(taskId, input)}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            selectedTaskId={selectedTaskId}
            onSelectedTaskIdChange={setSelectedTaskId}
          />
        </section>
      </div>
    </div>
  );
};

export default GanttView;
