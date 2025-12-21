import { useMemo, useRef } from "react";
import GanttChart, { GanttChartHandle } from "../../components/GanttChart";
import { useWorkspace } from "../../workspace/WorkspaceContext";

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
        <section className="gantt-grid__panel gantt-grid__panel--timeline">
          <GanttChart
            ref={chartRef}
            projects={projects}
            tasks={tasks}
            selectedProjectId={selectedProjectId}
            onCreateTask={handleCreateTask}
            onUpdateTask={(taskId, input) => handleUpdateTask(taskId, input)}
          />
        </section>
      </div>
    </div>
  );
};

export default GanttView;
