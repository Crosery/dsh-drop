/**
 * Preview-rail copy.
 *
 * Registered with `ctx.locale` rather than resolved from `document.lang` the
 * way `messages.ts` does it: composer notices take a rendered string, but a
 * slot entry declaring `locale:` receives the framework's `t` seat, which
 * follows a locale switch without a remount. The two dictionaries must carry
 * identical key sets — the locale service rejects a namespace whose locales
 * disagree.
 * @module @crosery/dsh-drop/client/locales
 */

/**
 * Namespace owning this plugin's copy.
 *
 * Scoped like every other name this package publishes: a bare `drop` would sit
 * in the same flat namespace table as the shipped dictionaries and collide
 * with the next plugin that has a drop surface.
 */
export const DROP_NS = 'crosery.drop'

/** Dictionary key domain of this plugin's namespace. */
export type DropKey =
  | 'rail.label'
  | 'kind.image' | 'kind.video' | 'kind.audio' | 'kind.pdf'
  | 'kind.document' | 'kind.text' | 'kind.archive' | 'kind.file'
  | 'action.remove' | 'action.open' | 'action.close' | 'action.openTab'
  | 'action.scrollLeft' | 'action.scrollRight'
  | 'state.noPreview' | 'state.reloaded' | 'state.binary'
  | 'media.noVideo' | 'media.noAudio'

/** Simplified Chinese copy. */
export const zh: Record<DropKey, string> = {
  'rail.label': '待发送的附件',
  'kind.image': '图片',
  'kind.video': '视频',
  'kind.audio': '音频',
  'kind.pdf': 'PDF',
  'kind.document': '文档',
  'kind.text': '文本',
  'kind.archive': '压缩包',
  'kind.file': '文件',
  'action.remove': '移除 {name}',
  'action.open': '预览 {name}',
  'action.close': '关闭预览',
  'action.openTab': '在新标签打开',
  'action.scrollLeft': '向前查看',
  'action.scrollRight': '向后查看',
  'state.noPreview': '该格式无法在页面内预览',
  'state.reloaded': '页面已刷新，预览内容不可用',
  'state.binary': '二进制内容，不作文本预览',
  'media.noVideo': '当前浏览器无法播放该视频格式',
  'media.noAudio': '当前浏览器无法播放该音频格式',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The preview rail's copy. */
    'crosery.drop': DropKey
  }
}

/** English copy. */
export const en: Record<DropKey, string> = {
  'rail.label': 'Attachments to send',
  'kind.image': 'Image',
  'kind.video': 'Video',
  'kind.audio': 'Audio',
  'kind.pdf': 'PDF',
  'kind.document': 'Document',
  'kind.text': 'Text',
  'kind.archive': 'Archive',
  'kind.file': 'File',
  'action.remove': 'Remove {name}',
  'action.open': 'Preview {name}',
  'action.close': 'Close preview',
  'action.openTab': 'Open in a new tab',
  'action.scrollLeft': 'Scroll back',
  'action.scrollRight': 'Scroll forward',
  'state.noPreview': 'This format cannot be previewed in the page',
  'state.reloaded': 'The page reloaded; preview content is unavailable',
  'state.binary': 'Binary content, not shown as text',
  'media.noVideo': 'This browser cannot play that video format',
  'media.noAudio': 'This browser cannot play that audio format',
}
