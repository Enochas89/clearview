import type { Session } from "@supabase/supabase-js";

type MobileProfilePaneProps = {
  user: Session["user"] | null;
  totalProjects: number;
  totalChangeOrders: number;
  totalNotes: number;
};

const MobileProfilePane = ({
  user,
  totalProjects,
  totalChangeOrders,
  totalNotes,
}: MobileProfilePaneProps) => {
  const name =
    (user?.user_metadata?.full_name as string | undefined) ??
    user?.email ??
    "Teammate";
  const initials = getInitials(name);

  return (
    <section className="mobile-profile">
      <header className="mobile-profile__header">
        <span className="mobile-profile__avatar" aria-hidden="true">
          {initials}
        </span>
        <div>
          <h2>{name}</h2>
          <p>{user?.email}</p>
        </div>
      </header>

      <section className="mobile-profile__stats" aria-label="Activity summary">
        <article>
          <h3>Projects</h3>
          <p>{totalProjects}</p>
        </article>
        <article>
          <h3>Change Orders</h3>
          <p>{totalChangeOrders}</p>
        </article>
        <article>
          <h3>Notes</h3>
          <p>{totalNotes}</p>
        </article>
      </section>

      <section className="mobile-profile__preferences">
        <h3>Notifications</h3>
        <ul>
          <li>
            <label>
              <input type="checkbox" defaultChecked /> Daily digest email
            </label>
          </li>
          <li>
            <label>
              <input type="checkbox" defaultChecked /> Mention push alerts
            </label>
          </li>
          <li>
            <label>
              <input type="checkbox" /> Weekly summary
            </label>
          </li>
        </ul>
      </section>

      <section className="mobile-profile__shortcuts">
        <h3>Quick actions</h3>
        <button type="button">Invite teammate</button>
        <button type="button">Manage workspace</button>
        <button type="button">Sign out</button>
      </section>
    </section>
  );
};

const getInitials = (value: string) => {
  if (!value) {
    return "CV";
  }
  const parts = value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) {
    return value.slice(0, 2).toUpperCase();
  }
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
};

export default MobileProfilePane;
