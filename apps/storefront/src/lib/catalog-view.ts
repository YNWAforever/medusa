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
