import { useMemo } from "react";
import type { ChangeOrder, DayNote, ProjectMember } from "../types";

type MobileMessagesHubProps = {
  projectName?: string | null;
  notes: DayNote[];
  changeOrders: ChangeOrder[];
  members: ProjectMember[];
};

type MessageEntry = {
  id: string;
  title: string;
  preview: string;
  timestamp: string;
  authorName: string;
  authorInitials: string;
  status?: string;
};

const MobileMessagesHub = ({
  projectName,
  notes,
  changeOrders,
  members,
}: MobileMessagesHubProps) => {
  const threads = useMemo<MessageEntry[]>(() => {
    const memberByUserId = new Map<string, ProjectMember>();
    members.forEach((member) => {
      if (member.userId) {
        memberByUserId.set(member.userId, member);
      }
    });

    const entries: MessageEntry[] = [];

    notes.forEach((note) => {
      const member = note.userId ? memberByUserId.get(note.userId) : undefined;
      const name =
        member?.fullName ??
        member?.email ??
        (projectName ? `${projectName} team` : "Team");
      entries.push({
        id: `note-${note.id}`,
        title: member?.fullName ? `${member.fullName} left a note` : "New field note",
        preview: note.text,
        timestamp: note.createdAt,
        authorName: name,
        authorInitials: getInitials(name),
      });
    });

    changeOrders.forEach((order) => {
      entries.push({
        id: `change-order-${order.id}`,
        title: order.title,
        preview: order.description,
        timestamp: order.requestedAt,
        authorName: order.requestedBy || "Client",
        authorInitials: getInitials(order.requestedBy || "Client"),
        status: order.status,
      });
    });

    return entries.sort((a, b) => {
      const timeA = Date.parse(a.timestamp);
      const timeB = Date.parse(b.timestamp);
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
  }, [changeOrders, members, notes, projectName]);

  return (
    <section className="mobile-messages">
      <header className="mobile-messages__header">
        <h2>Messages &amp; Mentions</h2>
        <p>Catch up on field notes, change orders, and client requests.</p>
      </header>
      {threads.length === 0 ? (
        <p className="mobile-messages__empty">
          No conversations yet. Notes and change order updates will show up here.
        </p>
      ) : (
        <ul className="mobile-messages__list">
          {threads.map((thread) => (
            <li key={thread.id} className="mobile-messages__item">
              <span className="mobile-messages__avatar" aria-hidden="true">
                {thread.authorInitials}
              </span>
              <div className="mobile-messages__body">
                <div className="mobile-messages__row">
                  <h3>{thread.title}</h3>
                  <time dateTime={thread.timestamp}>
                    {new Date(thread.timestamp).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
                <p className="mobile-messages__preview">{thread.preview}</p>
                <div className="mobile-messages__meta">
                  <span>{thread.authorName}</span>
                  {thread.status ? (
                    <span className={`mobile-messages__status mobile-messages__status--${thread.status}`}>
                      {thread.status}
                    </span>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
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
  return words.map((word) => word[0]?.toUpperCase() ?? "").join("");
};

export default MobileMessagesHub;
