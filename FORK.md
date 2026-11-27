# tg-FeedbackOS: how this fork differs

tg-FeedbackOS is the hub of ToolGui.de (hub.toolgui.de). It is a fork of
[FeedbackOS](https://github.com/PayGlue/FeedbackOS), PayGlue's fork of
[Quackback](https://github.com/QuackbackIO/quackback), licensed under the
[AGPL-3.0](LICENSE). The complete source code of the running instance lives in
this repository, on the `toolgui` branch.

"Quackback" is the name of the original project. This fork is not affiliated
with, and is not endorsed by, the Quackback project or its maintainers. The names
and logos "ToolGui.de", "FeedbackOS" and "PayGlue" are not part of the AGPL
licensing.

## Changes on top of FeedbackOS

- Emails use the ToolGui.de look: pale blue page, white card, orange buttons,
  blue links, and the workspace name drawn as a wordmark like the logo
  ("Tool" in orange, "Gui.de" in blue). The maintenance notice box is light to
  match.
- The "Source code" link in the portal points at this repository.
- Sign-in and account emails, which carry no workspace name, take the name
  for logo and wordmark from `EMAIL_APP_NAME` instead of "Quackback".
- The Docker workflow builds only the app image; the browser reader sidecar
  ("Import your brand") is not run by the hub.
- `deploy/coolify/docker-compose.yml` is the Coolify service on NAFDO.
- README and security policy name ToolGui.de and its contact.

Everything below is what FeedbackOS changes compared to Quackback, kept as it is.

## Updating from FeedbackOS

FeedbackOS merges Quackback regularly (PayGlue ticket PG-381). This fork takes
those updates from FeedbackOS, not from Quackback directly, so PayGlue's conflict
resolutions come along:

- Remotes: `payglue` (https://github.com/PayGlue/FeedbackOS, push disabled) and
  `quackback` (push disabled). Never push to either.
- Fetch `payglue/payglue`, merge it with `git merge --no-ff` on a branch named
  `upstream-sync/<feedbackos-commit>`, open a pull request against `toolgui` and
  merge it with a merge commit.
- Then build the image with the Docker workflow (dispatch on `toolgui`, with
  `image_tag`) and roll it out in Coolify (service tg-feedbackos on NAFDO).

# FeedbackOS: how it differs from Quackback

## Changes

**Branding**

- No "Powered by Quackback" footer in the portal, widget or emails.
- The admin uses the workspace name and favicon in the browser tab.
- Error and not-found pages show the workspace logo and, as full pages, the
  workspace theme instead of the Quackback duck and palette.
- Emails use the workspace look: logo and wordmark above the card (in
  FeedbackOS a dark card with indigo buttons and links, here the ToolGui.de look). Conversation emails to customers (replies, acknowledgement,
  closed) use the same layout with the subject as heading.
- The launcher greeting uses the waving hand with a skin tone (👋🏻) in every
  language.
- Once a teammate replies in a conversation, the messenger header shows that
  person instead of the AI assistant; the assistant moves to the subtitle.
- A "Source code" link to this repository under the feedback filters in the
  portal (`portal-source-code-link.tsx`), so every user can reach the source of
  the running version (AGPL section 13). A fork points
  `apps/web/src/lib/shared/source-code.ts` at its own repository.

**Help center on a custom domain**

- Paths from a previous documentation site are redirected into the help center
  (`/index` to the help center home, `/<category>` to the category, `/<category>/<article>` to
  `/hc/...`).
- A category URL whose category was merged or deleted falls back to the
  configured redirect rules instead of a 404.
- This redirect runs before Quackback's section host routing, which would
  otherwise send a path no section owns away from the help center domain.
- Clicking an image in an article opens it at full size in the file viewer,
  with the article's other images one arrow key away.
- The file viewer leaves the size out of its header when it is unknown
  (size 0), as for these article images.

**Email channel**

- Mails that can be answered by email start with a reply marker line. Inbound
  replies are cut at the quote that holds it, independent of mail client and
  language; the client's attribution line is removed by its shape.
- German attribution lines ("Am ... schrieb ...:") are recognised as well.
- New contacts from inbound email take the display name from the From header.
- The reply address carries a display name ("<Workspace> Support").

**IMAP inbound**

- The poll searches unseen and recent mail, because some servers (label
  folders) report new mail as seen. Duplicates are dropped by Message-ID.
- A handled message can be marked seen in further mailboxes
  (`IMAP_MARK_SEEN_ALSO`, comma separated).
- A fetched message that is not ingested is logged with its reason.

**Tickets API**

- `GET /api/v1/ticket-types` lists ticket types with id and slug.
- `POST /api/v1/tickets` accepts `descriptionFromRequester`, so a ticket an
  integration files on a customer's behalf opens with the customer's message.
- Tickets created by an API key or integration are not assigned to it.

**Dependencies**

- Security updates ahead of upstream where an advisory required it.
- No Dependabot. Its updates for this Bun workspace fail in the fork; the
  audit check in CI catches advisories, and upstream merges bring the updates.

## Configuration added by this fork

| Variable              | Purpose                                                                    |
| --------------------- | -------------------------------------------------------------------------- |
| `EMAIL_LOGO_URL`      | Logo for emails sent without a workspace logo                              |
| `EMAIL_APP_NAME`      | Name and wordmark for emails sent without a workspace name (tg-FeedbackOS) |
| `IMAP_MARK_SEEN_ALSO` | Further mailboxes in which a handled message is marked seen                |

## Maintaining the fork

- **Upstream updates are merged, never rebased.** Fetch Quackback's `main`, run
  `git merge --no-ff upstream/main` on a branch named `upstream-sync/<date>`,
  and open a pull request. Merge it with a merge commit, not a squash, so the
  upstream history and the recorded conflict resolutions stay.
- **Turn on `git rerere`** in every clone (`git config rerere.enabled true`), so
  a conflict resolved once is resolved the same way next time.
- **`merge=ours` only for branding files.** `.gitattributes` marks `README.md`;
  it needs `git config merge.ours.driver true` once per clone. Never use it for
  code: it discards the other side entirely, real fixes included.
- **No octopus merges** and no automatic search and replace of "Quackback":
  both have silently broken forks before (URLs, path aliases, i18n keys).
- After an upstream merge, check every file this fork added or deleted against
  the new tree. Upstream can bring a deleted file back under a new path.
- The `Upstream reference check` workflow fails a pull request that adds new
  references to Quackback's infrastructure; `upstream-sync/*` branches are
  exempt and reviewed by hand.
- Commits follow Conventional Commits (`feat(email): ...`, `fix(imap): ...`),
  in English, describing the behaviour.
