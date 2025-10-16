import { handleInvite, createSupabaseAdminClient, InviteError } from '../../../backend/inviteService.js';
import { createResendInviteEmailSender } from '../../../backend/emailService.js';

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  RESEND_API_KEY,
  INVITE_EMAIL_FROM,
  INVITE_EMAIL_REPLY_TO,
  INVITE_EMAIL_APP_URL,
  INVITE_EMAIL_APP_NAME,
} = process.env;

let supabaseAdmin;
let inviteEmailSender;

const setCorsHeaders = (res, origin) => {
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
};

const getSupabaseAdmin = () => {
  if (supabaseAdmin) {
    return supabaseAdmin;
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured for the invite function.',
    );
  }

  supabaseAdmin = createSupabaseAdminClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  return supabaseAdmin;
};

const getInviteEmailSender = () => {
  if (inviteEmailSender !== undefined) {
    return inviteEmailSender;
  }

  inviteEmailSender = createResendInviteEmailSender({
    apiKey: RESEND_API_KEY,
    fromAddress: INVITE_EMAIL_FROM,
    replyTo: INVITE_EMAIL_REPLY_TO,
    appUrl: INVITE_EMAIL_APP_URL,
    appName: INVITE_EMAIL_APP_NAME ?? 'Clearview',
  });

  if (!inviteEmailSender) {
    const message =
      'Invite email service is not fully configured. Set RESEND_API_KEY, INVITE_EMAIL_FROM, and INVITE_EMAIL_APP_URL to enable delivery.';
    if (process.env.NODE_ENV !== 'production') {
      console.warn(message);
    }
  }

  return inviteEmailSender;
};

const parseBody = async (req) => {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

  if (!req.body) {
    return {};
  }

  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch (_err) {
      throw new InviteError(400, 'Request body must be valid JSON.');
    }
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch (_err) {
    throw new InviteError(400, 'Request body must be valid JSON.');
  }
};

export default async function handler(req, res) {
  const origin = req.headers.origin ?? process.env.INVITE_EMAIL_APP_URL ?? '*';
  setCorsHeaders(res, origin);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const body = await parseBody(req);
    const { member, emailWarning } = await handleInvite({
      supabaseAdmin: getSupabaseAdmin(),
      projectId: req.query.projectId,
      body,
      authorizationHeader: req.headers.authorization,
      sendEmail: getInviteEmailSender() ?? undefined,
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

    console.error('Invite function error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
