/**
 * catalog.ts — SCG Product Catalog
 * ===================================
 *
 * Loads the demo product catalog from data/scg_catalog.json and exposes
 * typed accessors. The recommend endpoint reads from this catalog and
 * embeds the chosen products directly in the BOM response, so the
 * frontend doesn't need its own copy.
 *
 * Replace the JSON file with a live SCG Home product feed for production.
 */

import catalogData from '../../data/scg_catalog.json';

export type ProductCategory =
  | 'floor_tile'
  | 'wall_tile'
  | 'sanitary_ware'
  | 'roofing'
  | 'wall_panel'
  | 'paint';

export type ProductUnit = 'm2' | 'piece' | '9L_can';

export interface Product {
  sku: string;
  name_en: string;
  name_th: string;
  category: ProductCategory;
  subcategory: string;
  style_tags: string[];
  swatch: string;
  price_thb: number;
  unit: ProductUnit;
  specs: Record<string, string>;
  description_en: string;
  description_th: string;
  /** Brand label — most COTTO/SCG; paint is currently TOA/BEGER (sold at SCG Home stores). */
  brand?: string;
  /** Public URL the price/name was sourced from; lets judges click through to verify. */
  source_url?: string;
  /** True when the price is from the linked retailer page; false when it is a market estimate. */
  price_verified?: boolean;
}

// `as unknown as Product[]` because TS infers the JSON's specs as fixed-shape
// objects rather than Record<string, string> — the runtime data IS a string
// map, so we widen explicitly.
export const CATALOG: Product[] = catalogData.products as unknown as Product[];

/** Filter catalog by category. */
export function byCategory(category: ProductCategory): Product[] {
  return CATALOG.filter((p) => p.category === category);
}

/** Look up a product by SKU. */
export function findProduct(sku: string): Product | undefined {
  return CATALOG.find((p) => p.sku === sku);
}

/**
 * Build a compact, prompt-friendly summary of the catalog for Claude.
 * Keeps the SKU + name + style tags + price + a one-line spec summary.
 * The full record is dereferenced on the server using findProduct().
 */
export function catalogForPrompt(): string {
  return CATALOG.map((p) => {
    const specSummary = Object.entries(p.specs)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    return `- ${p.sku} | ${p.name_en} | category=${p.category} | tags=[${p.style_tags.join(',')}] | ${p.price_thb} THB/${p.unit} | ${specSummary}`;
  }).join('\n');
}
