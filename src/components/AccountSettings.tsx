import { FormEvent, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

type AccountSettingsProps = {
  user: User;
  onUpdateProfile: (input: { fullName: string }) => Promise<void>;
  isSaving: boolean;
  errorMessage: string | null;
  successMessage: string | null;
};

const AccountSettings = ({
  user,
  onUpdateProfile,
  isSaving,
  errorMessage,
  successMessage,
}: AccountSettingsProps) => {
  const [fullName, setFullName] = useState(() => user.user_metadata?.full_name ?? "");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    setFullName(user.user_metadata?.full_name ?? "");
    setTouched(false);
  }, [user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextFullName = fullName.trim();
    if (!nextFullName) {
      setTouched(true);
      return;
    }
    await onUpdateProfile({ fullName: nextFullName });
  };

  const showRequiredError = touched && fullName.trim().length === 0;

  return (
    <section className="account">
      <header className="account__header">
        <div>
          <h2>Account settings</h2>
          <p>Review your personal details or update how your name appears to teammates.</p>
        </div>
      </header>

      <div className="account__grid">
        <article className="account__card">
          <h3>Profile</h3>
          <p className="account__description">Update your display name. This is shared with project members.</p>
          <form className="account__form" onSubmit={handleSubmit}>
            <label className="account__label" htmlFor="account-full-name">
              Display name
            </label>
            <input
              id="account-full-name"
              type="text"
              value={fullName}
              onChange={(event) => {
                setFullName(event.target.value);
                if (!touched) {
                  setTouched(true);
                }
              }}
              placeholder="Your name"
              disabled={isSaving}
              className={showRequiredError ? "has-error" : undefined}
              autoComplete="name"
            />
            {showRequiredError && <p className="account__error">Display name is required.</p>}
            {errorMessage && <p className="account__error">{errorMessage}</p>}
            {successMessage && <p className="account__success">{successMessage}</p>}
            <div className="account__actions">
              <button type="submit" className="account__primary" disabled={isSaving}>
                {isSaving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </article>

        <article className="account__card">
          <h3>Account details</h3>
          <dl className="account__details">
            <div>
              <dt>Email</dt>
              <dd>{user.email ?? "Not set"}</dd>
            </div>
            <div>
              <dt>User ID</dt>
              <dd>
                <code>{user.id}</code>
              </dd>
            </div>
            <div>
              <dt>Last sign in</dt>
              <dd>{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : "Not available"}</dd>
            </div>
          </dl>
        </article>
      </div>
    </section>
  );
};

export default AccountSettings;
