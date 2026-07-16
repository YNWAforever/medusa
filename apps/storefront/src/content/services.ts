import type { Locale } from "../lib/medusa/contracts"

export interface ServiceEntry {
  handle: string
  categoryHandle: string
  title: Record<Locale, string>
  summary: Record<Locale, string>
  actionLabel: Record<Locale, string>
}

export const serviceEntries: ServiceEntry[] = [
  {
    handle: "upload-photo-print",
    categoryHandle: "photo-print",
    title: { "zh-HK": "上載相片沖印訂單", en: "Upload Photo Print Order" },
    summary: { "zh-HK": "網上相片上載、裁切、尺寸選擇及門市取貨功能即將推出。", en: "Online photo upload, cropping, size selection, and store pickup are coming soon." },
    actionLabel: { "zh-HK": "查看沖印選項", en: "Preview print options" },
  },
  {
    handle: "design-photobook",
    categoryHandle: "photobook",
    title: { "zh-HK": "設計相簿", en: "Design a Photobook" },
    summary: { "zh-HK": "相簿版面、頁數及封面設定功能即將推出。", en: "Photobook layout, page count, and cover setup are coming soon." },
    actionLabel: { "zh-HK": "查看相簿款式", en: "Preview book styles" },
  },
  {
    handle: "store-pickup",
    categoryHandle: "photo-print",
    title: { "zh-HK": "門市取貨及分店服務", en: "Store Pickup & Collection" },
    summary: { "zh-HK": "分店搜尋、庫存提示及取貨時段選擇功能即將推出。", en: "Store search, availability guidance, and pickup time selection are coming soon." },
    actionLabel: { "zh-HK": "瀏覽相片服務", en: "Browse photo services" },
  },
]

export function getServiceEntry(handle: string): ServiceEntry | undefined {
  return serviceEntries.find((entry) => entry.handle === handle)
}