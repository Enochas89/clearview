import { useMemo, useRef, useState, type MouseEvent, type UIEvent } from "react";

type SampleTask = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "todo" | "in-progress" | "done";
  progress: number;
  dependencies: string[];
  isMilestone?: boolean;
};

type ScaleKey = "DAY" | "WEEK" | "MONTH";

const SAMPLE_TASKS: SampleTask[] = [
  {
    id: "1",
    name: "Site Clearing & Grading",
    startDate: "2024-01-01",
    endDate: "2024-01-10",
    status: "done",
    progress: 1,
    dependencies: [],
  },
  {
    id: "2",
    name: "Foundation Excavation",
    startDate: "2024-01-11",
    endDate: "2024-01-20",
    status: "done",
    progress: 1,
    dependencies: ["1"],
  },
  {
    id: "3",
    name: "Concrete Pouring",
    startDate: "2024-01-21",
    endDate: "2024-01-28",
    status: "in-progress",
    progress: 0.6,
    dependencies: ["2"],
  },
  {
    id: "4",
    name: "Structural Framing",
    startDate: "2024-01-29",
    endDate: "2024-02-15",
    status: "todo",
    progress: 0,
    dependencies: ["3"],
  },
  {
    id: "5",
    name: "Milestone: Shell Complete",
    startDate: "2024-02-15",
    endDate: "2024-02-15",
    status: "todo",
    progress: 0,
    dependencies: ["4"],
    isMilestone: true,
  },
  {
    id: "6",
    name: "Roofing & Siding",
    startDate: "2024-02-16",
    endDate: "2024-03-05",
    status: "todo",
    progress: 0,
    dependencies: ["5"],
  },
  {
    id: "7",
    name: "Electrical & Plumbing",
    startDate: "2024-02-20",
    endDate: "2024-03-15",
    status: "todo",
    progress: 0,
    dependencies: ["4"],
  },
  {
    id: "8",
    name: "Interior Drywall",
    startDate: "2024-03-16",
    endDate: "2024-04-10",
    status: "todo",
    progress: 0,
    dependencies: ["6", "7"],
  },
];

const SCALES: Record<ScaleKey, { label: string; cellWidth: number; unit: "day" | "week" | "month" }> = {
  DAY: { label: "Days", cellWidth: 40, unit: "day" },
  WEEK: { label: "Weeks", cellWidth: 100, unit: "week" },
  MONTH: { label: "Months", cellWidth: 200, unit: "month" },
};

export const SampleGantt = () => {
  const [tasks] = useState<SampleTask[]>(SAMPLE_TASKS);
  const [viewScale, setViewScale] = useState<ScaleKey>("WEEK");
  const [hoveredTask, setHoveredTask] = useState<SampleTask | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | SampleTask["status"]>("all");

  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const mainRef = useRef<HTMLDivElement | null>(null);

  const currentScale = SCALES[viewScale];
  const today = useMemo(() => new Date("2024-01-25T00:00:00"), []);

  const filteredTasks = useMemo(
    () =>
      tasks.filter((task) => {
        const matchesSearch = task.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFilter = filterStatus === "all" || task.status === filterStatus;
        return matchesSearch && matchesFilter;
      }),
    [tasks, searchQuery, filterStatus],
  );

  const stats = useMemo(() => {
    const total = tasks.length || 1;
    const completed = tasks.filter((t) => t.status === "done").length;
    const avgProgress = tasks.reduce((acc, t) => acc + t.progress, 0) / total;
    return { completed, total: tasks.length, percent: Math.round(avgProgress * 100) };
  }, [tasks]);

  const projectBounds = useMemo(() => {
    if (tasks.length === 0) return { start: new Date(), end: new Date() };
    const dates = tasks.flatMap((t) => [new Date(`${t.startDate}T00:00:00`), new Date(`${t.endDate}T00:00:00`)]);
    const start = new Date(Math.min(...dates.map((d) => d.getTime())));
    const end = new Date(Math.max(...dates.map((d) => d.getTime())));
    start.setDate(start.getDate() - 7);
    end.setDate(end.getDate() + 14);
    return { start, end };
  }, [tasks]);

  const timelineDates = useMemo(() => {
    const dates: Date[] = [];
    const cursor = new Date(projectBounds.start);
    while (cursor <= projectBounds.end) {
      dates.push(new Date(cursor));
      if (viewScale === "DAY") cursor.setDate(cursor.getDate() + 1);
      else if (viewScale === "WEEK") cursor.setDate(cursor.getDate() + 7);
      else cursor.setMonth(cursor.getMonth() + 1);
    }
    return dates;
  }, [projectBounds, viewScale]);

  const getXPos = (iso: string) => {
    const date = new Date(`${iso}T00:00:00`);
    const diffTime = date.getTime() - projectBounds.start.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    if (viewScale === "DAY") return diffDays * currentScale.cellWidth;
    if (viewScale === "WEEK") return (diffDays / 7) * currentScale.cellWidth;
    return (diffDays / 30.44) * currentScale.cellWidth;
  };

  const handleMouseMove = (event: MouseEvent) => {
    setTooltipPos({ x: event.clientX + 14, y: event.clientY + 14 });
  };

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    if (sidebarRef.current) {
      sidebarRef.current.scrollTop = event.currentTarget.scrollTop;
    }
  };

  const styleBlock = `
    :root {
      --gantt-bg: #ffffff;
      --gantt-border: #e2e8f0;
      --gantt-text: #1e293b;
      --gantt-text-muted: #64748b;
      --gantt-primary: #3b82f6;
      --gantt-success: #10b981;
      --gantt-danger: #ef4444;
      --gantt-sidebar-width: 260px;
      --gantt-row-height: 52px;
      --gantt-header-height: 100px;
    }

    .gantt__container {
      font-family: "Inter", system-ui, sans-serif;
      color: var(--gantt-text);
      background: var(--gantt-bg);
      border: 1px solid var(--gantt-border);
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      height: 640px;
      box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1);
    }

    .gantt__toolbar {
      padding: 16px 20px;
      border-bottom: 1px solid var(--gantt-border);
      background: #f8fafc;
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      align-items: center;
      justify-content: space-between;
    }

    .gantt__controls-left { display: flex; gap: 12px; align-items: center; }

    .gantt__search {
      padding: 8px 12px;
      border: 1px solid var(--gantt-border);
      border-radius: 10px;
      font-size: 0.85rem;
      width: 220px;
      background: #fff;
    }

    .gantt__filter-select {
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid var(--gantt-border);
      font-size: 0.85rem;
      background: white;
    }

    .gantt__scale-buttons {
      display: inline-flex;
      gap: 8px;
      align-items: center;
    }

    .gantt__scale-btn {
      padding: 8px 12px;
      border-radius: 10px;
      border: 1px solid var(--gantt-border);
      background: #fff;
      font-weight: 700;
      font-size: 0.85rem;
      cursor: pointer;
    }

    .gantt__scale-btn--active {
      background: #0f172a;
      color: #fff;
      border-color: #0f172a;
      box-shadow: 0 8px 16px rgba(15, 23, 42, 0.25);
    }

    .gantt__stats {
      display: flex;
      gap: 20px;
      padding: 10px 20px;
      background: #fff;
      border-bottom: 1px solid var(--gantt-border);
      font-size: 0.8rem;
    }
    .gantt__stat-item { display: flex; align-items: center; gap: 6px; }
    .gantt__stat-pill { background: #f1f5f9; padding: 2px 8px; border-radius: 10px; font-weight: 600; }

    .gantt__viewport {
      flex: 1;
      display: flex;
      overflow: hidden;
      position: relative;
    }

    .gantt__sidebar {
      width: var(--gantt-sidebar-width);
      flex-shrink: 0;
      border-right: 1px solid var(--gantt-border);
      z-index: 20;
      background: white;
      overflow: hidden;
    }

    .gantt__sidebar-header {
      height: var(--gantt-header-height);
      padding: 0 20px;
      display: flex;
      align-items: center;
      font-weight: 700;
      font-size: 0.75rem;
      text-transform: uppercase;
      color: var(--gantt-text-muted);
      border-bottom: 1px solid var(--gantt-border);
      background: #fff;
    }

    .gantt__sidebar-row {
      height: var(--gantt-row-height);
      padding: 0 20px;
      display: flex;
      align-items: center;
      border-bottom: 1px solid #f1f5f9;
      font-size: 0.85rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .gantt__main {
      flex: 1;
      overflow: auto;
      position: relative;
      background-image: linear-gradient(to right, #f1f5f9 1px, transparent 1px);
      background-size: ${currentScale.cellWidth}px 100%;
    }

    .gantt__timeline-header {
      height: var(--gantt-header-height);
      display: flex;
      position: sticky;
      top: 0;
      z-index: 10;
      background: white;
      border-bottom: 1px solid var(--gantt-border);
    }

    .gantt__timeline-cell {
      flex-shrink: 0;
      width: ${currentScale.cellWidth}px;
      height: 100%;
      border-right: 1px solid #f1f5f9;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      font-size: 0.7rem;
    }

    .gantt__today-line {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 2px;
      background: var(--gantt-danger);
      z-index: 5;
      pointer-events: none;
    }
    .gantt__today-label {
      position: absolute;
      top: 4px;
      left: 4px;
      background: var(--gantt-danger);
      color: white;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: bold;
      white-space: nowrap;
    }

    .gantt__chart-row {
      height: var(--gantt-row-height);
      border-bottom: 1px solid #f1f5f9;
      position: relative;
    }

    .gantt__bar-wrapper {
      position: absolute;
      top: 14px;
      height: 24px;
      display: flex;
      align-items: center;
      cursor: pointer;
    }

    .gantt__bar {
      height: 100%;
      border-radius: 6px;
      position: relative;
      overflow: hidden;
      min-width: 10px;
      display: flex;
      border: 1px solid transparent;
    }

    .gantt__bar--done { background: #f0fdf4; border-color: #bbf7d0; }
    .gantt__bar--in-progress { background: #eff6ff; border-color: #bfdbfe; }
    .gantt__bar--todo { background: #f8fafc; border-color: #e2e8f0; }

    .gantt__progress {
      height: 100%;
      background: var(--gantt-primary);
      opacity: 0.7;
    }
    .gantt__bar--done .gantt__progress { background: var(--gantt-success); }

    .gantt__milestone {
      width: 14px;
      height: 14px;
      background: #1e293b;
      transform: rotate(45deg);
    }

    .gantt__tooltip {
      position: fixed;
      background: #1e293b;
      color: white;
      padding: 12px;
      border-radius: 8px;
      font-size: 0.8rem;
      pointer-events: none;
      z-index: 1000;
      box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3);
    }
  `;

  return (
    <div className="gantt__container">
      <style>{styleBlock}</style>

      <div className="gantt__toolbar">
        <div className="gantt__controls-left">
          <input
            className="gantt__search"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <select
            className="gantt__filter-select"
            value={filterStatus}
            onChange={(event) => setFilterStatus(event.target.value as typeof filterStatus)}
          >
            <option value="all">All Statuses</option>
            <option value="done">Completed</option>
            <option value="in-progress">In Progress</option>
            <option value="todo">Pending</option>
          </select>
        </div>

        <div className="gantt__scale-buttons">
          {(Object.keys(SCALES) as ScaleKey[]).map((scale) => (
            <button
              key={scale}
              className={`gantt__scale-btn${viewScale === scale ? " gantt__scale-btn--active" : ""}`}
              onClick={() => setViewScale(scale)}
            >
              {SCALES[scale].label}
            </button>
          ))}
        </div>
      </div>

      <div className="gantt__stats">
        <div className="gantt__stat-item">
          Total Progress: <span className="gantt__stat-pill">{stats.percent}%</span>
        </div>
        <div className="gantt__stat-item">
          Tasks: <span className="gantt__stat-pill">{stats.completed} / {stats.total}</span>
        </div>
        <div className="gantt__stat-item" style={{ color: "var(--gantt-danger)" }}>
          Today: <span className="gantt__stat-pill" style={{ background: "#fee2e2" }}>{today.toLocaleDateString()}</span>
        </div>
      </div>

      <div className="gantt__viewport">
        <div className="gantt__sidebar" ref={sidebarRef}>
          <div className="gantt__sidebar-header">WBS / Task List</div>
          {filteredTasks.map((task) => (
            <div key={task.id} className="gantt__sidebar-row">
              <span style={{ color: "var(--gantt-text-muted)", marginRight: 8, fontSize: "0.7rem" }}>{task.id}</span>
              {task.name}
            </div>
          ))}
        </div>

        <div className="gantt__main" ref={mainRef} onScroll={handleScroll}>
          <div className="gantt__timeline-header">
            {timelineDates.map((date, index) => (
              <div key={index} className="gantt__timeline-cell">
                <span style={{ fontWeight: 600, color: "#1e293b" }}>
                  {viewScale === "MONTH"
                    ? date.toLocaleDateString(undefined, { month: "short" })
                    : viewScale === "WEEK"
                      ? `W${Math.ceil(date.getDate() / 7)}`
                      : date.getDate()}
                </span>
                <span style={{ opacity: 0.6 }}>
                  {date.toLocaleDateString(undefined, { month: "short" })}
                </span>
              </div>
            ))}
          </div>

          <div className="gantt__chart-body">
            <div className="gantt__today-line" style={{ left: getXPos(today.toISOString().slice(0, 10)) }}>
              <div className="gantt__today-label">Today</div>
            </div>

            {filteredTasks.map((task) => {
              const startX = getXPos(task.startDate);
              const endX = getXPos(task.endDate);
              const width = Math.max(endX - startX, task.isMilestone ? 0 : 20);

              return (
                <div key={task.id} className="gantt__chart-row">
                  <div
                    className="gantt__bar-wrapper"
                    style={{ left: startX, width: task.isMilestone ? 14 : width }}
                    onMouseEnter={(event) => {
                      setHoveredTask(task);
                      handleMouseMove(event);
                    }}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={() => setHoveredTask(null)}
                  >
                    {task.isMilestone ? (
                      <div className="gantt__milestone" />
                    ) : (
                      <div className={`gantt__bar gantt__bar--${task.status}`}>
                        <div className="gantt__progress" style={{ width: `${task.progress * 100}%` }} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {hoveredTask && (
        <div className="gantt__tooltip" style={{ left: tooltipPos.x, top: tooltipPos.y }}>
          <strong style={{ display: "block", marginBottom: 4 }}>{hoveredTask.name}</strong>
          <div>Status: {hoveredTask.status.replace("-", " ")}</div>
          <div>Dates: {hoveredTask.startDate} to {hoveredTask.endDate}</div>
          <div>Progress: {Math.round(hoveredTask.progress * 100)}%</div>
        </div>
      )}
    </div>
  );
};

export default SampleGantt;
