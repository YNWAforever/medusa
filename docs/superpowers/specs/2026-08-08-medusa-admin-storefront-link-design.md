# Medusa Admin Storefront Link Design

## Context

Fotomax has a Medusa Admin application in `apps/medusa` and a bilingual storefront in `apps/storefront`. The storefront's canonical entry point redirects to the default Traditional Chinese locale, `/zh-HK`. The Medusa Admin currently has no visible global action that takes an administrator to that storefront.

Medusa supports a configured `admin.storefrontUrl`, which is also exposed to Admin customizations through `__STOREFRONT_URL__`. Medusa v2.17.2 provides a `topbar` Admin widget injection zone suitable for a small global navigation action.

## Goal

Add a global Medusa Admin top-bar action labeled “Open storefront” that opens the Fotomax storefront home at the default Traditional Chinese locale in a new browser tab.

The action must use an environment-configured storefront origin so the same Admin code works across local, staging, and production environments without embedding a production URL in source code.

## Non-Goals

- Adding an Admin route or dashboard fork.
- Adding a locale picker to the Admin action.
- Passing Admin authentication or customer session state to the storefront.
- Changing storefront routing, localization, or storefront UI.
- Building a storefront preview or draft-content workflow.

## Approved Approach

Configure Medusa's `admin.storefrontUrl` and add a minimal custom Admin widget in the `topbar` injection zone.

The widget will read the build-time `__STOREFRONT_URL__` global, normalize a trailing slash, append `/zh-HK`, and render a link that opens in a new tab. This uses Medusa's supported Admin configuration boundary and keeps the behavior isolated to the Fotomax application.

## Architecture

The flow is:

```text
MEDUSA_STOREFRONT_URL
        |
        v
medusa-config.ts: admin.storefrontUrl
        |
        v
Medusa Admin build: __STOREFRONT_URL__
        |
        v
apps/medusa/src/admin/widgets/storefront-link.tsx
        |
        v
https://storefront.example/zh-HK (new tab)
```

The implementation will touch only the Medusa app configuration, Admin widget entry point, Admin global type declarations if required by TypeScript, and the Medusa environment example/validation surface.

## Configuration And Environment Policy

`apps/medusa/medusa-config.ts` will set `admin.storefrontUrl` from `MEDUSA_STOREFRONT_URL`.

Environment behavior:

- Local and test environments may default to `http://localhost:3000` so the Admin remains usable with the local storefront.
- Staging and production environments must provide an explicit `MEDUSA_STOREFRONT_URL`.
- A missing non-local value must fail the existing Medusa environment validation/startup path instead of producing a misleading localhost link.
- The environment example will document the variable and the build-time nature of the Admin value.

Because Medusa inlines the storefront URL into the Admin bundle, changing `MEDUSA_STOREFRONT_URL` requires rebuilding the Admin bundle before the link changes.

## Admin Widget Behavior

The new widget will be placed at:

`apps/medusa/src/admin/widgets/storefront-link.tsx`

Behavior and presentation:

- Render in the `topbar` injection zone so it is available from every Admin page.
- Use the existing Medusa Admin UI primitives and styling conventions.
- Display the label “Open storefront” with an external-link indicator.
- Build the destination as the configured storefront origin plus `/zh-HK`.
- Remove only trailing slashes from the configured origin before appending the locale path.
- Use `target="_blank"` and `rel="noopener noreferrer"`.
- Keep the link a normal anchor so browser navigation, accessibility, and copy-link behavior remain standard.

The widget will not fetch data, call the Store API, or depend on Admin session state. A configured URL is treated as trusted deployment configuration; the widget will not accept a destination from query parameters or user-entered data.

## Verification

Implementation verification will include:

- TypeScript validation for the widget and any `__STOREFRONT_URL__` declaration.
- Medusa Admin production build to verify the widget is discovered and the configured URL is available.
- Focused test or static assertion that the destination normalizes trailing slashes and ends at `/zh-HK`.
- Configuration validation for local/test fallback and non-local missing-variable failure.
- A manual Admin smoke check confirming the top-bar action appears globally and opens the expected storefront page in a new tab.
- Separate reporting of source failures versus any existing linked-worktree or dependency-environment limitation.

## Alternatives Considered

### Configuration only

Setting only `admin.storefrontUrl` is low-risk and supports Medusa features that already generate storefront-aware links, but it does not provide the requested visible global navigation action.

### Custom Admin route or dashboard fork

This would create a larger navigation surface and increase maintenance against Medusa dashboard upgrades without adding value for a single external link.

## Deferred Work

Future work may add locale-aware storefront navigation, customer preview links, authenticated preview sessions, or context-sensitive links from specific Admin records. Those concerns should be designed separately from this global storefront-home action.
