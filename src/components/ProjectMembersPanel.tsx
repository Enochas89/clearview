import { FormEvent, useMemo, useState } from "react";
import { MemberRole, MemberStatus, ProjectMember, InviteMemberResult } from "../types";

type ProjectMembersPanelProps = {
  projectId: string;
  members: ProjectMember[];
  currentUserId: string;
  currentUserEmail: string | null;
  allowInviteFallback?: boolean;
  onInvite: (input: { projectId: string; email: string; role: MemberRole; name: string }) => Promise<InviteMemberResult | undefined>;
  onUpdateRole: (memberId: string, role: MemberRole) => Promise<void> | void;
  onRemoveMember: (memberId: string) => Promise<void> | void;
};

const roleLabels: Record<MemberRole, string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
};

const statusLabels: Record<MemberStatus, string> = {
  accepted: "Active",
  pending: "Pending invite",
};

const getInitials = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) {
    return "?";
  }
  const parts = trimmed.split(/\s+/);
  const [first, second] = parts;
  if (!second) {
    return first.slice(0, 2).toUpperCase();
  }
  return `${first[0]}${second[0]}`.toUpperCase();
};

const ProjectMembersPanel = ({
  projectId,
  members,
  currentUserId,
  currentUserEmail,
  allowInviteFallback = false,
  onInvite,
  onUpdateRole,
  onRemoveMember,
}: ProjectMembersPanelProps) => {
  const [nameValue, setNameValue] = useState("");
  const [emailValue, setEmailValue] = useState("");
  const [roleValue, setRoleValue] = useState<MemberRole>("viewer");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localSuccess, setLocalSuccess] = useState<string | null>(null);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);

  const normalizedCurrentEmail = (currentUserEmail ?? "").toLowerCase();

  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      if (a.role === b.role) {
        return (a.email ?? "").localeCompare(b.email ?? "");
      }
      const priority: MemberRole[] = ["owner", "editor", "viewer"];
      return priority.indexOf(a.role) - priority.indexOf(b.role);
    });
  }, [members]);

  const ownerCount = useMemo(
    () => members.filter((member) => member.role === "owner").length,
    [members],
  );

  const currentMember = useMemo(() => {
    return sortedMembers.find(
      (member) =>
        member.userId === currentUserId ||
        (member.email ?? "").toLowerCase() === normalizedCurrentEmail,
    );
  }, [sortedMembers, currentUserId, normalizedCurrentEmail]);

  const hasRoleInviteAccess = Boolean(
    currentMember && (currentMember.role === "owner" || currentMember.role === "editor"),
  );

  const canInvite = hasRoleInviteAccess || allowInviteFallback;

  const canManageRoles = currentMember?.role === "owner" || allowInviteFallback;

  const openInviteModal = () => {
    setLocalError(null);
    setLocalSuccess(null);
    setIsInviteModalOpen(true);
  };

  const closeInviteModal = () => {
    if (isSubmitting) {
      return;
    }
    setIsInviteModalOpen(false);
    setLocalError(null);
    setLocalSuccess(null);
    setNameValue("");
    setEmailValue("");
    setRoleValue("viewer");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);
    setLocalSuccess(null);

    const trimmedName = nameValue.trim();
    const trimmedEmail = emailValue.trim();
    if (!trimmedEmail) {
      setLocalError("Enter an email address to send an invite.");
      return;
    }
    if (!trimmedName) {
      setLocalError("Enter a name so teammates know who is joining.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await onInvite({ projectId, email: trimmedEmail, role: roleValue, name: trimmedName });
      if (result) {
        setNameValue("");
        setEmailValue("");
        setRoleValue("viewer");
        if (result.emailWarning) {
          setLocalError(result.emailWarning);
          setLocalSuccess(`Invite created for ${trimmedName}, but email delivery failed. Share the link manually.`);
        } else {
          setLocalSuccess(`Invite email sent to ${trimmedName}.`);
        }
      } else {
        setLocalError("Unable to send invite. Please check the address and try again.");
      }
    } catch (err: any) {
      setLocalError(err?.message ?? "Unable to send invite right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="members" aria-labelledby="project-members-heading">
      <header className="members__header">
        <div>
          <h2 id="project-members-heading">Project team</h2>
          <p>Invite teammates.</p>
        </div>
        {canInvite && (
          <button type="button" className="members__invite-launch" onClick={openInviteModal}>
            Invite teammate
          </button>
        )}
      </header>

      {!canInvite && (
        <p className="members__message members__message--muted">
          Only project owners and editors can send invitations.
        </p>
      )}

      <div className="members__list" role="list">
        {sortedMembers.length === 0 ? (
          <div className="members__empty">No Members Yet.</div>
        ) : (
          sortedMembers.map((member) => {
            const displayName = member.fullName?.trim() || member.email;
            const initials = getInitials(displayName ?? "");
            const isSelf = member.userId === currentUserId || (member.email ?? "").toLowerCase() === normalizedCurrentEmail;
            const statusLabel = statusLabels[member.status] ?? member.status;
            const lockRole =
              member.role === "owner" &&
              ownerCount <= 1 &&
              (isSelf || !canManageRoles);

            return (
              <div key={member.id} className="members__row" role="listitem">
                <div className="members__person">
                  <span className="members__avatar" aria-hidden="true">
                    {initials}
                  </span>
                  <div className="members__details">
                    <strong>{displayName}</strong>
                    <span className="members__email">{member.email}</span>
                  </div>
                </div>
                <div className="members__role">
                  {canManageRoles ? (
                    <select
                      value={member.role}
                      onChange={(event) => onUpdateRole(member.id, event.target.value as MemberRole)}
                      disabled={lockRole || member.status === "pending"}
                      aria-label={`Update role for ${displayName}`}
                    >
                      <option value="owner">Owner</option>
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  ) : (
                    <span className={`members__role-badge members__role-badge--${member.role}`}>
                      {roleLabels[member.role]}
                    </span>
                  )}
                </div>
                <span className="members__status">{statusLabel}</span>
                {canManageRoles && !isSelf && (
                  <button
                    type="button"
                    className="members__remove-button"
                    onClick={() => onRemoveMember(member.id)}
                  >
                    Remove
                  </button>
                )}
                {isSelf && <span className="members__self-tag">You</span>}
              </div>
            );
          })
        )}
      </div>
      {isInviteModalOpen && (
        <div className="members-modal" role="dialog" aria-modal="true" aria-labelledby="members-invite-title">
          <div className="members-modal__backdrop" onClick={closeInviteModal} />
          <div
            className="members-modal__dialog"
            role="document"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="members-modal__header">
              <h3 id="members-invite-title">Invite teammate</h3>
              <button
                type="button"
                className="members-modal__close"
                onClick={closeInviteModal}
                disabled={isSubmitting}
              >
                Close
              </button>
            </header>
            <form className="members-modal__form" onSubmit={handleSubmit}>
              <label className="members__label">
                <span>Name</span>
                <input
                  type="text"
                  value={nameValue}
                  onChange={(event) => setNameValue(event.target.value)}
                  placeholder="Teammate name"
                  disabled={isSubmitting}
                  required
                  autoFocus
                />
              </label>
              <label className="members__label">
                <span>Email</span>
                <input
                  type="email"
                  value={emailValue}
                  onChange={(event) => setEmailValue(event.target.value)}
                  placeholder="teammate@example.com"
                  disabled={isSubmitting}
                  required
                />
              </label>
              <label className="members__label">
                <span>Role</span>
                <select
                  value={roleValue}
                  onChange={(event) => setRoleValue(event.target.value as MemberRole)}
                  disabled={isSubmitting}
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="owner">Owner</option>
                </select>
              </label>
              {localError && <p className="members__message members__message--error">{localError}</p>}
              {localSuccess && <p className="members__message members__message--success">{localSuccess}</p>}
              <div className="members-modal__actions">
                <button
                  type="button"
                  className="members-modal__cancel"
                  onClick={closeInviteModal}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button type="submit" className="members__invite-button members-modal__submit" disabled={isSubmitting}>
                  {isSubmitting ? "Sending..." : "Send invite"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

export default ProjectMembersPanel;
