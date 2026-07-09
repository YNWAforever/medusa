# Fotomax Commerce Storefront Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a modern bilingual Fotomax commerce storefront foundation with Medusa-ready catalog data, category browsing, product detail pages, and a cart shell.

**Architecture:** Create a small npm workspace monorepo with `apps/storefront`, `apps/medusa`, and `packages/shared`. The storefront uses local shared seed data through a catalog access layer first, while the Medusa backend skeleton and seed payload establish the commerce boundary for API integration. UI components stay small and data-driven so locale, catalog, cart, and page behavior can be tested independently.

**Tech Stack:** npm workspaces, Node.js 20+, Next.js App Router, React, TypeScript, Vitest, Playwright, lucide-react, Medusa v2.

## Global Constraints

- Build a new Fotomax application in this workspace instead of customizing inside the upstream Medusa framework repository.
- Phase 1 will not implement production photo upload, photo print configuration, document print fulfillment, payment capture, production checkout, account management, or store inventory synchronization.
- Service-heavy flows must appear as polished entry points with clear next-phase states instead of incomplete production logic.
- Routes and navigation must support English and Traditional Chinese from the start.
- Product/category data must keep bilingual labels adjacent so drift is easy to spot during review.
- Customer-facing failures must be explicit and recoverable.
- Verification must include typecheck, production build, seed catalog validation, locale route smoke tests, and browser checks for homepage, category page, product detail page, cart shell, desktop, and mobile.

---

## File Structure

- `package.json`: root workspace scripts and package manager metadata.
- `.gitignore`: generated artifacts, dependency folders, local env files, Playwright output.
- `tsconfig.base.json`: shared TypeScript defaults for all packages.
- `packages/shared/package.json`: package metadata and test/typecheck scripts for shared catalog utilities.
- `packages/shared/tsconfig.json`: shared package TypeScript config.
- `packages/shared/src/i18n.ts`: locale types, locale metadata, copy dictionary, and path helpers.
- `packages/shared/src/catalog.ts`: Fotomax categories, products, service entries, formatters, and catalog lookup helpers.
- `packages/shared/src/index.ts`: public shared exports.
- `packages/shared/src/catalog.test.ts`: catalog integrity tests.
- `apps/storefront/package.json`: storefront dependencies and scripts.
- `apps/storefront/next.config.mjs`: Next config, including shared package transpilation.
- `apps/storefront/tsconfig.json`: storefront TypeScript config.
- `apps/storefront/app/layout.tsx`: root HTML shell.
- `apps/storefront/app/page.tsx`: default locale redirect.
- `apps/storefront/app/[locale]/layout.tsx`: locale-aware app shell.
- `apps/storefront/app/[locale]/page.tsx`: homepage route.
- `apps/storefront/app/[locale]/categories/[handle]/page.tsx`: category route.
- `apps/storefront/app/[locale]/products/[handle]/page.tsx`: product route.
- `apps/storefront/app/[locale]/services/[handle]/page.tsx`: service entry route.
- `apps/storefront/app/[locale]/cart/page.tsx`: cart route.
- `apps/storefront/app/not-found.tsx`: global not-found route.
- `apps/storefront/app/globals.css`: complete storefront styling.
- `apps/storefront/src/lib/locales.ts`: locale validation and href helpers.
- `apps/storefront/src/lib/catalog-view.ts`: storefront-friendly catalog selectors.
- `apps/storefront/src/lib/locales.test.ts`: locale helper tests.
- `apps/storefront/src/components/*.tsx`: focused layout, card, homepage, category, product, and cart components.
- `apps/storefront/e2e/storefront.spec.ts`: Playwright route and screenshot smoke tests.
- `apps/storefront/playwright.config.ts`: Playwright server and browser settings.
- `apps/medusa/package.json`: Medusa backend package metadata and scripts.
- `apps/medusa/tsconfig.json`: backend TypeScript config.
- `apps/medusa/medusa-config.ts`: Medusa configuration.
- `apps/medusa/src/scripts/seed.test.ts`: pure seed payload validation that does not require PostgreSQL.
- `apps/medusa/src/scripts/seed.ts`: Medusa seed payload entry point.
- `apps/medusa/README.md`: local backend run notes.

---

### Task 1: Workspace Scaffolding

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `tsconfig.base.json`

**Interfaces:**
- Produces: npm workspaces `apps/*` and `packages/*`; shared TypeScript compiler defaults consumed by all later tasks.

- [ ] **Step 1: Create root workspace metadata**

Create `package.json` with this complete content:

```json
{
  "name": "fotomax-modernization",
  "version": "0.1.0",
  "private": true,
  "packageManager": "npm@10.9.0",
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "build": "npm run build --workspace @fotomax/storefront",
    "check": "npm run typecheck && npm run test && npm run build",
    "dev": "npm run dev --workspace @fotomax/storefront",
    "dev:medusa": "npm run dev --workspace @fotomax/medusa",
    "seed:medusa": "npm run seed --workspace @fotomax/medusa"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 2: Create repository ignore rules**

Create `.gitignore` with this complete content:

```gitignore
.worktrees/
.superpowers/
node_modules/
.next/
.medusa/
dist/
coverage/
test-results/
playwright-report/
.env
.env.*
!.env.example
npm-debug.log*
```

- [ ] **Step 3: Create shared TypeScript defaults**

Create `tsconfig.base.json` with this complete content:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 4: Verify root workspace metadata**

Run: `npm pkg get workspaces`

Expected output includes:

```text
[
  "apps/*",
  "packages/*"
]
```

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore tsconfig.base.json
git commit -m "chore: scaffold Fotomax workspace"
```

---

### Task 2: Shared Bilingual Catalog

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/i18n.ts`
- Create: `packages/shared/src/catalog.ts`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/catalog.test.ts`

**Interfaces:**
- Produces: `Locale`, `locales`, `isLocale(value: string): value is Locale`, `t(locale: Locale, key: CopyKey): string`, `localize(value: LocalizedText, locale: Locale): string`, `getCategory(handle: string)`, `getProduct(handle: string)`, `getProductsByCategory(handle: string)`, `getServiceEntry(handle: string)`, `formatPrice(cents: number, locale: Locale): string`.
- Consumes: root TypeScript defaults from Task 1.

- [ ] **Step 1: Create the shared package shell**

Create `packages/shared/package.json`:

```json
{
  "name": "@fotomax/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  }
}
```

Create `packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "moduleResolution": "Bundler",
    "types": ["vitest/globals"]
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 2: Write the failing catalog test**

Create `packages/shared/src/catalog.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  categories,
  defaultLocale,
  formatPrice,
  getCategory,
  getProduct,
  getProductsByCategory,
  getServiceEntry,
  isLocale,
  locales,
  localize,
  products,
  serviceEntries,
  t,
} from "./index"

describe("Fotomax shared catalog", () => {
  it("defines the supported bilingual locales", () => {
    expect(defaultLocale).toBe("zh-HK")
    expect(locales).toEqual(["zh-HK", "en"])
    expect(isLocale("zh-HK")).toBe(true)
    expect(isLocale("en")).toBe(true)
    expect(isLocale("fr")).toBe(false)
  })

  it("keeps category and product handles unique", () => {
    expect(new Set(categories.map((category) => category.handle)).size).toBe(categories.length)
    expect(new Set(products.map((product) => product.handle)).size).toBe(products.length)
  })

  it("links every product to an existing category", () => {
    const handles = new Set(categories.map((category) => category.handle))
    for (const product of products) {
      expect(handles.has(product.categoryHandle)).toBe(true)
    }
  })

  it("returns bilingual category, product, and service data", () => {
    expect(localize(getCategory("photo-print")!.name, "en")).toBe("Photo Print")
    expect(localize(getProduct("classic-4r-photo-print")!.name, "zh-HK")).toBe("經典 4R 相片沖印")
    expect(localize(getServiceEntry("upload-photo-print")!.title, "en")).toBe("Upload Photo Print Order")
  })

  it("filters category products and formats Hong Kong prices", () => {
    expect(getProductsByCategory("photo-print").map((product) => product.handle)).toContain("classic-4r-photo-print")
    expect(formatPrice(280, "en")).toBe("HK$2.80")
    expect(formatPrice(280, "zh-HK")).toBe("HK$2.80")
  })

  it("uses product-representative audited media", () => {
    expect(getProduct("premium-layflat-photobook")!.image).toBe("https://images.unsplash.com/photo-1528569937393-ee892b976859?auto=format&fit=crop&w=1200&q=80")
    expect(getProduct("instax-mini-film-pack")!.image).toBe("https://images.unsplash.com/photo-1486574655068-162e94137442?auto=format&fit=crop&w=1200&q=80")
    expect(getProduct("desktop-acrylic-photo-block")!.image).toBe("https://images.unsplash.com/photo-1526049471490-b2a136bb4538?auto=format&fit=crop&w=1200&q=80")
  })

  it("provides shared navigation copy", () => {
    expect(t("en", "cart")).toBe("Cart")
    expect(t("zh-HK", "cart")).toBe("購物車")
  })

  it("has polished next-phase service entries", () => {
    expect(serviceEntries.every((entry) => entry.status === "next-phase")).toBe(true)
    expect(serviceEntries.map((entry) => entry.handle)).toContain("upload-photo-print")
    expect(serviceEntries.map((entry) => entry.handle)).toContain("store-pickup")
  })
})
```

- [ ] **Step 3: Run the failing test**

Run: `npm install`

Run: `npm run test --workspace @fotomax/shared`

Expected: FAIL because `packages/shared/src/index.ts` does not exist yet.

- [ ] **Step 4: Implement locale helpers**

Create `packages/shared/src/i18n.ts`:

```ts
export const locales = ["zh-HK", "en"] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = "zh-HK"

export type LocalizedText = Record<Locale, string>

export const localeLabels: Record<Locale, string> = {
  "zh-HK": "繁體中文",
  en: "English",
}

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value)
}

export function localize(value: LocalizedText, locale: Locale): string {
  return value[locale] || value[defaultLocale]
}

export const copy = {
  cart: {
    "zh-HK": "購物車",
    en: "Cart",
  },
  shopNow: {
    "zh-HK": "立即選購",
    en: "Shop now",
  },
  browseCategory: {
    "zh-HK": "瀏覽分類",
    en: "Browse category",
  },
  storePickup: {
    "zh-HK": "門市取貨",
    en: "Store pickup",
  },
  nextPhase: {
    "zh-HK": "下一階段推出",
    en: "Coming in the next phase",
  },
  addToCart: {
    "zh-HK": "加入購物車",
    en: "Add to cart",
  },
  addedToCart: {
    "zh-HK": "已加入購物車",
    en: "Added to cart",
  },
} as const satisfies Record<string, LocalizedText>

export type CopyKey = keyof typeof copy

export function t(locale: Locale, key: CopyKey): string {
  return copy[key][locale]
}
```

- [ ] **Step 5: Implement catalog data and accessors**

Create `packages/shared/src/catalog.ts`:

```ts
import type { Locale, LocalizedText } from "./i18n"

export type CategoryKind = "service" | "product" | "promotion"
export type ProductStatus = "available" | "featured" | "next-phase"
export type ServiceStatus = "next-phase"

export interface Category {
  handle: string
  kind: CategoryKind
  name: LocalizedText
  summary: LocalizedText
  hero: LocalizedText
  accent: string
}

export interface ProductOption {
  name: LocalizedText
  values: LocalizedText[]
}

export interface Product {
  handle: string
  categoryHandle: string
  status: ProductStatus
  name: LocalizedText
  description: LocalizedText
  image: string
  priceCents: number
  badge: LocalizedText
  options: ProductOption[]
}

export interface ServiceEntry {
  handle: string
  categoryHandle: string
  status: ServiceStatus
  title: LocalizedText
  summary: LocalizedText
  actionLabel: LocalizedText
}

export const categories: Category[] = [
  {
    handle: "photo-print",
    kind: "service",
    name: { "zh-HK": "相片沖印", en: "Photo Print" },
    summary: { "zh-HK": "快速沖印、證件相及日常相片服務。", en: "Fast prints, ID photos, and everyday photo services." },
    hero: { "zh-HK": "把手機相片變成可收藏的實體回憶。", en: "Turn camera-roll moments into keepsakes." },
    accent: "#e84855",
  },
  {
    handle: "photobook",
    kind: "service",
    name: { "zh-HK": "相簿及影集", en: "Photobook" },
    summary: { "zh-HK": "為旅行、家庭及紀念日製作高質感相簿。", en: "Premium books for trips, family stories, and milestones." },
    hero: { "zh-HK": "用一本相簿整理值得重看的故事。", en: "Collect the stories worth revisiting." },
    accent: "#3f7cac",
  },
  {
    handle: "personalized-gifts",
    kind: "product",
    name: { "zh-HK": "個人化禮品", en: "Personalized Gifts" },
    summary: { "zh-HK": "杯、拼圖、座枱相架及客製心意。", en: "Mugs, puzzles, frames, and personal keepsakes." },
    hero: { "zh-HK": "把日常用品變成有心思的禮物。", en: "Make everyday objects feel personal." },
    accent: "#f5a623",
  },
  {
    handle: "instax-film",
    kind: "product",
    name: { "zh-HK": "Instax 及菲林", en: "Instax & Film" },
    summary: { "zh-HK": "即影即有相機、菲林及配件。", en: "Instant cameras, film packs, and accessories." },
    hero: { "zh-HK": "即時拍下，即時分享。", en: "Shoot it, share it, keep it." },
    accent: "#00a6a6",
  },
  {
    handle: "lifestyle",
    kind: "product",
    name: { "zh-HK": "生活精品", en: "Lifestyle" },
    summary: { "zh-HK": "影像生活用品及精選配件。", en: "Photo-led lifestyle goods and selected accessories." },
    hero: { "zh-HK": "讓影像走進日常生活。", en: "Bring photography into daily life." },
    accent: "#7b61ff",
  },
  {
    handle: "promotions",
    kind: "promotion",
    name: { "zh-HK": "優惠推廣", en: "Promotions" },
    summary: { "zh-HK": "最新沖印、相簿及禮品優惠。", en: "Current offers across prints, books, and gifts." },
    hero: { "zh-HK": "用更抵價錢完成更多影像計劃。", en: "Do more with current Fotomax offers." },
    accent: "#111827",
  },
]

export const products: Product[] = [
  {
    handle: "classic-4r-photo-print",
    categoryHandle: "photo-print",
    status: "featured",
    name: { "zh-HK": "經典 4R 相片沖印", en: "Classic 4R Photo Print" },
    description: { "zh-HK": "適合家庭、旅行及日常分享的標準尺寸相片沖印。", en: "Standard-size prints for family, travel, and everyday sharing." },
    image: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80",
    priceCents: 280,
    badge: { "zh-HK": "人氣服務", en: "Popular service" },
    options: [
      {
        name: { "zh-HK": "相紙", en: "Paper finish" },
        values: [
          { "zh-HK": "光面", en: "Glossy" },
          { "zh-HK": "啞面", en: "Matte" },
        ],
      },
    ],
  },
  {
    handle: "premium-layflat-photobook",
    categoryHandle: "photobook",
    status: "featured",
    name: { "zh-HK": "高級平開相簿", en: "Premium Layflat Photobook" },
    description: { "zh-HK": "適合婚禮、旅行及家庭故事的平開設計相簿。", en: "A layflat book for weddings, travel, and family stories." },
    image: "https://images.unsplash.com/photo-1528569937393-ee892b976859?auto=format&fit=crop&w=1200&q=80",
    priceCents: 19800,
    badge: { "zh-HK": "可客製", en: "Customizable" },
    options: [
      {
        name: { "zh-HK": "尺寸", en: "Size" },
        values: [
          { "zh-HK": "8 x 8 吋", en: "8 x 8 in" },
          { "zh-HK": "10 x 10 吋", en: "10 x 10 in" },
        ],
      },
    ],
  },
  {
    handle: "photo-mug-gift",
    categoryHandle: "personalized-gifts",
    status: "available",
    name: { "zh-HK": "個人化相片杯", en: "Personalized Photo Mug" },
    description: { "zh-HK": "把喜愛相片印在日常使用的陶瓷杯上。", en: "Print a favorite image on an everyday ceramic mug." },
    image: "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=1200&q=80",
    priceCents: 8800,
    badge: { "zh-HK": "送禮精選", en: "Gift pick" },
    options: [
      {
        name: { "zh-HK": "杯色", en: "Mug color" },
        values: [
          { "zh-HK": "白色", en: "White" },
          { "zh-HK": "黑色", en: "Black" },
        ],
      },
    ],
  },
  {
    handle: "instax-mini-film-pack",
    categoryHandle: "instax-film",
    status: "available",
    name: { "zh-HK": "Instax Mini 即影即有菲林", en: "Instax Mini Film Pack" },
    description: { "zh-HK": "適用於 Instax Mini 系列相機的即影即有菲林。", en: "Instant film for Instax Mini cameras." },
    image: "https://images.unsplash.com/photo-1486574655068-162e94137442?auto=format&fit=crop&w=1200&q=80",
    priceCents: 7800,
    badge: { "zh-HK": "門市取貨", en: "Store pickup" },
    options: [
      {
        name: { "zh-HK": "包裝", en: "Pack" },
        values: [
          { "zh-HK": "10 張", en: "10 shots" },
          { "zh-HK": "20 張", en: "20 shots" },
        ],
      },
    ],
  },
  {
    handle: "desktop-acrylic-photo-block",
    categoryHandle: "lifestyle",
    status: "available",
    name: { "zh-HK": "亞加力座枱相架", en: "Desktop Acrylic Photo Block" },
    description: { "zh-HK": "清晰厚身亞加力展示相片，適合家居或辦公桌。", en: "A clear acrylic block for desks, shelves, and workspaces." },
    image: "https://images.unsplash.com/photo-1526049471490-b2a136bb4538?auto=format&fit=crop&w=1200&q=80",
    priceCents: 12800,
    badge: { "zh-HK": "家居擺設", en: "Home display" },
    options: [
      {
        name: { "zh-HK": "方向", en: "Orientation" },
        values: [
          { "zh-HK": "直度", en: "Portrait" },
          { "zh-HK": "橫度", en: "Landscape" },
        ],
      },
    ],
  },
]

export const serviceEntries: ServiceEntry[] = [
  {
    handle: "upload-photo-print",
    categoryHandle: "photo-print",
    status: "next-phase",
    title: { "zh-HK": "上載相片沖印訂單", en: "Upload Photo Print Order" },
    summary: { "zh-HK": "下一階段會加入上載、裁切、尺寸及門市取貨流程。", en: "Upload, crop, sizing, and pickup selection will be added in the next phase." },
    actionLabel: { "zh-HK": "查看沖印選項", en: "Preview print options" },
  },
  {
    handle: "design-photobook",
    categoryHandle: "photobook",
    status: "next-phase",
    title: { "zh-HK": "設計相簿", en: "Design a Photobook" },
    summary: { "zh-HK": "下一階段會加入相簿版面、頁數及封面設定。", en: "Book layout, page count, and cover setup will be added in the next phase." },
    actionLabel: { "zh-HK": "查看相簿款式", en: "Preview book styles" },
  },
  {
    handle: "store-pickup",
    categoryHandle: "photo-print",
    status: "next-phase",
    title: { "zh-HK": "門市取貨及分店服務", en: "Store Pickup & Collection" },
    summary: { "zh-HK": "下一階段會加入分店搜尋、庫存提示及取貨時段選擇。", en: "Store search, availability guidance, and pickup times will be added in the next phase." },
    actionLabel: { "zh-HK": "瀏覽相片服務", en: "Browse photo services" },
  },
]

export function getCategory(handle: string): Category | undefined {
  return categories.find((category) => category.handle === handle)
}

export function getProduct(handle: string): Product | undefined {
  return products.find((product) => product.handle === handle)
}

export function getProductsByCategory(handle: string): Product[] {
  return products.filter((product) => product.categoryHandle === handle)
}

export function getServiceEntry(handle: string): ServiceEntry | undefined {
  return serviceEntries.find((entry) => entry.handle === handle)
}

export function formatPrice(cents: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "zh-HK" ? "zh-HK" : "en-HK", {
    style: "currency",
    currency: "HKD",
  }).format(cents / 100)
}
```

- [ ] **Step 6: Export public shared API**

Create `packages/shared/src/index.ts`:

```ts
export * from "./catalog"
export * from "./i18n"
```

- [ ] **Step 7: Run shared verification**

Run: `npm run test --workspace @fotomax/shared`

Expected: PASS with 8 tests.

Run: `npm run typecheck --workspace @fotomax/shared`

Expected: PASS with no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add packages/shared
git commit -m "feat: add shared Fotomax catalog"
```

---

### Task 3: Storefront App Shell And Locale Routing

**Files:**
- Create: `apps/storefront/package.json`
- Create: `apps/storefront/next.config.mjs`
- Create: `apps/storefront/tsconfig.json`
- Create: `apps/storefront/app/layout.tsx`
- Create: `apps/storefront/app/page.tsx`
- Create: `apps/storefront/app/[locale]/layout.tsx`
- Create: `apps/storefront/app/[locale]/page.tsx`
- Create: `apps/storefront/app/not-found.tsx`
- Create: `apps/storefront/app/globals.css`
- Create: `apps/storefront/src/lib/locales.ts`
- Create: `apps/storefront/src/lib/locales.test.ts`

**Interfaces:**
- Consumes: `Locale`, `isLocale`, `localeLabels`, `defaultLocale` from `@fotomax/shared`.
- Produces: `assertLocale(value: string): Locale`, `localeHref(locale: Locale, pathname: string): string`, and a working Next.js shell that redirects `/` to `/zh-HK`.

- [ ] **Step 1: Create storefront package and config**

Create `apps/storefront/package.json`:

```json
{
  "name": "@fotomax/storefront",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@fotomax/shared": "file:../../packages/shared",
    "lucide-react": "^0.475.0",
    "next": "^16.2.10",
    "react": "^19.2.4",
    "react-dom": "^19.2.4"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  }
}
```

Create `apps/storefront/next.config.mjs`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@fotomax/shared"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
}

export default nextConfig
```

Create `apps/storefront/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "allowJs": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    },
    "types": ["vitest/globals", "node"]
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 2: Write failing locale helper tests**

Create `apps/storefront/src/lib/locales.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { assertLocale, localeHref } from "./locales"

describe("storefront locale helpers", () => {
  it("accepts supported locale route segments", () => {
    expect(assertLocale("zh-HK")).toBe("zh-HK")
    expect(assertLocale("en")).toBe("en")
  })

  it("rejects unsupported locale route segments", () => {
    expect(() => assertLocale("zh")).toThrow("Unsupported locale: zh")
  })

  it("builds stable localized hrefs", () => {
    expect(localeHref("en", "/categories/photo-print")).toBe("/en/categories/photo-print")
    expect(localeHref("zh-HK", "products/classic-4r-photo-print")).toBe("/zh-HK/products/classic-4r-photo-print")
  })
})
```

- [ ] **Step 3: Run the failing storefront test**

Run: `npm install`

Run: `npm run test --workspace @fotomax/storefront`

Expected: FAIL because `apps/storefront/src/lib/locales.ts` does not exist yet.

- [ ] **Step 4: Implement locale helpers**

Create `apps/storefront/src/lib/locales.ts`:

```ts
import { isLocale, type Locale } from "@fotomax/shared"

export function assertLocale(value: string): Locale {
  if (!isLocale(value)) {
    throw new Error(`Unsupported locale: ${value}`)
  }

  return value
}

export function localeHref(locale: Locale, pathname: string): string {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`
  return `/${locale}${normalized}`
}
```

- [ ] **Step 5: Create the Next.js route shell**

Create `apps/storefront/app/layout.tsx`:

```tsx
import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Fotomax Modern Storefront",
  description: "A modern bilingual Fotomax commerce storefront foundation.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-HK">
      <body>{children}</body>
    </html>
  )
}
```

Create `apps/storefront/app/page.tsx`:

```tsx
import { redirect } from "next/navigation"
import { defaultLocale } from "@fotomax/shared"

export default function IndexPage() {
  redirect(`/${defaultLocale}`)
}
```

Create `apps/storefront/app/[locale]/layout.tsx`:

```tsx
import { notFound } from "next/navigation"
import { localeLabels, locales, type Locale } from "@fotomax/shared"
import { assertLocale } from "@/lib/locales"

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale: localeParam } = await params
  let locale: Locale

  try {
    locale = assertLocale(localeParam)
  } catch {
    notFound()
  }

  return (
    <div lang={locale} data-locale={locale} aria-label={localeLabels[locale]}>
      {children}
    </div>
  )
}
```

Create `apps/storefront/app/[locale]/page.tsx`:

```tsx
import { type Locale } from "@fotomax/shared"
import { assertLocale } from "@/lib/locales"

export default async function LocaleHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params
  const locale: Locale = assertLocale(localeParam)

  return (
    <main className="page-shell">
      <section className="hero-band">
        <p className="eyebrow">Fotomax</p>
        <h1>{locale === "zh-HK" ? "現代影像生活商店" : "Modern Photo Commerce"}</h1>
        <p>{locale === "zh-HK" ? "相片沖印、相簿、菲林及個人化禮品。" : "Photo print, photobooks, film, and personalized gifts."}</p>
      </section>
    </main>
  )
}
```

Create `apps/storefront/app/not-found.tsx`:

```tsx
import Image from "next/image"
import Link from "next/link"

export default function NotFound() {
  return (
    <main className="page-shell not-found">
      <p className="eyebrow">Fotomax</p>
      <h1>Page not found</h1>
      <p>The requested Fotomax page is not available.</p>
      <Link className="button primary" href="/zh-HK">
        Back to homepage
      </Link>
    </main>
  )
}
```

Create `apps/storefront/app/globals.css`:

```css
:root {
  color: #111827;
  background: #fbfbf8;
  font-family: Arial, "Noto Sans HK", "Microsoft JhengHei", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
}

a {
  color: inherit;
  text-decoration: none;
  touch-action: manipulation;
}

button {
  font: inherit;
}

button:not(:disabled) {
  cursor: pointer;
  touch-action: manipulation;
}

:where(a, button):focus-visible {
  outline: 3px solid #007f7f;
  outline-offset: 3px;
}

.page-shell {
  width: min(1180px, calc(100% - 32px));
  margin: 0 auto;
}

.hero-band {
  min-height: 520px;
  display: grid;
  align-content: center;
  gap: 18px;
  padding: 64px 0;
}

.eyebrow {
  margin: 0;
  color: #e84855;
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
}

h1,
p {
  margin-top: 0;
}

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  border-radius: 8px;
  padding: 0 18px;
  font-weight: 800;
}

.button.primary {
  background: #111827;
  color: #ffffff;
}
```

- [ ] **Step 6: Run storefront shell verification**

Run: `npm run test --workspace @fotomax/storefront`

Expected: PASS with 3 locale helper tests.

Run: `npm run typecheck --workspace @fotomax/storefront`

Expected: PASS with no TypeScript errors.

Run: `npm run build --workspace @fotomax/storefront`

Expected: PASS and `.next` build output.

- [ ] **Step 7: Commit**

```bash
git add apps/storefront package-lock.json
git commit -m "feat: add storefront locale shell"
```

---

### Task 4: Homepage, Navigation, And Product Cards

**Files:**
- Create: `apps/storefront/src/components/site-header.tsx`
- Create: `apps/storefront/src/components/category-tile.tsx`
- Create: `apps/storefront/src/components/product-card.tsx`
- Create: `apps/storefront/src/components/home-page.tsx`
- Create: `apps/storefront/src/components/home-page.test.tsx`
- Modify: `apps/storefront/app/[locale]/layout.tsx`
- Modify: `apps/storefront/app/[locale]/page.tsx`
- Modify: `apps/storefront/app/globals.css`

**Interfaces:**
- Consumes: `categories`, `products`, `serviceEntries`, `formatPrice`, `localize`, `t`, and `Locale`.
- Produces: reusable `SiteHeader`, `CategoryTile`, `ProductCard`, and `HomePage` components.

- [ ] **Step 1: Write the failing homepage composition tests**

Create `apps/storefront/src/components/home-page.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { HomePage } from "./home-page"
import { SiteHeader } from "./site-header"

describe("Fotomax homepage composition", () => {
  it("renders English commerce paths without dead controls", () => {
    const header = renderToStaticMarkup(<SiteHeader locale="en" />)
    const page = renderToStaticMarkup(<HomePage locale="en" />)

    expect(header).toContain('href="/en/categories/photo-print"')
    expect(header).toContain('href="/en/services/store-pickup"')
    expect(header).not.toContain('aria-label="Search"')
    expect(page).toContain("Photo life, from prints to gifts in one modern shop.")
    expect(page).toContain("Popular products and services")
  })

  it("renders Traditional Chinese category and service copy", () => {
    const page = renderToStaticMarkup(<HomePage locale="zh-HK" />)

    expect(page).toContain("影像生活，由沖印到禮物一站完成。")
    expect(page).toContain("熱門產品及服務")
    expect(page).toContain("下一階段推出")
  })
})
```

- [ ] **Step 2: Run the failing homepage composition tests**

Run: `npm run test --workspace @fotomax/storefront`

Expected: FAIL because `HomePage` and `SiteHeader` do not exist yet.

- [ ] **Step 3: Create header and card components**

Create `apps/storefront/src/components/site-header.tsx`:

```tsx
import Link from "next/link"
import { Globe2, MapPin, ShoppingBag } from "lucide-react"
import { categories, localeLabels, localize, t, type Locale } from "@fotomax/shared"
import { localeHref } from "@/lib/locales"

export function SiteHeader({ locale }: { locale: Locale }) {
  const alternateLocale: Locale = locale === "zh-HK" ? "en" : "zh-HK"

  return (
    <header className="site-header">
      <Link className="brand" href={localeHref(locale, "/")}>
        Fotomax
      </Link>
      <nav className="mega-nav" aria-label="Main navigation">
        {categories.map((category) => (
          <Link key={category.handle} href={localeHref(locale, `/categories/${category.handle}`)}>
            {localize(category.name, locale)}
          </Link>
        ))}
      </nav>
      <div className="header-actions">
        <Link className="icon-button" href={localeHref(locale, "/services/store-pickup")} aria-label={t(locale, "storePickup")}>
          <MapPin size={18} />
        </Link>
        <Link className="icon-button" href={localeHref(alternateLocale, "/")} aria-label={localeLabels[alternateLocale]}>
          <Globe2 size={18} />
        </Link>
        <Link className="cart-link" href={localeHref(locale, "/cart")}>
          <ShoppingBag size={18} />
          <span>{t(locale, "cart")}</span>
        </Link>
      </div>
    </header>
  )
}
```

Create `apps/storefront/src/components/category-tile.tsx`:

```tsx
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { localize, t, type Category, type Locale } from "@fotomax/shared"
import { localeHref } from "@/lib/locales"

export function CategoryTile({ category, locale }: { category: Category; locale: Locale }) {
  return (
    <Link className="category-tile" href={localeHref(locale, `/categories/${category.handle}`)} style={{ "--accent": category.accent } as React.CSSProperties}>
      <span>{localize(category.name, locale)}</span>
      <p>{localize(category.summary, locale)}</p>
      <strong>
        {t(locale, "browseCategory")}
        <ArrowRight size={16} />
      </strong>
    </Link>
  )
}
```

Create `apps/storefront/src/components/product-card.tsx`:

```tsx
import Image from "next/image"
import Link from "next/link"
import { ShoppingBag } from "lucide-react"
import { formatPrice, localize, type Locale, type Product } from "@fotomax/shared"
import { localeHref } from "@/lib/locales"

export function ProductCard({ product, locale }: { product: Product; locale: Locale }) {
  const productName = localize(product.name, locale)

  return (
    <article className="product-card">
      <Link
        href={localeHref(locale, `/products/${product.handle}`)}
        className="product-image"
        aria-label={locale === "zh-HK" ? `查看${productName}` : `View ${productName}`}
      >
        <Image src={product.image} alt="" fill sizes="(max-width: 920px) 100vw, 25vw" />
      </Link>
      <div className="product-card-body">
        <span className="badge">{localize(product.badge, locale)}</span>
        <h3>
          <Link href={localeHref(locale, `/products/${product.handle}`)}>{productName}</Link>
        </h3>
        <p>{localize(product.description, locale)}</p>
        <div className="product-card-footer">
          <strong>{formatPrice(product.priceCents, locale)}</strong>
          <ShoppingBag size={18} aria-hidden="true" />
        </div>
      </div>
    </article>
  )
}
```

- [ ] **Step 4: Create homepage component**

Create `apps/storefront/src/components/home-page.tsx`:

```tsx
import Image from "next/image"
import Link from "next/link"
import { Camera, Images, Sparkles } from "lucide-react"
import { categories, products, serviceEntries, localize, t, type Locale } from "@fotomax/shared"
import { localeHref } from "@/lib/locales"
import { CategoryTile } from "./category-tile"
import { ProductCard } from "./product-card"

export function HomePage({ locale }: { locale: Locale }) {
  const featuredProducts = products.slice(0, 4)

  return (
    <main id="main-content">
      <section className="home-hero">
        <Image
          className="hero-backdrop"
          src="https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=1800&q=80"
          alt=""
          fill
          priority
          sizes="100vw"
        />
        <div className="hero-overlay" aria-hidden="true" />
        <div className="page-shell hero-content">
          <div>
            <p className="eyebrow">Fotomax</p>
            <h1>{locale === "zh-HK" ? "影像生活，由沖印到禮物一站完成。" : "Photo life, from prints to gifts in one modern shop."}</h1>
            <p>
              {locale === "zh-HK"
                ? "快速找到相片沖印、相簿、即影即有菲林及個人化產品，並前往合適的門市取貨服務。"
                : "Browse prints, photobooks, instant film, and personalized products with clear paths to store pickup."}
            </p>
            <div className="hero-actions">
              <Link className="button primary" href={localeHref(locale, "/categories/photo-print")}>
                <Camera size={18} />
                {localize(categories[0].name, locale)}
              </Link>
              <Link className="button secondary" href={localeHref(locale, "/categories/personalized-gifts")}>
                <Sparkles size={18} />
                {localize(categories[2].name, locale)}
              </Link>
            </div>
          </div>
          <div className="hero-panel" aria-label="Featured Fotomax services">
            <Images size={32} />
            <strong>{locale === "zh-HK" ? "門市取貨及影像服務" : "Store pickup and photo services"}</strong>
            <span>{locale === "zh-HK" ? "更多取貨選項即將推出" : "More pickup options coming soon"}</span>
          </div>
        </div>
      </section>

      <section className="page-shell section">
        <div className="section-heading">
          <p className="eyebrow">{locale === "zh-HK" ? "分類" : "Categories"}</p>
          <h2>{locale === "zh-HK" ? "從你要做的影像任務開始" : "Start with the photo job you need"}</h2>
        </div>
        <div className="category-grid">
          {categories.map((category) => (
            <CategoryTile key={category.handle} category={category} locale={locale} />
          ))}
        </div>
      </section>

      <section className="page-shell section">
        <div className="section-heading split">
          <div>
            <p className="eyebrow">{locale === "zh-HK" ? "精選" : "Featured"}</p>
            <h2>{locale === "zh-HK" ? "熱門產品及服務" : "Popular products and services"}</h2>
          </div>
          <Link className="text-link" href={localeHref(locale, "/categories/promotions")}>
            {locale === "zh-HK" ? "查看優惠" : "View promotions"}
          </Link>
        </div>
        <div className="product-grid">
          {featuredProducts.map((product) => (
            <ProductCard key={product.handle} product={product} locale={locale} />
          ))}
        </div>
      </section>

      <section className="page-shell service-strip">
        {serviceEntries.map((entry) => (
          <Link key={entry.handle} href={localeHref(locale, `/services/${entry.handle}`)}>
            <span>{t(locale, "nextPhase")}</span>
            <strong>{localize(entry.title, locale)}</strong>
            <p>{localize(entry.summary, locale)}</p>
          </Link>
        ))}
      </section>
    </main>
  )
}
```

- [ ] **Step 5: Wire header and homepage routes**

Modify `apps/storefront/app/[locale]/layout.tsx` to:

```tsx
import { notFound } from "next/navigation"
import { localeLabels, locales, type Locale } from "@fotomax/shared"
import { SiteHeader } from "@/components/site-header"
import { assertLocale } from "@/lib/locales"

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale: localeParam } = await params
  let locale: Locale

  try {
    locale = assertLocale(localeParam)
  } catch {
    notFound()
  }

  return (
    <div lang={locale} data-locale={locale} aria-label={localeLabels[locale]}>
      <a className="skip-link" href="#main-content">
        {locale === "zh-HK" ? "跳至主要內容" : "Skip to main content"}
      </a>
      <SiteHeader locale={locale} />
      {children}
    </div>
  )
}
```

Modify `apps/storefront/app/[locale]/page.tsx` to:

```tsx
import { type Locale } from "@fotomax/shared"
import { HomePage } from "@/components/home-page"
import { assertLocale } from "@/lib/locales"

export default async function LocaleHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params
  const locale: Locale = assertLocale(localeParam)

  return <HomePage locale={locale} />
}
```

- [ ] **Step 6: Replace global CSS with complete responsive styles**

Replace `apps/storefront/app/globals.css` with the CSS from Task 3 plus these additional selectors:

```css
.site-header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 24px;
  padding: 14px min(40px, 4vw);
  border-bottom: 1px solid #e5e7eb;
  background: rgba(251, 251, 248, 0.96);
  backdrop-filter: blur(12px);
}

.skip-link {
  position: fixed;
  top: 8px;
  left: 8px;
  z-index: 100;
  transform: translateY(-160%);
  background: #111827;
  color: #ffffff;
  padding: 10px 14px;
}

.skip-link:focus {
  transform: translateY(0);
}

.brand {
  font-size: 1.45rem;
  font-weight: 900;
  color: #e84855;
}

.mega-nav,
.header-actions,
.hero-actions,
.product-card-footer,
.section-heading.split {
  display: flex;
  align-items: center;
}

.mega-nav {
  gap: 18px;
  justify-content: center;
  font-size: 0.9rem;
  font-weight: 800;
}

.header-actions,
.hero-actions {
  gap: 10px;
}

.icon-button,
.cart-link {
  min-width: 44px;
  min-height: 44px;
  border: 1px solid #d1d5db;
  background: #ffffff;
  color: #111827;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 8px;
  padding: 0 12px;
  font-weight: 800;
}

.home-hero {
  position: relative;
  min-height: min(620px, calc(100dvh - 144px));
  overflow: hidden;
  color: #ffffff;
}

.hero-backdrop {
  object-fit: cover;
}

.hero-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: rgba(17, 24, 39, 0.62);
}

.hero-content {
  position: relative;
  z-index: 2;
  min-height: min(620px, calc(100dvh - 144px));
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(260px, 0.55fr);
  gap: 36px;
  align-items: center;
}

.hero-content h1 {
  max-width: 780px;
  font-size: 5.25rem;
  line-height: 0.96;
  margin-bottom: 18px;
}

.hero-content p {
  max-width: 620px;
  color: #f3f4f6;
  font-size: 1.12rem;
  line-height: 1.7;
}

.hero-panel {
  min-height: 260px;
  display: grid;
  align-content: end;
  gap: 12px;
  padding: 24px;
  border: 1px solid rgba(255, 255, 255, 0.38);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.12);
}

.button.secondary {
  background: #ffffff;
  color: #111827;
}

.button svg {
  margin-right: 8px;
}

.section {
  padding: 72px 0 0;
}

.section-heading {
  margin-bottom: 24px;
}

.section-heading h2 {
  margin: 0;
  font-size: 2rem;
}

.section-heading.split {
  justify-content: space-between;
  gap: 20px;
}

.text-link {
  font-weight: 900;
  color: #e84855;
}

.category-grid,
.product-grid {
  display: grid;
  gap: 18px;
}

.category-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.product-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.category-tile,
.product-card,
.service-strip a {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
}

.category-tile {
  min-height: 190px;
  display: grid;
  align-content: space-between;
  padding: 22px;
  border-top: 5px solid var(--accent);
  transition: border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
}

.home-hero .eyebrow,
.category-hero .eyebrow {
  color: #ffd166;
}

.category-tile:hover,
.category-tile:focus-visible,
.product-card:focus-within {
  box-shadow: 0 14px 32px rgba(17, 24, 39, 0.1);
}

.category-tile:hover {
  transform: translateY(-2px);
}

.category-tile span,
.category-tile strong,
.product-card h3 {
  font-weight: 900;
}

.category-tile p,
.product-card p,
.service-strip p {
  color: #4b5563;
  line-height: 1.55;
}

.category-tile strong {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.product-image {
  position: relative;
  display: block;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border-radius: 8px 8px 0 0;
}

.product-image img {
  object-fit: cover;
}

.product-card-body {
  padding: 16px;
}

.badge {
  display: inline-flex;
  min-height: 26px;
  align-items: center;
  border-radius: 999px;
  background: #f3f4f6;
  padding: 0 10px;
  color: #374151;
  font-size: 0.78rem;
  font-weight: 900;
}

.product-card-footer {
  justify-content: space-between;
  margin-top: 16px;
}

.service-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
  padding: 72px 0;
}

.service-strip a {
  padding: 22px;
}

.service-strip span {
  color: #e84855;
  font-size: 0.78rem;
  font-weight: 900;
}

@media (max-width: 920px) {
  .site-header {
    grid-template-columns: 1fr auto;
  }

  .mega-nav {
    grid-column: 1 / -1;
    justify-content: flex-start;
    flex-wrap: wrap;
    padding-bottom: 4px;
  }

  .hero-content h1 {
    font-size: 4rem;
  }

  .hero-content,
  .category-grid,
  .product-grid,
  .service-strip {
    grid-template-columns: 1fr;
  }

  .hero-panel {
    min-height: 180px;
  }
}

@media (max-width: 620px) {
  .cart-link span {
    display: none;
  }

  .hero-content h1 {
    font-size: 2.7rem;
  }
}
```

- [ ] **Step 7: Verify homepage**

Run: `npm run test --workspace @fotomax/storefront`

Expected: PASS with 5 tests across locale helpers and homepage composition.

Run: `npm run build --workspace @fotomax/storefront`

Expected: PASS and includes static routes for `/zh-HK` and `/en`.

- [ ] **Step 8: Commit**

```bash
git add apps/storefront
git commit -m "feat: build Fotomax storefront homepage"
```

---

### Task 5: Category And Product Detail Routes

**Files:**
- Create: `apps/storefront/src/lib/catalog-view.ts`
- Create: `apps/storefront/src/lib/catalog-view.test.ts`
- Create: `apps/storefront/src/components/category-page.tsx`
- Create: `apps/storefront/src/components/category-product-grid.tsx`
- Create: `apps/storefront/src/components/product-detail.tsx`
- Create: `apps/storefront/app/[locale]/categories/[handle]/page.tsx`
- Create: `apps/storefront/app/[locale]/products/[handle]/page.tsx`
- Modify: `apps/storefront/app/globals.css`

**Interfaces:**
- Consumes: shared catalog accessors.
- Produces: `getCategoryView(handle: string)`, `getProductView(handle: string)`, `filterProducts(products: Product[], filter: ProductFilter)`, category route, and product route.

- [ ] **Step 1: Write failing catalog view tests**

Create `apps/storefront/src/lib/catalog-view.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { products } from "@fotomax/shared"
import { filterProducts, getCategoryView, getProductView } from "./catalog-view"

describe("catalog view selectors", () => {
  it("returns a category with its products", () => {
    const view = getCategoryView("photo-print")
    expect(view?.category.handle).toBe("photo-print")
    expect(view?.products.map((product) => product.handle)).toContain("classic-4r-photo-print")
  })

  it("returns undefined for unknown categories", () => {
    expect(getCategoryView("unknown")).toBeUndefined()
  })

  it("returns product with parent category", () => {
    const view = getProductView("classic-4r-photo-print")
    expect(view?.product.handle).toBe("classic-4r-photo-print")
    expect(view?.category.handle).toBe("photo-print")
  })

  it("filters products by customer-facing availability state", () => {
    const featured = filterProducts(products, "featured")
    const available = filterProducts(products, "available")

    expect(filterProducts(products, "all")).toHaveLength(products.length)
    expect(featured).toHaveLength(2)
    expect(featured.every((product) => product.status === "featured")).toBe(true)
    expect(available).toHaveLength(3)
    expect(available.every((product) => product.status === "available")).toBe(true)
  })
})
```

- [ ] **Step 2: Run failing catalog view tests**

Run: `npm run test --workspace @fotomax/storefront`

Expected: FAIL because `apps/storefront/src/lib/catalog-view.ts` does not exist.

- [ ] **Step 3: Implement catalog view selectors**

Create `apps/storefront/src/lib/catalog-view.ts`:

```ts
import { getCategory, getProduct, getProductsByCategory, type Category, type Product } from "@fotomax/shared"

export interface CategoryView {
  category: Category
  products: Product[]
}

export interface ProductView {
  product: Product
  category: Category
}

export type ProductFilter = "all" | "featured" | "available"

export function filterProducts(products: Product[], filter: ProductFilter): Product[] {
  if (filter === "all") {
    return products
  }

  return products.filter((product) => product.status === filter)
}

export function getCategoryView(handle: string): CategoryView | undefined {
  const category = getCategory(handle)

  if (!category) {
    return undefined
  }

  return {
    category,
    products: getProductsByCategory(handle),
  }
}

export function getProductView(handle: string): ProductView | undefined {
  const product = getProduct(handle)

  if (!product) {
    return undefined
  }

  const category = getCategory(product.categoryHandle)

  if (!category) {
    return undefined
  }

  return { product, category }
}
```

- [ ] **Step 4: Create category and product components**

Create `apps/storefront/src/components/category-product-grid.tsx`:

```tsx
"use client"

import { useState } from "react"
import type { Locale, Product } from "@fotomax/shared"
import { filterProducts, type ProductFilter } from "@/lib/catalog-view"
import { ProductCard } from "./product-card"

const filters: ProductFilter[] = ["all", "featured", "available"]

const filterLabels: Record<ProductFilter, Record<Locale, string>> = {
  all: { "zh-HK": "全部", en: "All" },
  featured: { "zh-HK": "精選", en: "Featured" },
  available: { "zh-HK": "現貨產品", en: "Available" },
}

export function CategoryProductGrid({ products, locale }: { products: Product[]; locale: Locale }) {
  const [filter, setFilter] = useState<ProductFilter>("all")
  const visibleProducts = filterProducts(products, filter)

  return (
    <div>
      <div className="filter-row" role="group" aria-label={locale === "zh-HK" ? "產品篩選" : "Product filters"}>
        {filters.map((value) => (
          <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
            {filterLabels[value][locale]}
          </button>
        ))}
      </div>
      {visibleProducts.length > 0 ? (
        <div className="product-grid">
          {visibleProducts.map((product) => (
            <ProductCard key={product.handle} product={product} locale={locale} />
          ))}
        </div>
      ) : (
        <div className="filter-empty" role="status">
          <p>{locale === "zh-HK" ? "這個篩選暫時沒有產品。" : "No products match this filter yet."}</p>
          <button type="button" className="button primary" onClick={() => setFilter("all")}>
            {locale === "zh-HK" ? "顯示全部" : "Show all"}
          </button>
        </div>
      )}
    </div>
  )
}
```

Create `apps/storefront/src/components/category-page.tsx`:

```tsx
import Image from "next/image"
import Link from "next/link"
import { localize, serviceEntries, type Category, type Locale, type Product } from "@fotomax/shared"
import { localeHref } from "@/lib/locales"
import { CategoryProductGrid } from "./category-product-grid"

export function CategoryPage({ category, products, locale }: { category: Category; products: Product[]; locale: Locale }) {
  const relatedServices = serviceEntries.filter((entry) => entry.categoryHandle === category.handle)

  return (
    <main id="main-content">
      <section className="category-hero" style={{ backgroundColor: category.accent }}>
        {products[0] && <Image className="category-hero-image" src={products[0].image} alt="" fill priority sizes="100vw" />}
        <div className="category-hero-overlay" aria-hidden="true" />
        <div className="page-shell category-hero-content">
          <p className="eyebrow">{localize(category.name, locale)}</p>
          <h1>{localize(category.hero, locale)}</h1>
          <p>{localize(category.summary, locale)}</p>
        </div>
      </section>
      <section className="page-shell section">
        {products.length > 0 ? (
          <CategoryProductGrid products={products} locale={locale} />
        ) : (
          <div className="empty-state">
            <h2>{locale === "zh-HK" ? "暫未有產品" : "No products yet"}</h2>
            <p>{locale === "zh-HK" ? "請返回首頁查看其他 Fotomax 分類。" : "Return to the homepage to browse other Fotomax categories."}</p>
            <Link className="button primary" href={localeHref(locale, "/")}>
              Fotomax
            </Link>
          </div>
        )}
      </section>
      {relatedServices.length > 0 && (
        <section className="page-shell service-strip">
          {relatedServices.map((entry) => (
            <Link key={entry.handle} href={localeHref(locale, `/services/${entry.handle}`)}>
              <span>{locale === "zh-HK" ? "即將推出" : "Coming soon"}</span>
              <strong>{localize(entry.title, locale)}</strong>
              <p>{localize(entry.summary, locale)}</p>
            </Link>
          ))}
        </section>
      )}
    </main>
  )
}
```

Create `apps/storefront/src/components/product-detail.tsx`:

```tsx
import Image from "next/image"
import Link from "next/link"
import { CheckCircle2, Store } from "lucide-react"
import { formatPrice, localize, type Category, type Locale, type Product } from "@fotomax/shared"
import { localeHref } from "@/lib/locales"

export function ProductDetail({ product, category, locale }: { product: Product; category: Category; locale: Locale }) {
  return (
    <main id="main-content" className="page-shell product-detail">
      <div className="product-gallery">
        <Image src={product.image} alt={localize(product.name, locale)} fill priority sizes="(max-width: 920px) 100vw, 60vw" />
      </div>
      <section className="product-info">
        <Link className="text-link" href={localeHref(locale, `/categories/${category.handle}`)}>
          {localize(category.name, locale)}
        </Link>
        <span className="badge">{localize(product.badge, locale)}</span>
        <h1>{localize(product.name, locale)}</h1>
        <p>{localize(product.description, locale)}</p>
        <strong className="price">{formatPrice(product.priceCents, locale)}</strong>
        <p className="option-note">
          {locale === "zh-HK" ? "以下選項只供參考；網上訂購功能即將推出。" : "Options are shown for reference; online ordering is coming soon."}
        </p>
        <div className="option-stack">
          {product.options.map((option) => (
            <div className="option-group" key={localize(option.name, "en")}>
              <strong>{localize(option.name, locale)}</strong>
              <div>
                {option.values.map((value) => (
                  <span key={localize(value, "en")}>
                    {localize(value, locale)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="availability-note">
          {locale === "zh-HK" ? "網上訂購即將推出" : "Online ordering coming soon"}
        </p>
        <div className="detail-notes">
          <p>
            <Store size={18} />
            {locale === "zh-HK" ? "門市取貨詳情即將推出。" : "Store pickup details are coming soon."}
          </p>
          <p>
            <CheckCircle2 size={18} />
            {locale === "zh-HK" ? "所有價格均以港幣顯示。" : "All prices are shown in Hong Kong dollars."}
          </p>
        </div>
      </section>
    </main>
  )
}
```

- [ ] **Step 5: Create category and product routes**

Create `apps/storefront/app/[locale]/categories/[handle]/page.tsx`:

```tsx
import { notFound } from "next/navigation"
import { type Locale } from "@fotomax/shared"
import { CategoryPage } from "@/components/category-page"
import { getCategoryView } from "@/lib/catalog-view"
import { assertLocale } from "@/lib/locales"

export default async function CategoryRoute({ params }: { params: Promise<{ locale: string; handle: string }> }) {
  const { locale: localeParam, handle } = await params
  const locale: Locale = assertLocale(localeParam)
  const view = getCategoryView(handle)

  if (!view) {
    notFound()
  }

  return <CategoryPage category={view.category} products={view.products} locale={locale} />
}
```

Create `apps/storefront/app/[locale]/products/[handle]/page.tsx`:

```tsx
import { notFound } from "next/navigation"
import { type Locale } from "@fotomax/shared"
import { ProductDetail } from "@/components/product-detail"
import { getProductView } from "@/lib/catalog-view"
import { assertLocale } from "@/lib/locales"

export default async function ProductRoute({ params }: { params: Promise<{ locale: string; handle: string }> }) {
  const { locale: localeParam, handle } = await params
  const locale: Locale = assertLocale(localeParam)
  const view = getProductView(handle)

  if (!view) {
    notFound()
  }

  return <ProductDetail product={view.product} category={view.category} locale={locale} />
}
```

- [ ] **Step 6: Add category and product CSS**

Append to `apps/storefront/app/globals.css`:

```css
.category-hero {
  position: relative;
  padding: 88px 0;
  overflow: hidden;
  color: #ffffff;
}

.category-hero-image {
  object-fit: cover;
}

.category-hero-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: rgba(17, 24, 39, 0.68);
}

.category-hero-content {
  position: relative;
  z-index: 2;
}

.category-hero h1 {
  max-width: 820px;
  font-size: 4rem;
  line-height: 1;
}

.category-hero p {
  max-width: 600px;
  color: #f9fafb;
  line-height: 1.7;
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 22px;
}

.filter-row button {
  min-height: 44px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 0 14px;
  background: #ffffff;
  color: #111827;
  font-weight: 800;
}

.filter-row button[aria-pressed="true"] {
  border-color: #111827;
  background: #111827;
  color: #ffffff;
}

.filter-empty {
  display: grid;
  justify-items: start;
  gap: 12px;
  padding: 32px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
}

.empty-state {
  display: grid;
  justify-items: start;
  gap: 12px;
  padding: 40px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
}

.product-detail {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 0.75fr);
  gap: 40px;
  padding: 64px 0;
}

.product-gallery {
  position: relative;
  min-height: 620px;
  overflow: hidden;
  border-radius: 8px;
}

.product-gallery img {
  object-fit: cover;
}

.product-info {
  display: grid;
  align-content: start;
  gap: 18px;
}

.product-info h1 {
  margin: 0;
  font-size: 3.25rem;
  line-height: 1;
}

.price {
  font-size: 1.75rem;
}

.option-stack {
  display: grid;
  gap: 16px;
}

.option-group {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 14px;
}

.option-group > strong {
  display: block;
  margin-bottom: 10px;
  font-weight: 900;
}

.option-group div {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.option-note {
  margin: 0;
  color: #4b5563;
  line-height: 1.6;
}

.option-stack span {
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #ffffff;
  padding: 0 14px;
  font-weight: 800;
}

.wide {
  width: 100%;
}

.detail-notes {
  display: grid;
  gap: 10px;
  color: #4b5563;
}

.detail-notes p {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 0;
}

@media (max-width: 920px) {
  .category-hero h1 {
    font-size: 3.2rem;
  }

  .product-detail {
    grid-template-columns: 1fr;
  }

  .product-gallery {
    min-height: 360px;
  }

  .product-info h1 {
    font-size: 2.75rem;
  }
}

@media (max-width: 620px) {
  .category-hero h1 {
    font-size: 2.5rem;
  }

  .product-info h1 {
    font-size: 2.25rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .category-tile {
    transition: none;
  }

  .category-tile:hover {
    transform: none;
  }
}
```

- [ ] **Step 7: Verify category and product pages**

Run: `npm run test --workspace @fotomax/storefront`

Expected: PASS with locale and catalog view tests.

Run: `npm run build --workspace @fotomax/storefront`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/storefront
git commit -m "feat: add storefront catalog routes"
```

---

### Task 6: Cart Shell And Service Entry States

**Files:**
- Create: `apps/storefront/src/lib/cart-state.ts`
- Create: `apps/storefront/src/lib/cart-state.test.ts`
- Create: `apps/storefront/src/components/cart-provider.tsx`
- Create: `apps/storefront/src/components/add-to-cart-button.tsx`
- Create: `apps/storefront/src/components/cart-drawer.tsx`
- Create: `apps/storefront/src/components/service-entry-page.tsx`
- Create: `apps/storefront/app/[locale]/cart/page.tsx`
- Create: `apps/storefront/app/[locale]/services/[handle]/page.tsx`
- Modify: `apps/storefront/app/[locale]/layout.tsx`
- Modify: `apps/storefront/src/components/product-detail.tsx`
- Modify: `apps/storefront/app/globals.css`

**Interfaces:**
- Consumes: `Product`, `ServiceEntry`, `getProduct`, `getServiceEntry`, `formatPrice`, `localize`, `t`.
- Produces: pure `addCartItem(items, product)` and `getCartSubtotal(items)` helpers plus client cart state with `addItem(product: Product): void`, `items`, and `clearCart(): void`.

- [ ] **Step 1: Write failing cart state tests**

Create `apps/storefront/src/lib/cart-state.test.ts` before the implementation. Cover adding a new product, incrementing an existing line without mutating the input array, and calculating a quantity-aware subtotal.

Run: `npm.cmd run test --workspace @fotomax/storefront`

Expected: FAIL because `apps/storefront/src/lib/cart-state.ts` does not exist.

- [ ] **Step 2: Implement cart state helpers**

Create `apps/storefront/src/lib/cart-state.ts`:

```ts
import type { Product } from "@fotomax/shared"

export interface CartItem {
  product: Product
  quantity: number
}

export function addCartItem(items: CartItem[], product: Product): CartItem[] {
  const existing = items.find((item) => item.product.handle === product.handle)

  if (!existing) {
    return [...items, { product, quantity: 1 }]
  }

  return items.map((item) =>
    item.product.handle === product.handle ? { ...item, quantity: item.quantity + 1 } : item
  )
}

export function getCartSubtotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.product.priceCents * item.quantity, 0)
}
```

- [ ] **Step 3: Create cart provider and add-to-cart button**

Create `apps/storefront/src/components/cart-provider.tsx`:

```tsx
"use client"

import { createContext, useContext, useMemo, useState } from "react"
import type { Product } from "@fotomax/shared"
import { addCartItem, type CartItem } from "@/lib/cart-state"

interface CartContextValue {
  items: CartItem[]
  addItem: (product: Product) => void
  clearCart: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      addItem(product) {
        setItems((current) => addCartItem(current, product))
      },
      clearCart() {
        setItems([])
      },
    }),
    [items]
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error("useCart must be used inside CartProvider")
  }
  return context
}
```

Create `apps/storefront/src/components/add-to-cart-button.tsx`:

```tsx
"use client"

import { useState } from "react"
import { ShoppingBag } from "lucide-react"
import { t, type Locale, type Product } from "@fotomax/shared"
import { useCart } from "./cart-provider"

export function AddToCartButton({ product, locale }: { product: Product; locale: Locale }) {
  const { addItem } = useCart()
  const [added, setAdded] = useState(false)

  return (
    <button
      className="button primary wide"
      type="button"
      onClick={() => {
        addItem(product)
        setAdded(true)
      }}
    >
      <ShoppingBag size={18} />
      {added ? t(locale, "addedToCart") : t(locale, "addToCart")}
    </button>
  )
}
```

- [ ] **Step 4: Create cart drawer and cart route**

Create `apps/storefront/src/components/cart-drawer.tsx`:

```tsx
"use client"

import Link from "next/link"
import { ShoppingBag, Trash2 } from "lucide-react"
import { formatPrice, localize, t, type Locale } from "@fotomax/shared"
import { localeHref } from "@/lib/locales"
import { getCartSubtotal } from "@/lib/cart-state"
import { useCart } from "./cart-provider"

export function CartDrawer({ locale }: { locale: Locale }) {
  const { items, clearCart } = useCart()
  const subtotal = getCartSubtotal(items)

  if (items.length === 0) {
    return null
  }

  return (
    <aside className="cart-drawer" aria-label={t(locale, "cart")}>
      <div className="cart-drawer-header">
        <strong>
          <ShoppingBag size={18} />
          {t(locale, "cart")}
        </strong>
        <button type="button" onClick={clearCart} aria-label={locale === "zh-HK" ? "清空購物車" : "Clear cart"}>
          <Trash2 size={16} />
        </button>
      </div>
      <div className="cart-lines">
        {items.map((item) => (
          <div key={item.product.handle}>
            <span>{localize(item.product.name, locale)}</span>
            <strong>
              {item.quantity} x {formatPrice(item.product.priceCents, locale)}
            </strong>
          </div>
        ))}
      </div>
      <div className="cart-total">
        <span>{locale === "zh-HK" ? "小計" : "Subtotal"}</span>
        <strong>{formatPrice(subtotal, locale)}</strong>
      </div>
      <Link className="button primary wide" href={localeHref(locale, "/cart")}>
        {locale === "zh-HK" ? "查看購物車" : "View cart"}
      </Link>
    </aside>
  )
}
```

Create `apps/storefront/app/[locale]/cart/page.tsx`:

```tsx
import { type Locale } from "@fotomax/shared"
import { assertLocale } from "@/lib/locales"

export default async function CartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params
  const locale: Locale = assertLocale(localeParam)

  return (
    <main id="main-content" className="page-shell cart-page">
      <p className="eyebrow">{locale === "zh-HK" ? "購物車" : "Cart"}</p>
      <h1>{locale === "zh-HK" ? "購物車已準備好" : "Your cart is ready"}</h1>
      <p>
        {locale === "zh-HK"
          ? "你可在瀏覽期間加入產品；結帳、付款及訂單確認即將推出。"
          : "Add products while you browse; checkout, payment, and order confirmation are coming soon."}
      </p>
    </main>
  )
}
```

- [ ] **Step 5: Create service entry page**

Create `apps/storefront/src/components/service-entry-page.tsx`:

```tsx
import Link from "next/link"
import { UploadCloud } from "lucide-react"
import { localize, type Locale, type ServiceEntry } from "@fotomax/shared"
import { localeHref } from "@/lib/locales"

export function ServiceEntryPage({ entry, locale }: { entry: ServiceEntry; locale: Locale }) {
  return (
    <main id="main-content" className="page-shell service-entry-page">
      <div className="service-icon">
        <UploadCloud size={34} />
      </div>
      <p className="eyebrow">{locale === "zh-HK" ? "即將推出" : "Coming soon"}</p>
      <h1>{localize(entry.title, locale)}</h1>
      <p>{localize(entry.summary, locale)}</p>
      <Link className="button primary" href={localeHref(locale, `/categories/${entry.categoryHandle}`)}>
        {localize(entry.actionLabel, locale)}
      </Link>
    </main>
  )
}
```

Create `apps/storefront/app/[locale]/services/[handle]/page.tsx`:

```tsx
import { notFound } from "next/navigation"
import { getServiceEntry, type Locale } from "@fotomax/shared"
import { ServiceEntryPage } from "@/components/service-entry-page"
import { assertLocale } from "@/lib/locales"

export default async function ServiceRoute({ params }: { params: Promise<{ locale: string; handle: string }> }) {
  const { locale: localeParam, handle } = await params
  const locale: Locale = assertLocale(localeParam)
  const entry = getServiceEntry(handle)

  if (!entry) {
    notFound()
  }

  return <ServiceEntryPage entry={entry} locale={locale} />
}
```

- [ ] **Step 6: Wire provider, drawer, and product button**

Modify `apps/storefront/app/[locale]/layout.tsx`:

```tsx
import { notFound } from "next/navigation"
import { localeLabels, locales, type Locale } from "@fotomax/shared"
import { CartDrawer } from "@/components/cart-drawer"
import { CartProvider } from "@/components/cart-provider"
import { SiteHeader } from "@/components/site-header"
import { assertLocale } from "@/lib/locales"

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale: localeParam } = await params
  let locale: Locale

  try {
    locale = assertLocale(localeParam)
  } catch {
    notFound()
  }

  return (
    <CartProvider>
      <div lang={locale} data-locale={locale} aria-label={localeLabels[locale]}>
        <a className="skip-link" href="#main-content">
          {locale === "zh-HK" ? "跳至主要內容" : "Skip to main content"}
        </a>
        <SiteHeader locale={locale} />
        {children}
        <CartDrawer locale={locale} />
      </div>
    </CartProvider>
  )
}
```

Modify `apps/storefront/src/components/product-detail.tsx` by replacing the `.availability-note` paragraph with:

```tsx
<AddToCartButton product={product} locale={locale} />
```

and add this import:

```tsx
import { AddToCartButton } from "./add-to-cart-button"
```

- [ ] **Step 7: Add cart and service CSS**

Append to `apps/storefront/app/globals.css`:

```css
.cart-drawer {
  position: fixed;
  right: 18px;
  bottom: 18px;
  width: min(360px, calc(100vw - 36px));
  display: grid;
  gap: 14px;
  padding: 16px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 18px 50px rgba(17, 24, 39, 0.16);
  z-index: 30;
}

.cart-drawer-header,
.cart-total,
.cart-lines div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.cart-drawer-header strong {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.cart-drawer-header button {
  width: 44px;
  height: 44px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #ffffff;
}

.cart-lines {
  display: grid;
  gap: 10px;
}

.cart-total {
  border-top: 1px solid #e5e7eb;
  padding-top: 12px;
}

.cart-page,
.service-entry-page {
  min-height: 520px;
  display: grid;
  align-content: center;
  justify-items: start;
  gap: 16px;
}

.cart-page h1,
.service-entry-page h1 {
  max-width: 760px;
  font-size: 4rem;
  line-height: 1;
}

.cart-page p,
.service-entry-page p {
  max-width: 680px;
  color: #4b5563;
  line-height: 1.7;
}

.service-icon {
  width: 68px;
  height: 68px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: #111827;
  color: #ffffff;
}

@media (max-width: 620px) {
  .cart-page h1,
  .service-entry-page h1 {
    font-size: 2.5rem;
  }
}
```

- [ ] **Step 8: Verify cart and service routes**

Run: `npm.cmd run test --workspace @fotomax/storefront`

Expected: PASS with cart-state coverage plus all existing storefront tests.

Run: `npm.cmd run build --workspace @fotomax/storefront`

Expected: PASS.

Run the local server: `npm run dev --workspace @fotomax/storefront`

Visit:

```text
http://localhost:3000/zh-HK/products/classic-4r-photo-print
http://localhost:3000/en/services/upload-photo-print
http://localhost:3000/zh-HK/cart
```

Expected: product route renders an enabled add-to-cart button, service route explains that upload/configuration details are coming soon, and cart route clearly describes the upcoming checkout path without implementation or release-planning language.

- [ ] **Step 9: Commit**

```bash
git add apps/storefront
git commit -m "feat: add cart and service entry states"
```

---

### Task 7: Medusa Backend Skeleton And Seed Payload

**Files:**
- Create: `apps/medusa/package.json`
- Create: `apps/medusa/tsconfig.json`
- Create: `apps/medusa/medusa-config.ts`
- Create: `apps/medusa/src/scripts/seed.test.ts`
- Create: `apps/medusa/src/scripts/seed.ts`
- Create: `apps/medusa/README.md`

**Interfaces:**
- Consumes: `categories`, `products`, `serviceEntries`, and `localize`.
- Produces: `buildFotomaxSeedPayload()` for Medusa-ready seed inspection and `medusa-config.ts` with Hong Kong storefront defaults.

- [ ] **Step 1: Create Medusa package metadata**

Create `apps/medusa/package.json`:

```json
{
  "name": "@fotomax/medusa",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "medusa develop",
    "build": "medusa build",
    "start": "medusa start",
    "seed": "medusa exec ./src/scripts/seed.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@fotomax/shared": "file:../../packages/shared",
    "@medusajs/framework": "^2.17.2",
    "@medusajs/medusa": "^2.17.2",
    "@medusajs/types": "^2.17.2",
    "@medusajs/utils": "^2.17.2",
    "awilix": "^8.0.1",
    "pg": "^8.13.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  }
}
```

Create `apps/medusa/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node", "vitest/globals"],
    "jsx": "react-jsx"
  },
  "include": ["medusa-config.ts", "src/**/*.ts"]
}
```

- [ ] **Step 2: Add Medusa config**

Create `apps/medusa/medusa-config.ts`:

```ts
import { defineConfig, loadEnv } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

export default defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS || "http://localhost:3000,http://localhost:8000",
      adminCors: process.env.ADMIN_CORS || "http://localhost:9000",
      authCors: process.env.AUTH_CORS || "http://localhost:9000,http://localhost:3000,http://localhost:8000",
      jwtSecret: process.env.JWT_SECRET || "fotomax-local-jwt-secret",
      cookieSecret: process.env.COOKIE_SECRET || "fotomax-local-cookie-secret",
    },
  },
})
```

- [ ] **Step 3: Write the failing seed payload test**

Create `apps/medusa/src/scripts/seed.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { buildFotomaxSeedPayload } from "./seed"

describe("Fotomax Medusa seed payload", () => {
  it("maps the bilingual catalog into Hong Kong commerce data", () => {
    const payload = buildFotomaxSeedPayload()
    const photoPrint = payload.products.find((product) => product.handle === "classic-4r-photo-print")

    expect(payload.region).toEqual({ name: "Hong Kong", currency_code: "hkd", countries: ["hk"] })
    expect(payload.collections).toHaveLength(6)
    expect(payload.products).toHaveLength(5)
    expect(payload.service_entries).toHaveLength(3)
    expect(photoPrint?.variants[0].prices[0]).toEqual({ currency_code: "hkd", amount: 280 })
    expect(photoPrint?.metadata.title_zh_hk).toBe("經典 4R 相片沖印")
  })
})
```

- [ ] **Step 4: Run the failing seed payload test**

Run: `npm run test --workspace @fotomax/medusa`

Expected: FAIL because `apps/medusa/src/scripts/seed.ts` does not exist yet.

- [ ] **Step 5: Add Medusa seed payload script**

Create `apps/medusa/src/scripts/seed.ts`:

```ts
import type { ExecArgs } from "@medusajs/framework/types"
import { categories, products, serviceEntries, localize } from "@fotomax/shared"

export function buildFotomaxSeedPayload() {
  return {
    region: {
      name: "Hong Kong",
      currency_code: "hkd",
      countries: ["hk"],
    },
    collections: categories.map((category) => ({
      handle: category.handle,
      title: localize(category.name, "en"),
      metadata: {
        title_zh_hk: localize(category.name, "zh-HK"),
        summary_en: localize(category.summary, "en"),
        summary_zh_hk: localize(category.summary, "zh-HK"),
        kind: category.kind,
        accent: category.accent,
      },
    })),
    products: products.map((product) => ({
      handle: product.handle,
      title: localize(product.name, "en"),
      description: localize(product.description, "en"),
      collection_handle: product.categoryHandle,
      status: "published",
      thumbnail: product.image,
      metadata: {
        title_zh_hk: localize(product.name, "zh-HK"),
        description_zh_hk: localize(product.description, "zh-HK"),
        badge_en: localize(product.badge, "en"),
        badge_zh_hk: localize(product.badge, "zh-HK"),
        fotomax_status: product.status,
      },
      variants: [
        {
          title: "Default",
          sku: `FOTOMAX-${product.handle.toUpperCase()}`,
          prices: [
            {
              currency_code: "hkd",
              amount: product.priceCents,
            },
          ],
        },
      ],
    })),
    service_entries: serviceEntries.map((entry) => ({
      handle: entry.handle,
      title: localize(entry.title, "en"),
      title_zh_hk: localize(entry.title, "zh-HK"),
      category_handle: entry.categoryHandle,
      status: entry.status,
    })),
  }
}

export default async function seedFotomax({ logger }: ExecArgs) {
  const payload = buildFotomaxSeedPayload()
  logger.info(`Prepared ${payload.collections.length} collections for Fotomax`)
  logger.info(`Prepared ${payload.products.length} products for Fotomax`)
  logger.info(`Prepared ${payload.service_entries.length} service entries for Fotomax`)
}
```

- [ ] **Step 6: Add backend run notes**

Create `apps/medusa/README.md`:

````md
# Fotomax Medusa Backend

This app is the Medusa boundary for the Fotomax storefront foundation.

## Local Commands

- `npm run dev --workspace @fotomax/medusa` starts Medusa at `http://localhost:9000`.
- `npm run seed --workspace @fotomax/medusa` prepares the Fotomax seed payload.
- `npm run test --workspace @fotomax/medusa` validates the generated seed payload without requiring PostgreSQL.
- `npm run typecheck --workspace @fotomax/medusa` checks the backend config and seed script.

## Required Local Environment

Create `apps/medusa/.env` with:

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/fotomax_medusa
STORE_CORS=http://localhost:3000,http://localhost:8000
ADMIN_CORS=http://localhost:9000
AUTH_CORS=http://localhost:9000,http://localhost:3000,http://localhost:8000
JWT_SECRET=fotomax-local-jwt-secret
COOKIE_SECRET=fotomax-local-cookie-secret
```
````

- [ ] **Step 7: Verify Medusa package**

Run: `npm install`

Run: `npm run test --workspace @fotomax/medusa`

Expected: PASS with the seed payload validation test.

Run: `npm run typecheck --workspace @fotomax/medusa`

Expected: PASS with no TypeScript errors.

Run: `npm run seed --workspace @fotomax/medusa`

Expected: logs show 6 collections, 5 products, and 3 service entries prepared. If PostgreSQL is not running, record that the seed payload test and typecheck passed and defer live DB import to the backend setup task for the next phase.

- [ ] **Step 8: Commit**

```bash
git add apps/medusa package-lock.json
git commit -m "feat: add Medusa backend skeleton"
```

---

### Task 8: End-To-End Verification

**Files:**
- Create: `apps/storefront/playwright.config.ts`
- Create: `apps/storefront/e2e/storefront.spec.ts`
- Modify: `apps/storefront/package.json`
- Create: `docs/verification/fotomax-phase-1.md`

**Interfaces:**
- Consumes: storefront routes from Tasks 3-6.
- Produces: `npm run e2e --workspace @fotomax/storefront` browser route smoke tests and verification notes.

- [ ] **Step 1: Add Playwright dependency and scripts**

Modify `apps/storefront/package.json` by adding these devDependencies and scripts:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "e2e": "playwright test"
  },
  "devDependencies": {
    "@playwright/test": "^1.54.0",
    "@types/node": "^22.10.0",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Step 2: Create Playwright config**

Create `apps/storefront/playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1",
    url: "http://127.0.0.1:3000/zh-HK",
    reuseExistingServer: true,
    timeout: 120000,
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 5"] },
    },
  ],
})
```

- [ ] **Step 3: Create browser smoke tests**

Create `apps/storefront/e2e/storefront.spec.ts`:

```ts
import { expect, test } from "@playwright/test"

test("homepage exposes bilingual commerce navigation", async ({ page }) => {
  await page.goto("/zh-HK")
  await expect(page.getByRole("link", { name: "Fotomax" }).first()).toBeVisible()
  await expect(page.getByRole("link", { name: "相片沖印" }).first()).toBeVisible()
  await expect(page.getByRole("link", { name: "個人化禮品" }).first()).toBeVisible()
})

test("category page lists seeded products", async ({ page }) => {
  await page.goto("/en/categories/photo-print")
  await expect(page.getByRole("heading", { name: /Turn camera-roll moments/i })).toBeVisible()
  await expect(page.getByRole("link", { name: "Classic 4R Photo Print" })).toBeVisible()
})

test("product page has a cart-ready CTA and customer-facing notes", async ({ page }) => {
  await page.goto("/en/products/classic-4r-photo-print")
  await expect(page.getByRole("heading", { name: "Classic 4R Photo Print" })).toBeVisible()
  await expect(page.getByRole("button", { name: /Add to cart/i })).toBeVisible()
  await page.getByRole("button", { name: /Add to cart/i }).click()
  await expect(page.getByRole("button", { name: /Added to cart/i })).toBeVisible()
  await expect(page.getByRole("complementary", { name: "Cart" })).toContainText("Classic 4R Photo Print")
})

test("service page communicates next-phase upload flow", async ({ page }) => {
  await page.goto("/en/services/upload-photo-print")
  await expect(page.getByRole("heading", { name: "Upload Photo Print Order" })).toBeVisible()
  await expect(page.getByText("Coming in the next phase")).toBeVisible()
})

test("store pickup navigation resolves to an honest next-phase state", async ({ page }) => {
  await page.goto("/en")
  await page.getByRole("link", { name: "Store pickup" }).click()
  await expect(page.getByRole("heading", { name: "Store Pickup & Collection" })).toBeVisible()
  await expect(page.getByText("Coming in the next phase")).toBeVisible()
})

test("cart route explains the next checkout phase", async ({ page }) => {
  await page.goto("/en/cart")
  await expect(page.getByRole("heading", { name: "Your cart is ready" })).toBeVisible()
})
```

- [ ] **Step 4: Run full verification**

Run: `npm install`

Run: `npm exec playwright install chromium`

Run: `npm run check`

Expected: shared, storefront, and Medusa seed tests PASS; typecheck PASS; storefront build PASS.

Run: `npm run e2e --workspace @fotomax/storefront`

Expected: desktop and mobile browser smoke tests PASS.

- [ ] **Step 5: Record verification**

Create `docs/verification/fotomax-phase-1.md`:

```md
# Fotomax Phase 1 Verification

## Commands

- `npm run check`
- `npm run e2e --workspace @fotomax/storefront`

## Routes Checked

- `/zh-HK`
- `/en/categories/photo-print`
- `/en/products/classic-4r-photo-print`
- `/en/services/upload-photo-print`
- `/en/services/store-pickup`
- `/en/cart`

## Result

Record the final command status, browser route status, and any environment-specific constraints from the implementation run.
```

- [ ] **Step 6: Commit**

```bash
git add apps/storefront docs/verification package-lock.json
git commit -m "test: add storefront phase one verification"
```

---

## Self-Review

**Spec coverage:** Task 1 creates the workspace foundation. Task 2 covers bilingual seed catalog data and Medusa-ready product/category concepts. Tasks 3-6 cover bilingual routing, homepage, mega navigation, categories, products, cart shell, error states, and next-phase service entries. Task 7 covers the Medusa backend boundary and seed payload. Task 8 covers typecheck, build, route smoke tests, browser checks, and verification notes.

**Red-flag scan:** The plan uses concrete demo data, exact files, command strings, and expected outcomes. It contains no unresolved planning markers.

**Type consistency:** `Locale`, catalog accessors, route helpers, cart provider APIs, and seed payload functions are defined before consuming tasks reference them.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-10-fotomax-commerce-storefront-foundation.md`.

Two execution options:

**1. Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
