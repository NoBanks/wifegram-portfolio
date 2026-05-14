#!/usr/bin/env node
/**
 * Create 5 Wifegram Founder License products + prices + Payment Links via Stripe API.
 * Reads STRIPE_SECRET_KEY from env (provided by the invoker via shell pipe).
 * Outputs JSON of {tier: url} pairs to stdout. Never echoes the secret key.
 *
 * Invocation pattern (key never appears in argv or process listing):
 *   STRIPE_SECRET_KEY=$(grep '^STRIPE_SECRET_KEY=' ~/Documents/nhn-enterprise/covenant/.env | cut -d= -f2-) \
 *     node scripts/create-stripe-payment-links.mjs > payment-links.json
 *
 * IDEMPOTENT: looks up existing "Wifegram Founder Tier X" products by name before creating.
 * Re-run is safe; will reuse existing products + prices and reuse Payment Links via lookup_key.
 */

const STRIPE_API = "https://api.stripe.com/v1"
const KEY = process.env.STRIPE_SECRET_KEY
if (!KEY || !KEY.startsWith("sk_")) {
  console.error("STRIPE_SECRET_KEY not present in env or wrong format. Aborting.")
  process.exit(2)
}

const TIERS = [
  { tier: 1, name: "Wifegram Founder Tier 1 - First Light", lookup: "wifegram_founder_t1_first_light", amount: 7900, label: "First Light" },
  { tier: 2, name: "Wifegram Founder Tier 2 - Charter",     lookup: "wifegram_founder_t2_charter",     amount: 9900, label: "Charter" },
  { tier: 3, name: "Wifegram Founder Tier 3 - Captain",     lookup: "wifegram_founder_t3_captain",    amount: 12900, label: "Captain" },
  { tier: 4, name: "Wifegram Founder Tier 4 - Reserve",     lookup: "wifegram_founder_t4_reserve",    amount: 16900, label: "Reserve" },
  { tier: 5, name: "Wifegram Founder Tier 5 - Sentinel",    lookup: "wifegram_founder_t5_sentinel",   amount: 19900, label: "Sentinel" },
]

async function stripe(method, path, params) {
  const url = `${STRIPE_API}${path}`
  const body = params ? new URLSearchParams(flatten(params)).toString() : undefined
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Stripe ${method} ${path} failed: HTTP ${res.status} ${text.slice(0, 400)}`)
  }
  return res.json()
}

function flatten(obj, prefix = "") {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k
    if (v === undefined || v === null) continue
    if (typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flatten(v, key))
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (typeof item === "object") {
          Object.assign(out, flatten(item, `${key}[${i}]`))
        } else {
          out[`${key}[${i}]`] = String(item)
        }
      })
    } else {
      out[key] = String(v)
    }
  }
  return out
}

async function findExistingProduct(name) {
  const list = await stripe("GET", `/products/search?query=${encodeURIComponent(`name:"${name}"`)}&limit=1`)
  return list.data?.[0] || null
}

async function findPriceByLookup(lookup) {
  const list = await stripe("GET", `/prices?lookup_keys[]=${encodeURIComponent(lookup)}&limit=1`)
  return list.data?.[0] || null
}

async function ensureProductPriceLink(t) {
  let product = await findExistingProduct(t.name)
  if (!product) {
    product = await stripe("POST", "/products", {
      name: t.name,
      description: `Wifegram founder license, 12-month access at the ${t.label} tier rate. Pre-paid revenue, not equity, not IOU.`,
      metadata: {
        app: "wifegram",
        tier: String(t.tier),
        founder_term_months: "12",
      },
    })
  }

  let price = await findPriceByLookup(t.lookup)
  if (!price || price.product !== product.id || price.unit_amount !== t.amount) {
    price = await stripe("POST", "/prices", {
      product: product.id,
      currency: "usd",
      unit_amount: t.amount,
      lookup_key: t.lookup,
      transfer_lookup_key: true,
      metadata: {
        app: "wifegram",
        tier: String(t.tier),
      },
    })
  }

  const link = await stripe("POST", "/payment_links", {
    line_items: [{ price: price.id, quantity: 1 }],
    metadata: {
      app: "wifegram",
      tier: String(t.tier),
      tier_label: t.label,
    },
    after_completion: {
      type: "redirect",
      redirect: { url: "https://wifegram.livingagentic.me/?status=success" },
    },
    custom_text: {
      submit: { message: `You're securing one of ${t.tier === 1 ? 50 : t.tier === 2 ? 75 : t.tier === 3 ? 50 : t.tier === 4 ? 34 : 25} ${t.label} licenses. 12 months of Wifegram access from purchase date.` },
    },
  })

  return { tier: t.tier, label: t.label, amount: t.amount, productId: product.id, priceId: price.id, url: link.url }
}

async function main() {
  const results = []
  for (const t of TIERS) {
    const r = await ensureProductPriceLink(t)
    results.push(r)
    console.error(`[t${r.tier}] ${r.label} $${r.amount / 100} ready`)
  }
  process.stdout.write(JSON.stringify(results, null, 2) + "\n")
}

main().catch((err) => {
  console.error("FATAL:", err.message)
  process.exit(1)
})
