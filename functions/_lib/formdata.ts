/**
 * formdata.ts — FormData helpers with correct File typing
 * =========================================================
 *
 * `@cloudflare/workers-types` types `FormData.get()` as `string | null` even
 * though the runtime actually returns `File` instances for file entries (it
 * follows the Web standard — the types are just incomplete). These helpers
 * do the real runtime check and narrow the type correctly so the rest of
 * the code can stay strictly typed.
 */

export function isFile(v: unknown): v is File {
  return (
    v !== null &&
    typeof v === 'object' &&
    'arrayBuffer' in v &&
    typeof (v as { arrayBuffer: unknown }).arrayBuffer === 'function'
  );
}

/** Read a form field as a File (or null if not present / not a file). */
export function getFile(form: FormData, name: string): File | null {
  const value = form.get(name) as unknown;
  return isFile(value) ? value : null;
}
