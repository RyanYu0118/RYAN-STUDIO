import { ExtensionLink } from '@halo-dev/richtext-editor'

/** 编辑页禁用 Link 一点即 window.open，避免红链 404；由 Ctrl+点击 / 打开链接 负责跳转 */
export const WikiEditorLinkOpenPatch = ExtensionLink.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      openOnClick: false,
    }
  },
})
