/**
 * tg-FeedbackOS: EMAIL_LANG=de turns the template wording German at the send
 * path. These tests send real mails through the SMTP rung (nodemailer mocked)
 * and read what would have gone out: subject, HTML and plain text.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const sendMailMock = vi.fn().mockResolvedValue({ messageId: 'test-msg-id' })
vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({ sendMail: sendMailMock }),
  },
}))

import {
  REPLY_MARKER_TEXT,
  sendChangelogPublishedEmail,
  sendConversationAssignedEmail,
  sendConversationAutoAckEmail,
  sendConversationClosedEmail,
  sendConversationMessageEmail,
  sendCsatRequestEmail,
  sendDomainAttentionEmail,
  sendInvitationEmail,
  sendMagicLinkEmail,
  sendMessengerInstallEmail,
  sendModerationDecisionEmail,
  sendNewCommentEmail,
  sendNewFeedbackEmail,
  sendNewSignInEmail,
  sendNoteMentionEmail,
  sendPasswordResetEmail,
  sendPlanLimitsEmail,
  sendPortalInviteEmail,
  sendPostMentionEmail,
  sendRawEmail,
  sendRecoveryCodeUsedEmail,
  sendSendingDomainAttentionEmail,
  sendSignupNotAllowedEmail,
  sendStatusChangeEmail,
  sendStatusIncidentPublishedEmail,
  sendStatusMaintenanceScheduledEmail,
  sendTicketEventEmail,
  sendVerifyAddressEmail,
  type TicketEmailKind,
} from '../index'
import {
  emailLanguageIsGerman,
  germanLongDate,
  germanShortDate,
  translateEmail,
} from '../translate-de'
import { sealedTo, sendingAs } from './brands'

const ENV_KEYS = [
  'EMAIL_SMTP_HOST',
  'EMAIL_SMTP_PORT',
  'EMAIL_SMTP_USER',
  'EMAIL_SMTP_PASS',
  'EMAIL_SES_ACCESS_KEY_ID',
  'EMAIL_SES_SECRET_ACCESS_KEY',
  'EMAIL_RESEND_API_KEY',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'EMAIL_LANG',
]

const W = 'ToolGui.de'
const URL = 'https://hub.toolgui.test/x/1'
const REPLY_TO = 'reply+abc@in.toolgui.test'
const RATINGS = [
  'https://r.test/1',
  'https://r.test/2',
  'https://r.test/3',
  'https://r.test/4',
  'https://r.test/5',
] as const

interface Sent {
  subject: string
  html: string
  text: string
}

async function capture(send: () => Promise<unknown>): Promise<Sent> {
  sendMailMock.mockClear()
  await send()
  expect(sendMailMock).toHaveBeenCalledTimes(1)
  const call = sendMailMock.mock.calls[0][0]
  return { subject: call.subject, html: call.html, text: call.text }
}

/** Visible words of the HTML: tags out, entities read. */
function visible(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
}

// User content: placed in the props, it must come out byte for byte. Each one
// carries template wording on purpose.
const USER = {
  name: 'Priya Sharma',
  title: 'Sign in: View post fails',
  message: 'How did we do? I could not sign in to View it online.',
  board: 'Ideas & Wishes',
  heading: 'New message about billing',
}

const ticketBase = {
  to: 'requester@example.com',
  ticketLabel: '#142',
  title: USER.title,
  workspaceName: W,
  ctaUrl: URL,
  replyTo: REPLY_TO,
}

/** Every template the hub sends, customer side first. */
const MAILS: Record<string, () => Promise<unknown>> = {
  conversationReply: () =>
    sendConversationMessageEmail({
      to: 'visitor@example.com',
      direction: 'agent_reply',
      senderName: 'Alex',
      messagePreview: USER.message,
      bodyHtml: `<p>${USER.message}</p>`,
      ctaUrl: URL,
      workspaceName: W,
      replyTo: REPLY_TO,
      channel: 'email',
      conversationSubject: USER.heading,
      quotedPrevious: { date: new Date('2026-11-03T09:00:00Z'), name: USER.name, text: 'Hi there' },
    }),
  conversationReplyMessenger: () =>
    sendConversationMessageEmail({
      to: 'visitor@example.com',
      direction: 'agent_reply',
      senderName: 'Alex',
      messagePreview: USER.message,
      ctaUrl: URL,
      workspaceName: W,
      replyTo: REPLY_TO,
      channel: 'messenger',
    }),
  conversationStarted: () =>
    sendConversationMessageEmail({
      to: 'visitor@example.com',
      direction: 'agent_started',
      senderName: 'Alex',
      messagePreview: USER.message,
      ctaUrl: URL,
      workspaceName: W,
      channel: 'messenger',
    }),
  conversationClosed: () =>
    sendConversationClosedEmail({
      to: 'visitor@example.com',
      workspaceName: W,
      variant: 'closed',
      viewUrl: URL,
      ratingUrls: RATINGS,
      replyTo: REPLY_TO,
    }),
  conversationAutoClosed: () =>
    sendConversationClosedEmail({
      to: 'visitor@example.com',
      workspaceName: W,
      variant: 'auto_closed',
      conversationSubject: USER.heading,
      replyTo: REPLY_TO,
    }),
  autoAck: () =>
    sendConversationAutoAckEmail({
      to: 'visitor@example.com',
      workspaceName: W,
      replyTo: REPLY_TO,
    }),
  csat: () =>
    sendCsatRequestEmail({
      to: 'visitor@example.com',
      promptText: '',
      ratingUrls: RATINGS,
      workspaceName: W,
      replyTo: REPLY_TO,
    }),
  ticketCreated: () => sendTicketEventEmail({ ...ticketBase, kind: 'created' }),
  ticketReply: () =>
    sendTicketEventEmail({
      ...ticketBase,
      kind: 'reply',
      authorName: 'Alex',
      messageBody: USER.message,
    }),
  ticketResolved: () =>
    sendTicketEventEmail({
      ...ticketBase,
      kind: 'status_resolved',
      statusChange: { previousLabel: 'Open', newLabel: 'Resolved' },
    }),
  ticketClosed: () =>
    sendTicketEventEmail({ ...ticketBase, kind: 'status_resolved', closedGeneric: true }),
  magicLink: () =>
    sendMagicLinkEmail({
      to: sealedTo('a@example.com'),
      signInUrl: URL,
      code: '123456',
      workspaceName: W,
    }),
  signupNotAllowed: () =>
    sendSignupNotAllowedEmail({ to: 'a@example.com' as never, workspaceName: W }),
  passwordReset: () =>
    sendPasswordResetEmail({ to: sealedTo('a@example.com'), resetLink: URL, workspaceName: W }),
  verifyAddress: () =>
    sendVerifyAddressEmail({ to: 'a@example.com', code: '654321', workspaceName: W }),
  portalInvite: () =>
    sendPortalInviteEmail({ to: sealedTo('a@example.com'), workspaceName: W, inviteLink: URL }),
  statusChange: () =>
    sendStatusChangeEmail({
      to: 'a@example.com',
      postTitle: USER.title,
      postUrl: URL,
      previousStatus: 'open',
      newStatus: 'planned',
      workspaceName: W,
      unsubscribeUrl: URL,
      preferencesUrl: URL,
      isPostAuthor: true,
    }),
  newComment: () =>
    sendNewCommentEmail({
      to: 'a@example.com',
      postTitle: USER.title,
      postUrl: URL,
      commenterName: USER.name,
      commentPreview: USER.message,
      isTeamMember: true,
      workspaceName: W,
      unsubscribeUrl: URL,
    }),
  postMention: () =>
    sendPostMentionEmail({
      to: 'a@example.com',
      mentionerName: USER.name,
      postTitle: USER.title,
      excerpt: USER.message,
      postUrl: URL,
      workspaceName: W,
      unsubscribeUrl: URL,
    }),
  moderationRejected: () =>
    sendModerationDecisionEmail({
      to: 'a@example.com',
      item: 'comment',
      decision: 'rejected',
      postTitle: USER.title,
      workspaceName: W,
    }),
  moderationApproved: () =>
    sendModerationDecisionEmail({
      to: 'a@example.com',
      item: 'post',
      decision: 'approved',
      postTitle: USER.title,
      postUrl: URL,
      workspaceName: W,
      unsubscribeUrl: URL,
    }),
  changelog: () =>
    sendChangelogPublishedEmail({
      to: 'a@example.com',
      changelogTitle: USER.title,
      changelogUrl: URL,
      contentPreview: USER.message,
      contentHtml: `<p>${USER.message}</p><p>Sign in</p>`,
      workspaceName: W,
      unsubscribeUrl: URL,
    }),
  incident: () =>
    sendStatusIncidentPublishedEmail({
      to: 'a@example.com',
      workspaceName: W,
      incidentTitle: USER.title,
      impact: 'major',
      statusLabel: 'Investigating',
      body: USER.message,
      affectedComponents: [{ name: 'API', status: 'Degraded performance' }],
      incidentUrl: URL,
      unsubscribeUrl: URL,
    }),
  maintenance: () =>
    sendStatusMaintenanceScheduledEmail({
      to: 'a@example.com',
      workspaceName: W,
      maintenanceTitle: USER.title,
      body: USER.message,
      startLabel: 'July 12, 2026 at 02:00 UTC',
      endLabel: 'July 12, 2026 at 04:00 UTC',
      affectedComponents: ['API', 'Hub'],
      incidentUrl: URL,
      unsubscribeUrl: URL,
    }),
  invitation: () =>
    sendInvitationEmail({
      to: sealedTo('a@example.com'),
      invitedByName: USER.name,
      workspaceName: W,
      inviteLink: URL,
    }),
  // --- team side ---
  newMessage: () =>
    sendConversationMessageEmail({
      to: 'agent@example.com',
      direction: 'visitor_message',
      senderName: USER.name,
      messagePreview: USER.message,
      ctaUrl: URL,
      workspaceName: W,
      isFirstMessage: true,
    }),
  conversationAssigned: () =>
    sendConversationAssignedEmail({
      to: 'agent@example.com',
      assignedToYou: true,
      customerName: USER.name,
      preview: USER.message,
      conversationUrl: URL,
      workspaceName: W,
      preferencesUrl: URL,
    }),
  ticketAssigned: () => sendTicketEventEmail({ ...ticketBase, kind: 'assigned' }),
  ticketAssignedTeam: () => sendTicketEventEmail({ ...ticketBase, kind: 'assigned_team' }),
  slaWarning: () =>
    sendTicketEventEmail({
      ...ticketBase,
      ticketLabel: '',
      title: USER.name,
      kind: 'sla_warning',
      clockLabel: 'first response',
      dueLabel: 'Nov 3, 09:30 PM UTC',
    }),
  slaBreach: () =>
    sendTicketEventEmail({
      ...ticketBase,
      ticketLabel: '',
      title: 'a customer',
      kind: 'sla_breach',
      clockLabel: 'resolution',
      dueLabel: 'Nov 3, 09:30 AM UTC',
    }),
  noteMention: () =>
    sendNoteMentionEmail({
      to: 'agent@example.com',
      authorName: USER.name,
      preview: USER.message,
      conversationUrl: URL,
      workspaceName: W,
    }),
  newFeedback: () =>
    sendNewFeedbackEmail({
      to: 'agent@example.com',
      title: USER.title,
      preview: USER.message,
      authorName: USER.name,
      boardName: USER.board,
      held: true,
      url: URL,
      workspaceName: W,
      preferencesUrl: URL,
    }),
  sendingDomain: () =>
    sendSendingDomainAttentionEmail({
      to: sealedTo('a@example.com'),
      domain: 'mail.toolgui.test',
      record: { purpose: 'dkim', type: 'CNAME', name: 'x._domainkey', state: 'missing' },
      settingsUrl: URL,
      workspaceName: W,
    }),
  domainAttention: () =>
    sendDomainAttentionEmail({
      to: sealedTo('a@example.com'),
      domain: 'toolgui.test',
      record: { name: '_verify.toolgui.test', value: 'abc123' },
      deadline: 'Dec 1',
      settingsUrl: URL,
      workspaceName: W,
    }),
  planLimits: () =>
    sendPlanLimitsEmail({
      to: sealedTo('a@example.com'),
      kind: 'start',
      workspaceName: W,
      planName: 'Free',
      fromPlanName: 'Pro',
      deadline: 'Dec 1',
      deadlineHeading: 'Tue, Dec 1',
      rows: [{ label: 'Seats', used: 5, cap: 3, effect: 'Extra seats pause' }],
      pausingFeatures: [],
      limitsUrl: URL,
      planUrl: URL,
    }),
  newSignIn: () =>
    sendNewSignInEmail({
      to: sealedTo('a@example.com'),
      workspaceName: W,
      occurredAt: 'Nov 3, 2026, 09:00 UTC',
      ipAddress: '203.0.113.7',
      userAgent: 'Firefox on macOS',
      location: 'Berlin',
      settingsUrl: URL,
    }),
  recoveryCode: () =>
    sendRecoveryCodeUsedEmail({
      to: sealedTo('a@example.com'),
      workspaceName: W,
      occurredAt: 'Nov 3, 2026, 09:00 UTC',
      ipAddress: '203.0.113.7',
      userAgent: 'Firefox on macOS',
    }),
  messengerInstall: () =>
    sendMessengerInstallEmail({
      to: 'dev@example.com',
      senderName: USER.name,
      workspaceName: W,
      snippet: '<script src="https://hub.toolgui.test/widget.js"></script>',
    }),
  // --- further variants of the same templates ---
  followerStatus: () =>
    sendStatusChangeEmail({
      to: 'a@example.com',
      postTitle: USER.title,
      postUrl: URL,
      previousStatus: 'planned',
      newStatus: 'in_progress',
      workspaceName: W,
      unsubscribeUrl: URL,
    }),
  authorComment: () =>
    sendNewCommentEmail({
      to: 'a@example.com',
      postTitle: USER.title,
      postUrl: URL,
      commenterName: USER.name,
      commentPreview: USER.message,
      isTeamMember: false,
      workspaceName: W,
      unsubscribeUrl: URL,
      isPostAuthor: true,
    }),
  anonymousMention: () =>
    sendPostMentionEmail({
      to: 'a@example.com',
      mentionerName: '',
      postTitle: USER.title,
      excerpt: '',
      postUrl: URL,
      workspaceName: W,
    }),
  commentApproved: () =>
    sendModerationDecisionEmail({
      to: 'a@example.com',
      item: 'comment',
      decision: 'approved',
      postTitle: USER.title,
      postUrl: URL,
      workspaceName: W,
    }),
  postRejected: () =>
    sendModerationDecisionEmail({
      to: 'a@example.com',
      item: 'post',
      decision: 'rejected',
      postTitle: USER.title,
      workspaceName: W,
    }),
  feedbackPublished: () =>
    sendNewFeedbackEmail({
      to: 'agent@example.com',
      title: USER.title,
      preview: '',
      authorName: '',
      boardName: USER.board,
      held: false,
      url: URL,
      workspaceName: W,
    }),
  followUpMessage: () =>
    sendConversationMessageEmail({
      to: 'agent@example.com',
      direction: 'visitor_message',
      senderName: USER.name,
      messagePreview: USER.message,
      ctaUrl: URL,
      workspaceName: W,
    }),
  teamAssigned: () =>
    sendConversationAssignedEmail({
      to: 'agent@example.com',
      assignedToYou: false,
      preview: '',
      conversationUrl: URL,
      workspaceName: W,
    }),
  anonymousNote: () =>
    sendNoteMentionEmail({
      to: 'agent@example.com',
      authorName: '',
      preview: USER.message,
      conversationUrl: URL,
      workspaceName: W,
      preferencesUrl: URL,
    }),
  closedCustomPrompt: () =>
    sendConversationClosedEmail({
      to: 'visitor@example.com',
      workspaceName: W,
      variant: 'auto_closed',
      csatPrompt: 'Wie war unser Support?',
      ratingUrls: RATINGS,
    }),
  incidentUnknownStatus: () =>
    sendStatusIncidentPublishedEmail({
      to: 'a@example.com',
      workspaceName: W,
      incidentTitle: USER.title,
      impact: 'none',
      statusLabel: 'Resolved',
      body: '',
      affectedComponents: [{ name: 'Hub', status: 'Operational' }],
      incidentUrl: URL,
      unsubscribeUrl: URL,
      preferencesUrl: URL,
    }),
  inviteeNamed: () =>
    sendInvitationEmail({
      to: sealedTo('a@example.com'),
      invitedByName: USER.name,
      inviteeName: 'Sam',
      workspaceName: W,
      inviteLink: URL,
    }),
  noWorkspaceMagic: () =>
    sendMagicLinkEmail({ to: sealedTo('a@example.com'), signInUrl: URL, code: '123456' }),
  noWorkspaceSignup: () => sendSignupNotAllowedEmail({ to: 'a@example.com' as never }),
  noWorkspaceReset: () => sendPasswordResetEmail({ to: sealedTo('a@example.com'), resetLink: URL }),
  noWorkspaceVerify: () => sendVerifyAddressEmail({ to: 'a@example.com', code: '654321' }),
  noWorkspaceRecovery: () =>
    sendRecoveryCodeUsedEmail({
      to: sealedTo('a@example.com'),
      occurredAt: 'Nov 3, 2026, 09:00 UTC',
    }),
  ssoSignIn: () =>
    sendNewSignInEmail({
      to: sealedTo('a@example.com'),
      occurredAt: 'Nov 3, 2026, 09:00 UTC',
      settingsUrl: URL,
      ssoEnforced: true,
    }),
  signInNoSettings: () =>
    sendNewSignInEmail({
      to: sealedTo('a@example.com'),
      workspaceName: W,
      occurredAt: 'Nov 3, 2026, 09:00 UTC',
    }),
  domainLapsed: () =>
    sendDomainAttentionEmail({
      to: sealedTo('a@example.com'),
      domain: 'toolgui.test',
      record: { name: '_verify.toolgui.test', value: 'abc123' },
      signInDomains: ['toolgui.test', 'hub.toolgui.test'],
    }),
  sendingProxied: () =>
    sendSendingDomainAttentionEmail({
      to: sealedTo('a@example.com'),
      domain: 'mail.toolgui.test',
      record: { purpose: 'mail-from', type: 'MX', name: 'bounce', state: 'proxied' },
      deadline: 'November 23, 2026',
    }),
  sendingMismatch: () =>
    sendSendingDomainAttentionEmail({
      to: sealedTo('a@example.com'),
      domain: 'mail.toolgui.test',
      record: {
        purpose: 'ownership',
        type: 'TXT',
        name: '_amazonses',
        state: 'mismatch',
        seen: 'xyz',
        value: 'abc',
      },
    }),
  sendingTruncated: () =>
    sendSendingDomainAttentionEmail({
      to: sealedTo('a@example.com'),
      domain: 'mail.toolgui.test',
      record: { purpose: 'dkim', type: 'TXT', name: 'k1', state: 'mismatch', reason: 'truncated' },
    }),
  sendingQuoted: () =>
    sendSendingDomainAttentionEmail({
      to: sealedTo('a@example.com'),
      domain: 'mail.toolgui.test',
      record: { purpose: 'dkim', type: 'TXT', name: 'k1', state: 'mismatch', reason: 'quoted' },
    }),
  sendingKey: () =>
    sendSendingDomainAttentionEmail({
      to: sealedTo('a@example.com'),
      domain: 'mail.toolgui.test',
      record: 'signing-key',
    }),
  sendingStopped: () =>
    sendSendingDomainAttentionEmail({ to: sealedTo('a@example.com'), domain: 'mail.toolgui.test' }),
  planReminder: () =>
    sendPlanLimitsEmail({
      to: sealedTo('a@example.com'),
      kind: 'reminder',
      workspaceName: W,
      deadline: 'Dec 1',
      deadlineHeading: 'Tue, Dec 1',
      rows: [
        { label: 'Seats', used: 5, cap: 3, effect: 'Extra seats pause' },
        { label: 'Boards', used: 4, cap: 2, effect: 'Extra boards pause' },
      ],
      pausingFeatures: ['Custom domain', 'SSO'],
      limitsUrl: URL,
      planUrl: URL,
    }),
  planFeaturesOnly: () =>
    sendPlanLimitsEmail({
      to: sealedTo('a@example.com'),
      kind: 'start',
      deadline: 'Dec 1',
      deadlineHeading: 'Tue, Dec 1',
      rows: [],
      pausingFeatures: ['Custom domain'],
      limitsUrl: null,
      planUrl: URL,
    }),
  planEnforced: () =>
    sendPlanLimitsEmail({
      to: sealedTo('a@example.com'),
      kind: 'enforced',
      workspaceName: W,
      planName: 'Free',
      deadline: 'Dec 1',
      deadlineHeading: 'Tue, Dec 1',
      rows: [{ label: 'Seats', used: 5, cap: 3, effect: 'Extra seats are paused' }],
      pausingFeatures: ['Custom domain', 'SSO'],
      limitsUrl: URL,
      planUrl: URL,
    }),
  testMail: () =>
    sendRawEmail({
      from: sendingAs('support@toolgui.test'),
      to: 'a@example.com',
      subject: 'Test email from support@toolgui.test',
      text: "This is a test from support@toolgui.test. If you're reading it, email can be sent from this address.",
      html: '<p>This is a test from support@toolgui.test. If you&#x27;re reading it, email can be sent from this address.</p>',
    }),
}

/** The main English template sentences. None may survive in a German mail. */
const ENGLISH = [
  'You received this email because',
  "You're receiving this because",
  "You're getting this because",
  'Reply to this email to continue the conversation',
  'View it online',
  'wrote:',
  'We received your email',
  'Not sorted?',
  'Need anything else?',
  "haven't heard back",
  'marked this conversation as resolved',
  'Conversation resolved',
  'Conversation closed',
  'Click a face above',
  "We've got your ticket",
  'We received your ticket',
  'is with the',
  'View your ticket',
  'New reply on',
  'Your ticket was',
  'Replying reopens it',
  'replying reopens it',
  'Open in inbox',
  'assigned to you',
  'SLA approaching breach',
  'SLA at risk',
  'SLA breached',
  'needs a',
  'Sign in to',
  'Click the button below',
  'Or enter this code',
  'expire in 10 minutes',
  "If you didn't",
  'is your code for',
  'No account for this address',
  'Someone asked for a sign-in link',
  'Reset your',
  'Reset Password',
  'Or copy and paste this link',
  'Confirm your email',
  'Enter this code',
  'verification code',
  "You've been invited",
  'Accept invitation',
  "weren't expecting",
  'invited you to',
  'Not expecting this?',
  'Your feedback is now',
  'Great news!',
  'View Feedback',
  'Unsubscribe',
  'Manage notification preferences',
  'New comment on',
  'commented on',
  'View Comment',
  'mentioned you in',
  'You were mentioned',
  'Turn off all email',
  'Your comment was not published',
  'Your post is now public',
  'team reviewed your',
  'New update',
  'just published',
  'View Update',
  'New incident reported',
  'just posted an update',
  'Major impact',
  'Affected services',
  'View live status',
  'Scheduled maintenance',
  'has scheduled maintenance',
  'Maintenance window',
  'View status page',
  'New message',
  'started a conversation',
  'Open inbox',
  'A conversation with',
  'Open conversation',
  'internal note',
  'Internal notes are visible',
  'New feedback',
  'posted on',
  'Customers cannot see it',
  'Review post',
  'needs attention',
  'is missing',
  'Add it back by',
  'Open email settings',
  'Open domain settings',
  'to check again',
  'Action needed',
  'is over the limits',
  'Nothing is deleted',
  'Review issues',
  'Upgrade to',
  'New sign-in to your account',
  'Someone just signed in',
  'When:',
  'Device:',
  'Location:',
  'If that was you',
  'set or change your password',
  'from your profile settings',
  'These alerts are required',
  'A recovery code',
  'recovery codes',
  'If this was you',
  'Add Messenger to the website',
  'asked you to put',
  'Using Google Tag Manager',
  'will see Messenger connect',
  'Test email from',
  'This is a test from',
  'Powered by',
  'Degraded performance',
  'Investigating',
]

describe('translateEmail (EMAIL_LANG=de)', () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key]
      delete process.env[key]
    }
    process.env.EMAIL_SMTP_HOST = 'smtp.example.com'
    process.env.EMAIL_FROM = 'noreply@example.com'
    process.env.EMAIL_LANG = 'de'
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] !== undefined) process.env[key] = saved[key]
      else delete process.env[key]
    }
  })

  it.each(Object.keys(MAILS))('%s: no English template sentence is left', async (name) => {
    const mail = await capture(MAILS[name])
    // The user content carries template wording on purpose; it is checked apart.
    // Headings are uppercased in the plain text, so compare in lower case.
    let words = `${mail.subject}\n${visible(mail.html)}\n${mail.text}`.toLowerCase()
    for (const value of Object.values(USER)) words = words.split(value.toLowerCase()).join(' ')
    const left = ENGLISH.filter((phrase) => words.includes(phrase.toLowerCase()))
    expect(left, `${name} still says: ${left.join(' | ')}`).toEqual([])
    if (name !== 'testMail') expect(mail.html).toMatch(/<html[^>]* lang="de"/)
    // No dash as punctuation in our German.
    expect(words).not.toMatch(/[–—]/)
  })

  it.each(Object.keys(MAILS))('%s: user content and links come out unchanged', async (name) => {
    process.env.EMAIL_LANG = ''
    const english = await capture(MAILS[name])
    process.env.EMAIL_LANG = 'de'
    const german = await capture(MAILS[name])
    const count = (haystack: string, value: string) => haystack.split(value).length - 1
    for (const value of [...Object.values(USER), URL]) {
      expect(count(german.subject, value), `${name} subject: ${value}`).toBe(
        count(english.subject, value)
      )
      expect(count(visible(german.html), value), `${name} html: ${value}`).toBe(
        count(visible(english.html), value)
      )
      expect(count(german.text, value), `${name} text: ${value}`).toBe(count(english.text, value))
    }
    const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1])
    expect(hrefs(german.html)).toEqual(hrefs(english.html))
  })

  it('leaves template wording alone where a customer or agent wrote it', async () => {
    // Subject and heading of the human reply are the conversation's subject.
    for (const subject of [
      'My account needs attention',
      'Sign in to my account fails',
      'New message',
    ]) {
      const mail = await capture(() =>
        sendConversationMessageEmail({
          to: 'visitor@example.com',
          direction: 'agent_reply',
          senderName: 'Alex',
          // One line, no HTML: it is also the hidden preview and the body.
          messagePreview: 'Reset your password',
          ctaUrl: URL,
          workspaceName: W,
          replyTo: REPLY_TO,
          channel: 'email',
          conversationSubject: subject,
        })
      )
      expect(mail.subject).toBe(`Re: ${subject}`)
      expect(visible(mail.html)).toContain(subject)
      expect(mail.text).toContain(subject.toUpperCase())
      expect(mail.html).toContain('data-skip-in-text="true">Reset your password')
      expect(mail.text).toContain('\nReset your password\n')
      // Our own wording in the same mail is still German.
      expect(mail.html).toContain('ToolGui.de Support')
    }

    const alert = await capture(() =>
      sendConversationMessageEmail({
        to: 'agent@example.com',
        direction: 'visitor_message',
        senderName: USER.name,
        messagePreview: 'My subscription is now paused.',
        ctaUrl: URL,
        workspaceName: W,
      })
    )
    expect(alert.subject).toBe(`${USER.name}: My subscription is now paused.`)
    expect(alert.text).toContain('\nMy subscription is now paused.\n')

    const ticket = await capture(() =>
      sendTicketEventEmail({
        ...ticketBase,
        kind: 'reply',
        authorName: 'Alex',
        messageBody: 'Thanks for your support\n\nValue: 42\n\nWhen: tomorrow',
      })
    )
    expect(ticket.text).toContain('\nThanks for your support\n')
    expect(ticket.text).toContain('\nValue: 42\n')
    expect(ticket.html).toContain('>Thanks for your support<')
    expect(ticket.html).toContain('>Value: 42<')
    expect(ticket.html).toContain('>When: tomorrow<')
  })

  it('keeps the reply marker exactly, so inbound replies are still cut', async () => {
    for (const name of [
      'conversationReply',
      'conversationClosed',
      'autoAck',
      'csat',
      'ticketReply',
    ]) {
      const mail = await capture(MAILS[name])
      expect(mail.html, name).toContain(REPLY_MARKER_TEXT)
      expect(mail.text, name).toContain(REPLY_MARKER_TEXT)
    }
  })

  it('writes the customer conversation mails in German', async () => {
    const reply = await capture(MAILS.conversationReply)
    expect(reply.subject).toBe(`Re: ${USER.heading}`)
    expect(reply.html).toContain('ToolGui.de Support')
    expect(reply.html).toContain('Antworte einfach auf diese Mail, um das Gespräch fortzusetzen')
    expect(reply.html).toContain('Online ansehen')
    expect(reply.text).toContain(`Am 3. Nov. schrieb ${USER.name}:`)
    // The customer's own words, inside the body, stay English.
    expect(reply.html).toContain(USER.message)

    const closed = await capture(MAILS.conversationClosed)
    expect(closed.subject).toBe('Re: Dein Gespräch mit ToolGui.de')
    expect(closed.html).toContain('Gespräch erledigt')
    expect(closed.text).toContain('GESPRÄCH ERLEDIGT')
    expect(closed.html).toContain('Wie zufrieden warst du?')
    expect(closed.html).toContain(
      'Noch nicht gelöst? Antworte einfach auf diese Mail, dann öffnen wir das Gespräch wieder.'
    )

    const ack = await capture(MAILS.autoAck)
    expect(ack.subject).toBe('Re: Deine Nachricht an ToolGui.de')
    expect(ack.text).toContain('Wir haben deine Mail bekommen und melden uns bald bei dir.')

    const csat = await capture(MAILS.csat)
    expect(csat.html).toContain('Wie zufrieden warst du?')
    expect(csat.text).toContain(
      'Du bekommst diese Mail, weil du ein Gespräch mit ToolGui.de hattest.'
    )
  })

  it('writes the ticket mails in German with title and label untouched', async () => {
    const created = await capture(MAILS.ticketCreated)
    expect(created.subject).toBe(`Wir haben dein Ticket #142 bekommen: ${USER.title}`)
    expect(created.text).toContain(
      `Dein Ticket #142 „${USER.title}“ liegt beim Team von ToolGui.de.`
    )

    const reply = await capture(MAILS.ticketReply)
    expect(reply.subject).toBe(`Neue Antwort zu #142: ${USER.title}`)
    expect(reply.text).toContain(`Alex hat auf #142 „${USER.title}“ geantwortet:`)

    const resolved = await capture(MAILS.ticketResolved)
    expect(resolved.subject).toBe('Dein Ticket #142 ist erledigt')

    const team = await capture(MAILS.ticketAssignedTeam)
    expect(team.subject).toBe('Ticket #142 ist deinem Team zugewiesen')

    const sla = await capture(MAILS.slaWarning)
    expect(sla.subject).toBe('SLA in Gefahr: Erste Antwort fällig am 3. Nov., 21:30 UTC')
    expect(sla.text).toContain(`Das Gespräch mit ${USER.name} braucht bald eine erste Antwort.`)

    const breach = await capture(MAILS.slaBreach)
    expect(breach.subject).toBe('SLA verletzt: Lösung für einen Kunden')
    expect(breach.text).toContain(
      'Das Gespräch mit einem Kunden hat das Ziel für die Lösung überschritten.'
    )
    expect(breach.text).toContain('Lösung war fällig am 3. Nov., 09:30 UTC')
  })

  it('writes sign-in, password and invitation mails in German', async () => {
    const magic = await capture(MAILS.magicLink)
    expect(magic.subject).toBe('123456 ist dein Code für ToolGui.de')
    expect(magic.html).toContain('Bei ToolGui.de anmelden')
    expect(magic.text).toContain('BEI TOOLGUI.DE ANMELDEN')
    expect(magic.text).toContain('Anmelden https://hub.toolgui.test/x/1')

    const reset = await capture(MAILS.passwordReset)
    expect(reset.subject).toBe('Neues Passwort für ToolGui.de')

    const portal = await capture(MAILS.portalInvite)
    expect(portal.subject).toBe('Du bist zu ToolGui.de eingeladen')
    expect(portal.html).toContain('Du bist zum Portal von <strong>ToolGui.de</strong> eingeladen.')

    const signIn = await capture(MAILS.newSignIn)
    expect(signIn.text).toContain(
      'Wenn du das warst, musst du nichts tun. Wenn nicht, ändere dein Passwort https://hub.toolgui.test/x/1 in deinen Profileinstellungen.'
    )
  })

  it('writes the status page mails in German', async () => {
    const incident = await capture(MAILS.incident)
    expect(incident.subject).toBe(`Störung: ${USER.title}`)
    expect(incident.text).toContain('Große Auswirkung · Wird untersucht')
    expect(incident.text).toContain('API: Eingeschränkte Leistung')

    const plan = await capture(MAILS.planLimits)
    expect(plan.text).toContain('KLÄRE 1 PUNKT BIS DI., 1. DEZ.')
    expect(plan.text).toContain('Kläre 1 Punkt bis 1. Dez. oder behalte mit einem Upgrade alles.')
    expect(plan.text).toContain('Seats: 5 von 3.')

    const domain = await capture(MAILS.domainAttention)
    expect(domain.text).toContain(
      'Trag ihn bis 1. Dez. wieder ein, damit toolgui.test verifiziert bleibt.'
    )

    const features = await capture(MAILS.planFeaturesOnly)
    expect(features.subject).toBe('Dein Workspace: Einige Funktionen pausieren nach 1. Dez.')
    expect(features.text).toContain('pausiert nach 1. Dez.\n')

    const maintenance = await capture(MAILS.maintenance)
    expect(maintenance.text).toContain('12. Juli 2026 um 02:00 UTC bis 12. Juli 2026 um 04:00 UTC')
  })

  it('leaves a German body alone and passes the reply marker and URLs through', () => {
    const html = `<html lang="en"><body><p>${REPLY_MARKER_TEXT}</p><p>Hallo, wie geht es?</p><a href="https://x.test/Sign in">Sign in</a></body></html>`
    const out = translateEmail({
      subject: 'Hallo',
      html,
      text: `${REPLY_MARKER_TEXT}\nSign in https://x.test/View it online`,
    })
    expect(out.subject).toBe('Hallo')
    expect(out.html).toContain(REPLY_MARKER_TEXT)
    expect(out.html).toContain('href="https://x.test/Sign in">Anmelden</a>')
    expect(out.text).toBe(`${REPLY_MARKER_TEXT}\nAnmelden https://x.test/View it online`)
  })

  it('formats the app dates in German', () => {
    expect(germanShortDate('Nov 3')).toBe('3. Nov.')
    expect(germanShortDate('Mar 14, 12:05 AM UTC')).toBe('14. März, 00:05 UTC')
    expect(germanShortDate('soon')).toBe('soon')
    expect(germanShortDate('Mon, Nov 23, 2027')).toBe('Mo., 23. Nov. 2027')
    expect(germanLongDate('July 12, 2026 at 02:00 UTC')).toBe('12. Juli 2026 um 02:00 UTC')
    expect(germanLongDate('November 23, 2026')).toBe('23. November 2026')
  })
})

describe('without EMAIL_LANG', () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key]
      delete process.env[key]
    }
    process.env.EMAIL_SMTP_HOST = 'smtp.example.com'
    process.env.EMAIL_FROM = 'noreply@example.com'
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] !== undefined) process.env[key] = saved[key]
      else delete process.env[key]
    }
  })

  it('sends the English templates unchanged', async () => {
    expect(emailLanguageIsGerman()).toBe(false)
    const closed = await capture(MAILS.conversationClosed)
    expect(closed.subject).toBe('Re: your conversation with ToolGui.de')
    expect(closed.html).toContain('Conversation resolved')
    expect(closed.html).toMatch(/<html[^>]* lang="en"/)

    const ticket = await capture(() =>
      sendTicketEventEmail({ ...ticketBase, kind: 'created' as TicketEmailKind })
    )
    expect(ticket.subject).toBe(`We received your ticket #142: ${USER.title}`)
  })

  it('treats any other value as English', async () => {
    process.env.EMAIL_LANG = 'en'
    expect(emailLanguageIsGerman()).toBe(false)
    const magic = await capture(MAILS.magicLink)
    expect(magic.subject).toBe('123456 is your code for ToolGui.de')
  })
})
