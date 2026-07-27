import { createUsersWorkflow } from "@medusajs/core-flows"
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

export interface AdminCredentials {
  email: string
  password: string
}

export const MIN_ADMIN_PASSWORD_LENGTH = 12

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Credentials come from the environment, never from argv, so they stay out of
 * shell history and the process list.
 */
export function parseAdminCredentials(
  source: Record<string, string | undefined>,
): AdminCredentials {
  const email = source.FOTOMAX_ADMIN_EMAIL?.trim() ?? ""
  const password = source.FOTOMAX_ADMIN_PASSWORD ?? ""

  if (!email) {
    throw new Error("FOTOMAX_ADMIN_EMAIL is required to create an admin user")
  }

  if (!emailPattern.test(email)) {
    throw new Error("FOTOMAX_ADMIN_EMAIL is not a valid email address")
  }

  if (password.trim().length < MIN_ADMIN_PASSWORD_LENGTH) {
    throw new Error(
      `FOTOMAX_ADMIN_PASSWORD must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters`,
    )
  }

  return { email, password }
}

/**
 * Creates the initial Medusa Admin operator.
 *
 * Mirrors the sequence the `medusa user` CLI performs: create the user record,
 * register an emailpass auth identity, then link the identity to the user. Safe
 * to re-run — an existing user is reported and left untouched.
 */
export default async function createAdmin({ container }: ExecArgs) {
  const { email, password } = parseAdminCredentials(process.env)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const auth = container.resolve(Modules.AUTH)

  const existing = await query.graph({
    entity: "user",
    fields: ["id", "email"],
    filters: { email },
  })

  if (existing.data.length > 0) {
    logger.info(`Admin user ${email} already exists; leaving it unchanged`)
    return
  }

  const { result: users } = await createUsersWorkflow(container).run({
    input: { users: [{ email }] },
  })
  const user = users[0]

  if (!user?.id) {
    throw new Error("Medusa did not return a created admin user")
  }

  const { authIdentity, error } = await auth.register("emailpass", {
    body: { email, password },
  })

  if (error || !authIdentity?.id) {
    throw new Error(`Could not register admin credentials for ${email}`)
  }

  await auth.updateAuthIdentities({
    id: authIdentity.id,
    app_metadata: { user_id: user.id },
  })

  logger.info(`Created Fotomax admin user ${email}`)
}
