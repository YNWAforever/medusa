import { authenticate, defineMiddlewares } from "@medusajs/framework/http"

export default defineMiddlewares({
  routes: [
    {
      matcher: "/store/photo-jobs*",
      middlewares: [
        authenticate("customer", "bearer", { allowUnauthenticated: true }),
      ],
    },
  ],
})
