import { defineLink } from "@medusajs/framework/utils"
import CartModule from "@medusajs/medusa/cart"
import PhotoProductionModule from "../modules/photo-production"

export default defineLink(
  { linkable: PhotoProductionModule.linkable.photoJobVersion, isList: false },
  { linkable: CartModule.linkable.lineItem, isList: true },
)
