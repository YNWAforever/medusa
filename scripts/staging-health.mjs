const defaultSleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

export async function waitForHealthyBackend(
  baseUrl,
  {
    fetchImpl = fetch,
    attempts = 30,
    delayMs = 2_000,
    sleep = defaultSleep,
  } = {},
) {
  const healthUrl = `${baseUrl.replace(/\/$/, "")}/health`
  let lastFailure = "health check did not run"

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(healthUrl, {
        headers: { accept: "text/plain" },
      })

      if (response.ok) {
        return { attempt, status: response.status }
      }

      lastFailure = `GET /health returned ${response.status}`
    } catch {
      lastFailure = "network request failed"
    }

    if (attempt < attempts) {
      await sleep(delayMs)
    }
  }

  throw new Error(
    `Medusa health check failed after ${attempts} attempts: ${lastFailure}`,
  )
}
