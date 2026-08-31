/** Visible product name. Replaces DSH / DeepSeek Harness in chrome. */
export const OPUTE_PRODUCT_TITLE = 'Opute'

/** House mark from platform.opute.io marketing; currentColor for DSH themes. */
export const OPUTE_MARK_PATH = 'M12 2L2 12H5V22H19V12H22L12 2Z'

/** Browser titles DSH bakes at build time or via locale fallback. */
export const DSH_PRODUCT_TITLES = Object.freeze([
  'DeepSeek Harness',
  'DSH Local Build',
  'DSH 本地构建',
])

/** Visible DSH product copy the overlay rewrites. Model ids are not in this list. */
export const BRANDED_COPY = Object.freeze([
  ['DeepSeek Harness', OPUTE_PRODUCT_TITLE],
  ['DSH Local Build', OPUTE_PRODUCT_TITLE],
  ['DSH 本地构建', OPUTE_PRODUCT_TITLE],
  ['Into the Unknown', OPUTE_PRODUCT_TITLE],
  ['探索未至之境', OPUTE_PRODUCT_TITLE],
])

/**
 * Rewrite a document title whose product suffix is a DSH name.
 * @param {string} title
 * @param {string} [product]
 */
export function rewriteProductTitle(title, product = OPUTE_PRODUCT_TITLE) {
  const current = typeof title === 'string' ? title : ''
  for (const suffix of DSH_PRODUCT_TITLES) {
    if (current === suffix) return product
    const tail = ` — ${suffix}`
    if (current.endsWith(tail)) return `${current.slice(0, -tail.length)} — ${product}`
  }
  return current
}

/**
 * Replace DSH product phrases in a text node. Skips model ids such as
 * `deepseek/deepseek-chat` because those are catalog routes, not chrome.
 * @param {string} text
 */
export function replaceBrandedCopy(text) {
  if (typeof text !== 'string' || text === '') return text
  let next = text
  for (const [from, to] of BRANDED_COPY) {
    if (next.includes(from)) next = next.split(from).join(to)
  }
  return next
}

export function oputeFaviconSvg() {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">',
    '<style>@media (prefers-color-scheme: dark) { path { fill: #fff; } }</style>',
    `<path d="${OPUTE_MARK_PATH}" fill="#000"/>`,
    '</svg>',
  ].join('')
}

export function oputeFaviconHref() {
  return `data:image/svg+xml,${encodeURIComponent(oputeFaviconSvg())}`
}
