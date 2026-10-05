import { supabaseRest } from "@/lib/server/supabase/rest"

type CatalogItem = {
  id: string
  tenant_id: string
  sku: string | null
  name: string
  description: string | null
  default_price_cents: number
  currency: string
  active: boolean
}

type PriceRow = {
  price_cents: number
  min_quantity: number
}

export async function loadCatalogItem(tenantId: string, itemId: string) {
  const rows = await supabaseRest<CatalogItem[]>(
    "GET",
    `/catalog_items?id=eq.${encodeURIComponent(itemId)}&tenant_id=eq.${encodeURIComponent(tenantId)}&active=eq.true&select=*&limit=1`,
  )
  return Array.isArray(rows) ? rows[0] ?? null : null
}

export async function resolveCatalogPrice(input: {
  tenantId: string
  itemId: string
  quantity: number
  priceBookId?: string | null
}) {
  const item = await loadCatalogItem(input.tenantId, input.itemId)
  if (!item) throw new Error("Item de catálogo não encontrado.")

  const quantity = Number.isFinite(input.quantity) && input.quantity > 0 ? input.quantity : 1
  let priceBookId = input.priceBookId || null

  if (!priceBookId) {
    const books = await supabaseRest<Array<{ id: string }>>(
      "GET",
      `/price_books?tenant_id=eq.${encodeURIComponent(input.tenantId)}&active=eq.true&is_default=eq.true&select=id&limit=1`,
    )
    priceBookId = Array.isArray(books) ? books[0]?.id ?? null : null
  }

  if (priceBookId) {
    const prices = await supabaseRest<PriceRow[]>(
      "GET",
      `/price_book_items?price_book_id=eq.${encodeURIComponent(priceBookId)}&catalog_item_id=eq.${encodeURIComponent(item.id)}&min_quantity=lte.${encodeURIComponent(String(quantity))}&select=price_cents,min_quantity&order=min_quantity.desc&limit=1`,
    )
    const price = Array.isArray(prices) ? prices[0] : null
    if (price) {
      return {
        item,
        priceCents: Number(price.price_cents),
        source: "price_book" as const,
        priceBookId,
        minQuantity: Number(price.min_quantity),
      }
    }
  }

  return {
    item,
    priceCents: Number(item.default_price_cents),
    source: "default" as const,
    priceBookId: null,
    minQuantity: 1,
  }
}
