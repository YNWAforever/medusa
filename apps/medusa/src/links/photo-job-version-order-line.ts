import { defineLink } from "@medusajs/framework/utils"
import OrderModule from "@medusajs/medusa/order"
import PhotoProductionModule from "../modules/photo-production"

export default defineLink(
  { linkable: PhotoProductionModule.linkable.photoJobVersion, isList: false },
  { linkable: OrderModule.linkable.orderLineItem, isList: true },
)
