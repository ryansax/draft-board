import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { extractPages } from './extract'
import type { PageItems } from './types'

/** The operator codes `extractPages` needs to find painted badge glyphs. */
const OPS = {
  save: pdfjs.OPS.save,
  restore: pdfjs.OPS.restore,
  transform: pdfjs.OPS.transform,
  paintImageXObject: pdfjs.OPS.paintImageXObject,
}

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

async function open(data: ArrayBuffer) {
  return pdfjs.getDocument({ data: new Uint8Array(data), useSystemFonts: true }).promise
}

export async function extractPagesFromPdf(data: ArrayBuffer): Promise<PageItems[]> {
  const doc = await open(data)
  try {
    return await extractPages(doc, OPS)
  } finally {
    await doc.destroy()
  }
}

/** Render each page to a PNG data URL, for the optional AI badge pass (section 4.3). */
export async function renderPagesToPng(data: ArrayBuffer, scale = 2): Promise<string[]> {
  const doc = await open(data)
  try {
    const out: string[] = []
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext('2d')!
      await page.render({ canvas, canvasContext: context, viewport }).promise
      out.push(canvas.toDataURL('image/png'))
    }
    return out
  } finally {
    await doc.destroy()
  }
}
