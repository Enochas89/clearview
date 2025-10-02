import { FormEvent, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";

type ProfileFormState = {
  email: string;
  fullName: string;
};

type AccountBannerProps = {
  user: User | null;
  onUpdateProfile: (input: ProfileFormState) => Promise<void>;
  onSignOut: () => void;
};

const AccountBanner = ({ user, onUpdateProfile, onSignOut }: AccountBannerProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileFormState>(() => ({
    email: user?.email ?? "",
    fullName: (user?.user_metadata?.full_name as string | undefined) ?? "",
  }));

  useEffect(() => {
    setProfileForm({
      email: user?.email ?? "",
      fullName: (user?.user_metadata?.full_name as string | undefined) ?? "",
    });
    setFeedback(null);
    setIsEditing(false);
  }, [user]);

  const displayName = profileForm.fullName || user?.email || "Account";

  const initials = useMemo(() => {
    const source = profileForm.fullName || user?.email || "";
    return source
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase())
      .slice(0, 2)
      .join("") || "CV";
  }, [profileForm.fullName, user?.email]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) {
      return;
    }

    const email = profileForm.email.trim();
    const fullName = profileForm.fullName.trim();

    if (!email || !fullName) {
      setFeedback({ type: "error", message: "Email and name are required." });
      return;
    }

    setIsSaving(true);
    setFeedback(null);
    try {
      await onUpdateProfile({ email, fullName });
      setFeedback({ type: "success", message: "Profile updated." });
      setIsEditing(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update profile.";
      setFeedback({ type: "error", message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <header className="topbar">
      <div className="topbar__main">
        <div className="topbar__identity">
          <div className="topbar__avatar" aria-hidden>{initials}</div>
          <div className="topbar__meta">
            <strong>{displayName}</strong>
            <span>{profileForm.email || "No email on file"}</span>
          </div>
        </div>
        <div className="topbar__actions">
          <button
            type="button"
            className="topbar__button"
            onClick={() => {
              if (!user) return;
              setIsEditing((prev) => !prev);
              setFeedback(null);
            }}
            disabled={!user}
          >
            {isEditing ? "Cancel" : "Edit profile"}
          </button>
          <button type="button" className="topbar__button topbar__button--signout" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </div>
      {isEditing && (
        <form className="topbar__form" onSubmit={handleSubmit}>
          <div className="topbar__form-grid">
            <label>
              Full name
              <input
                type="text"
                value={profileForm.fullName}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, fullName: event.target.value }))}
                placeholder="Your name"
                required
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={profileForm.email}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="name@example.com"
                required
              />
            </label>
          </div>
          {feedback && (
            <p className={`topbar__status topbar__status--${feedback.type}`}>
              {feedback.message}
            </p>
          )}
          <div className="topbar__form-actions">
            <button type="submit" className="topbar__button topbar__button--primary" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save profile"}
            </button>
          </div>
        </form>
      )}
    </header>
  );
};

export default AccountBanner;