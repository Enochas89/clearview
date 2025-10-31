import { ChangeEvent, useCallback, useMemo } from "react";
import GanttChart from "../../components/GanttChart";
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

  const handleProjectChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value || null;
      setSelectedProjectId(value);
    },
    [setSelectedProjectId],
  );

  const handleCreateTaskForChart = useCallback(
    (input: Parameters<typeof handleCreateTask>[0]) => {
      void handleCreateTask(input);
    },
    [handleCreateTask],
  );

  const handleUpdateTaskForChart = useCallback(
    (taskId: string, input: Parameters<typeof handleCreateTask>[0]) => {
      void handleUpdateTask(taskId, input);
    },
    [handleUpdateTask],
  );

  if (projects.length === 0) {
    return (
      <section className="gantt-view">
        <div className="gantt-view__empty">
          <h2>Create your first project</h2>
          <p>Add a project from the left panel to start planning tasks on the Gantt timeline.</p>
        </div>
      </section>
    );
  }

  if (!selectedProjectId) {
    return (
      <section className="gantt-view">
        <div className="gantt-view__empty">
          <h2>Select a project to view its schedule</h2>
          <p>Choose a project from the dropdown so we can load its tasks and dependencies.</p>
          <label className="gantt-view__selector">
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

  return (
    <section className="gantt-view">
      <header className="gantt-view__header">
        <div className="gantt-view__title">
          <h1>Gantt planner</h1>
          <p>
            Visualise deadlines, dependencies, and the overall timeline for{" "}
            <strong>{activeProject?.name ?? "your project"}</strong>.
          </p>
        </div>
        <div className="gantt-view__controls">
          <label className="gantt-view__selector">
            <span>Project</span>
            <select value={selectedProjectId} onChange={handleProjectChange}>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className="gantt-view__chart">
        <GanttChart
          projects={projects}
          tasks={visibleTasks}
          selectedProjectId={selectedProjectId}
          onCreateTask={handleCreateTaskForChart}
          onUpdateTask={handleUpdateTaskForChart}
        />
      </div>
    </section>
  );
};

export default GanttView;
