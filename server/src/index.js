import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import {
  handleInvite,
  createSupabaseAdminClient,
  InviteError,
  parseBearerToken,
  acceptPendingInvitesForUser,
} from '../../backend/inviteService.js';
import { createResendInviteEmailSender } from '../../backend/emailService.js';

const {
  PORT = 4000,
  CORS_ORIGIN,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  RESEND_API_KEY,
  INVITE_EMAIL_FROM,
  INVITE_EMAIL_REPLY_TO,
  INVITE_EMAIL_APP_URL,
  INVITE_EMAIL_APP_NAME,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'Missing Supabase configuration. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.',
  );
  process.exit(1);
}

const supabaseAdmin = createSupabaseAdminClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const inviteEmailSender =
  createResendInviteEmailSender({
    apiKey: RESEND_API_KEY,
    fromAddress: INVITE_EMAIL_FROM,
    replyTo: INVITE_EMAIL_REPLY_TO,
    appUrl: INVITE_EMAIL_APP_URL,
    appName: INVITE_EMAIL_APP_NAME ?? 'Clearview',
  }) ?? undefined;

if (!inviteEmailSender) {
  console.warn(
    'Invite email service is not fully configured. Set RESEND_API_KEY, INVITE_EMAIL_FROM, and INVITE_EMAIL_APP_URL to enable delivery.',
  );
}

const app = express();

const corsOrigins = CORS_ORIGIN
  ? CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
  : undefined;

app.use(
  cors({
    origin: corsOrigins ?? true,
  }),
);
app.use(express.json());

app.post('/api/projects/:projectId/invites', async (req, res, next) => {
  try {
    const projectId = req.params.projectId;
    const { member, emailWarning } = await handleInvite({
      supabaseAdmin,
      projectId,
      body: req.body,
      authorizationHeader: req.headers.authorization,
      sendEmail: inviteEmailSender,
    });

    const responsePayload = { member };
    if (emailWarning) {
      responsePayload.emailWarning = emailWarning;
    }

    return res.status(201).json(responsePayload);
  } catch (err) {
    if (err instanceof InviteError) {
      const payload = { error: err.message };
      if (err.details) {
        payload.details = err.details;
      }
      return res.status(err.statusCode).json(payload);
    }
    return next(err);
  }
});

app.post('/api/invites/accept', async (req, res, next) => {
  try {
    const token = parseBearerToken(req.headers.authorization);
    if (!token) {
      throw new InviteError(401, 'Missing or invalid authorization header.');
    }

    const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !userData?.user) {
      throw new InviteError(401, 'The session token is invalid or expired.');
    }

    const members = await acceptPendingInvitesForUser({
      supabaseAdmin,
      user: userData.user,
    });

    res.json({ members });
  } catch (err) {
    if (err instanceof InviteError) {
      const payload = { error: err.message };
      if (err.details) {
        payload.details = err.details;
      }
      return res.status(err.statusCode).json(payload);
    }
    return next(err);
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, _req, res, _next) => {
  console.error('Unexpected error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Invite service running on port ${PORT}`);
});
