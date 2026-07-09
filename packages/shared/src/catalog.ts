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
  { handle: "photo-print", kind: "service", name: { "zh-HK": "相片沖印", en: "Photo Print" }, summary: { "zh-HK": "快速沖印、證件相及日常相片服務。", en: "Fast prints, ID photos, and everyday photo services." }, hero: { "zh-HK": "把手機相片變成可收藏的實體回憶。", en: "Turn camera-roll moments into keepsakes." }, accent: "#e84855" },
  { handle: "photobook", kind: "service", name: { "zh-HK": "相簿及影集", en: "Photobook" }, summary: { "zh-HK": "為旅行、家庭及紀念日製作高質感相簿。", en: "Premium books for trips, family stories, and milestones." }, hero: { "zh-HK": "用一本相簿整理值得重看的故事。", en: "Collect the stories worth revisiting." }, accent: "#3f7cac" },
  { handle: "personalized-gifts", kind: "product", name: { "zh-HK": "個人化禮品", en: "Personalized Gifts" }, summary: { "zh-HK": "杯、拼圖、座枱相架及客製心意。", en: "Mugs, puzzles, frames, and personal keepsakes." }, hero: { "zh-HK": "把日常用品變成有心思的禮物。", en: "Make everyday objects feel personal." }, accent: "#f5a623" },
  { handle: "instax-film", kind: "product", name: { "zh-HK": "Instax 及菲林", en: "Instax & Film" }, summary: { "zh-HK": "即影即有相機、菲林及配件。", en: "Instant cameras, film packs, and accessories." }, hero: { "zh-HK": "即時拍下，即時分享。", en: "Shoot it, share it, keep it." }, accent: "#00a6a6" },
  { handle: "lifestyle", kind: "product", name: { "zh-HK": "生活精品", en: "Lifestyle" }, summary: { "zh-HK": "影像生活用品及精選配件。", en: "Photo-led lifestyle goods and selected accessories." }, hero: { "zh-HK": "讓影像走進日常生活。", en: "Bring photography into daily life." }, accent: "#7b61ff" },
  { handle: "promotions", kind: "promotion", name: { "zh-HK": "優惠推廣", en: "Promotions" }, summary: { "zh-HK": "最新沖印、相簿及禮品優惠。", en: "Current offers across prints, books, and gifts." }, hero: { "zh-HK": "用更抵價錢完成更多影像計劃。", en: "Do more with current Fotomax offers." }, accent: "#111827" },
]

export const products: Product[] = [
  { handle: "classic-4r-photo-print", categoryHandle: "photo-print", status: "featured", name: { "zh-HK": "經典 4R 相片沖印", en: "Classic 4R Photo Print" }, description: { "zh-HK": "適合家庭、旅行及日常分享的標準尺寸相片沖印。", en: "Standard-size prints for family, travel, and everyday sharing." }, image: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80", priceCents: 280, badge: { "zh-HK": "人氣服務", en: "Popular service" }, options: [{ name: { "zh-HK": "相紙", en: "Paper finish" }, values: [{ "zh-HK": "光面", en: "Glossy" }, { "zh-HK": "啞面", en: "Matte" }] }] },
  { handle: "premium-layflat-photobook", categoryHandle: "photobook", status: "featured", name: { "zh-HK": "高級平開相簿", en: "Premium Layflat Photobook" }, description: { "zh-HK": "適合婚禮、旅行及家庭故事的平開設計相簿。", en: "A layflat book for weddings, travel, and family stories." }, image: "https://images.unsplash.com/photo-1519682337058-a94d519337bc?auto=format&fit=crop&w=1200&q=80", priceCents: 19800, badge: { "zh-HK": "可客製", en: "Customizable" }, options: [{ name: { "zh-HK": "尺寸", en: "Size" }, values: [{ "zh-HK": "8 x 8 吋", en: "8 x 8 in" }, { "zh-HK": "10 x 10 吋", en: "10 x 10 in" }] }] },
  { handle: "photo-mug-gift", categoryHandle: "personalized-gifts", status: "available", name: { "zh-HK": "個人化相片杯", en: "Personalized Photo Mug" }, description: { "zh-HK": "把喜愛相片印在日常使用的陶瓷杯上。", en: "Print a favorite image on an everyday ceramic mug." }, image: "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=1200&q=80", priceCents: 8800, badge: { "zh-HK": "送禮精選", en: "Gift pick" }, options: [{ name: { "zh-HK": "杯色", en: "Mug color" }, values: [{ "zh-HK": "白色", en: "White" }, { "zh-HK": "黑色", en: "Black" }] }] },
  { handle: "instax-mini-film-pack", categoryHandle: "instax-film", status: "available", name: { "zh-HK": "Instax Mini 即影即有菲林", en: "Instax Mini Film Pack" }, description: { "zh-HK": "適用於 Instax Mini 系列相機的即影即有菲林。", en: "Instant film for Instax Mini cameras." }, image: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=1200&q=80", priceCents: 7800, badge: { "zh-HK": "門市取貨", en: "Store pickup" }, options: [{ name: { "zh-HK": "包裝", en: "Pack" }, values: [{ "zh-HK": "10 張", en: "10 shots" }, { "zh-HK": "20 張", en: "20 shots" }] }] },
  { handle: "desktop-acrylic-photo-block", categoryHandle: "lifestyle", status: "available", name: { "zh-HK": "亞加力座枱相架", en: "Desktop Acrylic Photo Block" }, description: { "zh-HK": "清晰厚身亞加力展示相片，適合家居或辦公桌。", en: "A clear acrylic block for desks, shelves, and workspaces." }, image: "https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?auto=format&fit=crop&w=1200&q=80", priceCents: 12800, badge: { "zh-HK": "家居擺設", en: "Home display" }, options: [{ name: { "zh-HK": "方向", en: "Orientation" }, values: [{ "zh-HK": "直度", en: "Portrait" }, { "zh-HK": "橫度", en: "Landscape" }] }] },
]

export const serviceEntries: ServiceEntry[] = [
  { handle: "upload-photo-print", categoryHandle: "photo-print", status: "next-phase", title: { "zh-HK": "上載相片沖印訂單", en: "Upload Photo Print Order" }, summary: { "zh-HK": "下一階段會加入上載、裁切、尺寸及門市取貨流程。", en: "Upload, crop, sizing, and pickup selection will be added in the next phase." }, actionLabel: { "zh-HK": "查看沖印選項", en: "Preview print options" } },
  { handle: "design-photobook", categoryHandle: "photobook", status: "next-phase", title: { "zh-HK": "設計相簿", en: "Design a Photobook" }, summary: { "zh-HK": "下一階段會加入相簿版面、頁數及封面設定。", en: "Book layout, page count, and cover setup will be added in the next phase." }, actionLabel: { "zh-HK": "查看相簿款式", en: "Preview book styles" } },
  { handle: "store-pickup", categoryHandle: "photo-print", status: "next-phase", title: { "zh-HK": "門市取貨及分店服務", en: "Store Pickup & Collection" }, summary: { "zh-HK": "下一階段會加入分店搜尋、庫存提示及取貨時段選擇。", en: "Store search, availability guidance, and pickup times will be added in the next phase." }, actionLabel: { "zh-HK": "瀏覽相片服務", en: "Browse photo services" } },
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
