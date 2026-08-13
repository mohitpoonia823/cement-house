/**
 * Single WhatsApp Cloud API sender, shared by every scheduled job.
 * Replaces four near-identical fetch blocks that lived in apps/worker.
 *
 * Never throws: a job sending to N recipients must not lose the remaining N-1
 * because one number is bad. Callers decide what a failure means.
 */
export type WhatsAppResult = { ok: boolean; status: number; error?: string }

const GRAPH_VERSION = 'v19.0'

/** Numbers are stored without the country code; the Cloud API needs it. */
function toWhatsAppNumber(phone: string) {
  const digits = phone.replace(/\D/g, '')
  return digits.startsWith('91') ? digits : `91${digits}`
}

export async function sendWhatsAppText(phone: string, body: string): Promise<WhatsAppResult> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  if (!phoneNumberId || !accessToken) {
    return { ok: false, status: 0, error: 'WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN not configured' }
  }

  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toWhatsAppNumber(phone),
        type: 'text',
        text: { body },
      }),
    })
    if (res.ok) return { ok: true, status: res.status }
    const detail = await res.text().catch(() => '')
    return { ok: false, status: res.status, error: detail.slice(0, 200) }
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) }
  }
}
