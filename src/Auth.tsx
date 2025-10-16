import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import logo from "./assets/logo.png";

type AuthMode = "signup" | "login";
type AuthStage = "form" | "verify";

const defaultValidity = {
  minLength: false,
  hasNumber: false,
  hasLowerCase: false,
  hasUpperCase: false,
};

const parseAuthParams = () => {
  if (typeof window === "undefined") {
    return { email: "", isSignUp: false, message: null };
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const modeParam = params.get("mode")?.toLowerCase();
    const inviteParam = params.get("invite")?.toLowerCase();
    const emailParam = params.get("email") ?? "";

    const shouldSignUp =
      modeParam === "signup" ||
      inviteParam === "1" ||
      inviteParam === "true" ||
      inviteParam === "yes";

    return {
      email: emailParam.trim(),
      isSignUp: shouldSignUp,
      message: shouldSignUp
        ? "You were invited to Clear View. Create your password to activate the invite."
        : null,
    };
  } catch (_err) {
    return { email: "", isSignUp: false, message: null };
  }
};

const buildEmailRedirect = () => {
  if (typeof window === "undefined") {
    return undefined;
  }
  try {
    const url = new URL(window.location.origin);
    url.searchParams.set("mode", "login");
    return url.toString();
  } catch {
    return undefined;
  }
};

export default function Auth() {
  const inviteContext = useMemo(() => parseAuthParams(), []);
  const [mode, setMode] = useState<AuthMode>(inviteContext.isSignUp ? "signup" : "login");
  const [stage, setStage] = useState<AuthStage>("form");
  const [email, setEmail] = useState(inviteContext.email);
  const [password, setPassword] = useState("");
  const [passwordValidity, setPasswordValidity] = useState(defaultValidity);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(inviteContext.message);
  const [lastSignUpEmail, setLastSignUpEmail] = useState(inviteContext.email || "");

  useEffect(() => {
    if (mode === "login") {
      setPasswordValidity(defaultValidity);
    }
  }, [mode]);

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    if (mode === "signup") {
      setPasswordValidity({
        minLength: value.length >= 8,
        hasNumber: /\d/.test(value),
        hasLowerCase: /[a-z]/.test(value),
        hasUpperCase: /[A-Z]/.test(value),
      });
    }
  };

  const switchMode = (nextMode: AuthMode) => {
    if (nextMode === mode) {
      return;
    }
    setMode(nextMode);
    setStage("form");
    setError(null);
    setStatusMessage(nextMode === "signup" && inviteContext.isSignUp ? inviteContext.message : null);
    setPassword("");
    setPasswordValidity(defaultValidity);
  };

  const resetToLogin = () => {
    setStage("form");
    setMode("login");
    setError(null);
    setStatusMessage("Your invite is confirmed. Sign in to get started.");
    setPassword("");
  };

  const handleAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (stage !== "form") {
      return;
    }

    if (mode === "signup" && !Object.values(passwordValidity).every(Boolean)) {
      setError("Please ensure your password meets all the requirements.");
      return;
    }

    setLoading(true);
    const trimmedEmail = email.trim().toLowerCase();

    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            emailRedirectTo: buildEmailRedirect(),
          },
        });

        if (signUpError) {
          throw signUpError;
        }

        setLastSignUpEmail(trimmedEmail);
        setStage("verify");
        setStatusMessage(
          data?.user
            ? `We sent a confirmation link to ${trimmedEmail}. Open it to finish setting up your account.`
            : "Check your email for the confirmation link to finish setting up your account."
        );
        setPassword("");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (signInError) {
          throw signInError;
        }
        setStatusMessage("Signing you in…");
      }
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const showPasswordHints = mode === "signup" && stage === "form";

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <header className="auth-card__header">
          <div className="auth-card__logo">
            <div className="auth-card__halo" aria-hidden="true" />
            <img src={logo} alt="Clear View" />
          </div>
          <h1>Clear View</h1>
          <p>Built by project managers for project managers.</p>
        </header>

        {inviteContext.isSignUp && stage === "form" && (
          <div className="auth-invite-banner">
            <span className="auth-invite-badge">Invite</span>
            <div className="auth-invite-steps">
              <strong>Finish joining your team:</strong>
              <ol>
                <li>Create a password with the invited email.</li>
                <li>Confirm the link in your inbox.</li>
                <li>Sign in and access your projects.</li>
              </ol>
            </div>
          </div>
        )}

        {stage === "verify" ? (
          <section className="auth-verify">
            <h2>Check your email</h2>
            <p>
              We sent a confirmation link to <strong>{lastSignUpEmail}</strong>. Follow it to
              activate your invite, then return here to sign in.
            </p>
            {statusMessage && <p className="auth-status auth-status--info">{statusMessage}</p>}
            <button
              type="button"
              className="modal__primary auth-verify__button"
              onClick={resetToLogin}
            >
              Go to sign in
            </button>
          </section>
        ) : (
          <>
            <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "signup"}
                className={`auth-tab${mode === "signup" ? " auth-tab--active" : ""}`}
                onClick={() => switchMode("signup")}
                disabled={loading}
              >
                Create account
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "login"}
                className={`auth-tab${mode === "login" ? " auth-tab--active" : ""}`}
                onClick={() => switchMode("login")}
                disabled={loading}
              >
                Sign in
              </button>
            </div>

            {statusMessage && <p className="auth-status auth-status--info">{statusMessage}</p>}
            {error && <p className="auth-status auth-status--error">{error}</p>}

            <form onSubmit={handleAuth} className="auth-form" aria-live="polite">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="auth-input"
                autoComplete="email"
                required
                disabled={loading}
              />

              <label htmlFor="password">{mode === "signup" ? "Create a password" : "Password"}</label>
              <input
                id="password"
                type="password"
                placeholder={mode === "signup" ? "Create a secure password" : "Your password"}
                value={password}
                onChange={(event) => handlePasswordChange(event.target.value)}
                className="auth-input"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                required
                disabled={loading}
              />

              {showPasswordHints && (
                <ul className="auth-password-hints">
                  <li className={passwordValidity.minLength ? "is-valid" : ""}>
                    At least 8 characters
                  </li>
                  <li className={passwordValidity.hasUpperCase ? "is-valid" : ""}>
                    One uppercase letter
                  </li>
                  <li className={passwordValidity.hasLowerCase ? "is-valid" : ""}>
                    One lowercase letter
                  </li>
                  <li className={passwordValidity.hasNumber ? "is-valid" : ""}>
                    One number
                  </li>
                </ul>
              )}

              <div className="auth-actions">
                <button
                  type="submit"
                  className="modal__primary"
                  disabled={loading || (mode === "signup" && !Object.values(passwordValidity).every(Boolean))}
                >
                  {loading ? "Submitting…" : mode === "signup" ? "Create account" : "Sign in"}
                </button>
                <button
                  type="button"
                  className="modal__secondary"
                  onClick={() => switchMode(mode === "signup" ? "login" : "signup")}
                  disabled={loading}
                >
                  {mode === "signup" ? "I already have an account" : "Need an account?"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

