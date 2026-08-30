# Teams app package (Phase 4a Part 1)

A Microsoft Teams "static tab" that loads the existing web app (Home / deck selection /
presenting) inside a Teams-shaped shell — the tab's `contentUrl` is the same deployed web
app everyone already uses in a browser, not a separate build.

**This package has never been sideloaded into a real Teams client** — that's explicitly
Phase 4a Part 2, blocked until real Teams access exists (see the root `README.md`/PR
description). What's here is a complete, schema-valid manifest and icon set, ready to zip
and sideload once that access exists; nothing below has had a live click-through check
inside Teams itself.

## Files

- `manifest.json` — the Teams app manifest (schema v1.16). `staticTabs[0].contentUrl` and
  `validDomains` point at the real deployed web app
  (`https://mmmi3mct2q.us-east-1.awsapprunner.com`) — if that App Runner service URL ever
  changes (e.g. the service is deleted and recreated; a normal redeploy keeps the same
  URL), update both fields here to match.
- `color.png` (192x192) / `outline.png` (32x32) — the two icons Teams requires. Generated
  by `generate-icons.mjs` (no image-editing tool was available in the environment this was
  built in, so it writes raw PNG bytes by hand via Node's `zlib`) rather than hand-drawn;
  re-run `node generate-icons.mjs` from this directory to regenerate or after tweaking the
  colors/shapes in that script.

## Building the sideloadable package

Teams sideloading takes a single zip containing exactly these three files at its root (no
subfolder):

```sh
cd infra/teams
zip -j teams-app-package.zip manifest.json color.png outline.png
```

`teams-app-package.zip` is the file an admin uploads via Teams' "Upload a custom app" flow,
or a developer sideloads via **Apps → Manage your apps → Upload an app → Upload a custom
app** in the Teams client.

## Known gaps, on purpose

- **No Teams SSO** (`webApplicationInfo`) — real Teams single-sign-on needs the Azure AD
  app registration's exposed API (Application ID URI + a scope) configured, which doesn't
  exist until that app registration itself does (see the root `README.md`'s Azure AD setup
  steps). Signing in inside the tab today would use the same "Sign in with Microsoft"
  button/redirect flow the plain browser login page has — a real click-through of that,
  inside a real Teams client's webview, is exactly the Part 2 verification that's blocked.
- **`websiteUrl`/`privacyUrl`/`termsOfUseUrl` all point at the same app URL** — fine for
  internal sideloading, but real Teams Store submission would need genuine, distinct pages
  for privacy and terms of use.
- **Personal scope only** — one static tab, no team/group-chat configurable tab. Matches
  "the existing web app... running inside a Teams-shaped shell" as asked; a
  channel/group-context tab is a bigger, separate feature (would need `configurableTabs`,
  a per-channel deck context, etc.) not part of this phase.
