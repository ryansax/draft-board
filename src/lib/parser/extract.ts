import type { ImageItem, PageItems, TextItem } from './types'

/** The pdf.js `OPS` map. Passed in so this module stays free of a pdf.js import. */
export interface OpsMap {
  save: number
  restore: number
  transform: number
  paintImageXObject: number
}

/** [a b c d e f] matrix multiply, PDF convention. */
function multiply(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ]
}

/** FNV-1a over the pixel bytes — fast, dependency-free, and only ever compared
 *  against hashes from the same document. */
function hashBytes(bytes: ArrayLike<number>, width: number, height: number): string {
  let h = 0x811c9dc5
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]
    h = Math.imul(h, 0x01000193)
  }
  return `${width}x${height}:${(h >>> 0).toString(16)}`
}

/**
 * pdf.js hands image objects back either as raw pixel bytes or, in browsers with
 * OffscreenCanvas, as an ImageBitmap. Both need to reduce to the same hash.
 */
async function hashImageObject(obj: any): Promise<string | null> {
  if (!obj) return null
  if (obj.data && obj.data.length) return hashBytes(obj.data, obj.width, obj.height)

  const bitmap = obj.bitmap
  if (bitmap && typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(bitmap, 0, 0)
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data
    return hashBytes(pixels, bitmap.width, bitmap.height)
  }
  if (bitmap && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(bitmap, 0, 0)
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data
    return hashBytes(pixels, bitmap.width, bitmap.height)
  }
  return null
}

/**
 * Only images this size or smaller are decoded. The sheet's badge glyphs are a few
 * points square; page art and logos are irrelevant to parsing and needlessly
 * expensive to decode.
 */
const MAX_DECODED_IMAGE_SIZE = 24

/** Give up on an object rather than hang the import if pdf.js never resolves it. */
const OBJECT_RESOLVE_TIMEOUT_MS = 2000

/**
 * Resolve an object from pdf.js's stores, whether or not it is ready yet. Objects
 * shared between pages are deduplicated into the document-wide `commonObjs` store
 * and are named with a `g_` prefix.
 */
function resolveObject(page: any, name: string): Promise<any> {
  const store = name.startsWith('g_') ? page.commonObjs : page.objs
  if (!store) return Promise.resolve(null)
  return new Promise((resolve) => {
    let settled = false
    const done = (value: any) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const timer = setTimeout(() => done(null), OBJECT_RESOLVE_TIMEOUT_MS)
    const finish = (value: any) => {
      clearTimeout(timer)
      done(value)
    }
    try {
      if (store.has(name)) return finish(store.get(name))
    } catch {
      /* not ready — fall through to the callback form */
    }
    try {
      store.get(name, finish)
    } catch {
      finish(null)
    }
  })
}

/**
 * Walk the operator list tracking the CTM so every painted image is reported with
 * the position and size it actually lands at on the page.
 */
async function extractImages(page: any, ops: OpsMap): Promise<ImageItem[]> {
  let operatorList: any
  try {
    operatorList = await page.getOperatorList()
  } catch {
    return []
  }

  let ctm = [1, 0, 0, 1, 0, 0]
  const stack: number[][] = []
  const placed: Array<{ name: string; x: number; y: number; width: number; height: number }> = []

  for (let i = 0; i < operatorList.fnArray.length; i++) {
    const fn = operatorList.fnArray[i]
    if (fn === ops.save) stack.push(ctm.slice())
    else if (fn === ops.restore) ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0]
    else if (fn === ops.transform) ctm = multiply(ctm, operatorList.argsArray[i])
    else if (fn === ops.paintImageXObject) {
      const name = operatorList.argsArray[i][0]
      if (typeof name !== 'string') continue
      const width = round(Math.abs(ctm[0]))
      const height = round(Math.abs(ctm[3]))
      if (width > MAX_DECODED_IMAGE_SIZE || height > MAX_DECODED_IMAGE_SIZE) continue
      placed.push({ name, x: round(ctm[4]), y: round(ctm[5]), width, height })
    }
  }

  // Each paint gets its own object id, so hash the pixels to recover identity.
  const hashes = new Map<string, string | null>()
  const images: ImageItem[] = []
  for (const item of placed) {
    if (!hashes.has(item.name)) {
      hashes.set(item.name, await hashImageObject(await resolveObject(page, item.name)))
    }
    const hash = hashes.get(item.name)
    if (!hash) continue
    images.push({ hash, x: item.x, y: item.y, width: item.width, height: item.height })
  }
  return images
}

/**
 * Pull text runs and painted images with their coordinates out of an already-opened
 * pdf.js document. Kept free of any pdf.js import so it runs unchanged in the browser
 * and in Node tests (which load the legacy build).
 */
export async function extractPages(
  doc: { numPages: number; getPage(n: number): Promise<any> },
  ops?: OpsMap,
): Promise<PageItems[]> {
  const pages: PageItems[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    const items: TextItem[] = []
    for (const raw of content.items as any[]) {
      if (typeof raw.str !== 'string') continue
      const t = raw.transform as number[]
      items.push({
        str: raw.str,
        x: round(t[4]),
        y: round(t[5]),
        width: round(raw.width ?? 0),
        height: round(raw.height ?? 0),
      })
    }
    const images = ops ? await extractImages(page, ops) : []
    pages.push({ pageNumber: n, items, images })
  }
  return pages
}

function round(n: number): number {
  return Math.round(n * 10) / 10
}
