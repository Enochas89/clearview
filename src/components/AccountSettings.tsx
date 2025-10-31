import { useEffect } from "react";
import { useForm } from "react-hook-form";
import type { User } from "@supabase/supabase-js";

type AccountSettingsProps = {
  user: User;
  onUpdateProfile: (input: { fullName: string }) => Promise<void>;
  isSaving: boolean;
  errorMessage: string | null;
  successMessage: string | null;
};

type AccountFormValues = {
  fullName: string;
};

const AccountSettings = ({
  user,
  onUpdateProfile,
  isSaving,
  errorMessage,
  successMessage,
}: AccountSettingsProps) => {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AccountFormValues>({
    defaultValues: {
      fullName: user.user_metadata?.full_name ?? "",
    },
  });

  useEffect(() => {
    reset({ fullName: user.user_metadata?.full_name ?? "" });
  }, [reset, user]);

  const onSubmit = handleSubmit(async ({ fullName }) => {
    const trimmed = fullName.trim();
    if (!trimmed) {
      return;
    }
    await onUpdateProfile({ fullName: trimmed });
  });

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
          <form className="account__form" onSubmit={onSubmit}>
            <label className="account__label" htmlFor="account-full-name">
              Display name
            </label>
            <input
              id="account-full-name"
              type="text"
              {...register("fullName", {
                required: "Display name is required.",
                validate: (value) =>
                  value.trim().length > 0 || "Display name is required.",
              })}
              placeholder="Your name"
              disabled={isSaving || isSubmitting}
              className={errors.fullName ? "has-error" : undefined}
              autoComplete="name"
            />
            {errors.fullName && <p className="account__error">{errors.fullName.message}</p>}
            {errorMessage && <p className="account__error">{errorMessage}</p>}
            {successMessage && <p className="account__success">{successMessage}</p>}
            <div className="account__actions">
              <button type="submit" className="account__primary" disabled={isSaving || isSubmitting}>
                {isSaving || isSubmitting ? "Saving..." : "Save changes"}
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
