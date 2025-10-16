import {
  createSupabaseAdminClient,
  InviteError,
  parseBearerToken,
  acceptPendingInvitesForUser,
} from '../../backend/inviteService.js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INVITE_EMAIL_APP_URL } = process.env;

let supabaseAdmin;

const getSupabaseAdmin = () => {
  if (supabaseAdmin) {
    return supabaseAdmin;
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured for the invite accept function.');
  }
  supabaseAdmin = createSupabaseAdminClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  return supabaseAdmin;
};

const setCorsHeaders = (req, res) => {
  const origin = req.headers.origin ?? INVITE_EMAIL_APP_URL ?? '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
};

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const supabase = getSupabaseAdmin();

    const token = parseBearerToken(req.headers.authorization);
    if (!token) {
      throw new InviteError(401, 'Missing or invalid authorization header.');
    }

    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData?.user) {
      throw new InviteError(401, 'The session token is invalid or expired.');
    }

    const members = await acceptPendingInvitesForUser({
      supabaseAdmin: supabase,
      user: userData.user,
    });

    return res.status(200).json({ members });
  } catch (err) {
    if (err instanceof InviteError) {
      const payload = { error: err.message };
      if (err.details) {
        payload.details = err.details;
      }
      return res.status(err.statusCode).json(payload);
    }

    console.error('Invite accept function error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
