# Fotomax Commerce Storefront Foundation Design

## Context

Fotomax's current public website is a broad bilingual commerce and service surface covering photo printing, document services, photobooks, personalized gifts, Instax and film products, lifestyle products, promotions, store pickup, member/account flows, and support content.

The local workspace at `C:\Users\laich\Documents\fotomax` is a fresh git repository. The referenced `YNWAforever/medusa` repository is the Medusa framework monorepo, not an existing Fotomax storefront application. Phase 1 will therefore create a new Fotomax application in this workspace and use Medusa as the commerce backend boundary.

## Goal

Build the Phase 1 foundation for a modern Fotomax commerce storefront. A user should be able to land on the site, understand Fotomax's major product categories, browse seeded products, view product detail pages, and see a credible cart path backed by Medusa-ready catalog data.

## Non-Goals

Phase 1 will not implement production photo upload, photo print configuration, document print fulfillment, payment capture, production checkout, account management, or store inventory synchronization. Service-heavy flows will appear as polished entry points with clear next-phase states instead of incomplete production logic.

## Approved Approach

Use a new Medusa-backed Next.js storefront rather than customizing inside the Medusa framework repository.

This keeps Fotomax-specific work isolated from upstream Medusa platform code, gives the storefront a clean project shape, and lets the backend mature behind a clear commerce boundary.

## Architecture

The repository will be organized as a small monorepo:

- `apps/storefront`: the public Fotomax site, including bilingual routes, homepage, navigation, category pages, product pages, and cart shell.
- `apps/medusa`: the Medusa backend application/configuration and seed entry points for Fotomax catalog data.
- `packages/shared`: shared catalog fixtures, bilingual labels, category definitions, and formatting helpers.
- `docs/superpowers/specs`: design and implementation planning documents.

The frontend will own routing, layout, interaction states, bilingual copy, product discovery, and cart-facing UI. Medusa will own commerce primitives such as regions, collections/categories, products, variants/options, pricing-ready records, and future checkout/cart API integration.

The important boundary is that Phase 1 makes the commerce catalog feel real and navigable without pretending that the photo-service fulfillment workflow is complete.

## Customer Experience

Phase 1 will modernize the shopping journey around the highest-value entry points:

- Bilingual homepage with clear paths into Photo Print, Photobook, Personalized Gifts, Instax/Film, Lifestyle, Promotions, and Store Pickup.
- Compact mega navigation that exposes Fotomax's breadth without recreating the old directory-heavy feel.
- Category pages with filters, featured services, product cards, demo price/status values, and promotion slots.
- Product detail pages with bilingual descriptions, image gallery, option/variant shell, pickup/shipping notes, and cart-ready calls to action.
- Cart drawer or cart page shell that can later connect to real Medusa cart state.
- Service-heavy flows represented by polished entry pages and disabled or next-phase calls to action.

The visual direction should feel modern retail, practical, and photography-forward: bright, crisp, product-led, and easy to scan. It should avoid marketing-only composition and instead prioritize efficient browsing, category clarity, and trust-building details.

## Data Model

The initial catalog will be seeded around Medusa-compatible concepts:

- Regions and currency defaults for the Hong Kong storefront.
- Collections/categories aligned to Fotomax's major shopping and service areas.
- Products with bilingual names, descriptions, image references, category handles, promotional labels, and product-type metadata.
- Variants/options for common choices such as size, finish, format, bundle, or color where applicable.
- Demo price and inventory/status values that can map cleanly to Medusa records later.

The storefront will read product/category information through a small catalog access layer. During early UI implementation that layer can use local seed data; as the backend comes online it can switch to Medusa APIs without rewriting page components.

## Bilingual Content

English and Traditional Chinese copy will be stored in structured dictionaries or locale-aware data objects. Routes and navigation must support both locales from the start. Product/category data should keep bilingual labels adjacent so drift is easy to spot during review.

## Error Handling And Empty States

Customer-facing failures should be explicit and recoverable:

- Empty categories show useful fallback text and links back to featured categories.
- Missing product handles return a clean not-found page.
- ~~Catalog/API failures can fall back to seed data where practical.~~
  **Superseded.** Phase 2A moved the catalog to live Medusa with no seed fallback:
  `app/[locale]/layout.tsx` awaits `getCatalogView()`, so a backend outage fails
  every localized route. Rather than reintroduce a fallback that could serve stale
  prices, the storefront now degrades through a bilingual error boundary at
  `app/global-error.tsx`. A seed fallback remains an open option if offline
  browsing is ever required.
- Cart actions expose disabled, loading, success, and error states.
- Next-phase service flows clearly explain that upload/configuration is not active in Phase 1.

## Verification

Phase 1 implementation should be verified with:

- Typecheck and production build.
- Seed catalog validation for required bilingual fields, handles, category links, and product references.
- Route smoke tests for both locales.
- Browser checks or screenshots for homepage, category page, product detail page, cart shell, desktop, and mobile.
- A short note separating true new failures from any baseline project/setup constraints.

## Success Criteria

Phase 1 is successful when:

- The repository contains a coherent Fotomax app structure rather than upstream Medusa framework customization.
- The storefront runs locally and presents a modern bilingual Fotomax commerce surface.
- Users can browse major categories and seeded products.
- Product detail pages have credible information architecture for future Medusa cart integration.
- The cart shell and service-entry states communicate the intended next steps without misleading users.
- The data layer can transition from local seed data to Medusa APIs behind a stable interface.

## Deferred Work

Later phases should cover real Medusa cart/checkout integration, photo/document upload workflows, print configuration rules, pickup/store inventory, member accounts, promotions engine, payment provider setup, production deployment, and content-management workflows for non-product pages.
