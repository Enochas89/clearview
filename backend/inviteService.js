import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

export class InviteError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.name = 'InviteError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const inviteBodySchema = z
  .object({
    email: z
      .string({
        required_error: 'Email is required.',
        invalid_type_error: 'Email must be a string.',
      })
      .trim()
      .min(1, 'Email is required.')
      .email('Provide a valid email address.'),
    name: z
      .string({
        required_error: 'Name is required.',
        invalid_type_error: 'Name must be a string.',
      })
      .trim()
      .min(1, 'Name is required.'),
    role: z
      .enum(['owner', 'editor', 'viewer'], {
        invalid_type_error: 'Role must be owner, editor, or viewer.',
      })
      .default('viewer'),
  })
  .strict();

export const mapMemberFromSupabase = (row) => ({
  id: row.id,
  projectId: row.project_id ?? row.projectId ?? '',
  userId: row.user_id ?? row.userId ?? null,
  email: (row.email ?? '').toLowerCase(),
  role: row.role ?? row.member_role ?? 'viewer',
  status: row.status ?? row.member_status ?? 'pending',
  invitedBy: row.invited_by ?? row.invitedBy ?? '',
  invitedAt: row.invited_at ?? row.invitedAt ?? row.created_at ?? new Date().toISOString(),
  acceptedAt: row.accepted_at ?? row.acceptedAt ?? row.joined_at ?? null,
  fullName: row.full_name ?? row.fullName ?? row.member_name ?? null,
});

const buildMemberUpdatePayload = (input) => {
  const payload = {};
  if (input.userId !== undefined) payload.user_id = input.userId;
  if (input.status !== undefined) payload.status = input.status;
  if (input.acceptedAt !== undefined) payload.accepted_at = input.acceptedAt;
  if (input.fullName !== undefined) payload.full_name = input.fullName;
  return payload;
};

export const parseBearerToken = (authorizationHeader) => {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(' ');
  if (!token || scheme.toLowerCase() !== 'bearer') {
    return null;
  }

  return token;
};

export const createSupabaseAdminClient = (supabaseUrl, serviceRoleKey) => {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase URL and service role key are required to create the admin client.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

export const ensureInvitePayload = (input) => {
  const parsed = inviteBodySchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    throw new InviteError(400, 'Invalid request payload.', issues);
  }
  return parsed.data;
};

const assertProjectId = (projectId) => {
  if (!projectId) {
    throw new InviteError(400, 'Project id is required.');
  }
};

const ensureToken = (token) => {
  if (!token) {
    throw new InviteError(401, 'Missing or invalid authorization header.');
  }
};

const getSessionUser = async (supabaseAdmin, token) => {
  const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !userData?.user) {
    throw new InviteError(401, 'The session token is invalid or expired.');
  }
  return userData.user;
};

const ensureActorPermissions = async ({ supabaseAdmin, projectId, userId, roleRequested, emailRequested }) => {
  const { data: actorMembership, error: membershipError } = await supabaseAdmin
    .from('project_members')
    .select('id, role, status')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle();

  if (membershipError) {
    throw new InviteError(500, 'Failed to verify project permissions.');
  }

  if (!actorMembership || (actorMembership.status ?? 'pending') !== 'accepted') {
    throw new InviteError(403, 'You do not have permission to invite members to this project.');
  }

  if (actorMembership.role !== 'owner' && roleRequested === 'owner') {
    throw new InviteError(403, 'Only project owners can invite new owners.');
  }

  if (emailRequested.actorEmail && emailRequested.actorEmail === emailRequested.targetEmail) {
    throw new InviteError(400, 'You cannot send an invite to your own email.');
  }
};

const ensureUniqueMembership = async ({ supabaseAdmin, projectId, targetEmail }) => {
  const { data: existingMembers, error: existingMembersError } = await supabaseAdmin
    .from('project_members')
    .select('id, email')
    .eq('project_id', projectId);

  if (existingMembersError) {
    console.error('Failed to check existing invites:', existingMembersError);
    const message =
      existingMembersError?.message
        ? `Failed to check existing invites: ${existingMembersError.message}`
        : 'Failed to check existing invites.';
    throw new InviteError(500, message);
  }

  const alreadyExists = (existingMembers ?? []).some((member) => {
    const memberEmail = (member.email ?? '').toLowerCase();
    return memberEmail === targetEmail;
  });

  if (alreadyExists) {
    throw new InviteError(409, 'This email is already associated with the project.');
  }
};

const createInviteRow = async ({ supabaseAdmin, projectId, payload, actorId }) => {
  const insertPayload = {
    project_id: projectId,
    email: payload.email,
    role: payload.role,
    status: 'pending',
    invited_by: actorId,
    invited_at: new Date().toISOString(),
    full_name: payload.name,
  };

  const { data: insertedMember, error: insertError } = await supabaseAdmin
    .from('project_members')
    .insert(insertPayload)
    .select()
    .single();

  if (insertError) {
    throw new InviteError(500, 'Failed to create invite.');
  }

  return mapMemberFromSupabase(insertedMember);
};

export const acceptPendingInvitesForUser = async ({ supabaseAdmin, user }) => {
  const normalizedEmail = (user?.email ?? '').trim().toLowerCase();
  if (!normalizedEmail) {
    throw new InviteError(400, 'User email is required to accept invites.');
  }

  const updatePayload = buildMemberUpdatePayload({
    userId: user.id,
    status: 'accepted',
    acceptedAt: new Date().toISOString(),
    fullName: user.user_metadata?.full_name ?? user.email ?? null,
  });

  const { data, error } = await supabaseAdmin
    .from('project_members')
    .update(updatePayload)
    .eq('email', normalizedEmail)
    .is('user_id', null)
    .eq('status', 'pending')
    .select();

  if (error) {
    console.error('Failed to accept pending invites:', error);
    throw new InviteError(
      500,
      error?.message ? `Failed to accept pending invites: ${error.message}` : 'Failed to accept pending invites.',
    );
  }

  return (data ?? []).map(mapMemberFromSupabase);
};

export const handleInvite = async ({
  supabaseAdmin,
  projectId,
  body,
  authorizationHeader,
  sendEmail,
}) => {
  assertProjectId(projectId);

  const token = parseBearerToken(authorizationHeader);
  ensureToken(token);

  const invitePayload = ensureInvitePayload(body);
  const normalizedEmail = invitePayload.email.toLowerCase();
  const normalizedName = invitePayload.name.trim();

  const actor = await getSessionUser(supabaseAdmin, token);

  await ensureActorPermissions({
    supabaseAdmin,
    projectId,
    userId: actor.id,
    roleRequested: invitePayload.role,
    emailRequested: {
      actorEmail: (actor.email ?? '').toLowerCase(),
      targetEmail: normalizedEmail,
    },
  });

  await ensureUniqueMembership({
    supabaseAdmin,
    projectId,
    targetEmail: normalizedEmail,
  });

  const member = await createInviteRow({
    supabaseAdmin,
    projectId,
    payload: {
      ...invitePayload,
      email: normalizedEmail,
      name: normalizedName,
    },
    actorId: actor.id,
  });

  let emailWarning = null;
  if (typeof sendEmail === 'function') {
    try {
      await sendEmail({
        member,
        actor,
        invitePayload: {
          ...invitePayload,
          email: normalizedEmail,
          name: normalizedName,
        },
      });
    } catch (err) {
      console.error('Failed to send invite email:', err);
      if (err instanceof InviteError) {
        emailWarning = err.message;
      } else if (err && typeof err.message === 'string') {
        emailWarning = err.message;
      } else {
        emailWarning = 'Failed to send invite email.';
      }
    }
  }

  return { member, emailWarning };
};
