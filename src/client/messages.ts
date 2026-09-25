/**
 * Notice and overlay copy.
 *
 * Not registered with `ctx.locale`: these strings surface through
 * `SessionInput.notify`, a toast, or the plain-DOM drop overlay, none of which
 * takes a namespace key, so a dictionary registration would add a service
 * dependency without adding a capability. Two locales, matching the shipped
 * dictionaries.
 * @module @crosery/dsh-drop/client/messages
 */

/** The message set one locale supplies. */
export interface Messages {
  /** Some files could not be staged; the rest were. */
  failed: (count: number) => string
  /** Directories were part of the drop and were skipped. */
  directories: string
  /** No session is open, so there is nothing to hold the files against. */
  noSession: string
  /** The composer under the drop is not taking files right now. */
  blocked: string
  /** A send was held back while files are still being prepared. */
  waiting: (count: number) => string
  /** The staged mentions could not be added to the outgoing message. */
  attachFailed: string
  /** Overlay: the invitation. */
  overlayTitle: string
  /** Overlay: what happens to each kind of file. */
  overlayDesc: string
  /** Overlay: the image limits the composer enforces. */
  overlayLimits: (count: number, size: string) => string
  /** Overlay: the composer under the pointer refuses the drop. */
  overlayBlockedTitle: string
  /** Overlay: why, when there is no session at all. */
  overlayNoSession: string
  /** Overlay: why, when the composer is busy or read-only. */
  overlayBusy: string
}

const zh: Messages = {
  failed: (count) => count === 1 ? '有 1 个文件未能添加，请重试' : `有 ${count} 个文件未能添加，请重试`,
  directories: '暂不支持文件夹，已跳过',
  noSession: '请先打开一个会话再拖入文件',
  blocked: '当前输入框暂不接收文件',
  waiting: (count) => count === 1 ? '还有 1 个文件在准备中，请稍候再发送' : `还有 ${count} 个文件在准备中，请稍候再发送`,
  attachFailed: '未能把附件加入这条消息，请重试',
  overlayTitle: '拖入文件',
  overlayDesc: '图片作为附件发送，其他文件在发送时附上 @ 路径',
  overlayLimits: (count, size) => `图片最多 ${count} 张，每张不超过 ${size}`,
  overlayBlockedTitle: '无法在这里添加文件',
  overlayNoSession: '请先打开一个会话',
  overlayBusy: '当前输入框暂不接收文件',
}

const en: Messages = {
  failed: (count) => count === 1 ? 'Could not add 1 file; try again' : `Could not add ${count} files; try again`,
  directories: 'Folders are not supported yet and were skipped',
  noSession: 'Open a session before dropping files',
  blocked: 'This composer is not taking files right now',
  waiting: (count) => count === 1 ? '1 file is still being prepared; send again in a moment' : `${count} files are still being prepared; send again in a moment`,
  attachFailed: 'Could not add the attachments to this message; try again',
  overlayTitle: 'Drop files here',
  overlayDesc: 'Images attach as images; other files are sent as @ paths',
  overlayLimits: (count, size) => `Up to ${count} images, ${size} each`,
  overlayBlockedTitle: 'Files cannot be added here',
  overlayNoSession: 'Open a session first',
  overlayBusy: 'This composer is not taking files right now',
}

/**
 * Resolve the message set for the document language.
 * @returns the copy set, defaulting to Chinese.
 */
export function messages(): Messages {
  return document.documentElement.lang.toLowerCase().startsWith('en') ? en : zh
}
