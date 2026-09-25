window.__ModuleLoader__.load({ id: "@crosery/dsh-drop", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  AttachedFiles: () => AttachedFiles,
  DROP_NS: () => DROP_NS,
  DropLightbox: () => DropLightbox,
  DropRail: () => DropRail,
  PreviewStore: () => PreviewStore,
  RailRegistry: () => RailRegistry,
  acceptsSubmission: () => acceptsSubmission,
  acquire: () => acquire,
  appendMentions: () => appendMentions,
  appendSpan: () => appendSpan,
  apply: () => apply,
  bridgePath: () => bridgePath,
  claimsTransfer: () => claimsTransfer2,
  claimsTransferShape: () => claimsTransfer,
  composeSubmission: () => composeSubmission,
  composerFace: () => composerFace,
  createOverlay: () => createOverlay,
  createToast: () => createToast,
  detectEnd: () => detectEnd,
  dropKindOf: () => dropKindOf,
  en: () => en2,
  extensionOf: () => extensionOf,
  fileNameOf: () => fileNameOf,
  formatDropBytes: () => formatDropBytes,
  freshFiles: () => freshFiles,
  hintFor: () => hintFor,
  hostPathBridge: () => hostPathBridge,
  insertedSpan: () => insertedSpan,
  installDropStyles: () => installDropStyles,
  installPreviewRail: () => installPreviewRail,
  installReferenceFit: () => installReferenceFit,
  installSubmitGuard: () => installSubmitGuard,
  isLexicalSendKey: () => isLexicalSendKey,
  isSendKey: () => isSendKey,
  kindBadge: () => kindBadge,
  lexicalEnterVerdict: () => lexicalEnterVerdict,
  looksBinary: () => looksBinary,
  mediaTypeFor: () => mediaTypeFor,
  mentionBlock: () => mentionBlock,
  mentionFor: () => mentionFor,
  messages: () => messages,
  name: () => name,
  pasteTextIsFileNames: () => pasteTextIsFileNames,
  planDrop: () => planDrop,
  primaryRoleOf: () => primaryRoleOf,
  readEntries: () => readEntries,
  readHints: () => readHints,
  sendButtonVerdict: () => sendButtonVerdict,
  sendObserved: () => sendObserved,
  snapshotOf: () => snapshotOf,
  uriListPaths: () => uriListPaths,
  usePreviewText: () => usePreviewText,
  withdrawMentions: () => withdrawMentions,
  zh: () => zh2
});
module.exports = __toCommonJS(index_exports);

// src/contract.ts
var STAGE_ROUTE = "/crosery/dsh-drop/stage";
var RESOLVE_ROUTE = "/crosery/dsh-drop/resolve";
var NAME_HEADER = "x-dsh-drop-name";
var DEFAULT_MAX_BYTES = 512 * 1024 * 1024;
var DEFAULT_FOLDER_IGNORE = Object.freeze([
  ".git",
  "node_modules",
  ".DS_Store",
  "Thumbs.db",
  "__MACOSX",
  ".svn",
  ".hg"
]);
var COMPOSER_IMAGE_MEDIA_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif"
];
function isComposerImageType(mediaType) {
  return COMPOSER_IMAGE_MEDIA_TYPES.includes(mediaType);
}
function claimsTransfer(shape) {
  if (!shape.types.includes("Files")) return false;
  return shape.fileItems > 0 || shape.files > 0;
}
function planDrop(entries) {
  const plan = { images: [], staged: [], folders: [] };
  for (const entry of entries) {
    if (entry.isDirectory) {
      plan.folders.push(entry);
      continue;
    }
    if (entry.file === null) continue;
    if (isComposerImageType(entry.file.type)) plan.images.push(entry.file);
    else plan.staged.push({ file: entry.file, path: entry.path === "" ? void 0 : entry.path });
  }
  return plan;
}
function sameFile(a, b) {
  return a.name === b.name && a.size === b.size && (a.lastModified ?? 0) === (b.lastModified ?? 0);
}
function freshFiles(present, incoming) {
  const kept = [];
  for (const file of incoming) {
    if (present.some((other) => sameFile(other, file))) continue;
    if (kept.some((other) => sameFile(other, file))) continue;
    kept.push(file);
  }
  return kept;
}
function pasteTextIsFileNames(text, names) {
  const lines = text.split(/\r\n|\r|\n/).map((line) => line.trim()).filter((line) => line !== "");
  if (lines.length === 0) return true;
  return lines.every((line) => {
    if (names.includes(line)) return true;
    const path = pathFromFileUrl(line);
    return path !== void 0 && names.includes(fileNameOf(path));
  });
}
var UNMENTIONABLE = /[\u0000-\u001F\u007F-\u009F"]/u;
function pathFromFileUrl(url) {
  if (!/^file:\/\//i.test(url)) return void 0;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return void 0;
  }
  if (parsed.hostname !== "" && parsed.hostname !== "localhost") return void 0;
  try {
    const path = decodeURIComponent(parsed.pathname);
    return path === "" ? void 0 : path;
  } catch {
    return void 0;
  }
}
function uriListPaths(text) {
  const paths = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const path = pathFromFileUrl(trimmed);
    if (path !== void 0) paths.push(path);
  }
  return paths;
}
function mentionFor(path, kind = "file") {
  const target = kind === "directory" && !/[\\/]$/.test(path) ? `${path}/` : path;
  if (UNMENTIONABLE.test(target)) return void 0;
  if (!/\s/u.test(target)) return `@${target}`;
  return `@"${target}"`;
}
function fileNameOf(path) {
  const trimmed = path.replace(/[\\/]+$/, "");
  const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  const name2 = cut < 0 ? trimmed : trimmed.slice(cut + 1);
  return name2 === "" ? path : name2;
}

// src/client/messages.ts
var zh = {
  failed: (count) => count === 1 ? "\u6709 1 \u4E2A\u6587\u4EF6\u672A\u80FD\u6DFB\u52A0\uFF0C\u8BF7\u91CD\u8BD5" : `\u6709 ${count} \u4E2A\u6587\u4EF6\u672A\u80FD\u6DFB\u52A0\uFF0C\u8BF7\u91CD\u8BD5`,
  directories: "\u6682\u4E0D\u652F\u6301\u6587\u4EF6\u5939\uFF0C\u5DF2\u8DF3\u8FC7",
  noSession: "\u8BF7\u5148\u6253\u5F00\u4E00\u4E2A\u4F1A\u8BDD\u518D\u62D6\u5165\u6587\u4EF6",
  blocked: "\u5F53\u524D\u8F93\u5165\u6846\u6682\u4E0D\u63A5\u6536\u6587\u4EF6",
  waiting: (count) => count === 1 ? "\u8FD8\u6709 1 \u4E2A\u6587\u4EF6\u5728\u51C6\u5907\u4E2D\uFF0C\u8BF7\u7A0D\u5019\u518D\u53D1\u9001" : `\u8FD8\u6709 ${count} \u4E2A\u6587\u4EF6\u5728\u51C6\u5907\u4E2D\uFF0C\u8BF7\u7A0D\u5019\u518D\u53D1\u9001`,
  attachFailed: "\u672A\u80FD\u628A\u9644\u4EF6\u52A0\u5165\u8FD9\u6761\u6D88\u606F\uFF0C\u8BF7\u91CD\u8BD5",
  overlayTitle: "\u62D6\u5165\u6587\u4EF6",
  overlayDesc: "\u56FE\u7247\u4F5C\u4E3A\u9644\u4EF6\u53D1\u9001\uFF0C\u5176\u4ED6\u6587\u4EF6\u5728\u53D1\u9001\u65F6\u9644\u4E0A @ \u8DEF\u5F84",
  overlayLimits: (count, size) => `\u56FE\u7247\u6700\u591A ${count} \u5F20\uFF0C\u6BCF\u5F20\u4E0D\u8D85\u8FC7 ${size}`,
  overlayBlockedTitle: "\u65E0\u6CD5\u5728\u8FD9\u91CC\u6DFB\u52A0\u6587\u4EF6",
  overlayNoSession: "\u8BF7\u5148\u6253\u5F00\u4E00\u4E2A\u4F1A\u8BDD",
  overlayBusy: "\u5F53\u524D\u8F93\u5165\u6846\u6682\u4E0D\u63A5\u6536\u6587\u4EF6"
};
var en = {
  failed: (count) => count === 1 ? "Could not add 1 file; try again" : `Could not add ${count} files; try again`,
  directories: "Folders are not supported yet and were skipped",
  noSession: "Open a session before dropping files",
  blocked: "This composer is not taking files right now",
  waiting: (count) => count === 1 ? "1 file is still being prepared; send again in a moment" : `${count} files are still being prepared; send again in a moment`,
  attachFailed: "Could not add the attachments to this message; try again",
  overlayTitle: "Drop files here",
  overlayDesc: "Images attach as images; other files are sent as @ paths",
  overlayLimits: (count, size) => `Up to ${count} images, ${size} each`,
  overlayBlockedTitle: "Files cannot be added here",
  overlayNoSession: "Open a session first",
  overlayBusy: "This composer is not taking files right now"
};
function messages() {
  return document.documentElement.lang.toLowerCase().startsWith("en") ? en : zh;
}

// src/client/overlay.ts
var STYLE_ID = "@crosery/dsh-drop/overlay.css";
var CSS = `
.dsh-drop-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.32));
  backdrop-filter: var(--dsw-mask-blur, blur(2px));
}
.dsh-drop-overlay-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  max-width: min(440px, calc(100vw - 48px));
  padding: 20px 28px;
  border-radius: 16px;
  border: 2px dashed var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.6));
  background: var(--dsw-specific-input-major, Canvas);
  color: var(--dsw-alias-label-primary, CanvasText);
  box-shadow: var(--dsw-shadow-lv2, 0 8px 32px rgba(0, 0, 0, 0.18));
  font-size: 14px;
  line-height: 20px;
  text-align: center;
}
.dsh-drop-overlay[data-blocked] .dsh-drop-overlay-card {
  border-color: var(--dsw-alias-state-error-primary, #d33);
}
.dsh-drop-overlay-title { font-size: 16px; font-weight: 600; }
.dsh-drop-overlay-desc,
.dsh-drop-overlay-limits { color: var(--dsw-alias-label-secondary, inherit); }
.dsh-drop-overlay-limits { font-size: 12px; }
@media (prefers-reduced-motion: no-preference) {
  .dsh-drop-overlay { animation: dsh-drop-fade 120ms ease-out; }
  @keyframes dsh-drop-fade { from { opacity: 0 } to { opacity: 1 } }
}
`;
function installStyles() {
  const selector = `style[data-plugin-css=${JSON.stringify(STYLE_ID)}]`;
  if (document.querySelector(selector) !== null) return;
  const tag = document.createElement("style");
  tag.dataset.plugin = "@crosery/dsh-drop";
  tag.dataset.pluginCss = STYLE_ID;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}
function linesFor(state) {
  const copy = messages();
  if (state.blocked) {
    return [copy.overlayBlockedTitle, state.noSession ? copy.overlayNoSession : copy.overlayBusy, ""];
  }
  const limits = state.limits === void 0 ? "" : copy.overlayLimits(state.limits.count, state.limits.size);
  return [copy.overlayTitle, copy.overlayDesc, limits];
}
function createOverlay() {
  let element;
  let shown = "";
  const hide = () => {
    element?.remove();
    element = void 0;
    shown = "";
  };
  return {
    show(state) {
      const lines = linesFor(state);
      const signature = `${String(state.blocked)}|${lines.join("|")}`;
      if (element !== void 0 && signature === shown) return;
      installStyles();
      if (element === void 0) {
        element = document.createElement("div");
        element.className = "dsh-drop-overlay";
        element.setAttribute("role", "status");
        document.body.appendChild(element);
      }
      element.toggleAttribute("data-blocked", state.blocked);
      const card = document.createElement("div");
      card.className = "dsh-drop-overlay-card";
      const [titleText, descText, limitsText] = lines;
      for (const [name2, text] of [["title", titleText], ["desc", descText], ["limits", limitsText]]) {
        if (text === "") continue;
        const line = document.createElement("div");
        line.className = `dsh-drop-overlay-${name2}`;
        line.textContent = text;
        card.append(line);
      }
      element.replaceChildren(card);
      shown = signature;
    },
    hide,
    dispose: hide
  };
}

// src/client/toast.ts
var STYLE_ID2 = "@crosery/dsh-drop/toast.css";
var VISIBLE_MS = 4e3;
var CSS2 = `
.dsh-drop-toast {
  position: fixed;
  left: 50%;
  bottom: 96px;
  z-index: 2147483001;
  max-width: min(480px, calc(100vw - 32px));
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.4));
  background: var(--dsw-specific-menu, Canvas);
  color: var(--dsw-alias-label-primary, CanvasText);
  box-shadow: var(--dsw-shadow-lv2, 0 8px 24px rgba(0, 0, 0, 0.18));
  font-size: 13px;
  line-height: 20px;
  transform: translateX(-50%);
  pointer-events: none;
}
`;
function createToast() {
  let element;
  let timer;
  const hide = () => {
    if (timer !== void 0) clearTimeout(timer);
    timer = void 0;
    element?.remove();
    element = void 0;
  };
  return {
    show(text) {
      const selector = `style[data-plugin-css=${JSON.stringify(STYLE_ID2)}]`;
      if (document.querySelector(selector) === null) {
        const tag = document.createElement("style");
        tag.dataset.plugin = "@crosery/dsh-drop";
        tag.dataset.pluginCss = STYLE_ID2;
        tag.textContent = CSS2;
        document.head.appendChild(tag);
      }
      hide();
      element = document.createElement("div");
      element.className = "dsh-drop-toast";
      element.setAttribute("role", "status");
      element.setAttribute("aria-live", "polite");
      element.textContent = text;
      document.body.appendChild(element);
      timer = setTimeout(hide, VISIBLE_MS);
    },
    dispose: hide
  };
}

// src/client/reference-fit.ts
var STYLE_ID3 = "@crosery/dsh-drop/reference-fit.css";
var CSS3 = `
[data-decoration="chip"] svg {
  width: 100%;
  height: auto;
}

[data-ref-chip] {
  /* inline-flex gives the bare file-name text node no box to truncate in. */
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  /* An overflow-hidden inline-block takes its margin edge as the baseline,
     which would drop the chip below the line it sits on. */
  vertical-align: bottom;
}
/* The shipped flex \`gap\` stops applying once the chip is not a flex box. */
[data-ref-chip] > svg {
  margin-right: 4px;
  vertical-align: -3px;
}
`;
function installReferenceFit() {
  const selector = `style[data-plugin-css=${JSON.stringify(STYLE_ID3)}]`;
  if (document.querySelector(selector) !== null) return () => {
  };
  const tag = document.createElement("style");
  tag.dataset.plugin = "@crosery/dsh-drop";
  tag.dataset.pluginCss = STYLE_ID3;
  tag.textContent = CSS3;
  document.head.appendChild(tag);
  return () => {
    tag.remove();
  };
}

// src/client/styles.ts
var STYLE_ID4 = "@crosery/dsh-drop/preview-rail.css";
var SHEET = `
/* The rail sits INSIDE the composer card, in the seat the shipped image rail
   used to hold \u2014 so it needs no surface of its own, only the same inset the
   shipped strip had. */
.dshdrop-rail-wrap {
  position: relative;
  min-width: 0;
  padding: 4px 12px 0;
}

.dshdrop-rail {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}
.dshdrop-rail::-webkit-scrollbar { display: none; }

.dshdrop-item {
  position: relative;
  flex: none;
  height: 64px;
}

/* A hidden scrollbar keeps the rail from reading as a form control, and leaves
   a clipped rail indistinguishable from a full one. These are the shipped
   attachment rail's edge circles, which is the convention this composer
   already teaches. */
.dshdrop-arrow {
  position: absolute;
  top: 50%;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--dsw-alias-border-l2-darkmode-thin);
  border-radius: 999px;
  background: var(--dsw-specific-input-major);
  color: var(--dsw-alias-label-secondary);
  box-shadow: var(--dsw-shadow-lv2);
  cursor: pointer;
  transform: translateY(-50%);
}
.dshdrop-arrowLeft { left: 4px; }
.dshdrop-arrowRight { right: 4px; }
.dshdrop-arrow:hover { color: var(--dsw-alias-label-primary); }
.dshdrop-arrow:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 1px;
}

/* The thumbnail card: identical box to the shipped draft-image rail, so a
   dropped GIF or video sits beside a dropped PNG as one row of peers. */
.dshdrop-thumb {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  padding: 0;
  border: 1px solid var(--dsw-alias-border-l2-darkmode-thin);
  border-radius: 16px;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
  cursor: zoom-in;
  overflow: hidden;
}
.dshdrop-thumb img,
.dshdrop-thumb video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* The identity card: a file with no visual preview still has a name, a format
   and a size, and those are what the user needs to confirm the right file is
   attached. */
.dshdrop-doc {
  display: flex;
  align-items: center;
  gap: 10px;
  box-sizing: border-box;
  width: max-content;
  min-width: 148px;
  max-width: 240px;
  height: 64px;
  padding: 0 12px 0 10px;
  border: 1px solid var(--dsw-alias-border-l2-darkmode-thin);
  border-radius: 16px;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.dshdrop-doc:hover { border-color: var(--dsw-alias-border-l2); }
/* Drawn as a page rather than given an icon: the extension IS the glyph, and
   a format badge stays legible at sizes where a bespoke pictogram would not. */
.dshdrop-glyph {
  position: relative;
  display: grid;
  place-items: center;
  flex: none;
  width: 34px;
  height: 42px;
  border: 1px solid var(--dsw-alias-border-l2, var(--dsw-alias-border-l1));
  border-radius: 5px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-tertiary);
}
/* The folded corner, cut from the page's own top-right. */
.dshdrop-glyph::before {
  content: "";
  position: absolute;
  top: -1px;
  right: -1px;
  width: 11px;
  height: 11px;
  border-left: 1px solid var(--dsw-alias-border-l2, var(--dsw-alias-border-l1));
  border-bottom: 1px solid var(--dsw-alias-border-l2, var(--dsw-alias-border-l1));
  border-bottom-left-radius: 4px;
  background: var(--dsw-alias-interactive-bg-hover);
}
.dshdrop-badge {
  max-width: 30px;
  overflow: hidden;
  font-size: 9px;
  font-weight: 600;
  line-height: 12px;
  letter-spacing: 0.02em;
  color: var(--dsw-alias-label-secondary);
}
.dshdrop-lines { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.dshdrop-name {
  font-size: 13px;
  line-height: 18px;
  color: var(--dsw-alias-label-primary);
  /* Two-line clamp keeps a long name readable without letting one card set
     the height of the whole rail. */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}
.dshdrop-meta {
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Play affordance over a video thumbnail: without it a paused first frame is
   indistinguishable from a still image. */
.dshdrop-play {
  position: absolute;
  right: 4px;
  bottom: 4px;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgb(0 0 0 / .55);
  color: #fff;
  pointer-events: none;
}

.dshdrop-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--dsw-alias-button-contrast-fill);
  color: var(--dsw-alias-label-primary-inverted);
  cursor: pointer;
  opacity: 0;
  transition: opacity .2s ease-in-out;
}
.dshdrop-item:hover .dshdrop-remove,
.dshdrop-remove:focus-visible { opacity: 1; }

/* A card whose file is still being prepared or uploaded: dimmed, with a
   moving edge so it reads as in progress rather than broken. */
.dshdrop-item[data-state="busy"] .dshdrop-doc,
.dshdrop-item[data-state="busy"] .dshdrop-thumb {
  opacity: .7;
  border-style: dashed;
}
@media (prefers-reduced-motion: no-preference) {
  .dshdrop-item[data-state="busy"] .dshdrop-doc,
  .dshdrop-item[data-state="busy"] .dshdrop-thumb { animation: dshdrop-pulse 1.2s ease-in-out infinite alternate; }
  @keyframes dshdrop-pulse { from { opacity: .55 } to { opacity: .85 } }
}
/* A failed upload keeps its card, tinted, with the composer's retry beside
   the remove control. */
.dshdrop-item[data-state="error"] .dshdrop-doc,
.dshdrop-item[data-state="error"] .dshdrop-thumb {
  border-color: var(--dsw-alias-state-error-primary);
}
.dshdrop-item[data-state="error"] .dshdrop-meta { color: var(--dsw-alias-state-error-primary); }
.dshdrop-retry {
  position: absolute;
  top: 4px;
  right: 26px;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--dsw-alias-button-contrast-fill);
  color: var(--dsw-alias-label-primary-inverted);
  cursor: pointer;
}
/* Touch surfaces have no hover, so the control has to stay put. */
@media (pointer: coarse) { .dshdrop-remove { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .dshdrop-remove { transition: none; } }

.dshdrop-thumb:focus-visible,
.dshdrop-doc:focus-visible,
.dshdrop-remove:focus-visible,
.dshdrop-retry:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 1px;
}

/* The expanded preview. Same layer, mask and dismissal shape as the shipped
   image lightbox, so opening a PDF feels like opening an image. */
.dshdrop-lightbox {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 12px;
  padding: 24px 24px 32px;
}
.dshdrop-mask {
  position: absolute;
  inset: 0;
  background: var(--dsw-alias-bg-mask-1);
  backdrop-filter: var(--dsw-mask-blur);
}
/* The header rides its own surface rather than sitting on the mask. That mask
   is a light scrim in the light theme, so text tinted for a dark backdrop
   would be white on near-white \u2014 unreadable, and unreadable differently per
   theme. On a surface it uses the ordinary label tokens and holds contrast in
   both. */
.dshdrop-head {
  position: relative;
  justify-self: center;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 100%;
  min-width: 0;
  padding: 6px 6px 6px 16px;
  border: 1px solid var(--dsw-alias-border-l2-darkmode-thin);
  border-radius: 999px;
  background: var(--dsw-specific-input-major);
  box-shadow: var(--dsw-shadow-lv2);
  color: var(--dsw-alias-label-primary);
}
.dshdrop-headName {
  min-width: 0;
  flex: auto;
  font-size: 14px;
  line-height: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dshdrop-headMeta {
  flex: none;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
.dshdrop-headAction {
  flex: none;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.dshdrop-headAction:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dshdrop-headAction:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 2px;
}
.dshdrop-stage {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 0;
}
.dshdrop-stageImage {
  max-width: 100%;
  max-height: 100%;
  border-radius: 12px;
  object-fit: contain;
  background: var(--dsw-specific-input-major);
}
.dshdrop-stageVideo {
  max-width: 100%;
  max-height: 100%;
  border-radius: 12px;
  background: #000;
}
.dshdrop-stageAudio { width: min(520px, 100%); }
/* A PDF frame must NOT be sandboxed: Chrome refuses to hand a sandboxed frame
   to its PDF viewer and renders a download prompt instead. */
.dshdrop-stageFrame {
  width: 100%;
  height: 100%;
  border: 0;
  border-radius: 12px;
  background: var(--dsw-alias-bg-base);
}
.dshdrop-stageText {
  box-sizing: border-box;
  width: min(920px, 100%);
  max-height: 100%;
  margin: 0;
  padding: 16px 20px;
  border-radius: 12px;
  background: var(--dsw-specific-input-major);
  color: var(--dsw-alias-label-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 20px;
  white-space: pre-wrap;
  word-break: break-word;
  overflow: auto;
}
.dshdrop-stageEmpty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 28px 32px;
  border-radius: 12px;
  background: var(--dsw-specific-input-major);
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 20px;
  text-align: center;
}
`;
function installDropStyles(ctx) {
  if (typeof document === "undefined") return;
  ctx.effect(() => {
    const selector = `style[data-plugin-css=${JSON.stringify(STYLE_ID4)}]`;
    const existing = document.querySelector(selector);
    if (existing !== null) return () => {
    };
    const tag = document.createElement("style");
    tag.dataset.plugin = "@crosery/dsh-drop";
    tag.dataset.pluginCss = STYLE_ID4;
    tag.textContent = SHEET;
    document.head.appendChild(tag);
    return () => {
      tag.remove();
    };
  }, "@crosery/dsh-drop: preview rail stylesheet");
}

// src/client/DropRail.tsx
var import_react3 = require("react");

// src/preview.ts
var KIND_BY_EXTENSION = {
  // Raster and vector images. The four the shipped composer accepts are here
  // too — a mixed drop hands those back to the shipped path, but a paste of a
  // lone SVG still lands on this table.
  png: "image",
  jpg: "image",
  jpeg: "image",
  jfif: "image",
  webp: "image",
  gif: "image",
  svg: "image",
  avif: "image",
  heic: "image",
  heif: "image",
  bmp: "image",
  ico: "image",
  tif: "image",
  tiff: "image",
  mp4: "video",
  webm: "video",
  mov: "video",
  m4v: "video",
  mkv: "video",
  avi: "video",
  ogv: "video",
  mpg: "video",
  mpeg: "video",
  mp3: "audio",
  wav: "audio",
  m4a: "audio",
  aac: "audio",
  flac: "audio",
  ogg: "audio",
  oga: "audio",
  opus: "audio",
  aiff: "audio",
  wma: "audio",
  pdf: "pdf",
  doc: "document",
  docx: "document",
  ppt: "document",
  pptx: "document",
  xls: "document",
  xlsx: "document",
  odt: "document",
  ods: "document",
  odp: "document",
  rtf: "document",
  pages: "document",
  numbers: "document",
  key: "document",
  epub: "document",
  md: "text",
  markdown: "text",
  mdx: "text",
  txt: "text",
  log: "text",
  csv: "text",
  tsv: "text",
  json: "text",
  jsonl: "text",
  yaml: "text",
  yml: "text",
  toml: "text",
  ini: "text",
  conf: "text",
  env: "text",
  xml: "text",
  html: "text",
  htm: "text",
  css: "text",
  scss: "text",
  less: "text",
  js: "text",
  mjs: "text",
  cjs: "text",
  jsx: "text",
  ts: "text",
  tsx: "text",
  vue: "text",
  svelte: "text",
  py: "text",
  rb: "text",
  go: "text",
  rs: "text",
  java: "text",
  kt: "text",
  swift: "text",
  c: "text",
  h: "text",
  cc: "text",
  cpp: "text",
  hpp: "text",
  cs: "text",
  php: "text",
  sh: "text",
  bash: "text",
  zsh: "text",
  fish: "text",
  sql: "text",
  graphql: "text",
  lua: "text",
  r: "text",
  pl: "text",
  patch: "text",
  diff: "text",
  zip: "archive",
  tar: "archive",
  gz: "archive",
  tgz: "archive",
  bz2: "archive",
  xz: "archive",
  rar: "archive",
  "7z": "archive",
  zst: "archive"
};
var KIND_BY_TYPE_PREFIX = [
  ["image/", "image"],
  ["video/", "video"],
  ["audio/", "audio"],
  ["text/", "text"]
];
var KIND_BY_TYPE = {
  "application/pdf": "pdf",
  "application/json": "text",
  "application/xml": "text",
  "application/zip": "archive",
  "application/gzip": "archive",
  "application/x-tar": "archive"
};
function extensionOf(name2) {
  const cut = Math.max(name2.lastIndexOf("/"), name2.lastIndexOf("\\"));
  const base = cut < 0 ? name2 : name2.slice(cut + 1);
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}
function dropKindOf(name2, mediaType = "") {
  const extension = extensionOf(name2);
  if (extension !== "" && Object.hasOwn(KIND_BY_EXTENSION, extension)) return KIND_BY_EXTENSION[extension];
  const type = mediaType.toLowerCase();
  if (Object.hasOwn(KIND_BY_TYPE, type)) return KIND_BY_TYPE[type];
  for (const [prefix, kind] of KIND_BY_TYPE_PREFIX) {
    if (type.startsWith(prefix)) return kind;
  }
  return "file";
}
var MIME_BY_EXTENSION = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jfif: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  tif: "image/tiff",
  tiff: "image/tiff",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  ogv: "video/ogg",
  mpg: "video/mpeg",
  mpeg: "video/mpeg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  aiff: "audio/aiff",
  pdf: "application/pdf"
};
function mediaTypeFor(name2, declared) {
  if (dropKindOf(name2, declared) === "pdf") return "application/pdf";
  if (declared !== "") return declared;
  const extension = extensionOf(name2);
  return extension !== "" && Object.hasOwn(MIME_BY_EXTENSION, extension) ? MIME_BY_EXTENSION[extension] : "";
}
function kindBadge(name2) {
  const extension = extensionOf(name2);
  return extension.length === 0 || extension.length > 5 ? "" : extension.toUpperCase();
}
function formatDropBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? String(Math.round(value)) : value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}
function looksBinary(sample) {
  return sample.includes("\0") || sample.includes("\uFFFD");
}

// src/client/send-plan.ts
var OPEN_PHASES = ["plain", "claimed"];
function acceptsSubmission(phase) {
  return phase !== void 0 && OPEN_PHASES.includes(phase);
}
function isLexicalSendKey(key, composing) {
  if (key.key !== "Enter") return false;
  if (key.altKey || key.altGraph) return false;
  if (key.ctrlKey && key.metaKey) return false;
  if (key.shiftKey) return false;
  if (key.isComposing || key.keyCode === 229 || composing) return false;
  if (key.repeat) return false;
  return true;
}
function lexicalEnterVerdict(key, composer) {
  if (!isLexicalSendKey(key, composer.composing)) return "pass";
  return stagedVerdict(composer, true);
}
function primaryRoleOf(isLastButton, hasRect, hasPath) {
  if (!isLastButton) return "other";
  if (hasRect) return "stop";
  return hasPath ? "send" : "other";
}
function sendButtonVerdict(role, enabled, running, composer) {
  if (role !== "send") return "pass";
  const verdict = stagedVerdict(composer, enabled);
  if (verdict !== "append" || enabled) return verdict;
  return running ? "pass" : "submit";
}
function stagedVerdict(composer, enabled) {
  if (composer.ready === 0 && composer.pending === 0) return "pass";
  if (composer.menuPick) return "pass";
  if (!composer.editable || !acceptsSubmission(composer.phase)) return "pass";
  if (composer.uploadsPending) return "pass";
  if (composer.pending > 0) return enabled ? "wait" : "pass";
  return "append";
}
function detectEnd(draft, occurrences) {
  let end = draft.length;
  for (const occurrence of occurrences) end -= occurrence.length - 1;
  return end;
}
function mentionBlock(draft, mentions) {
  if (mentions.length === 0) return "";
  const body = `${mentions.join("\n")} `;
  if (draft.trim() === "") return body;
  if (draft.endsWith("\n\n")) return body;
  if (draft.endsWith("\n")) return `
${body}`;
  return `

${body}`;
}
function appendSpan(draft, occurrences, draftRev) {
  const end = detectEnd(draft, occurrences);
  return { start: end, end, draftRev };
}
function insertedSpan(draft, occurrences, draftRev, inserted) {
  if (inserted === "" || !draft.endsWith(inserted)) return void 0;
  const end = detectEnd(draft, occurrences);
  return { start: end - inserted.length, end, draftRev };
}
function sendObserved(after, inserted) {
  if (after === void 0) return true;
  if (!acceptsSubmission(after.phase) && after.phase !== void 0) return true;
  return !after.draft.endsWith(inserted);
}

// src/client/composer-face.ts
function snapshotOf(raw) {
  if (typeof raw !== "object" || raw === null) return void 0;
  const draft = Reflect.get(raw, "draft");
  if (typeof draft !== "string") return void 0;
  const occurrences = Reflect.get(raw, "occurrences");
  const draftRev = Reflect.get(raw, "draftRev");
  const phase = Reflect.get(raw, "phase");
  return {
    draft,
    occurrences: Array.isArray(occurrences) ? occurrences.filter((occurrence) => typeof occurrence === "object" && occurrence !== null && typeof Reflect.get(occurrence, "length") === "number") : [],
    draftRev: typeof draftRev === "number" ? draftRev : void 0,
    phase: typeof phase === "string" ? phase : void 0
  };
}
function composerFace(parts) {
  return {
    sessionId: parts.sessionId,
    input: () => parts.input(),
    revision: () => {
      const actions = parts.actions();
      if (typeof actions?.captureInsertion === "function") {
        try {
          return actions.captureInsertion().draftRev;
        } catch {
        }
      }
      return parts.input()?.draftRev;
    },
    insert: (text, span) => {
      const actions = parts.actions();
      if (typeof actions?.insertText === "function") {
        try {
          return actions.insertText(text, span) === true;
        } catch {
          return false;
        }
      }
      const scope = parts.scope();
      if (typeof scope?.bail === "function") {
        try {
          return scope.bail(scope, "slash/input-insert-text", { text, span }) === true;
        } catch {
          return false;
        }
      }
      return false;
    },
    insertAtSelection: (text) => {
      const actions = parts.actions();
      if (typeof actions?.insertText !== "function" || typeof actions.captureInsertion !== "function") return false;
      try {
        return actions.insertText(text, actions.captureInsertion()) === true;
      } catch {
        return false;
      }
    },
    setDraft: (text) => {
      const actions = parts.actions();
      if (typeof actions?.setDraft !== "function") return false;
      actions.setDraft(text);
      return true;
    },
    submit: () => {
      const actions = parts.actions();
      if (typeof actions?.submit !== "function") return false;
      actions.submit();
      return true;
    },
    uploadsPending: () => parts.uploadsPending(),
    running: () => parts.running()
  };
}
function appendMentions(face, mentions) {
  if (mentions.length === 0) return void 0;
  const state = face.input();
  if (state === void 0) return void 0;
  const block = mentionBlock(state.draft, mentions);
  const rev = face.revision();
  if (rev !== void 0 && state.draftRev !== void 0 && state.draftRev !== rev) return void 0;
  if (rev !== void 0 && face.insert(block, appendSpan(state.draft, state.occurrences, rev))) {
    return { block, via: "insert" };
  }
  if (state.occurrences.length > 0) return void 0;
  return face.setDraft(state.draft + block) ? { block, via: "setDraft" } : void 0;
}
function withdrawMentions(face, appended) {
  const state = face.input();
  if (state === void 0) return false;
  if (!state.draft.endsWith(appended.block)) return true;
  if (appended.via === "insert") {
    const rev = face.revision() ?? state.draftRev;
    const span = rev === void 0 ? void 0 : insertedSpan(state.draft, state.occurrences, rev, appended.block);
    if (span !== void 0 && face.insert("", span)) return true;
  }
  if (state.occurrences.length > 0) return false;
  return face.setDraft(state.draft.slice(0, state.draft.length - appended.block.length));
}

// src/client/DropLightbox.tsx
var import_react = require("react");
var import_react_dom = require("react-dom");

// src/client/icons.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function Svg({ size = 16, children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 16 16",
      fill: "none",
      "aria-hidden": "true",
      focusable: "false",
      children
    }
  );
}
function CloseGlyph({ size }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Svg, { size, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4 4l8 8M12 4l-8 8", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round" }) });
}
function ChevronLeftGlyph({ size }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Svg, { size, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M10 3.5L5.5 8l4.5 4.5", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round" }) });
}
function ChevronRightGlyph({ size }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Svg, { size, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M6 3.5L10.5 8 6 12.5", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round" }) });
}
function PlayGlyph({ size }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Svg, { size, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M5 3.2v9.6a.6.6 0 00.9.5l7.4-4.8a.6.6 0 000-1L5.9 2.7a.6.6 0 00-.9.5z", fill: "currentColor" }) });
}
function RetryGlyph({ size }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Svg, { size, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "path",
    {
      d: "M13 8a5 5 0 11-1.46-3.54M13 3v2.6h-2.6",
      stroke: "currentColor",
      strokeWidth: "1.6",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }
  ) });
}

// src/client/DropLightbox.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function focusables(root) {
  return [...root.querySelectorAll('button, [href], video, audio, iframe, [tabindex]:not([tabindex="-1"])')].filter((element) => element.tabIndex !== -1);
}
function Stage({ asset, text, t }) {
  if (asset === void 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dshdrop-stageEmpty", children: t("state.reloaded") });
  }
  if (asset.url !== void 0) {
    if (asset.kind === "image") {
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("img", { className: "dshdrop-stageImage", src: asset.url, alt: asset.name });
    }
    if (asset.kind === "video") {
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("video", { className: "dshdrop-stageVideo", src: asset.url, controls: true, autoPlay: true, playsInline: true, children: t("media.noVideo") });
    }
    if (asset.kind === "audio") {
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("audio", { className: "dshdrop-stageAudio", src: asset.url, controls: true, children: t("media.noAudio") });
    }
    if (asset.kind === "pdf") {
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("iframe", { className: "dshdrop-stageFrame", src: asset.url, title: asset.name });
    }
  }
  if (asset.kind === "text") {
    if (text === void 0) return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dshdrop-stageEmpty", children: t("state.binary") });
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("pre", { className: "dshdrop-stageText", children: text });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dshdrop-stageEmpty", children: t("state.noPreview") });
}
function DropLightbox({ name: name2, asset, text, onClose, t }) {
  const dialogRef = (0, import_react.useRef)(null);
  const closeRef = (0, import_react.useRef)(null);
  const openerRef = (0, import_react.useRef)(null);
  (0, import_react.useEffect)(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (dialog === null) return;
      const stops = focusables(dialog);
      if (stops.length === 0) return;
      const first = stops[0];
      const last = stops[stops.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      openerRef.current?.focus();
    };
  }, [onClose]);
  const size = formatDropBytes(asset?.size ?? 0);
  return (0, import_react_dom.createPortal)(
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
      "div",
      {
        ref: dialogRef,
        className: "dshdrop-lightbox",
        role: "dialog",
        "aria-modal": "true",
        "aria-label": name2,
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dshdrop-mask", "aria-hidden": "true", onMouseDown: onClose }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshdrop-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dshdrop-headName", children: name2 }),
            size !== "" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dshdrop-headMeta", children: size }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "button",
              {
                ref: closeRef,
                type: "button",
                className: "dshdrop-headAction",
                "aria-label": t("action.close"),
                onClick: onClose,
                children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(CloseGlyph, { size: 16 })
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dshdrop-stage", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Stage, { asset, text, t }) })
        ]
      }
    ),
    document.body
  );
}
function usePreviewText(path, read) {
  const [text, setText] = (0, import_react.useState)(void 0);
  (0, import_react.useEffect)(() => {
    setText(void 0);
    if (path === null) return;
    let live = true;
    void read(path).then((value) => {
      if (live) setText(value);
    });
    return () => {
      live = false;
    };
  }, [path, read]);
  return text;
}

// src/client/use-rail-overflow.ts
var import_react2 = require("react");
var EPSILON = 1;
var MIN_STEP = 200;
var OVERLAP = 74;
function useRailOverflow(count) {
  const railRef = (0, import_react2.useRef)(null);
  const [edges, setEdges] = (0, import_react2.useState)({ start: false, end: false });
  const measure = (0, import_react2.useCallback)(() => {
    const rail = railRef.current;
    if (rail === null) return;
    const max = rail.scrollWidth - rail.clientWidth;
    setEdges({ start: rail.scrollLeft > EPSILON, end: rail.scrollLeft < max - EPSILON });
  }, []);
  const ref = (0, import_react2.useCallback)((element) => {
    railRef.current = element;
    measure();
  }, [measure]);
  (0, import_react2.useEffect)(() => {
    const rail = railRef.current;
    if (rail === null) return;
    measure();
    rail.addEventListener("scroll", measure, { passive: true });
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : void 0;
    observer?.observe(rail);
    return () => {
      rail.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, [measure, count]);
  const page = (0, import_react2.useCallback)((direction) => {
    const rail = railRef.current;
    if (rail === null) return;
    const step = Math.max(MIN_STEP, rail.clientWidth - OVERLAP);
    const smooth = typeof window.matchMedia === "function" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rail.scrollBy({ left: step * direction, behavior: smooth ? "smooth" : "auto" });
  }, []);
  return { ref, atStart: edges.start, atEnd: edges.end, page };
}

// src/client/DropRail.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
var KIND_LABEL = {
  image: "kind.image",
  video: "kind.video",
  audio: "kind.audio",
  pdf: "kind.pdf",
  document: "kind.document",
  text: "kind.text",
  archive: "kind.archive",
  file: "kind.file"
};
var THUMBNAIL_KINDS = ["image", "video"];
function seatKey(id) {
  return `seat:${id}`;
}
function Glyph({ name: name2 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dshdrop-glyph", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dshdrop-badge", children: kindBadge(name2) }) });
}
function statusOf(item, t) {
  if (item.row === "staged") {
    if (item.entry.status === "pending") return t("state.staging");
    if (item.entry.how === "in-place") return t("state.inPlace");
    if (item.entry.how === "copied") return t("state.copied");
    return "";
  }
  const upload = item.upload;
  if (upload === void 0 || upload.status === "ready") return "";
  if (upload.status === "error") return t("state.failed");
  const total = upload.total ?? item.size;
  const percent = total > 0 ? Math.min(100, Math.floor(upload.loaded / total * 100)) : 0;
  return t("state.uploading", { percent: `${percent}%` });
}
function Card({ item, url, onOpen, t }) {
  const size = item.row === "seat" ? item.size : item.entry.size ?? item.asset?.size ?? 0;
  const sizeText = formatDropBytes(size);
  const thumbnail = THUMBNAIL_KINDS.includes(item.kind) && url !== void 0;
  const status = statusOf(item, t);
  const busy = item.row === "staged" ? item.entry.status === "pending" : item.upload?.status === "uploading";
  const failed = item.row === "seat" && item.upload?.status === "error";
  const title = item.row === "staged" && item.entry.path !== void 0 ? item.entry.path : item.name;
  const meta = [t(KIND_LABEL[item.kind]), sizeText, status].filter((part) => part !== "").join(" \xB7 ");
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dshdrop-item", "data-state": failed ? "error" : busy ? "busy" : void 0, "aria-busy": busy || void 0, children: [
    thumbnail ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
      "button",
      {
        type: "button",
        className: "dshdrop-thumb",
        "aria-label": t("action.open", { name: item.name }),
        title,
        onClick: onOpen,
        children: [
          item.kind === "image" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("img", { src: url, alt: "" }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("video", { src: `${url ?? ""}#t=0.1`, muted: true, playsInline: true, preload: "metadata" }),
          item.kind === "video" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dshdrop-play", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(PlayGlyph, { size: 11 }) })
        ]
      }
    ) : /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
      "button",
      {
        type: "button",
        className: "dshdrop-doc",
        "aria-label": t("action.open", { name: item.name }),
        title,
        onClick: onOpen,
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Glyph, { name: item.name }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "dshdrop-lines", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dshdrop-name", children: item.name }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dshdrop-meta", children: meta })
          ] })
        ]
      }
    ),
    item.row === "seat" && item.retry !== void 0 && failed && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      "button",
      {
        type: "button",
        className: "dshdrop-retry",
        "aria-label": t("action.retry", { name: item.name }),
        title: item.upload?.status === "error" ? item.upload.message : void 0,
        onClick: item.retry,
        children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(RetryGlyph, { size: 12 })
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      "button",
      {
        type: "button",
        className: "dshdrop-remove",
        "aria-label": t("action.remove", { name: item.name }),
        onClick: item.remove,
        children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(CloseGlyph, { size: 10 })
      }
    )
  ] });
}
function DropRail(props) {
  const {
    attachments,
    canAcceptDrop,
    onAddImages,
    onAddFiles,
    onRemoveImage,
    onRemoveAttachment,
    uploads,
    onRetryFile,
    dropLimits,
    useSession,
    useInput,
    inputActions,
    sessionId,
    assetOf,
    putAsset,
    releaseAsset,
    textOf,
    register,
    access,
    onLegacyComposer,
    useAttached,
    detach,
    t
  } = props;
  const attached = useAttached((staged) => staged);
  const [open, setOpen] = (0, import_react3.useState)(null);
  const anchorRef = (0, import_react3.useRef)(null);
  const addFiles = onAddFiles ?? onAddImages;
  const removeAttachment = onRemoveAttachment ?? onRemoveImage;
  const rawInput = useInput((state) => state);
  const running = useSession?.((session) => session.running === true) ?? false;
  const uploadsPending = attachments.some(
    (attachment) => attachment.kind === "file" && uploads?.[attachment.id]?.status !== "ready"
  );
  const latest = (0, import_react3.useRef)({
    attachments,
    canAcceptDrop,
    dropLimits,
    addFiles,
    rawInput,
    running,
    uploadsPending,
    actions: inputActions
  });
  latest.current = {
    attachments,
    canAcceptDrop,
    dropLimits,
    addFiles,
    rawInput,
    running,
    uploadsPending,
    actions: inputActions
  };
  (0, import_react3.useEffect)(() => {
    const cardOf2 = () => anchorRef.current?.closest("[data-composer-card]") ?? null;
    const liveInput = () => {
      if (sessionId !== void 0) {
        const store = access.inputOf(sessionId)?.state;
        if (typeof store?.getSnapshot === "function") {
          const live = snapshotOf(store.getSnapshot());
          if (live !== void 0) return live;
        }
      }
      return snapshotOf(latest.current.rawInput);
    };
    const composer = sessionId === void 0 ? void 0 : composerFace({
      sessionId,
      input: liveInput,
      actions: () => latest.current.actions,
      scope: () => access.scopeOf(sessionId),
      uploadsPending: () => latest.current.uploadsPending,
      running: () => latest.current.running
    });
    const handle = {
      sessionId,
      contains: (target) => {
        const card2 = cardOf2();
        return card2 !== null && target instanceof Node && card2.contains(target);
      },
      canAcceptDrop: () => latest.current.canAcceptDrop ?? true,
      dropLimits: () => latest.current.dropLimits,
      addFiles: (files) => {
        const intake = latest.current.addFiles;
        if (intake === void 0) return;
        const fresh = freshFiles(latest.current.attachments.map((attachment) => attachment.file), files);
        if (fresh.length > 0) intake(fresh);
      },
      composer
    };
    const card = cardOf2();
    if (card !== null && card.querySelector("textarea") !== null && card.querySelector("[data-composer-input]") === null) {
      onLegacyComposer();
    }
    return register(handle);
  }, [register, access, sessionId, onLegacyComposer]);
  const seatKeys = (0, import_react3.useRef)(/* @__PURE__ */ new Set());
  (0, import_react3.useEffect)(() => {
    const live = new Set(attachments.filter((attachment) => attachment.previewUrl === void 0).map((attachment) => seatKey(attachment.id)));
    for (const key of seatKeys.current) if (!live.has(key)) releaseAsset(key);
    seatKeys.current = live;
  }, [attachments, releaseAsset]);
  (0, import_react3.useEffect)(() => () => {
    for (const key of seatKeys.current) releaseAsset(key);
    seatKeys.current = /* @__PURE__ */ new Set();
  }, [releaseAsset]);
  const items = (0, import_react3.useMemo)(() => {
    const drafts = attachments.map((attachment) => {
      const assetKey = attachment.previewUrl === void 0 ? seatKey(attachment.id) : void 0;
      if (assetKey !== void 0) putAsset(assetKey, attachment.file);
      const kind = attachment.kind === "file" ? dropKindOf(attachment.file.name, attachment.file.type) : attachment.previewUrl !== void 0 ? "image" : dropKindOf(attachment.file.name, attachment.file.type);
      return {
        row: "seat",
        key: `seat:${attachment.id}`,
        name: attachment.file.name,
        kind,
        url: attachment.previewUrl ?? (assetKey === void 0 ? void 0 : assetOf(assetKey)?.url),
        assetKey,
        size: attachment.file.size,
        upload: uploads?.[attachment.id],
        remove: () => {
          removeAttachment?.(attachment.id);
        },
        retry: onRetryFile === void 0 ? void 0 : () => {
          onRetryFile(attachment.id);
        }
      };
    });
    const staged = attached.map((entry) => {
      const asset = assetOf(entry.key);
      return {
        row: "staged",
        key: entry.key,
        entry,
        // The name the user dropped: a copy may have been suffixed on disk
        // (`notes-2.md`), and the card's tooltip carries the real path.
        name: entry.name === "" && entry.path !== void 0 ? fileNameOf(entry.path) : entry.name,
        kind: asset?.kind ?? dropKindOf(entry.name, ""),
        asset,
        // Drafts and staged files are held by different owners; a card only
        // knows it has a remove verb.
        remove: () => {
          detach(entry.id);
        }
      };
    });
    return [...drafts, ...staged];
  }, [attachments, attached, uploads, assetOf, putAsset, removeAttachment, onRetryFile, detach]);
  const overflow = useRailOverflow(items.length);
  const previewed = items.find((item) => item.key === open) ?? null;
  (0, import_react3.useEffect)(() => {
    if (open !== null && previewed === null) setOpen(null);
  }, [open, previewed]);
  const previewKey = previewed === null || previewed.kind !== "text" ? null : previewed.row === "staged" ? previewed.entry.key : previewed.assetKey ?? null;
  const previewText = usePreviewText(previewKey, textOf);
  const anchor = /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { ref: anchorRef, hidden: true, "data-dshdrop-rail": "" });
  if (items.length === 0) return anchor;
  const previewAsset = (item) => {
    if (item.row === "staged") return item.asset;
    if (item.assetKey !== void 0) return assetOf(item.assetKey);
    return { name: item.name, mediaType: "", size: item.size, kind: "image", url: item.url };
  };
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dshdrop-rail-wrap", children: [
    anchor,
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dshdrop-rail", ref: overflow.ref, role: "group", "aria-label": t("rail.label"), children: items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      Card,
      {
        item,
        url: item.row === "seat" ? item.url : item.asset?.url,
        onOpen: () => {
          setOpen(item.key);
        },
        t
      },
      item.key
    )) }),
    overflow.atStart && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      "button",
      {
        type: "button",
        className: "dshdrop-arrow dshdrop-arrowLeft",
        "aria-label": t("action.scrollLeft"),
        onClick: () => {
          overflow.page(-1);
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ChevronLeftGlyph, { size: 14 })
      }
    ),
    overflow.atEnd && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      "button",
      {
        type: "button",
        className: "dshdrop-arrow dshdrop-arrowRight",
        "aria-label": t("action.scrollRight"),
        onClick: () => {
          overflow.page(1);
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ChevronRightGlyph, { size: 14 })
      }
    ),
    previewed !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      DropLightbox,
      {
        name: previewed.name,
        asset: previewAsset(previewed),
        text: previewText,
        onClose: () => {
          setOpen(null);
        },
        t
      }
    )
  ] });
}

// src/client/locales.ts
var DROP_NS = "crosery.drop";
var zh2 = {
  "rail.label": "\u5F85\u53D1\u9001\u7684\u9644\u4EF6",
  "kind.image": "\u56FE\u7247",
  "kind.video": "\u89C6\u9891",
  "kind.audio": "\u97F3\u9891",
  "kind.pdf": "PDF",
  "kind.document": "\u6587\u6863",
  "kind.text": "\u6587\u672C",
  "kind.archive": "\u538B\u7F29\u5305",
  "kind.file": "\u6587\u4EF6",
  "action.remove": "\u79FB\u9664 {name}",
  "action.open": "\u9884\u89C8 {name}",
  "action.close": "\u5173\u95ED\u9884\u89C8",
  "action.openTab": "\u5728\u65B0\u6807\u7B7E\u6253\u5F00",
  "action.scrollLeft": "\u5411\u524D\u67E5\u770B",
  "action.scrollRight": "\u5411\u540E\u67E5\u770B",
  "action.retry": "\u91CD\u65B0\u4E0A\u4F20 {name}",
  "state.noPreview": "\u8BE5\u683C\u5F0F\u65E0\u6CD5\u5728\u9875\u9762\u5185\u9884\u89C8",
  "state.reloaded": "\u9875\u9762\u5DF2\u5237\u65B0\uFF0C\u9884\u89C8\u5185\u5BB9\u4E0D\u53EF\u7528",
  "state.binary": "\u4E8C\u8FDB\u5236\u5185\u5BB9\uFF0C\u4E0D\u4F5C\u6587\u672C\u9884\u89C8",
  "state.staging": "\u51C6\u5907\u4E2D\u2026",
  "state.uploading": "\u4E0A\u4F20\u4E2D {percent}",
  "state.failed": "\u4E0A\u4F20\u5931\u8D25",
  "state.inPlace": "\u5F15\u7528\u539F\u6587\u4EF6",
  "state.copied": "\u5DF2\u590D\u5236\u526F\u672C",
  "media.noVideo": "\u5F53\u524D\u6D4F\u89C8\u5668\u65E0\u6CD5\u64AD\u653E\u8BE5\u89C6\u9891\u683C\u5F0F",
  "media.noAudio": "\u5F53\u524D\u6D4F\u89C8\u5668\u65E0\u6CD5\u64AD\u653E\u8BE5\u97F3\u9891\u683C\u5F0F"
};
var en2 = {
  "rail.label": "Attachments to send",
  "kind.image": "Image",
  "kind.video": "Video",
  "kind.audio": "Audio",
  "kind.pdf": "PDF",
  "kind.document": "Document",
  "kind.text": "Text",
  "kind.archive": "Archive",
  "kind.file": "File",
  "action.remove": "Remove {name}",
  "action.open": "Preview {name}",
  "action.close": "Close preview",
  "action.openTab": "Open in a new tab",
  "action.scrollLeft": "Scroll back",
  "action.scrollRight": "Scroll forward",
  "action.retry": "Retry uploading {name}",
  "state.noPreview": "This format cannot be previewed in the page",
  "state.reloaded": "The page reloaded; preview content is unavailable",
  "state.binary": "Binary content, not shown as text",
  "state.staging": "Preparing\u2026",
  "state.uploading": "Uploading {percent}",
  "state.failed": "Upload failed",
  "state.inPlace": "Referenced in place",
  "state.copied": "Copied",
  "media.noVideo": "This browser cannot play that video format",
  "media.noAudio": "This browser cannot play that audio format"
};

// src/client/rail-entry.ts
var RAIL_PRIORITY = -1;
var EMPTY = Object.freeze([]);
function installPreviewRail(ctx, deps) {
  const { store, attached, registry, access, onLegacyComposer } = deps;
  const shared = {
    assetOf: (key) => store.get(key),
    putAsset: (key, file) => {
      store.put(key, file);
    },
    releaseAsset: (key) => {
      store.release(key);
    },
    textOf: (key) => store.text(key),
    register: (rail) => registry.register(rail),
    access,
    onLegacyComposer
  };
  ctx.inject(["slots", "locale"], (scoped) => {
    scoped.effect(
      () => scoped.locale.register(DROP_NS, { zh: zh2, en: en2 }),
      "@crosery/dsh-drop: rail dictionaries"
    );
    scoped.slots.inject("conversation.input.attachments", () => scoped.slots.register({
      name: "conversation.input.attachments",
      priority: RAIL_PRIORITY,
      locale: DROP_NS,
      // The staged list rides the `hooks` compartment, not a plain value: the
      // inject factory runs once when the entry materializes, so a value read
      // there would freeze at whatever was staged in that instant. A
      // `HostObservable` is bound into a `useAttached` selector hook instead,
      // and the rail re-renders on every drop and removal.
      //
      // `sessionId` arrives as the factory's parameter — the framework-resolved
      // session of this occurrence, `undefined` on a blank composer. Each
      // composer on the page gets its own occurrence, so a second composer
      // (the subagent sidebar) gets its own session here too.
      inject: (sessionId) => ({
        ...shared,
        sessionId,
        hooks: {
          attached: {
            getSnapshot: () => sessionId === void 0 ? EMPTY : attached.list(sessionId),
            subscribe: (fn) => attached.subscribe(fn)
          }
        },
        detach: (id) => {
          if (sessionId !== void 0) attached.remove(sessionId, id);
        }
      })
    }, DropRail));
  });
}

// src/client/attached.ts
var AttachedFiles = class _AttachedFiles {
  bySession = /* @__PURE__ */ new Map();
  listeners = /* @__PURE__ */ new Set();
  seq = 0;
  /**
   * Snapshot identity per session.
   *
   * `useSyncExternalStore` compares snapshots by reference and loops forever if
   * a fresh array comes back every read, so each session keeps one frozen array
   * that is replaced only on a real mutation.
   */
  snapshots = /* @__PURE__ */ new Map();
  /** The empty snapshot, shared so an untouched session is reference-stable. */
  static EMPTY = Object.freeze([]);
  /** Called once for every entry that leaves the store. */
  onRelease;
  /**
   * @param onRelease - called once for every entry that leaves the store, so
   *   the preview material behind it can be released.
   */
  constructor(onRelease = () => {
  }) {
    this.onRelease = onRelease;
  }
  /**
   * Stage one file for a session.
   *
   * A ready path already staged in the session is not staged twice: the
   * existing entry is returned instead, and no second card appears.
   * @param sessionId - the owning session.
   * @param input - the entry's fields; a bare string stages a ready path.
   * @returns the staged entry, or the existing one it duplicates.
   */
  add(sessionId, input) {
    const fields = typeof input === "string" ? { kind: "file", status: "ready", name: nameOf(input), path: input } : input;
    if (fields.status === "ready" && fields.path !== void 0) {
      const existing = this.findPath(sessionId, fields.path);
      if (existing !== void 0) return existing;
    }
    this.seq += 1;
    const entry = { ...fields, id: this.seq, key: `staged:${this.seq}` };
    const list = this.bySession.get(sessionId) ?? [];
    list.push(entry);
    this.bySession.set(sessionId, list);
    this.publish(sessionId);
    return entry;
  }
  /**
   * Change one entry, typically `pending` → `ready`.
   *
   * Becoming ready with a path another ready entry already holds removes this
   * entry instead: the reference is already staged.
   * @param sessionId - the owning session.
   * @param id - the entry's identity.
   * @param update - the fields to change.
   * @returns the entry now standing for the file, or undefined when it is gone.
   */
  update(sessionId, id, update) {
    const list = this.bySession.get(sessionId);
    const at = list?.findIndex((entry) => entry.id === id) ?? -1;
    if (list === void 0 || at < 0) return void 0;
    const next = { ...list[at], ...update };
    if (next.status === "ready" && next.path !== void 0) {
      const existing = this.findPath(sessionId, next.path, id);
      if (existing !== void 0) {
        this.remove(sessionId, id);
        return existing;
      }
    }
    list[at] = next;
    this.publish(sessionId);
    return next;
  }
  /**
   * Drop one staged file.
   * @param sessionId - the owning session.
   * @param id - the entry's identity.
   */
  remove(sessionId, id) {
    const list = this.bySession.get(sessionId);
    if (list === void 0) return;
    const gone = list.filter((entry) => entry.id === id);
    if (gone.length === 0) return;
    this.bySession.set(sessionId, list.filter((entry) => entry.id !== id));
    this.publish(sessionId);
    for (const entry of gone) this.onRelease(entry);
  }
  /**
   * Clear staged files after a send carried them out.
   *
   * Called only once the send is observed: the paths went out with that
   * message, and leaving them staged would silently attach them to the next
   * one too.
   * @param sessionId - the owning session.
   * @param ids - the entries that were sent; all of the session's when omitted.
   */
  clear(sessionId, ids) {
    const list = this.bySession.get(sessionId);
    if (list === void 0 || list.length === 0) return;
    const gone = ids === void 0 ? list : list.filter((entry) => ids.includes(entry.id));
    if (gone.length === 0) return;
    const kept = ids === void 0 ? [] : list.filter((entry) => !ids.includes(entry.id));
    if (kept.length === 0) this.bySession.delete(sessionId);
    else this.bySession.set(sessionId, kept);
    this.publish(sessionId);
    for (const entry of gone) this.onRelease(entry);
  }
  /**
   * Read one session's staged files.
   * @param sessionId - the owning session.
   * @returns a reference-stable snapshot, empty when nothing is staged.
   */
  list(sessionId) {
    return this.snapshots.get(sessionId) ?? _AttachedFiles.EMPTY;
  }
  /**
   * One session's entries by status.
   * @param sessionId - the owning session.
   * @param status - the status to select.
   * @returns the matching entries, in order.
   */
  withStatus(sessionId, status) {
    return this.list(sessionId).filter((entry) => entry.status === status);
  }
  /**
   * Subscribe to changes in any session's list.
   * @param listener - called after every mutation.
   * @returns the unsubscribe function.
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  /** A ready entry holding `path`, other than `except`. */
  findPath(sessionId, path, except) {
    return this.bySession.get(sessionId)?.find((entry) => entry.id !== except && entry.status === "ready" && entry.path === path);
  }
  /** Re-freeze one session's snapshot and notify subscribers. */
  publish(sessionId) {
    const list = this.bySession.get(sessionId);
    if (list === void 0 || list.length === 0) {
      this.snapshots.delete(sessionId);
    } else {
      this.snapshots.set(sessionId, Object.freeze([...list]));
    }
    for (const listener of this.listeners) listener();
  }
};
function nameOf(path) {
  const trimmed = path.replace(/[\\/]+$/, "");
  const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return cut < 0 ? trimmed : trimmed.slice(cut + 1);
}
function composeSubmission(draft, mentions) {
  if (mentions.length === 0) return draft;
  const joined = mentions.join("\n");
  const typed = draft.trim();
  return typed === "" ? joined : `${typed}

${joined}`;
}

// src/client/submit-guard.ts
function isSendKey(event) {
  if (event.key !== "Enter" || event.shiftKey) return false;
  if (event.isComposing || event.keyCode === 229) return false;
  return true;
}
function keyFacts(event) {
  return {
    key: event.key,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altGraph: typeof event.getModifierState === "function" && event.getModifierState("AltGraph"),
    isComposing: event.isComposing,
    keyCode: event.keyCode,
    repeat: event.repeat
  };
}
function readyMentions(entries) {
  const mentions = [];
  const ids = [];
  for (const entry of entries) {
    if (entry.status !== "ready" || entry.path === void 0) continue;
    const mention = mentionFor(entry.path, entry.kind);
    if (mention === void 0) continue;
    mentions.push(mention);
    ids.push(entry.id);
  }
  return { mentions, ids };
}
function cardOf(element) {
  return element.closest("[data-composer-card]");
}
function menuPick(card) {
  const selector = "[data-trigger-menu] [aria-activedescendant]";
  return (card?.querySelector(selector) ?? document.querySelector(selector)) !== null;
}
function primaryRole(button, card) {
  const buttons = card.querySelectorAll("button");
  const last = buttons.item(buttons.length - 1);
  const svg = button.querySelector(":scope > svg");
  return primaryRoleOf(last === button, svg?.querySelector("rect") != null, svg?.querySelector("path") != null);
}
function installSubmitGuard(deps) {
  const inFlight = /* @__PURE__ */ new Map();
  const factsFor = (input, card, composer) => {
    const entries = deps.staged(composer.sessionId);
    const editable = input instanceof HTMLElement && input.isContentEditable && input.getAttribute("aria-disabled") !== "true";
    return {
      composing: input?.hasAttribute("data-composer-composing") ?? false,
      menuPick: menuPick(card),
      editable,
      phase: composer.input()?.phase,
      ready: readyMentions(entries).mentions.length,
      pending: entries.filter((entry) => entry.status === "pending").length,
      uploadsPending: composer.uploadsPending()
    };
  };
  const judge = (composer, appended, ids) => {
    inFlight.set(composer.sessionId, appended);
    setTimeout(() => {
      inFlight.delete(composer.sessionId);
      if (sendObserved(composer.input(), appended.block)) {
        deps.onSent(composer.sessionId, ids);
        return;
      }
      withdrawMentions(composer, appended);
    }, 0);
  };
  const act = (verdict, composer) => {
    if (verdict === "pass") return false;
    const entries = deps.staged(composer.sessionId);
    if (verdict === "wait") {
      const pending = entries.filter((entry) => entry.status === "pending").length;
      deps.notify(composer.sessionId, "info", deps.copy().waiting(pending));
      return true;
    }
    if (inFlight.has(composer.sessionId)) return false;
    const { mentions, ids } = readyMentions(entries);
    const appended = appendMentions(composer, mentions);
    if (appended === void 0) {
      deps.notify(composer.sessionId, "error", deps.copy().attachFailed);
      return true;
    }
    if (verdict === "submit") composer.submit();
    judge(composer, appended, ids);
    return false;
  };
  const legacySend = (composer) => {
    const state = composer.input();
    if (!acceptsSubmission(state?.phase) || state === void 0) return false;
    const entries = deps.staged(composer.sessionId);
    const pending = entries.filter((entry) => entry.status === "pending").length;
    const { mentions, ids } = readyMentions(entries);
    if (mentions.length === 0 && pending === 0) return false;
    if (pending > 0) {
      deps.notify(composer.sessionId, "info", deps.copy().waiting(pending));
      return true;
    }
    if (!composer.setDraft(composeSubmission(state.draft, mentions))) return false;
    composer.submit();
    deps.onSent(composer.sessionId, ids);
    return true;
  };
  const stop = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const onKeyDown = (event) => {
    if (event.key !== "Enter") return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target instanceof HTMLTextAreaElement) {
      if (!isSendKey(event)) return;
      const card2 = cardOf(target);
      if (card2 === null || target.disabled || target.readOnly) return;
      if (card2.querySelector("[data-composer-input]") !== null) return;
      if (target.getAttribute("aria-expanded") === "true") return;
      const composer2 = deps.composerAt(target);
      if (composer2 !== void 0 && legacySend(composer2)) stop(event);
      return;
    }
    const input = target.closest("[data-composer-input]");
    if (input === null) return;
    const card = cardOf(input);
    const composer = deps.composerAt(input);
    if (composer === void 0) return;
    const verdict = lexicalEnterVerdict(keyFacts(event), factsFor(input, card, composer));
    if (act(verdict, composer)) stop(event);
  };
  const onClick = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest("button");
    const card = button === null ? null : cardOf(button);
    if (button === null || card === null) return;
    const role = primaryRole(button, card);
    if (role !== "send" || button.disabled) return;
    const composer = deps.composerAt(button);
    if (composer === void 0) return;
    const input = card.querySelector("[data-composer-input]");
    if (input === null) {
      if (legacySend(composer)) stop(event);
      return;
    }
    const verdict = sendButtonVerdict(role, true, composer.running(), factsFor(input, card, composer));
    if (act(verdict, composer)) stop(event);
  };
  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest("button");
    const card = button === null ? null : cardOf(button);
    if (button === null || card === null || !button.disabled) return;
    const input = card.querySelector("[data-composer-input]");
    if (input === null) return;
    const role = primaryRole(button, card);
    const composer = deps.composerAt(button);
    if (composer === void 0) return;
    const verdict = sendButtonVerdict(role, false, composer.running(), factsFor(input, card, composer));
    if (verdict === "pass") return;
    if (act(verdict, composer) || verdict === "submit") stop(event);
  };
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("pointerdown", onPointerDown, true);
  return () => {
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("pointerdown", onPointerDown, true);
  };
}

// src/client/preview-store.ts
var TEXT_SAMPLE_BYTES = 64 * 1024;
var RENDERABLE = ["image", "video", "audio", "pdf"];
var PreviewStore = class {
  assets = /* @__PURE__ */ new Map();
  files = /* @__PURE__ */ new Map();
  texts = /* @__PURE__ */ new Map();
  urls = /* @__PURE__ */ new Set();
  disposed = false;
  /**
   * Record one file against the attachment key it backs.
   *
   * Idempotent per key: a second put keeps the first asset, so a card never
   * flickers through a new object URL for identical bytes.
   * @param path - the attachment key.
   * @param file - the dropped file that key stands for.
   */
  put(path, file) {
    if (this.disposed || this.assets.has(path)) return;
    const kind = dropKindOf(file.name, file.type);
    this.files.set(path, file);
    this.assets.set(path, {
      name: file.name,
      mediaType: mediaTypeFor(file.name, file.type),
      size: file.size,
      kind,
      // Only the renderable kinds get a URL. Minting one for a 400 MB archive
      // would pin its bytes for the page's lifetime and render nothing.
      url: RENDERABLE.includes(kind) ? this.mintUrl(file) : void 0
    });
  }
  /**
   * Read one path's preview material.
   * @param path - the absolute path.
   * @returns the asset, or undefined when this page never saw the bytes.
   */
  get(path) {
    return this.assets.get(path);
  }
  /**
   * Decode the head of a text file, once per path.
   *
   * Answers undefined for a file with no retained bytes, one that turns out to
   * be binary, and a read that fails. All three render identically — an
   * identity card with no excerpt — so distinguishing them would add a state
   * the UI does not use.
   * @param path - the absolute path.
   * @returns the decoded prefix, or undefined.
   */
  text(path) {
    const cached = this.texts.get(path);
    if (cached !== void 0) return cached;
    const pending = this.decode(path);
    this.texts.set(path, pending);
    return pending;
  }
  /**
   * Let one attachment's preview material go: revoke its URL and drop its bytes.
   * @param path - the attachment key.
   */
  release(path) {
    const asset = this.assets.get(path);
    if (asset?.url !== void 0) {
      URL.revokeObjectURL(asset.url);
      this.urls.delete(asset.url);
    }
    this.assets.delete(path);
    this.files.delete(path);
    this.texts.delete(path);
  }
  /** Revoke every URL this store minted and drop its retained bytes. */
  dispose() {
    this.disposed = true;
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls.clear();
    this.assets.clear();
    this.files.clear();
    this.texts.clear();
  }
  /**
   * Mint and track one object URL, tolerating an environment without them.
   *
   * A blob URL inherits its source's media type, and a drop is not required to
   * declare one — a typeless PDF hands the frame bytes it renders as source
   * text rather than as a document. `slice` re-types without copying, which
   * matters when the source is a several-hundred-megabyte recording.
   */
  mintUrl(file) {
    if (typeof URL.createObjectURL !== "function") return void 0;
    const mediaType = mediaTypeFor(file.name, file.type);
    const source = file.type !== mediaType && mediaType !== "" ? file.slice(0, file.size, mediaType) : file;
    const url = URL.createObjectURL(source);
    this.urls.add(url);
    return url;
  }
  /** The uncached read behind {@link text}. */
  async decode(path) {
    const file = this.files.get(path);
    if (file === void 0) return void 0;
    try {
      const sample = await file.slice(0, TEXT_SAMPLE_BYTES).text();
      return looksBinary(sample) ? void 0 : sample;
    } catch {
      return void 0;
    }
  }
};

// src/client/acquire.ts
function hostPathBridge(scope = globalThis) {
  const bridge = Reflect.get(scope, "__DSH_HOST_PATHS__");
  if (typeof bridge !== "object" || bridge === null) return void 0;
  return typeof Reflect.get(bridge, "pathFor") === "function" ? bridge : void 0;
}
function bridgePath(file, bridge = hostPathBridge()) {
  if (bridge === void 0) return void 0;
  try {
    const path = bridge.pathFor(file);
    return typeof path === "string" && path !== "" ? path : void 0;
  } catch {
    return void 0;
  }
}
function relative(route) {
  return route.startsWith("/") ? route.slice(1) : route;
}
async function resolveInPlace(path, file, signal, http) {
  const claim = { path, size: file.size, lastModified: file.lastModified };
  try {
    const response = await http(relative(RESOLVE_ROUTE), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(claim),
      signal
    });
    if (!response.ok) return void 0;
    const body = await response.json();
    return typeof body.path === "string" && body.path !== "" ? body.path : void 0;
  } catch {
    return void 0;
  }
}
async function stage(file, signal, http) {
  const response = await http(relative(STAGE_ROUTE), {
    method: "POST",
    headers: { [NAME_HEADER]: encodeURIComponent(file.name) },
    body: file,
    signal
  });
  if (!response.ok) throw new Error(`stage failed: ${response.status}`);
  const body = await response.json();
  if (typeof body.path !== "string" || body.path === "") throw new Error("stage returned no path");
  return body.path;
}
function hintFor(file, hints) {
  return hints.find((hint) => fileNameOf(hint) === file.name);
}
async function acquire(file, bridged, hints, signal, http = (url, init) => fetch(url, init)) {
  if (bridged !== void 0 && mentionFor(bridged) !== void 0) return { path: bridged, how: "in-place" };
  const hint = hintFor(file, hints);
  if (hint !== void 0 && mentionFor(hint) !== void 0) {
    const confirmed = await resolveInPlace(hint, file, signal, http);
    if (confirmed !== void 0) return { path: confirmed, how: "in-place" };
  }
  return { path: await stage(file, signal, http), how: "copied" };
}

// src/client/registry.ts
var RailRegistry = class {
  rails = [];
  listeners = /* @__PURE__ */ new Set();
  /**
   * Add one mounted rail.
   * @param rail - the rail; its identity is its registration.
   * @returns the disposer, which removes exactly this registration.
   */
  register(rail) {
    this.rails.push(rail);
    this.changed();
    return () => {
      const at = this.rails.indexOf(rail);
      if (at < 0) return;
      this.rails.splice(at, 1);
      this.changed();
    };
  }
  /** The rails, oldest first. */
  list() {
    return this.rails;
  }
  /**
   * The rail whose composer card contains a target.
   * @param target - an event target.
   * @returns the latest-mounted matching rail, or undefined.
   */
  at(target) {
    for (let i = this.rails.length - 1; i >= 0; i -= 1) {
      const rail = this.rails[i];
      if (rail.contains(target)) return rail;
    }
    return void 0;
  }
  /**
   * The rail a gesture outside every composer card belongs to.
   *
   * The latest-mounted rail with a session that accepts a drop. A subagent's
   * composer refuses drops, so this is the main conversation's composer in
   * practice; a blank composer has no session to hold references against.
   * @returns the rail, or undefined when none accepts.
   */
  primary() {
    for (let i = this.rails.length - 1; i >= 0; i -= 1) {
      const rail = this.rails[i];
      if (rail.sessionId !== void 0 && rail.canAcceptDrop()) return rail;
    }
    return void 0;
  }
  /**
   * Route one gesture.
   *
   * The composer under the pointer wins, accepting or not — a drop onto a
   * busy composer must say so rather than land in another one. Anywhere else
   * goes to the primary rail; with none accepting, to the latest rail at all,
   * marked blocked, so the user still hears why nothing happened.
   * @param target - the event target.
   * @returns the route, or undefined when no rail is mounted.
   */
  route(target) {
    const inside = this.at(target);
    if (inside !== void 0) return { rail: inside, blocked: !accepts(inside) };
    const primary = this.primary();
    if (primary !== void 0) return { rail: primary, blocked: false };
    const last = this.rails[this.rails.length - 1];
    return last === void 0 ? void 0 : { rail: last, blocked: true };
  }
  /**
   * The latest-mounted rail for one session.
   * @param sessionId - the session.
   * @returns the rail, or undefined.
   */
  forSession(sessionId) {
    for (let i = this.rails.length - 1; i >= 0; i -= 1) {
      const rail = this.rails[i];
      if (rail.sessionId === sessionId) return rail;
    }
    return void 0;
  }
  /**
   * Follow registrations.
   * @param listener - called after every register and unregister.
   * @returns the unsubscribe function.
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  changed() {
    for (const listener of this.listeners) listener();
  }
};
function accepts(rail) {
  return rail.sessionId !== void 0 && rail.canAcceptDrop();
}

// src/client/index.ts
var name = "@crosery/dsh-drop";
function claimsTransfer2(transfer) {
  if (transfer === null) return false;
  let fileItems = 0;
  for (const item of transfer.items) {
    if (item.kind === "file") fileItems += 1;
  }
  return claimsTransfer({ types: [...transfer.types], fileItems, files: transfer.files.length });
}
function readEntries(transfer) {
  const bridge = hostPathBridge();
  const entries = [];
  for (const item of transfer.items) {
    if (item.kind !== "file") continue;
    const entry = typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null;
    const file = item.getAsFile();
    entries.push({
      file,
      isDirectory: entry?.isDirectory ?? false,
      path: file === null ? void 0 : bridgePath(file, bridge),
      entry: entry ?? void 0
    });
  }
  if (entries.length === 0) {
    for (const file of transfer.files) {
      entries.push({ file, isDirectory: false, path: bridgePath(file, bridge) });
    }
  }
  return entries;
}
function readHints(transfer) {
  const hints = uriListPaths(transfer.getData("text/uri-list"));
  if (hints.length > 0) return hints;
  return uriListPaths(transfer.getData("text/plain"));
}
function isForeignEditable(target) {
  if (!(target instanceof Element)) return false;
  if (target.closest("[data-composer-card]") !== null) return false;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return true;
  return target instanceof HTMLElement && target.isContentEditable;
}
function apply(ctx) {
  const previews = new PreviewStore();
  ctx.effect(() => () => {
    previews.dispose();
  }, "@crosery/dsh-drop: preview material");
  const attached = new AttachedFiles((entry) => {
    previews.release(entry.key);
  });
  const registry = new RailRegistry();
  const toast = createToast();
  ctx.effect(() => () => {
    toast.dispose();
  }, "@crosery/dsh-drop: toast");
  let sessions;
  let conversation;
  const access = {
    inputOf: (sessionId) => {
      const agent = sessions?.scope(sessionId);
      if (agent === void 0 || conversation === void 0) return void 0;
      try {
        return conversation.input.for(agent);
      } catch {
        return void 0;
      }
    },
    scopeOf: (sessionId) => sessions?.scope(sessionId)
  };
  const notify = (sessionId, level, text) => {
    const input = sessionId === void 0 ? void 0 : access.inputOf(sessionId);
    if (input !== void 0 && typeof input.notify === "function") {
      input.notify(level, text);
      return;
    }
    toast.show(text);
  };
  let referenceFit;
  ctx.effect(() => () => {
    referenceFit?.();
    referenceFit = void 0;
  }, "@crosery/dsh-drop: reference fit");
  const onLegacyComposer = () => {
    referenceFit ??= installReferenceFit();
  };
  installDropStyles(ctx);
  installPreviewRail(ctx, { store: previews, attached, registry, access, onLegacyComposer });
  ctx.effect(
    () => installSubmitGuard({
      composerAt: (target) => registry.at(target)?.composer,
      staged: (sessionId) => attached.list(sessionId),
      onSent: (sessionId, ids) => {
        attached.clear(sessionId, ids);
      },
      notify,
      copy: () => messages()
    }),
    "@crosery/dsh-drop: submit guard"
  );
  ctx.inject(["sessions", "conversation"], (scoped) => {
    scoped.effect(() => {
      sessions = scoped.get("sessions");
      conversation = scoped.get("conversation");
      return () => {
        sessions = void 0;
        conversation = void 0;
      };
    }, "@crosery/dsh-drop: session services");
  });
  const overlay = createOverlay();
  const aborter = new AbortController();
  let depth = 0;
  const stageAll = async (sessionId, candidates, hints) => {
    let failed = 0;
    const queued = candidates.map((candidate) => {
      if (candidate.path !== void 0 && attached.list(sessionId).some((entry2) => entry2.status === "ready" && entry2.path === candidate.path)) return void 0;
      const entry = attached.add(sessionId, {
        kind: "file",
        status: "pending",
        name: candidate.file.name,
        size: candidate.file.size
      });
      previews.put(entry.key, candidate.file);
      return { candidate, entry };
    });
    for (const job of queued) {
      if (job === void 0) continue;
      if (aborter.signal.aborted) return;
      if (!attached.list(sessionId).some((entry) => entry.id === job.entry.id)) continue;
      try {
        const one = await acquire(job.candidate.file, job.candidate.path, hints, aborter.signal);
        if (mentionFor(one.path) === void 0) throw new Error("acquired path cannot be referenced");
        attached.update(sessionId, job.entry.id, { status: "ready", path: one.path, how: one.how });
      } catch (error) {
        if (aborter.signal.aborted) return;
        console.warn("[dsh-drop] could not acquire a file", error);
        attached.remove(sessionId, job.entry.id);
        failed += 1;
      }
    }
    if (failed > 0) notify(sessionId, "error", messages().failed(failed));
  };
  const consume = (transfer, route) => {
    const plan = planDrop(readEntries(transfer));
    const hints = readHints(transfer);
    const copy = messages();
    if (route === void 0) {
      notify(void 0, "error", copy.noSession);
      return;
    }
    const { rail, blocked } = route;
    if (blocked || rail.sessionId === void 0) {
      notify(rail.sessionId, "error", rail.sessionId === void 0 ? copy.noSession : copy.blocked);
      return;
    }
    if (plan.images.length > 0) rail.addFiles(plan.images);
    if (plan.folders.length > 0) notify(rail.sessionId, "info", copy.directories);
    if (plan.staged.length > 0) void stageAll(rail.sessionId, plan.staged, hints);
  };
  let watchdog;
  const reset = () => {
    depth = 0;
    if (watchdog !== void 0) clearTimeout(watchdog);
    watchdog = void 0;
    overlay.hide();
  };
  const armWatchdog = () => {
    if (watchdog !== void 0) clearTimeout(watchdog);
    watchdog = setTimeout(reset, 1500);
  };
  const showFor = (target) => {
    const route = registry.route(target);
    overlay.show({
      blocked: route === void 0 || route.blocked,
      noSession: route === void 0 || route.rail.sessionId === void 0,
      limits: route?.rail.dropLimits()
    });
    return route;
  };
  const onDragEnter = (event) => {
    if (!claimsTransfer2(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    depth += 1;
    showFor(event.target);
    armWatchdog();
  };
  const onDragOver = (event) => {
    const transfer = event.dataTransfer;
    if (!claimsTransfer2(transfer)) return;
    event.preventDefault();
    event.stopPropagation();
    showFor(event.target);
    if (transfer !== null) transfer.dropEffect = "copy";
    armWatchdog();
  };
  const onDragLeave = (event) => {
    if (!claimsTransfer2(event.dataTransfer)) return;
    event.stopPropagation();
    depth = Math.max(0, depth - 1);
    if (depth === 0) overlay.hide();
  };
  const onDrop = (event) => {
    const transfer = event.dataTransfer;
    if (!claimsTransfer2(transfer) || transfer === null) return;
    event.preventDefault();
    event.stopPropagation();
    reset();
    consume(transfer, registry.route(event.target));
  };
  const onPaste = (event) => {
    const transfer = event.clipboardData;
    if (!claimsTransfer2(transfer) || transfer === null) return;
    if (isForeignEditable(event.target)) return;
    const route = registry.route(event.target);
    const text = transfer.getData("text/plain");
    const names = [...transfer.files].map((file) => file.name);
    const keepText = text !== "" && !pasteTextIsFileNames(text, names);
    event.preventDefault();
    event.stopPropagation();
    consume(transfer, route);
    if (keepText) insertPastedText(route?.rail, event.target, text);
  };
  const insertPastedText = (rail, target, text) => {
    if (rail?.composer?.insertAtSelection(text) === true) return;
    const input = target instanceof Element ? target.closest("[data-composer-input], textarea") : null;
    if (input === null) return;
    input.focus();
    document.execCommand("insertText", false, text);
  };
  ctx.effect(() => {
    document.addEventListener("dragenter", onDragEnter, true);
    document.addEventListener("dragover", onDragOver, true);
    document.addEventListener("dragleave", onDragLeave, true);
    document.addEventListener("drop", onDrop, true);
    document.addEventListener("paste", onPaste, true);
    window.addEventListener("dragend", reset);
    return () => {
      aborter.abort();
      document.removeEventListener("dragenter", onDragEnter, true);
      document.removeEventListener("dragover", onDragOver, true);
      document.removeEventListener("dragleave", onDragLeave, true);
      document.removeEventListener("drop", onDrop, true);
      document.removeEventListener("paste", onPaste, true);
      window.removeEventListener("dragend", reset);
      reset();
      overlay.dispose();
    };
  }, "@crosery/dsh-drop: composer file transfer");
}
return module.exports; } });
