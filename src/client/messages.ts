/**
 * Composer notice copy.
 *
 * Not registered with `ctx.locale`: these strings surface through
 * `SessionInput.notify`, which takes a rendered string rather than a namespace
 * key, so a dictionary registration would add a service dependency without
 * adding a capability. Two locales, matching the shipped dictionaries.
 * @module @crosery/dsh-drop/client/messages
 */

/** The message set one locale supplies. */
export interface Messages {
  /** One or more files staged and referenced. */
  added: (count: number) => string
  /** Every file failed to stage. */
  failed: string
  /** Directories were part of the drop and were skipped. */
  directories: string
  /** No session is current, so there is no draft to write into. */
  noSession: string
}

const zh: Messages = {
  added: (count) => count === 1 ? '已插入 1 个文件引用' : `已插入 ${count} 个文件引用`,
  failed: '文件暂存失败，请重试',
  directories: '文件夹暂不支持，已跳过',
  noSession: '请先打开一个会话再拖入文件',
}

const en: Messages = {
  added: (count) => count === 1 ? 'Inserted 1 file reference' : `Inserted ${count} file references`,
  failed: 'Could not stage the dropped file',
  directories: 'Folders are not supported yet and were skipped',
  noSession: 'Open a session before dropping files',
}

/**
 * Resolve the message set for the document language.
 * @returns the copy set, defaulting to Chinese.
 */
export function messages(): Messages {
  return document.documentElement.lang.toLowerCase().startsWith('en') ? en : zh
}
