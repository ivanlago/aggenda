const triggerUrl = process.env.OUTBOX_WORKER_TRIGGER_URL?.replace(/\/$/, "");
const triggerSecret = process.env.OUTBOX_TRIGGER_SECRET ?? process.env.AGGENDA_INTERNAL_API_KEY;

/**
 * Best-effort wake-up for the outbox worker. The periodic recovery scan remains
 * responsible for processing the event if the worker is temporarily offline.
 */
export async function triggerOutboxWorker() {
  if (!triggerUrl || !triggerSecret) return false;

  try {
    const response = await fetch(`${triggerUrl}/drain`, {
      method: "POST",
      headers: { authorization: `Bearer ${triggerSecret}` },
      cache: "no-store",
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok && response.status !== 202) {
      console.warn(`[outbox-trigger] Worker respondeu HTTP ${response.status}`);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[outbox-trigger] Worker indisponível; a varredura periódica recuperará o evento", error);
    return false;
  }
}
