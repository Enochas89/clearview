import { Resend } from 'resend';
import { InviteError } from './inviteService.js';

const escapeHtml = (value) =>
  value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });

const normalizeUrl = (input) => {
  if (!input) {
    return null;
  }
  try {
    const url = new URL(input);
    return url.toString();
  } catch (_err) {
    return null;
  }
};

const isTruthyString = (value) => typeof value === 'string' && value.trim().length > 0;

export const createResendInviteEmailSender = ({
  apiKey,
  fromAddress,
  appUrl,
  replyTo,
  appName = 'Clearview',
}) => {
  const normalizedUrl = normalizeUrl(appUrl);

  if (!isTruthyString(apiKey) || !isTruthyString(fromAddress) || !normalizedUrl) {
    return null;
  }

  const resend = new Resend(apiKey.trim());
  const buildInviteLink = (email) => {
    try {
      const url = new URL(normalizedUrl);
      url.searchParams.set('mode', 'signup');
      url.searchParams.set('invite', '1');
      if (email) {
        url.searchParams.set('email', email);
      }
      return url.toString();
    } catch (_err) {
      const params = new URLSearchParams();
      params.set('mode', 'signup');
      params.set('invite', '1');
      if (email) {
        params.set('email', email);
      }
      const separator = normalizedUrl.includes('?') ? '&' : '?';
      return `${normalizedUrl}${separator}${params.toString()}`;
    }
  };

  return async ({ member, actor, invitePayload }) => {
    const actorMetadata = actor?.user_metadata ?? {};
    const actorDisplayName =
      actorMetadata.full_name ??
      actorMetadata.name ??
      actor?.email ??
      'A teammate';
    const safeActorName = escapeHtml(actorDisplayName);
    const safeAppName = escapeHtml(appName);
    const safeRole = escapeHtml(invitePayload.role ?? member.role ?? 'viewer');
    const subject = `You're invited to ${safeAppName}`;

    const ctaUrl = buildInviteLink(member.email);
    const safeInviteUrl = escapeHtml(ctaUrl);
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111">
        <p>${safeActorName} invited you to collaborate on <strong>${safeAppName}</strong>.</p>
        <p>Role: <strong>${safeRole}</strong></p>
        <p style="margin: 24px 0;">
          <a href="${safeInviteUrl}" style="background-color: #2563eb; color: #fff; padding: 12px 20px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            Open ${safeAppName}
          </a>
        </p>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p><a href="${safeInviteUrl}" style="color: #2563eb;">${safeInviteUrl}</a></p>
        <p style="margin-top: 32px;">See you inside,<br />The ${safeAppName} Team</p>
      </div>
    `;

    const text = `${safeActorName} invited you to collaborate on ${appName}.

Role: ${safeRole}

Open ${appName}: ${ctaUrl}

If the link doesn't work, copy and paste it into your browser.`;

    const { data, error } = await resend.emails.send({
      from: fromAddress.trim(),
      to: member.email,
      subject,
      html,
      text,
      reply_to: isTruthyString(replyTo) ? replyTo.trim() : undefined,
    });

    if (error) {
      throw new InviteError(502, error.message ?? 'Failed to send invite email.');
    }

    if (!data || !data.id) {
      throw new InviteError(502, 'Failed to send invite email.');
    }
  };
};
