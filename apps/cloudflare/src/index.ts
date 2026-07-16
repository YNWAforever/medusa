import { Container, getContainer, type StopParams } from "@cloudflare/containers"
import { env as workerEnv } from "cloudflare:workers"

import { proxyToMedusa } from "./proxy"
import { buildContainerEnv, type RuntimeSecrets } from "./runtime"

export type CloudflareBindings = RuntimeSecrets & {
  FOTOMAX_MEDUSA: DurableObjectNamespace<FotomaxMedusaContainer>
}

const runtimeEnv = workerEnv as unknown as RuntimeSecrets

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
  fetch(request: Request, env: CloudflareBindings): Promise<Response> {
    return proxyToMedusa(request, () =>
      getContainer(env.FOTOMAX_MEDUSA, "fotomax-medusa-staging"),
    )
  },
} satisfies ExportedHandler<CloudflareBindings>
