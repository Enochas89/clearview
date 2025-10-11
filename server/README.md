# Clearview Invite Service

Lightweight Express API that powers the project member invite flow. The service protects writes to the `project_members` table and lets the web UI send authenticated invite requests without exposing a Supabase service role key in the browser.

## Prerequisites

- Node.js 18+
- Supabase project with the `project_members` table already created
- A service role key for the Supabase project

## Setup

1. Install dependencies:
   ```bash
   cd server
   npm install
   ```
2. Copy `.env.example` to `.env` and update the values:
   ```bash
   cp .env.example .env
   ```
   | Variable | Description |
   | --- | --- |
   | `PORT` | Port to run the API on (defaults to `4000`). |
   | `SUPABASE_URL` | Supabase project URL. |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key with access to `project_members`. |
   | `CORS_ORIGIN` | Optional comma-delimited origins allowed to call the API (omit for `*`). |
   | `RESEND_API_KEY` | API key for Resend. Required to send invite emails. |
   | `INVITE_EMAIL_FROM` | Email sender, e.g. `"Clearview Team <team@example.com>"`. |
   | `INVITE_EMAIL_APP_URL` | URL included in the invite email (typically your app URL). |
   | `INVITE_EMAIL_REPLY_TO` | Optional reply-to address. |
   | `INVITE_EMAIL_APP_NAME` | Optional friendly name used in the email copy. |

3. Start the API:
   ```bash
   npm run dev
   ```

The server exposes `POST /api/projects/:projectId/invites`. Provide the Supabase access token in the `Authorization` header (`Bearer <token>`) plus a JSON body:

```json
{
  "email": "teammate@example.com",
  "name": "Teammate Name",
  "role": "editor"
}
```

Add `VITE_INVITE_SERVICE_URL=http://localhost:4000` to the web app's `.env` so the UI routes invite requests through this API. With the Resend variables configured, each successful invite will also trigger an email to the teammate.

## Vercel Deployment

Production deployments on Vercel use the serverless handler in `api/projects/[projectId]/invites.js`, which shares the same invite validation logic defined in `backend/inviteService.js`. This Express server is optional and useful when you need a long-running process or want to debug the invite flow outside of the Vercel runtime.
