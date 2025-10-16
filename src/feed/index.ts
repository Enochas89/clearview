import {
  ChangeOrder,
  DayFile,
  DayNote,
  Project,
  ProjectMember,
  Task,
} from "../types";

export type ActivityTone = "neutral" | "positive" | "warning" | "danger";

export type ActivityType =
  | "task-update"
  | "note"
  | "change-order"
  | "file-upload"
  | "milestone";

export type ActivityAttachment = {
  id: string;
  type: "file" | "image";
  url?: string;
  name: string;
  size?: number;
  mimeType?: string;
};

export type ActivityAuthor = {
  name: string;
  role?: string | null;
  initials: string;
  color: string;
};

export type FeedActivity = {
  id: string;
  projectId: string;
  projectName: string;
  createdAt: string;
  type: ActivityType;
  headline: string;
  body?: string;
  statusTag?: string;
  statusTone?: ActivityTone;
  author: ActivityAuthor;
  attachments?: ActivityAttachment[];
  meta?: Record<string, unknown>;
};

export type StoryEntry = {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  createdAt: string;
  coverUrl?: string;
  fallbackColor: string;
  type: "image" | "document";
  summary?: string;
};

export type FeedData = {
  activities: FeedActivity[];
  stories: StoryEntry[];
};

type BuildFeedArgs = {
  projectId: string | null;
  projects: Project[];
  tasks: Task[];
  notes: DayNote[];
  changeOrders: ChangeOrder[];
  files: DayFile[];
  members: ProjectMember[];
  now?: Date;
};

const DEFAULT_COLORS = [
  "#2563eb",
  "#0ea5e9",
  "#22c55e",
  "#a855f7",
  "#f97316",
];

const imageMimePrefixes = ["image/", "video/"];

export const buildFeedData = ({
  projectId,
  projects,
  tasks,
  notes,
  changeOrders,
  files,
  members,
  now = new Date(),
}: BuildFeedArgs): FeedData => {
  const projectLookup = new Map(projects.map((project) => [project.id, project]));

  const membersByProject = new Map<string, ProjectMember[]>();
  const membersByUserId = new Map<string, ProjectMember>();
  const membersByEmail = new Map<string, ProjectMember>();

  members.forEach((member) => {
    const list = membersByProject.get(member.projectId);
    if (list) {
      list.push(member);
    } else {
      membersByProject.set(member.projectId, [member]);
    }
    if (member.userId) {
      membersByUserId.set(member.userId, member);
    }
    if (member.email) {
      membersByEmail.set(member.email.toLowerCase(), member);
    }
  });

  const fallbackProjectId =
    projectId ?? (projects.length > 0 ? projects[0].id : null);

  const scopePredicate = (candidateProjectId: string) =>
    projectId ? candidateProjectId === projectId : candidateProjectId === fallbackProjectId;

  const activities: FeedActivity[] = [];

  const resolveProjectMeta = (candidateProjectId: string) => {
    const project = projectLookup.get(candidateProjectId);
    const color =
      (project?.color && project.color.trim()) ||
      DEFAULT_COLORS[
        Math.abs(hashString(candidateProjectId)) % DEFAULT_COLORS.length
      ];
    const membersForProject = membersByProject.get(candidateProjectId) ?? [];
    const preferredMember =
      membersForProject.find((member) => member.role === "owner") ??
      membersForProject.find((member) => member.role === "editor") ??
      membersForProject[0];
    const defaultName =
      project?.projectManager?.trim() ||
      preferredMember?.fullName ||
      preferredMember?.email ||
      project?.name ||
      "Project Team";

    return {
      name: project?.name ?? "Project",
      color,
      defaultAuthor: {
        name: defaultName,
        role: preferredMember?.role ?? null,
        initials: getInitials(defaultName),
        color,
      } satisfies ActivityAuthor,
    };
  };

  const resolveAuthor = (options: {
    userId?: string | null;
    email?: string | null;
    explicitName?: string | null;
    projectId: string;
  }): ActivityAuthor => {
    const projectMeta = resolveProjectMeta(options.projectId);

    if (options.userId) {
      const member = membersByUserId.get(options.userId);
      if (member) {
        const name =
          member.fullName?.trim() ||
          member.email ||
          projectMeta.defaultAuthor.name;
        return {
          name,
          role: member.role,
          initials: getInitials(name),
          color: projectMeta.color,
        };
      }
    }

    if (options.email) {
      const member = membersByEmail.get(options.email.toLowerCase());
      if (member) {
        const name =
          member.fullName?.trim() ||
          member.email ||
          projectMeta.defaultAuthor.name;
        return {
          name,
          role: member.role,
          initials: getInitials(name),
          color: projectMeta.color,
        };
      }
    }

    if (options.explicitName) {
      const name = options.explicitName.trim();
      return {
        name,
        role: projectMeta.defaultAuthor.role,
        initials: getInitials(name),
        color: projectMeta.color,
      };
    }

    return projectMeta.defaultAuthor;
  };

  const tasksForScope = tasks.filter((task) =>
    scopePredicate(task.projectId)
  );
  tasksForScope.forEach((task) => {
    const timestamp =
      parseDate(task.actualDueDate) ??
      parseDate(task.actualStartDate) ??
      parseDate(task.dueDate) ??
      parseDate(task.startDate) ??
      now;

    const meta = resolveProjectMeta(task.projectId);
    const type: ActivityType = task.isMilestone ? "milestone" : "task-update";

    const statusTone: ActivityTone =
      task.status === "done"
        ? "positive"
        : task.status === "in-progress"
        ? "neutral"
        : "warning";

    activities.push({
      id: `task-${task.id}`,
      projectId: task.projectId,
      projectName: meta.name,
      createdAt: toISOString(timestamp),
      type,
      headline: task.name,
      body: task.description,
      statusTag: formatTaskStatus(task),
      statusTone,
      author: resolveAuthor({
        projectId: task.projectId,
      }),
      meta: {
        dueDate: task.dueDate,
        startDate: task.startDate,
        percentComplete: task.percentComplete,
      },
    });
  });

  const notesForScope = notes.filter((note) =>
    scopePredicate(note.projectId)
  );
  notesForScope.forEach((note) => {
    const timestamp = parseDate(note.createdAt) ?? now;
    const meta = resolveProjectMeta(note.projectId);
    activities.push({
      id: `note-${note.id}`,
      projectId: note.projectId,
      projectName: meta.name,
      createdAt: toISOString(timestamp),
      type: "note",
      headline: "Field note added",
      body: note.text,
      author: resolveAuthor({
        projectId: note.projectId,
        userId: note.userId,
      }),
    });
  });

  const changeOrdersForScope = changeOrders.filter((entry) =>
    scopePredicate(entry.projectId)
  );
  changeOrdersForScope.forEach((order) => {
    const timestamp =
      parseDate(order.requestedAt) ?? parseDate(order.clientLastSentAt) ?? now;
    const meta = resolveProjectMeta(order.projectId);
    const status = formatChangeOrderStatus(order.status);

    activities.push({
      id: `change-order-${order.id}`,
      projectId: order.projectId,
      projectName: meta.name,
      createdAt: toISOString(timestamp),
      type: "change-order",
      headline: order.title,
      body: order.description,
      statusTag: status.label,
      statusTone: status.tone,
      author: resolveAuthor({
        projectId: order.projectId,
        explicitName: order.requestedBy,
      }),
      meta: {
        amount: order.amount,
        dueDate: order.dueDate,
      },
    });
  });

  const filesForScope = files.filter((file) =>
    scopePredicate(file.projectId)
  );
  filesForScope.forEach((file) => {
    const timestamp =
      parseDate(file.addedAt) ?? parseDate(file.date) ?? now;
    const meta = resolveProjectMeta(file.projectId);
    const mime = file.type?.toLowerCase() ?? "";
    const attachmentType: ActivityAttachment["type"] = imageMimePrefixes.some(
      (prefix) => mime.startsWith(prefix)
    )
      ? "image"
      : "file";

    activities.push({
      id: `file-${file.id}`,
      projectId: file.projectId,
      projectName: meta.name,
      createdAt: toISOString(timestamp),
      type: "file-upload",
      headline: "New file uploaded",
      body: file.name,
      author: resolveAuthor({
        projectId: file.projectId,
        userId: file.uploadedBy,
      }),
      attachments: [
        {
          id: file.id,
          type: attachmentType,
          url: file.url,
          name: file.name,
          size: file.size,
          mimeType: file.type,
        },
      ],
      meta: {
        size: file.size,
      },
    });
  });

  activities.sort((a, b) => {
    const timeA = Date.parse(a.createdAt);
    const timeB = Date.parse(b.createdAt);
    if (Number.isNaN(timeA) && Number.isNaN(timeB)) {
      return 0;
    }
    if (Number.isNaN(timeA)) {
      return 1;
    }
    if (Number.isNaN(timeB)) {
      return -1;
    }
    return timeB - timeA;
  });

  const stories = filesForScope
    .filter((file) => file.url && file.url.length > 0)
    .sort((a, b) => {
      const timeA = Date.parse(a.addedAt ?? "");
      const timeB = Date.parse(b.addedAt ?? "");
      return (Number.isNaN(timeB) ? 0 : timeB) - (Number.isNaN(timeA) ? 0 : timeA);
    })
    .slice(0, 16)
    .map((file) => {
      const meta = resolveProjectMeta(file.projectId);
      const mime = file.type?.toLowerCase() ?? "";
      const type: StoryEntry["type"] = imageMimePrefixes.some((prefix) =>
        mime.startsWith(prefix)
      )
        ? "image"
        : "document";
      return {
        id: file.id,
        projectId: file.projectId,
        projectName: meta.name,
        title: file.name,
        createdAt: toISOString(
          parseDate(file.addedAt) ?? parseDate(file.date) ?? now
        ),
        coverUrl: file.url,
        fallbackColor: meta.color,
        type,
        summary: type === "document" ? "Document upload" : "Photo update",
      };
    });

  return {
    activities,
    stories,
  };
};

const parseDate = (value?: string | null) => {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toISOString = (date: Date) => {
  const clone = new Date(date);
  return clone.toISOString();
};

const getInitials = (value: string) => {
  if (!value) {
    return "CV";
  }
  const words = value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (words.length === 0) {
    return value.slice(0, 2).toUpperCase();
  }
  const initials = words.map((word) => word[0]?.toUpperCase() ?? "").join("");
  return initials || value.slice(0, 2).toUpperCase();
};

const formatTaskStatus = (task: Task) => {
  switch (task.status) {
    case "done":
      return "Completed";
    case "in-progress":
      return task.percentComplete
        ? `${Math.round(task.percentComplete)}%`
        : "In progress";
    default:
      return "Scheduled";
  }
};

const formatChangeOrderStatus = (
  status: ChangeOrder["status"]
): { label: string; tone: ActivityTone } => {
  switch (status) {
    case "approved":
      return { label: "Approved", tone: "positive" };
    case "denied":
      return { label: "Denied", tone: "danger" };
    default:
      return { label: "Pending", tone: "warning" };
  }
};

const hashString = (input: string) => {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return hash;
};
