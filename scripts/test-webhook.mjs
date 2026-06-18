// ─────────────────────────────────────────────────────────────────────────────
// Phase 1D — locally-signed Stripe webhook verification (NO live Stripe).
//
// Builds a customer.subscription.updated payload, signs it with the SAME HMAC
// scheme Stripe uses (`t=<ts>,v1=<HMAC-SHA256(ts.payload, STRIPE_WEBHOOK_SECRET)>`)
// and POSTs the RAW body to POST /stripe/webhook. Verifies:
//   1) a correctly-signed event returns 200 and updates the subscriptions row
//   2) a tampered / missing signature is rejected with 400
//
// Usage:
//   node scripts/test-webhook.mjs <schoolId> <status>
//     schoolId  required — the school whose subscriptions row should update
//     status    optional — Stripe sub status to send (default 'active')
//
// Env:
//   API_BASE              default http://localhost:8000
//   STRIPE_WEBHOOK_SECRET default whsec_test_finrep_local_dev_secret
// ─────────────────────────────────────────────────────────────────────────────
import { createHmac } from 'node:crypto'

const API_BASE = process.env.API_BASE ?? 'http://localhost:8000'
const SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_test_finrep_local_dev_secret'

const schoolId = process.argv[2]
const status = process.argv[3] ?? 'active'
if (!schoolId) {
  console.error('Usage: node scripts/test-webhook.mjs <schoolId> [status]')
  process.exit(2)
}

function stripeSignature(rawBody, secret, timestamp) {
  // Stripe signs the string `${timestamp}.${rawBody}` with HMAC-SHA256.
  const signedPayload = `${timestamp}.${rawBody}`
  const v1 = createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex')
  return `t=${timestamp},v1=${v1}`
}

function buildEvent() {
  const now = Math.floor(Date.now() / 1000)
  // A minimal-but-realistic customer.subscription.updated payload. metadata.schoolId
  // lets the backend resolve the tenant without a Stripe customer lookup.
  return {
    id: 'evt_test_' + now,
    object: 'event',
    type: 'customer.subscription.updated',
    created: now,
    data: {
      object: {
        id: 'sub_test_local',
        object: 'subscription',
        status,
        customer: 'cus_test_local',
        cancel_at_period_end: false,
        current_period_end: now + 30 * 24 * 60 * 60,
        trial_end: null,
        metadata: { schoolId },
        items: {
          object: 'list',
          data: [
            {
              id: 'si_test',
              price: { id: process.env.STRIPE_PRICE_MONTHLY ?? 'price_monthly_placeholder' },
            },
          ],
        },
      },
    },
  }
}

async function post(rawBody, signature) {
  const res = await fetch(`${API_BASE}/stripe/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(signature ? { 'stripe-signature': signature } : {}),
    },
    body: rawBody,
  })
  let body
  try {
    body = await res.json()
  } catch {
    body = await res.text()
  }
  return { status: res.status, body }
}

async function main() {
  const event = buildEvent()
  const rawBody = JSON.stringify(event)
  const ts = Math.floor(Date.now() / 1000)
  const goodSig = stripeSignature(rawBody, SECRET, ts)

  console.log(`POST /stripe/webhook  (school=${schoolId}, status=${status})`)

  // 1) Valid signature → expect 200 + { received: true }
  const ok = await post(rawBody, goodSig)
  console.log('  [valid sig]   ->', ok.status, JSON.stringify(ok.body))
  const validPassed = ok.status === 200

  // 2) Tampered signature → expect 400
  const badSig = stripeSignature(rawBody, 'whsec_wrong_secret', ts)
  const bad = await post(rawBody, badSig)
  console.log('  [bad sig]     ->', bad.status, JSON.stringify(bad.body))
  const badRejected = bad.status === 400

  // 3) Missing signature → expect 400
  const missing = await post(rawBody, null)
  console.log('  [missing sig] ->', missing.status, JSON.stringify(missing.body))
  const missingRejected = missing.status === 400

  const allPass = validPassed && badRejected && missingRejected
  console.log('')
  console.log(
    `RESULT: valid=${validPassed ? 'PASS' : 'FAIL'} bad=${badRejected ? 'PASS' : 'FAIL'} missing=${missingRejected ? 'PASS' : 'FAIL'} => ${allPass ? 'ALL PASS' : 'FAIL'}`,
  )
  process.exit(allPass ? 0 : 1)
}

main().catch((e) => {
  console.error('webhook test error:', e)
  process.exit(1)
})
