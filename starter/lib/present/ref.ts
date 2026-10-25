/** Operators know orders by their reference (CD-420439), not by the internal id (ord-00439). */
export function orderRef(orderId: string): string {
  const m = /^ord-(\d{5})$/.exec(orderId)
  return m ? `CD-${420000 + Number(m[1])}` : orderId
}
/** Raw provider and lease messages are for support, not for the operator's timeline. */
export function friendlyEvent(text: string): string {
  return /Provider HTTP|rate_limit|Execution time limit|lease|timed out/i.test(text) ? "The AI model was busy or slow; the agent retried automatically." : text
}
