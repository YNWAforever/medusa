import { Container, getContainer, type StopParams } from "@cloudflare/containers"
import { env as workerEnv } from "cloudflare:workers"

import { denyAdminRequest, proxyToMedusa } from "./proxy"
import {
  buildContainerEnv,
  type ContainerSettings,
  type RuntimeSecrets,
  type WorkerSecrets,
} from "./runtime"

export type CloudflareBindings = RuntimeSecrets &
  ContainerSettings &
  WorkerSecrets & {
    FOTOMAX_MEDUSA: DurableObjectNamespace<FotomaxMedusaContainer>
  }

const runtimeEnv = workerEnv as unknown as RuntimeSecrets & ContainerSettings

export class FotomaxMedusaContainer extends Container {
  defaultPort = 9000
  sleepAfter = "10m"
  enableInternet = true
  envVars = buildContainerEnv(runtimeEnv)

  override onStart(): void {
    console.log("medusa_container_started")
  }

  override onStop(stopParams: StopParams): void {
    console.log("medusa_container_stopped", {
      exit_code: stopParams.exitCode,
      reason: stopParams.reason,
    })
  }

  override onError(error: unknown): never {
    console.error("medusa_container_error", error)
    throw error
  }
}

export default {
  async fetch(request: Request, env: CloudflareBindings): Promise<Response> {
    const denied = denyAdminRequest(request, env.ADMIN_GATE_SECRET)

    if (denied) {
      return denied
    }

    return proxyToMedusa(request, () =>
      getContainer(env.FOTOMAX_MEDUSA, "fotomax-medusa-staging"),
    )
  },
} satisfies ExportedHandler<CloudflareBindings>
