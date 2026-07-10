# Fotomax Phase 1 Verification

## Commands

- `corepack npm install`
- `npm.cmd exec playwright install chromium`
- `npm.cmd run check`
- `npm.cmd run e2e --workspace @fotomax/storefront`

## Routes Checked

- `/zh-HK`
- `/en`
- `/en/categories/photo-print`
- `/en/products/classic-4r-photo-print`
- `/en/services/upload-photo-print`
- `/en/services/store-pickup`
- `/en/services/not-a-service`
- `/zh-HK/does-not-exist`
- `/en/does-not-exist`
- `/en/cart`

## Automated Result

- Root verification passed with typechecks for all three workspaces, 85 unit tests across 13 files, and both the Next.js 16.2.10 storefront and Medusa/Admin production builds.
- Playwright passed 18 of 18 browser tests: nine customer journeys in both `desktop-chromium` and `mobile-chromium`.
- The browser suite covers initial SSR `lang` values for `en` and `zh-HK` without hydration errors, bilingual navigation, URL-backed filtering with a genuinely empty recovery case, repeated add-to-cart status and quantity, drawer focus restoration, clear-then-add recovery, service entry states, localized nested not-found recovery, optimized above-fold category media, and cart-route copy.

## Issues Found And Resolved

- Vitest initially discovered the Playwright spec. Its config now excludes `e2e/**`, keeping unit and browser runners separate without broadening focused commands.
- Port 3000 was occupied by an unrelated local Next.js application. The Playwright server uses the free port 3100 explicitly.
- The cart drawer opened over the product action after the first addition and intercepted the second click on both viewports. The cart now remains collapsed during additions and exposes its compact reopen control; focused and full browser regressions pass.
- Playwright no longer reuses an arbitrary listener. It starts this checkout's local Next executable on a configurable test port, owns that process, and stops it after the run. The final clean-start run confirmed port 3100 was free before and after all 18 tests.
- Confirmed cart clearing now resets the drawer to its collapsed state, so adding twice after a clear remains unobstructed while the header focus contract is preserved.
- The final review recreated an LCP regression twice: first for the category hero and then for its first visible product card. Both were made explicit `loading="eager"` and `fetchPriority="high"`; the focused browser rerun and final 18-test run emitted no Next.js LCP warning.
- A locale catch-all routes unknown nested English and Traditional Chinese URLs through the nearest localized not-found boundary with same-locale recovery.
- The final seed contract creates regions, collections, and then products in order, maps Medusa-created collection IDs into typed product DTOs, and aborts before product creation when any collection is missing.

## Final-Review RED To Green

- Inherited seed and Playwright ownership RED-to-GREEN evidence remains in `.superpowers/sdd/task-7-report.md` and `.superpowers/sdd/task-8-report.md`.
- The recreated category-media RED commands failed because the hero, then the first category card, lacked `loading="eager"`. Each passed after the narrow rendering change; `npm.cmd run test --workspace @fotomax/storefront -- src/components/catalog-pages.test.tsx` finished with 18 passing tests.
- Patch-focused green checks passed: Medusa seed tests (19), storefront routing/catalog/Playwright-config tests (12), storefront production build, the root `npm.cmd run check`, and the clean-start 18/18 Playwright suite.

## In-App Browser Result

- The production storefront was inspected at 1440 x 900 and 375 x 812. Both viewports had zero horizontal overflow, readable controls and headings, and a visible start to the category section below the mobile hero.
- The hero and four product images decoded with non-zero natural dimensions through the production Next.js image optimizer.
- Live interaction checks covered URL-backed filtering, repeated add-to-cart announcements, drawer collapse/reopen focus, guarded clear-cart focus, clear-then-add-twice recovery, service and cart routes, and same-locale not-found recovery.
- A fresh product-page reload added no console errors or warnings after the eager-image fix.

## Environment Notes

- Dependency and browser downloads required elevated network and user-cache access in the managed sandbox.
- Remote Unsplash catalog images required the E2E command to run with network access; the sandboxed run failed with `connect EACCES`.
- Vitest's config bundler required broader filesystem access in the managed Windows sandbox; the focused and root gates passed in the approved execution context.
- The final install audited 1,146 packages and reported the existing dependency baseline of 93 moderate and 8 high advisories. No forced dependency upgrade was applied.
