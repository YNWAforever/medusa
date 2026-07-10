import {
  getCategory,
  getProduct,
  getProductsByCategory,
  type Category,
  type Product,
} from "@fotomax/shared"

export interface CategoryView {
  category: Category
  products: Product[]
}

export interface ProductView {
  product: Product
  category: Category
}

export type ProductFilter = "all" | "featured" | "available"

const productFilters: ProductFilter[] = ["all", "featured", "available"]

export function parseProductFilter(value: string | string[] | undefined): ProductFilter {
  if (typeof value === "string" && productFilters.includes(value as ProductFilter)) {
    return value as ProductFilter
  }

  return "all"
}

export function buildCategoryFilterHref(
  pathname: string,
  currentSearch: string,
  filter: ProductFilter,
): string {
  const searchParams = new URLSearchParams(currentSearch)

  if (filter === "all") {
    searchParams.delete("filter")
  } else {
    searchParams.set("filter", filter)
  }

  const query = searchParams.toString()
  return query ? `${pathname}?${query}` : pathname
}

export function filterProducts(products: Product[], filter: ProductFilter): Product[] {
  if (filter === "all") {
    return products
  }

  if (filter === "available") {
    return products.filter((product) =>
      ["available", "featured"].includes(product.status),
    )
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
