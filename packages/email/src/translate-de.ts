/**
 * tg-FeedbackOS: German email wording without touching the templates.
 *
 * With `EMAIL_LANG=de` every mail the send path renders goes through
 * `translateEmail` once, after rendering: the subject, the HTML and the plain
 * text. The templates stay exactly as upstream wrote them, so merging
 * FeedbackOS never conflicts with a translation.
 *
 * How it stays away from what people wrote:
 * - A mail only meets the phrases of its own template group, picked by its
 *   email type. The human reply (agent's words, customer's subject as the
 *   heading) meets nothing but its footer, support line and quote line.
 * - Subjects only meet template headlines, never sentence rules.
 * - A phrase matches only a whole unit: a whole text node in the HTML, a whole
 *   line in the plain text, the whole subject. "Sign in" inside a customer's
 *   message is a part of a node and is left alone. Rules marked `link`,
 *   `heading`, `strong` or `eyebrow` only match inside a link or button, a
 *   heading (or the hidden preview line), a bold label or the support line.
 * - The dynamic parts of a phrase (names, titles, ticket labels, the
 *   workspace name) are captured and written back byte for byte.
 * - URLs (href, src, links in the plain text) and the reply marker are masked
 *   before matching and put back afterwards, so they cannot change.
 *
 * What remains: a customer's text that is, as a whole node, exactly one of
 * the template sentences of the same mail type would be translated too.
 *
 * Phrases are written once in plain English. They are compiled per target:
 * in the HTML an apostrophe also matches `&#x27;` and `’`, a quote `&quot;`,
 * React's `<!-- -->` text separators are removed first, and the plain text
 * also gets an UPPERCASE variant because headings are uppercased there.
 * Rules run longest first, so a specific sentence wins over a shorter one.
 */

import { REPLY_MARKER_TEXT } from './reply-marker'

/** True when `EMAIL_LANG=de`: every outgoing mail is sent in German. */
export function emailLanguageIsGerman(): boolean {
  return process.env.EMAIL_LANG === 'de'
}

export interface TranslatableEmail {
  subject: string
  html?: string
  text?: string
  /** The send path's email type (`MagicLinkEmail`, …): only that template's phrases apply. */
  emailType?: string
}

type Target = 'html' | 'text' | 'subject'
type Values = Record<string, string>

interface Phrase {
  /** English with `{name}` or `{name:kind}` placeholders. */
  en: string
  /** German with the same placeholders, or a function of the captured values. */
  de: string | ((v: Values) => string)
  /** Which ends of the unit the phrase must touch. Default `both` (whole unit). */
  anchor?: 'both' | 'start' | 'end' | 'none'
  /** Only inside a link or button, a heading or preview, a bold label, or the support line. */
  at?: 'link' | 'heading' | 'strong' | 'eyebrow'
}

interface Kind {
  /** A closed set of values; the captured value must be one of them. */
  alts?: readonly string[]
  /** A regex (non-capturing groups only) the value must match. */
  re?: string
  /** German for known values, looked up in lower case. Others pass through. */
  map?: Record<string, string>
  conv?: (value: string) => string
}

// ---------------------------------------------------------------------------
// Dates (en-US as the app formats them) into German
// ---------------------------------------------------------------------------

const SHORT_MONTHS: Record<string, string> = {
  jan: 'Jan.',
  feb: 'Feb.',
  mar: 'März',
  apr: 'Apr.',
  may: 'Mai',
  jun: 'Juni',
  jul: 'Juli',
  aug: 'Aug.',
  sep: 'Sept.',
  oct: 'Okt.',
  nov: 'Nov.',
  dec: 'Dez.',
}

const LONG_MONTHS: Record<string, string> = {
  january: 'Januar',
  february: 'Februar',
  march: 'März',
  april: 'April',
  may: 'Mai',
  june: 'Juni',
  july: 'Juli',
  august: 'August',
  september: 'September',
  october: 'Oktober',
  november: 'November',
  december: 'Dezember',
}

const WEEKDAYS: Record<string, string> = {
  mon: 'Mo.',
  tue: 'Di.',
  wed: 'Mi.',
  thu: 'Do.',
  fri: 'Fr.',
  sat: 'Sa.',
  sun: 'So.',
}

/**
 * "Nov 3" → "3. Nov.", "Mon, Nov 23, 2027" → "Mo., 23. Nov. 2027",
 * "Nov 3, 09:30 PM UTC" → "3. Nov., 21:30 UTC". Anything else stays as it is.
 */
export function germanShortDate(value: string): string {
  const m =
    /^(?:([a-z]{3})[a-z]*,? )?([a-z]{3})[a-z]* (\d{1,2})(?:, (\d{4}))?(?:, (\d{1,2}):(\d{2})(?:\s?([ap]m))?)?(\s.*)?$/i.exec(
      value.trim()
    )
  if (!m) return value
  const month = SHORT_MONTHS[m[2].toLowerCase()]
  const weekday = m[1] ? WEEKDAYS[m[1].toLowerCase()] : ''
  if (!month || weekday === undefined) return value
  let out = `${weekday ? `${weekday}, ` : ''}${m[3]}. ${month}${m[4] ? ` ${m[4]}` : ''}`
  if (m[5] !== undefined) {
    let hour = Number(m[5])
    const half = m[7]?.toLowerCase()
    if (half === 'pm' && hour < 12) hour += 12
    if (half === 'am' && hour === 12) hour = 0
    out += `, ${String(hour).padStart(2, '0')}:${m[6]}`
  }
  return out + (m[8] ?? '')
}

/** "July 12, 2026 at 02:00 UTC" → "12. Juli 2026 um 02:00 UTC". */
export function germanLongDate(value: string): string {
  const m = /^([a-z]+) (\d{1,2}), (\d{4})(?: at (\d{1,2}:\d{2}))?(\s.*)?$/i.exec(value.trim())
  if (!m) return value
  const month = LONG_MONTHS[m[1].toLowerCase()]
  if (!month) return value
  return `${m[2]}. ${month} ${m[3]}${m[4] ? ` um ${m[4]}` : ''}${m[5] ?? ''}`
}

const LONG_DATE_RE = `(?:${Object.keys(LONG_MONTHS)
  .map((name) => `[${name[0].toUpperCase()}${name[0]}]${name.slice(1)}`)
  .join('|')}) \\d{1,2}, \\d{4}(?: at \\d{1,2}:\\d{2})?(?: [A-Z]{2,5})?`

// ---------------------------------------------------------------------------
// Placeholder kinds
// ---------------------------------------------------------------------------

const KINDS: Record<string, Kind> = {
  /** Fallback names the senders use when nobody is named. */
  who: {
    map: {
      'anonymous user': 'Jemand',
      'a teammate': 'Jemand aus deinem Team',
      someone: 'Jemand',
      'the team': 'Das Team',
    },
  },
  workspace: { map: { 'your workspace': 'Dein Workspace' } },
  /** The SLA mails' stand-in for a visitor without a name, after "mit" / "für". */
  customerDat: { map: { 'a customer': 'einem Kunden' } },
  customerAcc: { map: { 'a customer': 'einen Kunden' } },
  clock: {
    alts: ['first response', 'next response', 'time to resolve', 'resolution', 'response'],
    map: {
      'first response': 'Erste Antwort',
      'next response': 'Nächste Antwort',
      'time to resolve': 'Lösungszeit',
      resolution: 'Lösung',
      response: 'Antwort',
    },
  },
  clockInSentence: {
    alts: ['first response', 'next response', 'time to resolve', 'resolution', 'response'],
    map: {
      'first response': 'erste Antwort',
      'next response': 'nächste Antwort',
      'time to resolve': 'Lösung',
      resolution: 'Lösung',
      response: 'Antwort',
    },
  },
  impact: {
    alts: ['No impact', 'Minor impact', 'Major impact', 'Critical impact'],
    map: {
      'no impact': 'Keine Auswirkung',
      'minor impact': 'Geringe Auswirkung',
      'major impact': 'Große Auswirkung',
      'critical impact': 'Kritische Auswirkung',
    },
  },
  lifecycle: {
    alts: [
      'Investigating',
      'Identified',
      'Monitoring',
      'Resolved',
      'Scheduled',
      'In progress',
      'Verifying',
      'Completed',
    ],
    map: {
      investigating: 'Wird untersucht',
      identified: 'Ursache gefunden',
      monitoring: 'Wird beobachtet',
      resolved: 'Behoben',
      scheduled: 'Geplant',
      'in progress': 'Läuft',
      verifying: 'Wird geprüft',
      completed: 'Abgeschlossen',
    },
  },
  purpose: {
    alts: ['verification record', 'DKIM record', 'return path record'],
    map: {
      'verification record': 'Verifizierungseintrag',
      'dkim record': 'DKIM-Eintrag',
      'return path record': 'Return-Path-Eintrag',
    },
  },
  shortDate: { re: '[A-Z][a-z]{2} \\d{1,2}', conv: germanShortDate },
  longDate: { re: LONG_DATE_RE, conv: germanLongDate },
  num: { re: '\\d+' },
  /** A date the app formatted in English ("Nov 23", "Mon, Nov 23", "November 23, 2026"). */
  appDate: {
    conv: (value) =>
      germanLongDate(value) !== value ? germanLongDate(value) : germanShortDate(value),
  },
}

const COMPONENT_STATUS: Record<string, string> = {
  operational: 'Betriebsbereit',
  'degraded performance': 'Eingeschränkte Leistung',
  'partial outage': 'Teilweiser Ausfall',
  'major outage': 'Großer Ausfall',
  'under maintenance': 'In Wartung',
}

/** One full stop at the end, also after a German date that already ends in one ("1. Dez."). */
function endSentence(text: string): string {
  return text.endsWith('.') ? text : `${text}.`
}

/** "fällig am 3. Nov., 09:00 UTC" or "bald fällig", for the SLA mails. */
function dueGerman(due: string): string {
  return due.trim().toLowerCase() === 'soon' ? 'bald fällig' : `fällig am ${germanShortDate(due)}`
}

// ---------------------------------------------------------------------------
// The phrases
// ---------------------------------------------------------------------------

const REASON = 'Du bekommst diese Mail, weil'

/**
 * Phrases by template group. A mail only meets its own group (and `shared`),
 * picked by its email type, so a sentence from one template cannot rewrite
 * what a customer wrote into another.
 */
type Group =
  | 'shared'
  | 'reply'
  | 'conversation'
  | 'ticket'
  | 'auth'
  | 'invite'
  | 'feedback'
  | 'updates'
  | 'security'
  | 'domain'
  | 'raw'
  | 'plan'
  | 'messenger'

// The parts of the human reply that are ours. Its heading, preview and body
// are the conversation's subject and the agent's words, so nothing else here.
const REPLY_PHRASES: Phrase[] = [
  { en: '{t} support', de: '{t} Support', at: 'eyebrow' },
  {
    en: 'Reply to this email to continue the conversation',
    de: 'Antworte einfach auf diese Mail, um das Gespräch fortzusetzen',
    anchor: 'start',
  },
  { en: 'View it online', de: 'Online ansehen', at: 'link' },
  { en: 'On {d:shortDate}, {n} wrote:', de: 'Am {d} schrieb {n}:' },
  { en: 'On {n} wrote:', de: '{n} schrieb:' },
  // The automatic acknowledgement is sent through the reply template.
  {
    en: 'We received your email and will get back to you shortly.',
    de: 'Wir haben deine Mail bekommen und melden uns bald bei dir.',
  },
  { en: 'Re: your message to {w}', de: 'Re: Deine Nachricht an {w}', at: 'heading' },
]

const GROUPS: Record<Group, Phrase[]> = {
  reply: REPLY_PHRASES,
  // --- Layout and shared footers ------------------------------------------
  shared: [
    { en: 'Powered by Quackback', de: 'Läuft mit Quackback', at: 'link' },
    { en: 'Unsubscribe from this post', de: 'Diesem Beitrag nicht mehr folgen', at: 'link' },
    { en: 'Manage notification preferences', de: 'Benachrichtigungen verwalten', at: 'link' },
    {
      en: 'Or copy and paste this link into your browser:',
      de: 'Oder kopiere diesen Link in deinen Browser:',
    },
    {
      en: 'Or paste this link into your browser:',
      de: 'Oder kopiere diesen Link in deinen Browser:',
    },
  ],

  // --- Conversations: customer side, then team side -----------------------
  conversation: [
    { en: '{t} support', de: '{t} Support', at: 'eyebrow' },
    {
      en: 'Reply to this email to continue the conversation',
      de: 'Antworte einfach auf diese Mail, um das Gespräch fortzusetzen',
      anchor: 'start',
    },
    { en: 'View it online', de: 'Online ansehen', at: 'link' },
    { en: 'On {d:shortDate}, {n} wrote:', de: 'Am {d} schrieb {n}:' },
    { en: 'On {n} wrote:', de: '{n} schrieb:' },
    {
      en: 'We received your email and will get back to you shortly.',
      de: 'Wir haben deine Mail bekommen und melden uns bald bei dir.',
    },
    {
      en: "This conversation was closed because we haven't heard back from you.",
      de: 'Wir haben das Gespräch geschlossen, weil wir nichts mehr von dir gehört haben.',
    },
    {
      en: '{w} marked this conversation as resolved.',
      de: '{w} hat das Gespräch als erledigt markiert.',
    },
    {
      en: 'Need anything else? Just reply to this email and the conversation will reopen.',
      de: 'Brauchst du noch etwas? Antworte einfach auf diese Mail, dann öffnen wir das Gespräch wieder.',
    },
    {
      en: 'Not sorted? Just reply to this email and the conversation will reopen.',
      de: 'Noch nicht gelöst? Antworte einfach auf diese Mail, dann öffnen wir das Gespräch wieder.',
    },
    { en: 'Conversation closed', de: 'Gespräch geschlossen', at: 'heading' },
    { en: 'Conversation resolved', de: 'Gespräch erledigt', at: 'heading' },
    { en: 'How did we do?', de: 'Wie zufrieden warst du?' },
    { en: 'Re: your conversation with {w}', de: 'Re: Dein Gespräch mit {w}', at: 'heading' },
    { en: 'Re: your message to {w}', de: 'Re: Deine Nachricht an {w}', at: 'heading' },
    { en: 'New reply from {w}', de: 'Neue Antwort von {w}', at: 'heading' },
    { en: 'New message from {w}', de: 'Neue Nachricht von {w}', at: 'heading' },
    {
      en: '{s} replied to your conversation with {w}.',
      de: '{s} hat dir in deinem Gespräch mit {w} geantwortet.',
    },
    { en: '{s} replied to your conversation.', de: '{s} hat dir in deinem Gespräch geantwortet.' },
    { en: '{s} from {w} sent you a message.', de: '{s} von {w} hat dir eine Nachricht geschickt.' },
    { en: '{s} sent you a message.', de: '{s} hat dir eine Nachricht geschickt.' },
    { en: 'View conversation', de: 'Gespräch ansehen', at: 'link' },
    {
      en: 'You received this email because you have an open conversation with this team.',
      de: `${REASON} du ein offenes Gespräch mit diesem Team hast.`,
    },
    {
      en: 'You received this email because {w} sent you a message.',
      de: `${REASON} {w} dir eine Nachricht geschickt hat.`,
    },
    {
      en: 'Click a face above to rate your experience.',
      de: 'Klick auf ein Gesicht, um uns zu bewerten.',
    },
    {
      en: 'You received this email because you had a conversation with {w}.',
      de: `${REASON} du ein Gespräch mit {w} hattest.`,
    },

    // team side
    { en: '{v}: New message', de: '{v}: Neue Nachricht', at: 'heading' },
    { en: 'New message', de: 'Neue Nachricht', at: 'heading' },
    { en: '{s} started a conversation in {w}.', de: '{s} hat ein Gespräch in {w} begonnen.' },
    { en: '{s} sent a new message in {w}.', de: '{s} hat eine neue Nachricht in {w} geschickt.' },
    { en: 'Open inbox', de: 'Posteingang öffnen', at: 'link' },
    {
      en: 'You received this email because you are a member of this workspace.',
      de: `${REASON} du Mitglied in diesem Workspace bist.`,
    },
    {
      en: 'A conversation was assigned to your team',
      de: 'Deinem Team wurde ein Gespräch zugewiesen',
      at: 'heading',
    },
    {
      en: 'A conversation was assigned to you',
      de: 'Dir wurde ein Gespräch zugewiesen',
      at: 'heading',
    },
    {
      en: 'A conversation with {c} was assigned to your team.',
      de: 'Ein Gespräch mit {c} wurde deinem Team zugewiesen.',
    },
    {
      en: 'A conversation with {c} was assigned to you.',
      de: 'Ein Gespräch mit {c} wurde dir zugewiesen.',
    },
    {
      en: 'A conversation was assigned to your team.',
      de: 'Deinem Team wurde ein Gespräch zugewiesen.',
    },
    { en: 'A conversation was assigned to you.', de: 'Dir wurde ein Gespräch zugewiesen.' },
    { en: 'Open conversation', de: 'Gespräch öffnen', at: 'link' },
    {
      en: 'You received this email because a conversation was assigned in {w}.',
      de: `${REASON} in {w} ein Gespräch zugewiesen wurde.`,
    },
    {
      en: '{n:who} mentioned you in an internal note on a conversation.',
      de: '{n} hat dich in einer internen Notiz zu einem Gespräch erwähnt.',
    },
    {
      en: '{n:who} mentioned you in an internal note',
      de: '{n} hat dich in einer internen Notiz erwähnt',
      at: 'heading',
    },
    { en: 'You were mentioned in a note', de: 'Du wurdest in einer Notiz erwähnt', at: 'heading' },
    {
      en: 'Internal notes are visible to your team only.',
      de: 'Interne Notizen sieht nur dein Team.',
    },
    // The note mail's stand-in name above the quoted note.
    { en: 'A teammate', de: 'Jemand aus deinem Team' },
    {
      en: 'You received this email because you were mentioned in {w}.',
      de: `${REASON} du in {w} erwähnt wurdest.`,
    },
  ],

  // --- Tickets ------------------------------------------------------------
  ticket: [
    {
      en: "You're receiving this because you opened ticket {l} at {w}.",
      de: `${REASON} du das Ticket {l} bei {w} eröffnet hast.`,
    },
    {
      en: 'We received your ticket {l}: {t}',
      de: 'Wir haben dein Ticket {l} bekommen: {t}',
      at: 'heading',
    },
    { en: "We've got your ticket", de: 'Wir haben dein Ticket bekommen', at: 'heading' },
    {
      en: 'Your ticket {l} "{t}" is with the {w} team. We\'ll email you as soon as there\'s a reply.',
      de: 'Dein Ticket {l} „{t}“ liegt beim Team von {w}. Wir schreiben dir, sobald es eine Antwort gibt.',
    },
    { en: 'New reply on {l}: {t}', de: 'Neue Antwort zu {l}: {t}', at: 'heading' },
    { en: 'New reply on your ticket', de: 'Neue Antwort zu deinem Ticket', at: 'heading' },
    { en: '{a:who} replied to {l} "{t}":', de: '{a} hat auf {l} „{t}“ geantwortet:' },
    { en: 'View your ticket', de: 'Ticket ansehen', at: 'link' },
    { en: 'Your ticket {l} was closed', de: 'Dein Ticket {l} wurde geschlossen', at: 'heading' },
    { en: 'Your ticket was closed', de: 'Dein Ticket wurde geschlossen', at: 'heading' },
    {
      en: '{l} "{t}" has been closed by the {w} team.',
      de: 'Das Team von {w} hat {l} „{t}“ geschlossen.',
    },
    {
      en: 'If you have a follow-up, reply on the ticket thread. Replying reopens it.',
      de: 'Hast du noch eine Frage? Antworte einfach im Ticket, dann öffnen wir es wieder.',
    },
    { en: 'Your ticket {l} was resolved', de: 'Dein Ticket {l} ist erledigt', at: 'heading' },
    { en: 'Your ticket was resolved', de: 'Dein Ticket ist erledigt', at: 'heading' },
    {
      en: '{l} "{t}" has been marked resolved by the {w} team.',
      de: 'Das Team von {w} hat {l} „{t}“ als erledigt markiert.',
    },
    {
      en: "Reply on the ticket thread if this isn't fixed for you; replying reopens it.",
      de: 'Noch nicht gelöst? Antworte einfach im Ticket, dann öffnen wir es wieder.',
    },
    {
      en: 'Ticket {l} assigned to your team',
      de: 'Ticket {l} ist deinem Team zugewiesen',
      at: 'heading',
    },
    { en: 'Ticket {l} assigned to you', de: 'Ticket {l} ist dir zugewiesen', at: 'heading' },
    {
      en: 'A ticket was assigned to your team',
      de: 'Deinem Team wurde ein Ticket zugewiesen',
      at: 'heading',
    },
    { en: 'You were assigned a ticket', de: 'Dir wurde ein Ticket zugewiesen', at: 'heading' },
    { en: '{l} "{t}" was assigned to your team.', de: '{l} „{t}“ wurde deinem Team zugewiesen.' },
    { en: '{l} "{t}" was assigned to you.', de: '{l} „{t}“ wurde dir zugewiesen.' },
    { en: 'Open in inbox', de: 'Im Posteingang öffnen', at: 'link' },
    {
      en: "You're receiving this because the ticket was assigned to your team.",
      de: `${REASON} das Ticket deinem Team zugewiesen wurde.`,
    },
    {
      en: "You're receiving this because the ticket was assigned to you.",
      de: `${REASON} dir das Ticket zugewiesen wurde.`,
    },
    // SLA alerts (team side)
    {
      en: 'SLA at risk: {c:clock} due {d}',
      de: (v) => `SLA in Gefahr: ${v.c} ${dueGerman(v.d)}`,
      at: 'heading',
    },
    { en: '{c:clock} SLA approaching breach', de: 'SLA für {c} läuft bald ab', at: 'heading' },
    {
      en: 'The conversation with {t:customerDat} needs a {c:clockInSentence} soon.',
      de: 'Das Gespräch mit {t} braucht bald eine {c}.',
    },
    {
      en: '{c:clock} was due {d}',
      de: (v) =>
        v.d.trim().toLowerCase() === 'earlier'
          ? `${v.c} war schon früher fällig`
          : `${v.c} war fällig am ${germanShortDate(v.d)}`,
    },
    { en: '{c:clock} due {d}', de: (v) => `${v.c} ${dueGerman(v.d)}` },
    {
      en: 'SLA breached: {c:clock} for {t:customerAcc}',
      de: 'SLA verletzt: {c} für {t}',
      at: 'heading',
    },
    { en: '{c:clock} SLA breached', de: 'SLA für {c} verletzt', at: 'heading' },
    {
      en: 'The conversation with {t:customerDat} has passed its {c:clockInSentence} target.',
      de: 'Das Gespräch mit {t} hat das Ziel für die {c} überschritten.',
    },
    {
      en: "You're receiving this because you're responsible for this conversation.",
      de: `${REASON} du für dieses Gespräch zuständig bist.`,
    },
  ],

  // --- Sign-in, password, address -----------------------------------------
  auth: [
    { en: 'Your sign-in link', de: 'Dein Anmeldelink', at: 'heading' },
    { en: 'Sign in to {n}', de: 'Bei {n} anmelden', at: 'heading' },
    { en: 'Sign in', de: 'Anmelden', at: 'heading' },
    { en: 'Sign in', de: 'Anmelden', at: 'link' },
    {
      en: 'Click the button below to finish signing in.',
      de: 'Klick auf den Button, um dich anzumelden.',
    },
    {
      en: 'Or enter this code on the sign-in screen:',
      de: 'Oder gib diesen Code auf der Anmeldeseite ein:',
    },
    { en: 'The link and code expire in 10 minutes.', de: 'Link und Code gelten 10 Minuten.' },
    {
      en: "If you didn't request this, you can safely ignore this email. No account was created and nothing was changed.",
      de: 'Wenn du das nicht angefordert hast, kannst du diese Mail einfach ignorieren. Es wurde kein Konto angelegt und nichts geändert.',
    },
    {
      en: "If you didn't request this, you can safely ignore this email.",
      de: 'Wenn du das nicht angefordert hast, kannst du diese Mail einfach ignorieren.',
    },
    { en: '{c:num} is your code for {n}', de: '{c} ist dein Code für {n}', at: 'heading' },
    { en: '{c:num} is your sign-in code', de: '{c} ist dein Anmeldecode', at: 'heading' },
    { en: 'About your {w} sign-in request', de: 'Deine Anmeldung bei {w}', at: 'heading' },
    { en: 'About your sign-in request', de: 'Zu deiner Anmeldung', at: 'heading' },
    { en: 'No account for this address', de: 'Kein Konto für diese Adresse', at: 'heading' },
    {
      en: 'Someone asked for a sign-in link for this email address at this workspace.',
      de: 'Jemand hat für diese Mailadresse einen Anmeldelink in diesem Workspace angefordert.',
    },
    {
      en: 'Someone asked for a sign-in link for this email address at {w}.',
      de: 'Jemand hat für diese Mailadresse einen Anmeldelink bei {w} angefordert.',
    },
    {
      en: 'There is no account here for this address, and this workspace is not accepting new accounts. Ask an admin to invite you, then sign in with the address they invite.',
      de: 'Für diese Adresse gibt es hier kein Konto, und dieser Workspace nimmt gerade keine neuen Konten an. Bitte einen Admin, dich einzuladen, und melde dich dann mit der eingeladenen Adresse an.',
    },
    {
      en: 'There is no account here for this address, and {w} is not accepting new accounts. Ask an admin to invite you, then sign in with the address they invite.',
      de: 'Für diese Adresse gibt es hier kein Konto, und {w} nimmt gerade keine neuen Konten an. Bitte einen Admin, dich einzuladen, und melde dich dann mit der eingeladenen Adresse an.',
    },
    { en: 'Reset your {w} password', de: 'Neues Passwort für {w}', at: 'heading' },
    { en: 'Reset your password', de: 'Passwort zurücksetzen', at: 'heading' },
    {
      en: 'Click the button below to set a new password. This link expires in 24 hours.',
      de: 'Klick auf den Button, um ein neues Passwort festzulegen. Der Link gilt 24 Stunden.',
    },
    { en: 'Reset Password', de: 'Passwort zurücksetzen', at: 'link' },
    {
      en: "If you didn't request a password reset, you can safely ignore this email.",
      de: 'Wenn du kein neues Passwort angefordert hast, kannst du diese Mail einfach ignorieren.',
    },
    { en: 'Confirm your email address', de: 'Bestätige deine Mailadresse', at: 'heading' },
    { en: 'Confirm your email', de: 'Bestätige deine Mailadresse', at: 'heading' },
    { en: 'Your verification code for {w}', de: 'Dein Bestätigungscode für {w}', at: 'heading' },
    { en: 'Your verification code', de: 'Dein Bestätigungscode', at: 'heading' },
    {
      en: 'Enter this code for {w} to confirm this address. It expires in 10 minutes.',
      de: 'Gib diesen Code für {w} ein, um diese Adresse zu bestätigen. Er gilt 10 Minuten.',
    },
    {
      en: 'Enter this code to confirm this address. It expires in 10 minutes.',
      de: 'Gib diesen Code ein, um diese Adresse zu bestätigen. Er gilt 10 Minuten.',
    },
    {
      en: "If you didn't ask for this, ignore it. Nothing changes without the code.",
      de: 'Wenn du das nicht warst, ignoriere die Mail einfach. Ohne den Code ändert sich nichts.',
    },
    {
      en: "You're receiving this because someone entered this address on an account. It won't be used for anything until it's confirmed.",
      de: `${REASON} jemand diese Adresse bei einem Konto eingetragen hat. Wir nutzen sie erst, wenn sie bestätigt ist.`,
    },
  ],

  // --- Invitations --------------------------------------------------------
  invite: [
    {
      en: "You've been invited to access the {w} portal",
      de: 'Du bist zum Portal von {w} eingeladen',
      at: 'heading',
    },
    { en: "You've been invited to {w}", de: 'Du bist zu {w} eingeladen', at: 'heading' },
    { en: "You've been invited!", de: 'Du bist eingeladen!', at: 'heading' },
    {
      en: "You've been invited to access the {w} portal. Click below to accept and sign in.",
      de: 'Du bist zum Portal von {w} eingeladen. Klick unten, um die Einladung anzunehmen und dich anzumelden.',
    },
    { en: 'Accept invitation', de: 'Einladung annehmen', at: 'link' },
    {
      en: "If you weren't expecting this invitation, you can ignore this email.",
      de: 'Wenn du diese Einladung nicht erwartet hast, kannst du diese Mail ignorieren.',
    },
    { en: '{a} invited you to the {w} team.', de: '{a} hat dich ins Team von {w} eingeladen.' },
    { en: '{a} invited you to {w}', de: '{a} hat dich zu {w} eingeladen', at: 'heading' },
    { en: 'Hi {n}, join {w}', de: 'Hallo {n}, komm zu {w}', at: 'heading' },
    { en: 'Join {w}', de: 'Komm zu {w}', at: 'heading' },
    {
      en: 'Not expecting this? You can ignore this email.',
      de: 'Nicht erwartet? Dann kannst du diese Mail ignorieren.',
    },
  ],

  // --- Feedback portal ----------------------------------------------------
  feedback: [
    {
      en: 'You received this email because you submitted this feedback.',
      de: `${REASON} du dieses Feedback eingereicht hast.`,
    },
    {
      en: 'You received this email because you follow this post.',
      de: `${REASON} du diesem Beitrag folgst.`,
    },
    {
      en: 'Your feedback is now {s}!',
      de: 'Dein Feedback hat jetzt den Status {s}!',
      anchor: 'end',
      at: 'heading',
    },
    {
      en: 'A post you follow is now {s}',
      de: 'Ein Beitrag, dem du folgst, hat jetzt den Status {s}',
      anchor: 'end',
      at: 'heading',
    },
    {
      en: 'Great news! The status of your feedback has been updated on {w}.',
      de: 'Gute Nachricht! Der Status deines Feedbacks bei {w} hat sich geändert.',
    },
    {
      en: 'The status of a post you follow has been updated on {w}.',
      de: 'Der Status eines Beitrags, dem du folgst, hat sich bei {w} geändert.',
    },
    { en: 'View Feedback', de: 'Feedback ansehen', at: 'link' },
    { en: 'New comment on "{t}"', de: 'Neuer Kommentar zu „{t}“', at: 'heading' },
    { en: 'New comment on your feedback', de: 'Neuer Kommentar zu deinem Feedback', at: 'heading' },
    {
      en: 'New comment on a post you follow',
      de: 'Neuer Kommentar zu einem Beitrag, dem du folgst',
      at: 'heading',
    },
    {
      en: '{c} commented on your feedback in {w}.',
      de: '{c} hat in {w} dein Feedback kommentiert.',
    },
    {
      en: '{c} commented on a post you follow in {w}.',
      de: '{c} hat in {w} einen Beitrag kommentiert, dem du folgst.',
    },
    { en: 'View Comment', de: 'Kommentar ansehen', at: 'link' },
    { en: '{n:who} mentioned you in "{t}"', de: '{n} hat dich in „{t}“ erwähnt', at: 'heading' },
    { en: 'You were mentioned', de: 'Du wurdest erwähnt', at: 'heading' },
    { en: '{n:who} mentioned you in {t}.', de: '{n} hat dich in {t} erwähnt.' },
    { en: 'Turn off all email', de: 'Alle Mails abbestellen', at: 'link' },
    {
      en: 'You received this email because you were mentioned in {w}.',
      de: `${REASON} du in {w} erwähnt wurdest.`,
    },
    { en: 'Approve new feedback: {t}', de: 'Neues Feedback freigeben: {t}', at: 'heading' },
    { en: 'New feedback: {t}', de: 'Neues Feedback: {t}', at: 'heading' },
    {
      en: 'New feedback waiting for approval',
      de: 'Neues Feedback wartet auf Freigabe',
      at: 'heading',
    },
    { en: 'New feedback', de: 'Neues Feedback', at: 'heading' },
    {
      en: '{a:who} posted on {b}. Customers cannot see it until it is approved.',
      de: '{a} hat in {b} gepostet. Kunden sehen es erst nach der Freigabe.',
    },
    { en: '{a:who} posted on {b}.', de: '{a} hat in {b} gepostet.' },
    { en: 'Review post', de: 'Beitrag prüfen', at: 'link' },
    { en: 'View post', de: 'Beitrag ansehen', at: 'link' },
    { en: 'View comment', de: 'Kommentar ansehen', at: 'link' },
    {
      en: 'You received this email because you are on the {w} team.',
      de: `${REASON} du im Team von {w} bist.`,
    },
    { en: 'Your comment is now public', de: 'Dein Kommentar ist jetzt öffentlich', at: 'heading' },
    {
      en: 'Your comment was not published',
      de: 'Dein Kommentar wurde nicht veröffentlicht',
      at: 'heading',
    },
    { en: 'Your post is now public', de: 'Dein Beitrag ist jetzt öffentlich', at: 'heading' },
    {
      en: 'Your post was not published',
      de: 'Dein Beitrag wurde nicht veröffentlicht',
      at: 'heading',
    },
    {
      en: 'The {w} team reviewed your comment on this post and published it.',
      de: 'Das Team von {w} hat deinen Kommentar zu diesem Beitrag geprüft und veröffentlicht.',
    },
    {
      en: 'The {w} team reviewed your comment on this post and decided not to publish it.',
      de: 'Das Team von {w} hat deinen Kommentar zu diesem Beitrag geprüft und sich entschieden, ihn nicht zu veröffentlichen.',
    },
    {
      en: 'The {w} team reviewed your post and published it.',
      de: 'Das Team von {w} hat deinen Beitrag geprüft und veröffentlicht.',
    },
    {
      en: 'The {w} team reviewed your post and decided not to publish it.',
      de: 'Das Team von {w} hat deinen Beitrag geprüft und sich entschieden, ihn nicht zu veröffentlichen.',
    },
    {
      en: 'You received this email because you wrote this comment on {w}.',
      de: `${REASON} du diesen Kommentar bei {w} geschrieben hast.`,
    },
    {
      en: 'You received this email because you wrote this post on {w}.',
      de: `${REASON} du diesen Beitrag bei {w} geschrieben hast.`,
    },
  ],

  // --- Changelog and status page ------------------------------------------
  updates: [
    { en: 'New update from {w}: {t}', de: 'Neues Update von {w}: {t}', at: 'heading' },
    { en: 'New update: {t}', de: 'Neues Update: {t}', at: 'heading' },
    { en: 'New update published', de: 'Neues Update veröffentlicht', at: 'heading' },
    {
      en: '{w} just published a product update.',
      de: '{w} hat gerade ein Produktupdate veröffentlicht.',
    },
    { en: 'View Update', de: 'Update ansehen', at: 'link' },
    {
      en: "You received this email because you're subscribed to changelog updates.",
      de: `${REASON} du den Changelog abonniert hast.`,
    },
    { en: 'Unsubscribe from the changelog', de: 'Changelog abbestellen', at: 'link' },
    { en: 'Incident: {t}', de: 'Störung: {t}', at: 'heading' },
    { en: '{t} ({s:lifecycle})', de: '{t} ({s})', at: 'heading' },
    { en: 'New incident reported', de: 'Neue Störung gemeldet', at: 'heading' },
    {
      en: '{w} just posted an update to its status page.',
      de: '{w} hat gerade ein Update auf der Statusseite veröffentlicht.',
    },
    { en: '{i:impact} · {s:lifecycle}', de: '{i} · {s}' },
    { en: '{i:impact} · {s}', de: '{i} · {s}' },
    { en: 'Affected services', de: 'Betroffene Dienste' },
    { en: 'View live status', de: 'Aktuellen Status ansehen', at: 'link' },
    {
      en: "You received this email because you're subscribed to status updates.",
      de: `${REASON} du Statusmeldungen abonniert hast.`,
    },
    { en: 'Unsubscribe from status updates', de: 'Statusmeldungen abbestellen', at: 'link' },
    {
      en: 'Scheduled maintenance: {t} ({d:longDate})',
      de: 'Geplante Wartung: {t} ({d})',
      at: 'heading',
    },
    { en: 'Scheduled maintenance: {t}', de: 'Geplante Wartung: {t}', at: 'heading' },
    { en: 'Scheduled maintenance', de: 'Geplante Wartung' },
    {
      en: '{w} has scheduled maintenance that may affect its services.',
      de: '{w} hat eine Wartung geplant, die die Dienste beeinträchtigen kann.',
    },
    { en: 'Maintenance window', de: 'Wartungsfenster' },
    { en: '{a:longDate} to {b:longDate}', de: '{a} bis {b}' },
    { en: 'View status page', de: 'Statusseite ansehen', at: 'link' },
  ],

  // --- Account security ---------------------------------------------------
  security: [
    { en: 'New sign-in to your account', de: 'Neue Anmeldung bei deinem Konto', at: 'heading' },
    {
      en: 'A new sign-in was detected on your account',
      de: 'Wir haben eine neue Anmeldung bei deinem Konto bemerkt',
      at: 'heading',
    },
    {
      en: "Someone just signed in to your {w} account on a device we haven't seen before.",
      de: 'Gerade hat sich jemand auf einem neuen Gerät bei deinem Konto für {w} angemeldet.',
    },
    {
      en: "Someone just signed in to your account on a device we haven't seen before.",
      de: 'Gerade hat sich jemand auf einem neuen Gerät bei deinem Konto angemeldet.',
    },
    { en: 'When:', de: 'Wann:', anchor: 'start', at: 'strong' },
    { en: 'Location:', de: 'Ort:', anchor: 'start', at: 'strong' },
    { en: 'Device:', de: 'Gerät:', anchor: 'start', at: 'strong' },
    { en: 'IP address:', de: 'IP-Adresse:', anchor: 'start', at: 'strong' },
    {
      en: "If that was you, no action needed. If it wasn't, change your password at your identity provider and ask a workspace admin to sign out other sessions.",
      de: 'Wenn du das warst, musst du nichts tun. Wenn nicht, ändere dein Passwort bei deinem Identitätsanbieter und bitte einen Admin, die anderen Sitzungen abzumelden.',
    },
    {
      en: "If that was you, no action needed. If it wasn't, set or change your password from your profile settings. This signs out other sessions.",
      de: 'Wenn du das warst, musst du nichts tun. Wenn nicht, ändere dein Passwort in deinen Profileinstellungen. Damit werden andere Sitzungen abgemeldet.',
    },
    // The same sentence with the middle as a link: three pieces that read right together.
    {
      en: "If that was you, no action needed. If it wasn't,",
      de: 'Wenn du das warst, musst du nichts tun. Wenn nicht,',
      anchor: 'start',
    },
    // Mid-sentence in the plain text, so only its end (the link) is anchored.
    { en: 'set or change your password', de: 'ändere dein Passwort', at: 'link', anchor: 'end' },
    {
      en: 'from your profile settings. This signs out other sessions.',
      de: 'in deinen Profileinstellungen. Damit werden andere Sitzungen abgemeldet.',
      anchor: 'end',
    },
    {
      en: "You're receiving this because a new sign-in was detected on your account. These alerts are required and can't be disabled.",
      de: `${REASON} wir eine neue Anmeldung bei deinem Konto bemerkt haben. Diese Hinweise sind Pflicht und lassen sich nicht abschalten.`,
    },
    {
      en: 'A recovery code on your account was just used',
      de: 'Gerade wurde ein Wiederherstellungscode deines Kontos benutzt',
      at: 'heading',
    },
    {
      en: 'A recovery code was used to sign in for {w}',
      de: 'Jemand hat sich mit einem Wiederherstellungscode bei {w} angemeldet',
      at: 'heading',
    },
    {
      en: 'A recovery code was used to sign in',
      de: 'Jemand hat sich mit einem Wiederherstellungscode angemeldet',
      at: 'heading',
    },
    {
      en: 'A recovery code was used',
      de: 'Ein Wiederherstellungscode wurde benutzt',
      at: 'heading',
    },
    {
      en: 'Someone signed in to your account for {w} using one of your saved recovery codes.',
      de: 'Jemand hat sich mit einem deiner gespeicherten Wiederherstellungscodes bei deinem Konto für {w} angemeldet.',
    },
    {
      en: 'Someone signed in to your account using one of your saved recovery codes.',
      de: 'Jemand hat sich mit einem deiner gespeicherten Wiederherstellungscodes bei deinem Konto angemeldet.',
    },
    {
      en: "If this was you, no action is needed. The code is now spent and can't be reused.",
      de: 'Wenn du das warst, musst du nichts tun. Der Code ist jetzt verbraucht und lässt sich nicht noch mal nutzen.',
    },
    {
      en: "If this wasn't you, sign in and rotate your recovery codes immediately. The person who used the code now has an active session. Revoke it from your security settings.",
      de: 'Wenn du das nicht warst, melde dich an und erneuere sofort deine Wiederherstellungscodes. Wer den Code benutzt hat, hat jetzt eine aktive Sitzung. Beende sie in deinen Sicherheitseinstellungen.',
    },
    {
      en: "You're receiving this because a recovery code on your account was just used. These alerts are required and can't be disabled.",
      de: `${REASON} gerade ein Wiederherstellungscode deines Kontos benutzt wurde. Diese Hinweise sind Pflicht und lassen sich nicht abschalten.`,
    },
  ],

  // --- Domains and sending addresses (team side) --------------------------
  domain: [
    {
      en: 'Sending from {d} needs attention',
      de: 'Senden von {d} braucht deine Aufmerksamkeit',
      at: 'heading',
    },
    { en: '{d} is no longer verified', de: '{d} ist nicht mehr verifiziert', at: 'heading' },
    { en: '{d} needs attention', de: '{d} braucht deine Aufmerksamkeit', at: 'heading' },
    {
      en: 'The {p:purpose} ({r}) is missing. Add it back by {dl:appDate} to keep {d} verified.',
      de: 'Der {p} ({r}) fehlt. Trag ihn bis {dl} wieder ein, damit {d} verifiziert bleibt.',
    },
    {
      en: 'The {p:purpose} ({r}) is still missing. Sign-in is no longer verified for {list}.',
      de: 'Der {p} ({r}) fehlt immer noch. Die Anmeldung ist für {list} nicht mehr verifiziert.',
    },
    { en: 'The {p:purpose} ({r}) is still missing.', de: 'Der {p} ({r}) fehlt immer noch.' },
    { en: 'The {p:purpose} ({r}) is missing.', de: 'Der {p} ({r}) fehlt.' },
    {
      en: 'The {p:purpose} ({r}) is proxied. Turn off any proxy for it.',
      de: 'Der {p} ({r}) läuft über einen Proxy. Schalte den Proxy dafür aus.',
    },
    {
      en: 'The {p:purpose} ({r}) was cut short by your DNS host.',
      de: 'Der {p} ({r}) wurde von deinem DNS-Anbieter abgeschnitten.',
    },
    {
      en: 'The {p:purpose} ({r}) has quote marks saved in its value.',
      de: 'Der {p} ({r}) hat Anführungszeichen im Wert gespeichert.',
    },
    {
      en: 'The {p:purpose} ({r}) has a different value: {s}.',
      de: 'Der {p} ({r}) hat einen anderen Wert: {s}.',
    },
    {
      en: 'The {p:purpose} ({r}) has a different value.',
      de: 'Der {p} ({r}) hat einen anderen Wert.',
    },
    {
      en: 'The email provider stopped confirming {d}.',
      de: 'Der Mailanbieter bestätigt {d} nicht mehr.',
    },
    {
      en: "The signing key for {d} isn't working.",
      de: 'Der Signaturschlüssel für {d} funktioniert nicht.',
    },
    {
      en: 'Add it back by {dl:appDate} to keep sending from {d}.',
      de: 'Trag ihn bis {dl} wieder ein, damit du weiter von {d} senden kannst.',
    },
    {
      en: "Until it's fixed, email from this domain comes from your default address.",
      de: 'Bis das behoben ist, gehen Mails von dieser Domain über deine Standardadresse raus.',
    },
    { en: 'Value:', de: 'Wert:', anchor: 'start' },
    { en: 'Open domain settings', de: 'Öffne die Domain-Einstellungen', at: 'link' },
    { en: ' to check again.', de: ' und prüf es noch mal.', anchor: 'end' },
    { en: 'Open email settings', de: 'Öffne die Mail-Einstellungen', at: 'link' },
    {
      en: ' to see the records and check again.',
      de: ', um die Einträge zu sehen und es noch mal zu prüfen.',
      anchor: 'end',
    },
    {
      en: "You're receiving this because you manage domains for {w}.",
      de: `${REASON} du die Domains für {w} verwaltest.`,
    },
    {
      en: "You're receiving this because you manage domains.",
      de: `${REASON} du die Domains verwaltest.`,
    },
    {
      en: "You're receiving this because you manage email settings for {w}.",
      de: `${REASON} du die Mail-Einstellungen für {w} verwaltest.`,
    },
    {
      en: "You're receiving this because you manage email settings.",
      de: `${REASON} du die Mail-Einstellungen verwaltest.`,
    },
  ],

  // --- Plan limits (billing) ----------------------------------------------
  plan: [
    {
      en: '{n:workspace}: some features pause after {d:appDate}',
      de: '{n}: Einige Funktionen pausieren nach {d}',
      at: 'heading',
    },
    {
      en: "Action needed: {n:workspace} is over the {p} plan's limits",
      de: 'Handlungsbedarf: {n} liegt über den Limits des Tarifs {p}',
      at: 'heading',
    },
    {
      en: "Action needed: {n:workspace} is over its plan's limits",
      de: 'Handlungsbedarf: {n} liegt über den Limits des Tarifs',
      at: 'heading',
    },
    {
      en: "2 days left to fix {n:workspace}'s plan limits",
      de: 'Noch 2 Tage, um die Tariflimits von {n} zu klären',
      at: 'heading',
    },
    {
      en: 'Some of {n:workspace} is now paused',
      de: 'Teile von {n} sind jetzt pausiert',
      at: 'heading',
    },
    {
      en: 'Some features pause after {d:appDate}',
      de: 'Einige Funktionen pausieren nach {d}',
      at: 'heading',
    },
    { en: 'Fix {k:num} issues by {d:appDate}', de: 'Kläre {k} Punkte bis {d}', at: 'heading' },
    { en: 'Fix {k:num} issue by {d:appDate}', de: 'Kläre {k} Punkt bis {d}', at: 'heading' },
    {
      en: '{n:workspace} is still over the limits of the {p} plan, so the items below are now paused.',
      de: '{n} liegt immer noch über den Limits des Tarifs {p}, deshalb sind die folgenden Punkte jetzt pausiert.',
    },
    {
      en: '{n:workspace} is still over the limits of its plan, so the items below are now paused.',
      de: '{n} liegt immer noch über den Limits des Tarifs, deshalb sind die folgenden Punkte jetzt pausiert.',
    },
    {
      en: '{n:workspace} is over the limits of the {p} plan. Upgrade to keep everything.',
      de: '{n} liegt über den Limits des Tarifs {p}. Mit einem Upgrade behältst du alles.',
    },
    {
      en: '{n:workspace} is over the limits of its plan. Upgrade to keep everything.',
      de: '{n} liegt über den Limits des Tarifs. Mit einem Upgrade behältst du alles.',
    },
    {
      en: '{n:workspace} is over the limits of the {p} plan. Fix {k:num} issues by {d:appDate}, or upgrade to keep everything.',
      de: '{n} liegt über den Limits des Tarifs {p}. Kläre {k} Punkte bis {d} oder behalte mit einem Upgrade alles.',
    },
    {
      en: '{n:workspace} is over the limits of the {p} plan. Fix {k:num} issue by {d:appDate}, or upgrade to keep everything.',
      de: '{n} liegt über den Limits des Tarifs {p}. Kläre {k} Punkt bis {d} oder behalte mit einem Upgrade alles.',
    },
    {
      en: '{n:workspace} is over the limits of its plan. Fix {k:num} issues by {d:appDate}, or upgrade to keep everything.',
      de: '{n} liegt über den Limits des Tarifs. Kläre {k} Punkte bis {d} oder behalte mit einem Upgrade alles.',
    },
    {
      en: '{n:workspace} is over the limits of its plan. Fix {k:num} issue by {d:appDate}, or upgrade to keep everything.',
      de: '{n} liegt über den Limits des Tarifs. Kläre {k} Punkt bis {d} oder behalte mit einem Upgrade alles.',
    },
    { en: '{f} are paused on the {p} plan.', de: '{f} sind im Tarif {p} pausiert.' },
    { en: '{f} is paused on the {p} plan.', de: '{f} ist im Tarif {p} pausiert.' },
    { en: '{f} are now paused.', de: '{f} sind jetzt pausiert.' },
    { en: '{f} is now paused.', de: '{f} ist jetzt pausiert.' },
    { en: '{f} pause after {d:appDate}.', de: (v) => `${v.f} pausieren nach ${endSentence(v.d)}` },
    { en: '{f} pauses after {d:appDate}.', de: (v) => `${v.f} pausiert nach ${endSentence(v.d)}` },
    {
      en: 'Nothing is deleted. It comes back when you upgrade.',
      de: 'Nichts wird gelöscht. Mit einem Upgrade ist alles wieder da.',
    },
    { en: 'Nothing is deleted.', de: 'Nichts wird gelöscht.' },
    { en: 'Review issues', de: 'Punkte ansehen', at: 'link' },
    { en: 'Upgrade to {p}', de: 'Upgrade auf {p}', at: 'link' },
    { en: 'Compare plans', de: 'Tarife vergleichen', at: 'link' },
    {
      en: "You're getting this because you manage billing for {w}.",
      de: `${REASON} du die Abrechnung für {w} verwaltest.`,
    },
    {
      en: "You're getting this because you manage billing.",
      de: `${REASON} du die Abrechnung verwaltest.`,
    },
  ],

  // --- Messenger install (team side) --------------------------------------
  messenger: [
    {
      en: 'Add {w} Messenger to the website',
      de: '{w} Messenger auf der Website einbauen',
      at: 'heading',
    },
    { en: 'Add Messenger to the website', de: 'Messenger auf der Website einbauen', at: 'heading' },
    {
      en: "{s} asked you to put {w}'s Messenger on the website. Paste this code before the closing body tag on every page.",
      de: '{s} bittet dich, den Messenger von {w} auf der Website einzubauen. Füge diesen Code auf jeder Seite vor dem schließenden body-Tag ein.',
    },
    {
      en: 'Using Google Tag Manager? Create a Custom HTML tag with the same code and trigger it on All pages.',
      de: 'Du nutzt den Google Tag Manager? Leg ein Tag vom Typ „Benutzerdefiniertes HTML“ mit demselben Code an und lös es auf „Alle Seiten“ aus.',
    },
    {
      en: '{s} will see Messenger connect as soon as it loads on the site.',
      de: '{s} sieht, dass der Messenger verbunden ist, sobald er auf der Website lädt.',
    },
  ],

  // --- Prerendered mail: the test from a sending address (apps/web) -------
  raw: [
    { en: 'Test email from {a}', de: 'Testmail von {a}', at: 'heading' },
    {
      en: "This is a test from {a}. If you're reading it, email can be sent from this address.",
      de: 'Das ist ein Test von {a}. Wenn du das liest, können Mails von dieser Adresse verschickt werden.',
    },
  ],
}

/** Which groups a mail meets, by its email type. Unknown types meet all of them. */
const GROUPS_BY_TYPE: Record<string, Group[]> = {
  ConversationReplyEmail: ['reply'],
  ConversationAutoAckEmail: ['reply'],
  ConversationMessageEmail: ['conversation'],
  ConversationClosedEmail: ['conversation'],
  CsatRequestEmail: ['conversation'],
  ConversationAssignedEmail: ['conversation'],
  NoteMentionEmail: ['conversation'],
  TicketEventEmail: ['ticket'],
  MagicLinkEmail: ['auth'],
  SignupNotAllowedEmail: ['auth'],
  PasswordResetEmail: ['auth'],
  VerifyAddressEmail: ['auth'],
  PortalInviteEmail: ['invite'],
  InvitationEmail: ['invite'],
  StatusChangeEmail: ['feedback'],
  NewCommentEmail: ['feedback'],
  PostMentionEmail: ['feedback'],
  NewFeedbackEmail: ['feedback'],
  ModerationDecisionEmail: ['feedback'],
  ChangelogPublishedEmail: ['updates'],
  StatusIncidentPublishedEmail: ['updates'],
  StatusMaintenanceScheduledEmail: ['updates'],
  NewSignInEmail: ['security'],
  RecoveryCodeUsedEmail: ['security'],
  DomainAttentionEmail: ['domain'],
  SendingDomainAttentionEmail: ['domain'],
  PlanLimitsEmail: ['plan'],
  MessengerInstallEmail: ['messenger'],
  // Written by the caller in the recipient's language already.
  OnboardingWelcomeEmail: [],
  OnboardingNudgeEmail: [],
  // A prerendered mail from apps/web; today only the sending-address test.
  RawEmail: ['raw'],
}

/** Patterns that are not one phrase: a value next to markup the phrase compiler cannot see. */
interface RawRule {
  group: Group
  html?: RegExp
  text?: RegExp
  replace: (match: string, ...groups: string[]) => string
}

const COMPONENT_ALTS = Object.keys(COMPONENT_STATUS)
  .map((s) => `[${s[0].toUpperCase()}${s[0]}]${s.slice(1)}`)
  .join('|')

const RAW_RULES: RawRule[] = [
  // The support line in the plain text: the line under the wordmark that
  // repeats its name ("ToolGui.de" then "ToolGui.de support").
  ...(['reply', 'conversation'] as const).map((group) => ({
    group,
    text: /^([^\n]+)(\n\n)\1 support$/gm,
    replace: (_m: string, name: string, gap: string) => `${name}${gap}${name} Support`,
  })),
  // Status incident: "<strong>API:</strong> Degraded performance"
  {
    group: 'updates',
    html: new RegExp(`(:</strong>\\s+)(${COMPONENT_ALTS})(?=\\s*<)`, 'g'),
    text: new RegExp(`^([^\\n:]+:[ ]+)(${COMPONENT_ALTS})$`, 'gm'),
    replace: (_m, lead: string, status: string) =>
      lead + (COMPONENT_STATUS[status.toLowerCase()] ?? status),
  },
  // Plan limits rows: "<strong>Seats</strong>: 5 of 3. …"
  {
    group: 'plan',
    html: /(<\/strong>:\s)(\d+) of (\d+)\./g,
    text: /^([^\n:]+:[ ])(\d+) of (\d+)\./gm,
    replace: (_m, lead: string, used: string, cap: string) => `${lead}${used} von ${cap}.`,
  },
]

// ---------------------------------------------------------------------------
// Compiler
// ---------------------------------------------------------------------------

type Token = { literal: string } | { name: string; kind?: Kind }

function parse(template: string): Token[] {
  const tokens: Token[] = []
  const re = /\{(\w+)(?::(\w+))?\}/g
  let last = 0
  for (const m of template.matchAll(re)) {
    if (m.index > last) tokens.push({ literal: template.slice(last, m.index) })
    const kind = m[2] ? KINDS[m[2]] : undefined
    if (m[2] && !kind) throw new Error(`translate-de: unknown placeholder kind ${m[2]}`)
    tokens.push({ name: m[1], kind })
    last = m.index + m[0].length
  }
  if (last < template.length) tokens.push({ literal: template.slice(last) })
  return tokens
}

const SYNTAX = /[\\^$.*+?()[\]{}|/]/g
const APOS_HTML = "(?:'|’|&#x27;|&#39;|&apos;|&rsquo;)"
const QUOT_HTML = '(?:"|&quot;|&#x22;|&#34;|“|”)'
const MASK_OPEN = '\uE000'
const MASK_CLOSE = '\uE001'

function literalSource(text: string, target: Target, upper: boolean): string {
  const html = target === 'html'
  const ws = html ? '\\s+' : '[ \\u00a0]+'
  let out = ''
  for (const ch of upper ? text.toUpperCase() : text) {
    if (ch === "'" || ch === '’') out += html ? APOS_HTML : "['’]"
    else if (ch === '"' || ch === '“' || ch === '”') out += html ? QUOT_HTML : '["“”]'
    else if (ch === '&') out += html ? '(?:&amp;|&)' : '&'
    else if (ch === '<') out += html ? '&lt;' : '<'
    else if (ch === '>') out += html ? '&gt;' : '>'
    else if (/\s/.test(ch)) {
      if (!out.endsWith(ws)) out += ws
    } else out += ch.replace(SYNTAX, '\\$&')
  }
  return out
}

/** A placeholder: inline markup may sit inside a value in the HTML, never a block. */
function placeholderSource(
  kind: Kind | undefined,
  target: Target,
  upper: boolean,
  greedy: boolean
): string {
  if (kind?.alts) {
    const alts = [...kind.alts]
      .sort((a, b) => b.length - a.length)
      .map((alt) =>
        upper
          ? literalSource(alt, target, true)
          : `[${alt[0].toUpperCase()}${alt[0].toLowerCase()}]${literalSource(alt.slice(1), target, false)}`
      )
    return `(${alts.join('|')})`
  }
  if (kind?.re) return `(${kind.re})`
  const q = greedy ? '+' : '+?'
  return target === 'html'
    ? `((?:[^<>]|</?(?:strong|b|em|i|span|code)(?:\\s[^<>]*)?>)${q})`
    : `([^\\n]${q})`
}

const HTML_START: Record<string, string> = {
  any: '>',
  heading: '(?:<h1\\b[^>]*>|<div\\b[^>]*data-skip-in-text="true"[^>]*>)',
  link: '(?:<a\\b[^>]*>|<span\\b[^>]*>)',
  strong: '<strong\\b[^>]*>',
  eyebrow: '<p\\b[^>]*text-transform:uppercase[^>]*>',
}

function compile(phrase: Phrase, target: Target, upper: boolean): RegExp | null {
  const at = phrase.at ?? 'any'
  // Subjects are built from template headlines only; every sentence rule stays out of them.
  if (target === 'subject' && at !== 'heading') return null
  // The support line in the plain text is a raw rule (it has no markup to anchor on).
  if (target === 'text' && at === 'eyebrow') return null
  // Headings are uppercased in the plain text; only the uppercase variant can meet one there.
  if (target === 'text' && at === 'heading' && !upper) return null
  if (upper && !/[a-z]/.test(phrase.en.replace(/\{[^}]*\}/g, ''))) return null

  const anchor = phrase.anchor ?? 'both'
  const anchoredStart = anchor === 'both' || anchor === 'start'
  const anchoredEnd = anchor === 'both' || anchor === 'end'
  const tokens = parse(phrase.en)

  let body = ''
  tokens.forEach((token, index) => {
    if ('literal' in token) body += literalSource(token.literal, target, upper)
    else
      body += placeholderSource(
        token.kind,
        target,
        upper,
        index === tokens.length - 1 && !anchoredEnd
      )
  })

  // No match inside a word.
  const first = tokens[0]
  const last = tokens[tokens.length - 1]
  if ('literal' in first && /^[\p{L}\p{N}]/u.test(first.literal))
    body = `(?<![\\p{L}\\p{N}])${body}`
  if ('literal' in last && /[\p{L}\p{N}]$/u.test(last.literal)) body = `${body}(?![\\p{L}\\p{N}])`

  let start = ''
  let end = ''
  if (target === 'subject') {
    start = anchoredStart ? '^' : ''
    end = anchoredEnd ? '$' : ''
  } else if (target === 'html') {
    const open = HTML_START[at]
    if (anchoredStart) start = `(?<=${open}\\s*)`
    else if (at !== 'any') start = `(?<=${open}[^<]*)`
    if (anchoredEnd) end = at === 'link' ? '(?=\\s*</(?:a|span)>)' : '(?=\\s*<)'
  } else {
    if (anchoredStart) start = '(?<=^|· )'
    if (anchoredEnd) end = at === 'link' ? `(?= ${MASK_OPEN})` : `(?=$| ${MASK_OPEN}| · )`
  }

  const flags = target === 'text' ? 'gmu' : 'gu'
  return new RegExp(start + body + end, flags)
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

interface Compiled {
  re: RegExp
  replace: (match: string, ...rest: unknown[]) => string
}

function compiledPhrase(phrase: Phrase, target: Target, upper: boolean): Compiled | null {
  const re = compile(phrase, target, upper)
  if (!re) return null
  const placeholders = parse(phrase.en).filter(
    (t): t is { name: string; kind?: Kind } => 'name' in t
  )
  const german = typeof phrase.de === 'string' ? parse(phrase.de) : null
  const forHtml = (s: string) => (target === 'html' ? escapeHtml(s) : s)

  return {
    re,
    replace: (_match, ...rest) => {
      const values: Values = {}
      placeholders.forEach((p, i) => {
        const raw = String(rest[i] ?? '')
        const mapped = p.kind?.map?.[raw.trim().toLowerCase()]
        values[p.name] =
          mapped !== undefined ? forHtml(mapped) : p.kind?.conv ? forHtml(p.kind.conv(raw)) : raw
      })
      let out: string
      if (german) {
        out = german
          .map((t) => ('literal' in t ? forHtml(t.literal) : (values[t.name] ?? '')))
          .join('')
      } else {
        // The values are already in the target's form; the functions add plain German only.
        out = (phrase.de as (v: Values) => string)(values)
      }
      return upper ? out.toUpperCase() : out
    },
  }
}

const literalLength = (phrase: Phrase) => phrase.en.replace(/\{[^}]*\}/g, '').length

const cache = new Map<string, Compiled[]>()

function groupsFor(emailType: string | undefined): Group[] {
  const own = emailType !== undefined ? GROUPS_BY_TYPE[emailType] : undefined
  if (!own) return Object.keys(GROUPS) as Group[]
  // The prerendered test mail carries no layout, so not the shared footers either.
  return emailType === 'RawEmail' ? own : ['shared', ...own]
}

function rules(target: Target, groups: Group[]): Compiled[] {
  const key = `${target}:${groups.join(',')}`
  const hit = cache.get(key)
  if (hit) return hit
  // Longest first: a specific sentence before a shorter one it contains.
  const ordered = groups
    .flatMap((group) => GROUPS[group])
    .sort((a, b) => literalLength(b) - literalLength(a))
  const list: Compiled[] = []
  for (const phrase of ordered) {
    const normal = compiledPhrase(phrase, target, false)
    if (normal) list.push(normal)
    if (target === 'text') {
      const upper = compiledPhrase(phrase, target, true)
      if (upper) list.push(upper)
    }
  }
  for (const raw of RAW_RULES) {
    const re = target === 'html' ? raw.html : target === 'text' ? raw.text : undefined
    if (re && groups.includes(raw.group)) {
      list.push({ re, replace: raw.replace as Compiled['replace'] })
    }
  }
  cache.set(key, list)
  return list
}

// ---------------------------------------------------------------------------
// Masking: what must never change
// ---------------------------------------------------------------------------

function mask(input: string, pattern: RegExp, saved: string[]): string {
  return input.replace(pattern, (m) => {
    saved.push(m)
    return `${MASK_OPEN}${saved.length - 1}${MASK_CLOSE}`
  })
}

function unmask(input: string, saved: string[]): string {
  const re = new RegExp(`${MASK_OPEN}(\\d+)${MASK_CLOSE}`, 'g')
  // Masks can nest (a URL inside the reply-marker pass), so repeat until none is left.
  let out = input
  for (let i = 0; i < 3 && re.test(out); i++) {
    out = out.replace(re, (_m, n: string) => saved[Number(n)] ?? '')
  }
  return out
}

const REPLY_MARKER_RE = new RegExp(REPLY_MARKER_TEXT.replace(SYNTAX, '\\$&'), 'g')

function translateTarget(input: string, target: Target, groups: Group[]): string {
  const saved: string[] = []
  let out = mask(input, REPLY_MARKER_RE, saved)
  if (target === 'html') {
    // React's separators between adjacent text nodes: "On <!-- -->Nov 3<!-- -->, …".
    out = out.replace(/<!-- -->/g, '')
    out = mask(out, /\b(?:href|src)="[^"]*"/g, saved)
    out = out.replace(/<html([^>]*)\blang="en"/, '<html$1lang="de"')
  } else {
    out = mask(out, /https?:\/\/\S+/g, saved)
  }
  for (const rule of rules(target, groups)) {
    rule.re.lastIndex = 0
    out = out.replace(rule.re, rule.replace)
  }
  return unmask(out, saved)
}

/**
 * The German version of a rendered email: template wording translated, every
 * name, title, message, URL and the reply marker left exactly as they were.
 */
export function translateEmail<T extends TranslatableEmail>(email: T): T {
  const groups = groupsFor(email.emailType)
  return {
    ...email,
    subject: translateTarget(email.subject, 'subject', groups),
    ...(email.html !== undefined ? { html: translateTarget(email.html, 'html', groups) } : {}),
    ...(email.text !== undefined ? { text: translateTarget(email.text, 'text', groups) } : {}),
  }
}
