# Deploying to Vercel

The project ships with a `vercel.json` and a serverless invite function at `api/projects/[projectId]/invites.js`, so the UI and invite API can live on the same deployment.

## 1. Connect the Repository

1. Push the project to GitHub (or another git provider supported by Vercel).
2. In Vercel, create a new project and import the repository.
3. When asked for the framework preset, choose **Other**. The build command and output directory come from `vercel.json`.

## 2. Configure Environment Variables

Configure these for both **Production** and **Preview** environments:

| Name | Scope | Description |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Build & Runtime | Supabase project URL used by the browser app. |
| `VITE_SUPABASE_ANON_KEY` | Build & Runtime | Supabase anon key used by the browser app. |
| `SUPABASE_SERVICE_ROLE_KEY` | Runtime (Server) | Supabase service role key for the invite API (`project_members` writes). Keep this secret. |
| `VITE_INVITE_SERVICE_URL` | Build | Set to `/api` so the browser calls the co-located invite API. |
| `RESEND_API_KEY` | Runtime (Server) | Resend API key used to send invite emails. |
| `INVITE_EMAIL_FROM` | Runtime (Server) | Sender, e.g. `"Clearview Team <team@example.com>"`. |
| `INVITE_EMAIL_APP_URL` | Runtime (Server) | The URL included in the invite email (your deployed app). |
| `INVITE_EMAIL_REPLY_TO` | Runtime (Server) | Optional reply-to address. |
| `INVITE_EMAIL_APP_NAME` | Runtime (Server) | Optional friendly product name shown in the email. |

Tip: When using `vercel dev` locally, place the same settings in a `.env.local` file at the project root so both Vite and the API can read them.

## 3. Build & Routes

`vercel.json` provides:

- `npm run build` as the static build command (outputs to `dist/`).
- `npm run dev` for `vercel dev`.
- SPA rewrites so client-side routing continues to work without 404s.
- Automatic exposure of any functions under `api/` (including the invite endpoint).

## 4. Local Verification

Run the stack exactly as Vercel would:

```bash
npm install
vercel dev
```

Visit `http://localhost:3000`. Front-end changes hot reload, and the invite modal posts to `/api/projects/:projectId/invites`, exercising the local serverless function.

## 5. Deploy

Push to the connected branch (for example, `main`). Vercel installs dependencies, builds the Vite app, and serves the invite API at `https://<your-app>.vercel.app/api/projects/:projectId/invites`.

Monitor the first deployment to confirm the environment variables are in place. A 500 response from the invite endpoint usually means `SUPABASE_SERVICE_ROLE_KEY` is missing or scoped incorrectly. If invites are created but no email is delivered, double-check the Resend variables (API key, sender, and app URL).
