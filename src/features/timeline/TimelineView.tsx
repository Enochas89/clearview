import { useMemo } from "react";
import CalendarView from "../../components/CalendarView";
import GanttChart from "../../components/GanttChart";
import { useWorkspace } from "../../workspace/WorkspaceContext";
import { differenceInDays, parseISODate, toISODate } from "../../utils/date";

const TimelineView = () => {
  const {
    projects,
    tasks,
    projectDayEntries,
    selectedProjectId,
    handleAddFile,
    handleRemoveFile,
    handleCreatePost,
    handleUpdatePost,
    handleDeletePost,
    handleCreateTask,
    handleUpdateTask,
    recentActivities,
    upcomingDueTasks,
  } = useWorkspace();

  const visibleTasks = useMemo(() => {
    if (!selectedProjectId) {
      return tasks;
    }
    return tasks.filter((task) => task.projectId === selectedProjectId);
  }, [selectedProjectId, tasks]);

  const activeProject = useMemo(
    () =>
      selectedProjectId
        ? projects.find((project) => project.id === selectedProjectId) ?? null
        : null,
    [projects, selectedProjectId],
  );

  const visibleDays = useMemo(() => {
    if (!selectedProjectId) {
      return [];
    }

    const selectedProject = activeProject;
    const projectTasks = tasks.filter((task) => task.projectId === selectedProjectId);
    const projectDays = projectDayEntries.get(selectedProjectId) ?? [];

    let timelineStart: Date | null = null;
    let timelineEnd: Date | null = null;

    const considerDate = (value?: string | null) => {
      if (!value) {
        return;
      }
      const parsed = parseISODate(value);
      if (Number.isNaN(parsed.getTime())) {
        return;
      }
      if (!timelineStart || parsed < timelineStart) {
        timelineStart = parsed;
      }
      if (!timelineEnd || parsed > timelineEnd) {
        timelineEnd = parsed;
      }
    };

    considerDate(selectedProject?.startDate);
    considerDate(selectedProject?.dueDate);

    projectTasks.forEach((task) => {
      considerDate(task.startDate);
      considerDate(task.dueDate);
    });

    projectDays.forEach((day) => considerDate(day.date));

    if (!timelineStart || !timelineEnd) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      timelineStart = today;
      timelineEnd = today;
    }

    let ensuredStart = timelineStart as Date;
    let ensuredEnd = timelineEnd as Date;

    if (ensuredStart > ensuredEnd) {
      const temp = ensuredStart;
      ensuredStart = ensuredEnd;
      ensuredEnd = temp;
    }

    const totalDays = Math.max(1, differenceInDays(ensuredStart, ensuredEnd) + 1);
    const dayLookup = new Map(projectDays.map((day) => [day.date, day]));

    return Array.from({ length: totalDays }, (_, index) => {
      const date = new Date(ensuredStart);
      date.setDate(ensuredStart.getDate() + index);
      const isoDate = toISODate(date);
      const existingDay = dayLookup.get(isoDate);
      return {
        date: isoDate,
        files: existingDay?.files ?? [],
        posts: existingDay?.posts ?? [],
      };
    });
  }, [activeProject, projectDayEntries, selectedProjectId, tasks]);

  if (projects.length === 0 || !selectedProjectId) {
    return (
      <div className="app__empty-state">
        <h2>No projects yet!</h2>
        <p>Create a new project in the sidebar to get started.</p>
      </div>
    );
  }

  return (
    <>
      <CalendarView
        activeProjectId={selectedProjectId}
        days={visibleDays}
        onAddFile={handleAddFile}
        onRemoveFile={handleRemoveFile}
        onCreatePost={handleCreatePost}
        onUpdatePost={handleUpdatePost}
        onDeletePost={handleDeletePost}
        recentActivities={recentActivities}
        upcomingDueTasks={upcomingDueTasks}
      />
      <GanttChart
        tasks={visibleTasks}
        projects={projects}
        selectedProjectId={selectedProjectId}
        onCreateTask={handleCreateTask}
        onUpdateTask={handleUpdateTask}
      />
    </>
  );
};

export default TimelineView;
