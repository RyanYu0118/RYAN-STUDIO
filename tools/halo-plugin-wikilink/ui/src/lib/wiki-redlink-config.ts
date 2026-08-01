/** 与 rs-config.js redlinks 段对齐；编辑器内可读取 window.RSConfig */
export type RedlinkRuntimeConfig = {
  defaultCategory: string
  defaultTags: string[]
  postOwner: string
  slugPrefix: string
  skipConfirm: boolean
}

const FALLBACK: RedlinkRuntimeConfig = {
  defaultCategory: 'category-f8bm8yzr',
  defaultTags: ['tag-sqmsuywx'],
  postOwner: 'ryanyu',
  slugPrefix: '',
  skipConfirm: true,
}

export function getRedlinkConfig(): RedlinkRuntimeConfig {
  const rs = (window as Window & { RSConfig?: { redlinks?: Partial<RedlinkRuntimeConfig> } })
    .RSConfig?.redlinks
  if (!rs) return { ...FALLBACK }
  return {
    defaultCategory: rs.defaultCategory ?? FALLBACK.defaultCategory,
    defaultTags: rs.defaultTags?.length ? rs.defaultTags.slice() : FALLBACK.defaultTags.slice(),
    postOwner: rs.postOwner ?? FALLBACK.postOwner,
    slugPrefix: rs.slugPrefix ?? FALLBACK.slugPrefix,
    skipConfirm: rs.skipConfirm === true,
  }
}
