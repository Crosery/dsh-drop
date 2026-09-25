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

import { formatDropBytes } from '../preview.ts'
import type { FolderLimit, FolderLimits } from '../contract.ts'

/** The message set one locale supplies. */
export interface Messages {
  /** Some files could not be staged; the rest were. */
  failed: (count: number) => string
  /** A folder crossed a copy limit and was not added. */
  folderOverLimit: (name: string, limit: FolderLimit, limits: FolderLimits) => string
  /** A folder held nothing that could be sent. */
  folderEmpty: (name: string) => string
  /** A folder could not be added for another reason. */
  folderFailed: (name: string) => string
  /** No session is open, so there is nothing to hold the files against. */
  noSession: string
  /** The composer under the drop is not taking files right now. */
  blocked: string
  /** A send was held back while attachments are still uploading. */
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

/** What each limit is called in a notice, with the configured value. */
const zhLimit = (limit: FolderLimit, limits: FolderLimits): string => {
  switch (limit) {
    case 'files': return `文件数超过 ${limits.maxFiles} 个（folderMaxFiles）`
    case 'bytes': return `总大小超过 ${formatDropBytes(limits.maxBytes)}（folderMaxBytes）`
    case 'file-bytes': return `其中有文件超过 ${formatDropBytes(limits.maxFileBytes)}（maxBytes）`
    case 'depth': return `层级深于 ${limits.maxDepth} 层（folderMaxDepth）`
  }
}

const enLimit = (limit: FolderLimit, limits: FolderLimits): string => {
  switch (limit) {
    case 'files': return `it holds more than ${limits.maxFiles} files (folderMaxFiles)`
    case 'bytes': return `it is larger than ${formatDropBytes(limits.maxBytes)} in total (folderMaxBytes)`
    case 'file-bytes': return `a file in it is larger than ${formatDropBytes(limits.maxFileBytes)} (maxBytes)`
    case 'depth': return `it nests deeper than ${limits.maxDepth} levels (folderMaxDepth)`
  }
}

const zh: Messages = {
  failed: (count) => count === 1 ? '有 1 个文件未能添加，请重试' : `有 ${count} 个文件未能添加，请重试`,
  folderOverLimit: (name, limit, limits) => `文件夹“${name}”未添加：${zhLimit(limit, limits)}`,
  folderEmpty: (name) => `文件夹“${name}”里没有可发送的文件`,
  folderFailed: (name) => `文件夹“${name}”未能添加，请重试`,
  noSession: '请先打开一个会话再拖入文件',
  blocked: '当前输入框暂不接收文件',
  waiting: (count) => `还有 ${count} 个附件在上传，请等上传完成再发送`,
  attachFailed: '未能把附件加入这条消息，请重试',
  overlayTitle: '拖入文件',
  overlayDesc: '图片作为附件发送，其他文件和文件夹在发送时附上 @ 路径',
  overlayLimits: (count, size) => `图片最多 ${count} 张，每张不超过 ${size}`,
  overlayBlockedTitle: '无法在这里添加文件',
  overlayNoSession: '请先打开一个会话',
  overlayBusy: '当前输入框暂不接收文件',
}

const en: Messages = {
  failed: (count) => count === 1 ? 'Could not add 1 file; try again' : `Could not add ${count} files; try again`,
  folderOverLimit: (name, limit, limits) => `Folder “${name}” was not added: ${enLimit(limit, limits)}`,
  folderEmpty: (name) => `Folder “${name}” has no files that can be sent`,
  folderFailed: (name) => `Could not add folder “${name}”; try again`,
  noSession: 'Open a session before dropping files',
  blocked: 'This composer is not taking files right now',
  waiting: (count) => count === 1
    ? 'Waiting for 1 upload to finish; send again when it is done'
    : `Waiting for ${count} uploads to finish; send again when they are done`,
  attachFailed: 'Could not add the attachments to this message; try again',
  overlayTitle: 'Drop files here',
  overlayDesc: 'Images attach as images; other files and folders are sent as @ paths',
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
