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
  acquire: () => acquire,
  apply: () => apply,
  claimsFileTypes: () => claimsFileTypes,
  claimsTransfer: () => claimsTransfer,
  composeSubmission: () => composeSubmission,
  composerBridge: () => composerBridge,
  createOverlay: () => createOverlay,
  dropKindOf: () => dropKindOf,
  en: () => en2,
  extensionOf: () => extensionOf,
  fileNameOf: () => fileNameOf,
  formatDropBytes: () => formatDropBytes,
  hintFor: () => hintFor,
  imageIntakeBridge: () => imageIntakeBridge,
  installDropStyles: () => installDropStyles,
  installPreviewRail: () => installPreviewRail,
  installReferenceFit: () => installReferenceFit,
  installSubmitGuard: () => installSubmitGuard,
  isSendKey: () => isSendKey,
  kindBadge: () => kindBadge,
  looksBinary: () => looksBinary,
  mediaTypeFor: () => mediaTypeFor,
  mentionFor: () => mentionFor,
  messages: () => messages,
  name: () => name,
  planDrop: () => planDrop,
  readEntries: () => readEntries,
  readHints: () => readHints,
  stageReferences: () => stageReferences,
  uriListPaths: () => uriListPaths,
  usePreviewText: () => usePreviewText,
  zh: () => zh2
});
module.exports = __toCommonJS(index_exports);

// src/contract.ts
var STAGE_ROUTE = "/crosery/dsh-drop/stage";
var RESOLVE_ROUTE = "/crosery/dsh-drop/resolve";
var NAME_HEADER = "x-dsh-drop-name";
var DEFAULT_MAX_BYTES = 512 * 1024 * 1024;
var COMPOSER_IMAGE_MEDIA_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif"
];
function isComposerImageType(mediaType) {
  return COMPOSER_IMAGE_MEDIA_TYPES.includes(mediaType);
}
function claimsFileTypes(mediaTypes) {
  return mediaTypes.some((mediaType) => !isComposerImageType(mediaType));
}
function planDrop(entries) {
  const plan = { images: [], staged: [], directories: false };
  for (const entry of entries) {
    if (entry.isDirectory) {
      plan.directories = true;
      continue;
    }
    if (entry.file === null) continue;
    if (isComposerImageType(entry.file.type)) plan.images.push(entry.file);
    else plan.staged.push(entry.file);
  }
  return plan;
}
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
function mentionFor(path) {
  return /[\s"]/.test(path) ? `@"${path}"` : `@${path}`;
}
function fileNameOf(path) {
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const name2 = cut < 0 ? path : path.slice(cut + 1);
  return name2 === "" ? path : name2;
}

// src/client/overlay.ts
var STYLE_ID = "@crosery/dsh-drop/overlay.css";
var COPY = {
  zh: { title: "\u62D6\u5165\u6587\u4EF6", desc: "\u56FE\u7247\u76F4\u63A5\u9644\u52A0\uFF0C\u5176\u4ED6\u6587\u4EF6\u63D2\u5165\u4E3A @ \u6587\u4EF6\u5F15\u7528" },
  en: { title: "Drop files here", desc: "Images attach; other files are inserted as @ file references" }
};
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
  padding: 20px 28px;
  border-radius: 16px;
  border: 2px dashed var(--dsw-alias-border-2, rgba(255, 255, 255, 0.6));
  background: var(--dsw-alias-bg-1, #fff);
  color: var(--dsw-alias-text-1, #111);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
  font-size: 14px;
  text-align: center;
}
.dsh-drop-overlay-title { font-size: 16px; font-weight: 600; }
.dsh-drop-overlay-desc { opacity: 0.7; }
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
function copy() {
  return document.documentElement.lang.toLowerCase().startsWith("en") ? COPY.en : COPY.zh;
}
function createOverlay() {
  let element;
  const hide = () => {
    element?.remove();
    element = void 0;
  };
  return {
    show() {
      if (element !== void 0) return;
      installStyles();
      const text = copy();
      const host = document.createElement("div");
      host.className = "dsh-drop-overlay";
      const card = document.createElement("div");
      card.className = "dsh-drop-overlay-card";
      const title = document.createElement("div");
      title.className = "dsh-drop-overlay-title";
      title.textContent = text.title;
      const desc = document.createElement("div");
      desc.className = "dsh-drop-overlay-desc";
      desc.textContent = text.desc;
      card.append(title, desc);
      host.append(card);
      document.body.appendChild(host);
      element = host;
    },
    hide,
    dispose: hide
  };
}

// src/client/messages.ts
var zh = {
  added: (count) => count === 1 ? "\u5DF2\u63D2\u5165 1 \u4E2A\u6587\u4EF6\u5F15\u7528" : `\u5DF2\u63D2\u5165 ${count} \u4E2A\u6587\u4EF6\u5F15\u7528`,
  failed: "\u6587\u4EF6\u6682\u5B58\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5",
  directories: "\u6587\u4EF6\u5939\u6682\u4E0D\u652F\u6301\uFF0C\u5DF2\u8DF3\u8FC7",
  noSession: "\u8BF7\u5148\u6253\u5F00\u4E00\u4E2A\u4F1A\u8BDD\u518D\u62D6\u5165\u6587\u4EF6"
};
var en = {
  added: (count) => count === 1 ? "Inserted 1 file reference" : `Inserted ${count} file references`,
  failed: "Could not stage the dropped file",
  directories: "Folders are not supported yet and were skipped",
  noSession: "Open a session before dropping files"
};
function messages() {
  return document.documentElement.lang.toLowerCase().startsWith("en") ? en : zh;
}

// src/client/reference-fit.ts
var STYLE_ID2 = "@crosery/dsh-drop/reference-fit.css";
var CSS2 = `
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
  const selector = `style[data-plugin-css=${JSON.stringify(STYLE_ID2)}]`;
  if (document.querySelector(selector) !== null) return () => {
  };
  const tag = document.createElement("style");
  tag.dataset.plugin = "@crosery/dsh-drop";
  tag.dataset.pluginCss = STYLE_ID2;
  tag.textContent = CSS2;
  document.head.appendChild(tag);
  return () => {
    tag.remove();
  };
}

// src/client/styles.ts
var STYLE_ID3 = "@crosery/dsh-drop/preview-rail.css";
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
/* Touch surfaces have no hover, so the control has to stay put. */
@media (pointer: coarse) { .dshdrop-remove { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .dshdrop-remove { transition: none; } }

.dshdrop-thumb:focus-visible,
.dshdrop-doc:focus-visible,
.dshdrop-remove:focus-visible {
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
    const selector = `style[data-plugin-css=${JSON.stringify(STYLE_ID3)}]`;
    const existing = document.querySelector(selector);
    if (existing !== null) return () => {
    };
    const tag = document.createElement("style");
    tag.dataset.plugin = "@crosery/dsh-drop";
    tag.dataset.pluginCss = STYLE_ID3;
    tag.textContent = SHEET;
    document.head.appendChild(tag);
    return () => {
      tag.remove();
    };
  }, "@crosery/dsh-drop: preview rail stylesheet");
}

// src/client/DropRail.tsx
var import_react3 = require("react");
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");

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

// src/client/DropLightbox.tsx
var import_react = require("react");
var import_react_dom = require("react-dom");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime = require("react/jsx-runtime");
function focusables(root) {
  return [...root.querySelectorAll('button, [href], video, audio, iframe, [tabindex]:not([tabindex="-1"])')].filter((element) => element.tabIndex !== -1);
}
function Stage({ asset, text, t }) {
  if (asset === void 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshdrop-stageEmpty", children: t("state.reloaded") });
  }
  if (asset.url !== void 0) {
    if (asset.kind === "image") {
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", { className: "dshdrop-stageImage", src: asset.url, alt: asset.name });
    }
    if (asset.kind === "video") {
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("video", { className: "dshdrop-stageVideo", src: asset.url, controls: true, autoPlay: true, playsInline: true, children: t("media.noVideo") });
    }
    if (asset.kind === "audio") {
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("audio", { className: "dshdrop-stageAudio", src: asset.url, controls: true, children: t("media.noAudio") });
    }
    if (asset.kind === "pdf") {
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("iframe", { className: "dshdrop-stageFrame", src: asset.url, title: asset.name });
    }
  }
  if (asset.kind === "text") {
    if (text === void 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshdrop-stageEmpty", children: t("state.binary") });
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { className: "dshdrop-stageText", children: text });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshdrop-stageEmpty", children: t("state.noPreview") });
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
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "div",
      {
        ref: dialogRef,
        className: "dshdrop-lightbox",
        role: "dialog",
        "aria-modal": "true",
        "aria-label": name2,
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshdrop-mask", "aria-hidden": "true", onMouseDown: onClose }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshdrop-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshdrop-headName", children: name2 }),
            size !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshdrop-headMeta", children: size }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                ref: closeRef,
                type: "button",
                className: "dshdrop-headAction",
                "aria-label": t("action.close"),
                onClick: onClose,
                children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconCloseOutline16, { size: 16 })
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshdrop-stage", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stage, { asset, text, t }) })
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
var import_jsx_runtime2 = require("react/jsx-runtime");
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
function Glyph({ name: name2 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dshdrop-glyph", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dshdrop-badge", children: kindBadge(name2) }) });
}
function Card({ item, url, onOpen, t }) {
  const kind = item.row === "image" ? "image" : item.kind;
  const size = item.row === "image" ? item.size : item.asset?.size ?? 0;
  const sizeText = formatDropBytes(size);
  const thumbnail = THUMBNAIL_KINDS.includes(kind) && url !== void 0;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshdrop-item", children: [
    thumbnail ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
      "button",
      {
        type: "button",
        className: "dshdrop-thumb",
        "aria-label": t("action.open", { name: item.name }),
        title: item.name,
        onClick: onOpen,
        children: [
          kind === "image" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("img", { src: url, alt: "" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("video", { src: `${url ?? ""}#t=0.1`, muted: true, playsInline: true, preload: "metadata" }),
          kind === "video" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dshdrop-play", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconPlayOutline16, { size: 11 }) })
        ]
      }
    ) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
      "button",
      {
        type: "button",
        className: "dshdrop-doc",
        "aria-label": t("action.open", { name: item.name }),
        title: item.name,
        onClick: onOpen,
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Glyph, { name: item.name }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "dshdrop-lines", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dshdrop-name", children: item.name }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dshdrop-meta", children: sizeText === "" ? t(KIND_LABEL[kind]) : `${t(KIND_LABEL[kind])} \xB7 ${sizeText}` })
          ] })
        ]
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "button",
      {
        type: "button",
        className: "dshdrop-remove",
        "aria-label": t("action.remove", { name: item.name }),
        onClick: item.remove,
        children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconCloseOutline16, { size: 10 })
      }
    )
  ] });
}
function DropRail({
  attachments,
  onAddImages,
  onAddFiles,
  onRemoveImage,
  onRemoveAttachment,
  useInput,
  inputActions,
  sessionId,
  assetOf,
  textOf,
  bindImageIntake,
  bindComposer,
  useAttached,
  detach,
  t
}) {
  const attached = useAttached((staged) => staged);
  const [open, setOpen] = (0, import_react3.useState)(null);
  const addFiles = onAddFiles ?? onAddImages;
  const removeAttachment = onRemoveAttachment ?? onRemoveImage;
  (0, import_react3.useEffect)(() => {
    bindImageIntake(addFiles);
    return () => {
      bindImageIntake(void 0);
    };
  }, [bindImageIntake, addFiles]);
  const phase = useInput((state) => state.phase);
  const draft = useInput((state) => state.draft) ?? "";
  (0, import_react3.useEffect)(() => {
    if (sessionId === void 0 || inputActions === void 0) {
      bindComposer(void 0);
      return;
    }
    bindComposer({
      sessionId,
      draft: () => draft,
      setDraft: (text) => {
        inputActions.setDraft(text);
      },
      submit: () => {
        inputActions.submit();
      },
      // Mid-transaction the machine ignores writes, so rewriting the draft
      // then would drop the paths silently.
      ready: () => phase === "plain" || phase === "claimed"
    });
    return () => {
      bindComposer(void 0);
    };
  }, [bindComposer, sessionId, inputActions, draft, phase]);
  const items = (0, import_react3.useMemo)(() => {
    const images = attachments.map((attachment) => ({
      row: "image",
      key: `image:${attachment.id}`,
      name: attachment.file.name,
      // Draft images carry a preview URL; a file-kind draft (0.1.2 widened the
      // union) has none, so its card renders as an identity row instead of a
      // thumbnail.
      url: attachment.previewUrl,
      size: attachment.file.size,
      remove: () => {
        removeAttachment?.(attachment.id);
      }
    }));
    const files = attached.map((entry) => ({
      row: "file",
      key: `file:${entry.id}`,
      path: entry.path,
      name: assetOf(entry.path)?.name ?? fileNameOf(entry.path),
      kind: assetOf(entry.path)?.kind ?? "file",
      asset: assetOf(entry.path),
      // Draft images and staged files are held by different owners; a card
      // only knows it has a remove verb.
      remove: () => {
        detach(entry.id);
      }
    }));
    return [...images, ...files];
  }, [attachments, attached, assetOf, onRemoveImage, detach]);
  const overflow = useRailOverflow(items.length);
  const previewed = items.find((item) => item.key === open) ?? null;
  (0, import_react3.useEffect)(() => {
    if (open !== null && previewed === null) setOpen(null);
  }, [open, previewed]);
  const previewText = usePreviewText(
    previewed !== null && previewed.row === "file" && previewed.kind === "text" ? previewed.path : null,
    textOf
  );
  if (items.length === 0) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshdrop-rail-wrap", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dshdrop-rail", ref: overflow.ref, role: "group", "aria-label": t("rail.label"), children: items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      Card,
      {
        item,
        url: item.row === "image" ? item.url : item.asset?.url,
        onOpen: () => {
          setOpen(item.key);
        },
        t
      },
      item.key
    )) }),
    overflow.atStart && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "button",
      {
        type: "button",
        className: "dshdrop-arrow dshdrop-arrowLeft",
        "aria-label": t("action.scrollLeft"),
        onClick: () => {
          overflow.page(-1);
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconChevronLeftOutline14, { size: 14 })
      }
    ),
    overflow.atEnd && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "button",
      {
        type: "button",
        className: "dshdrop-arrow dshdrop-arrowRight",
        "aria-label": t("action.scrollRight"),
        onClick: () => {
          overflow.page(1);
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconChevronRightOutline14, { size: 14 })
      }
    ),
    previewed !== null && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      DropLightbox,
      {
        name: previewed.name,
        asset: previewed.row === "file" ? previewed.asset : {
          name: previewed.name,
          mediaType: "",
          size: previewed.size,
          kind: "image",
          url: previewed.url
        },
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
  "state.noPreview": "\u8BE5\u683C\u5F0F\u65E0\u6CD5\u5728\u9875\u9762\u5185\u9884\u89C8",
  "state.reloaded": "\u9875\u9762\u5DF2\u5237\u65B0\uFF0C\u9884\u89C8\u5185\u5BB9\u4E0D\u53EF\u7528",
  "state.binary": "\u4E8C\u8FDB\u5236\u5185\u5BB9\uFF0C\u4E0D\u4F5C\u6587\u672C\u9884\u89C8",
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
  "state.noPreview": "This format cannot be previewed in the page",
  "state.reloaded": "The page reloaded; preview content is unavailable",
  "state.binary": "Binary content, not shown as text",
  "media.noVideo": "This browser cannot play that video format",
  "media.noAudio": "This browser cannot play that audio format"
};

// src/client/rail-entry.ts
var RAIL_PRIORITY = -1;
var EMPTY = Object.freeze([]);
function imageIntakeBridge() {
  let intake;
  return {
    bind: (next) => {
      intake = next;
    },
    current: () => intake
  };
}
function composerBridge() {
  let handle;
  return {
    bind: (next) => {
      handle = next;
    },
    current: () => handle
  };
}
function installPreviewRail(ctx, store, images, composer, attached) {
  const shared = {
    assetOf: (path) => store.get(path),
    textOf: (path) => store.text(path),
    bindImageIntake: images.bind,
    bindComposer: composer.bind
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
      // current session, `undefined` while none is selected. It used to arrive
      // as a standard prop; 0.1.2 stopped merging it there, so the rail takes it
      // from this share and works on either train.
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
  /**
   * Stage one file for a session.
   * @param sessionId - the owning session.
   * @param path - absolute path to attach.
   * @returns the staged entry.
   */
  add(sessionId, path) {
    this.seq += 1;
    const entry = { id: this.seq, path };
    const list = this.bySession.get(sessionId) ?? [];
    list.push(entry);
    this.bySession.set(sessionId, list);
    this.publish(sessionId);
    return entry;
  }
  /**
   * Drop one staged file.
   * @param sessionId - the owning session.
   * @param id - the entry's identity.
   */
  remove(sessionId, id) {
    const list = this.bySession.get(sessionId);
    if (list === void 0) return;
    const next = list.filter((entry) => entry.id !== id);
    if (next.length === list.length) return;
    this.bySession.set(sessionId, next);
    this.publish(sessionId);
  }
  /**
   * Clear a session's staged files.
   *
   * Called after a send commits: the paths went out with that message, and
   * leaving them staged would silently attach them to the next one too.
   * @param sessionId - the owning session.
   */
  clear(sessionId) {
    if ((this.bySession.get(sessionId)?.length ?? 0) === 0) return;
    this.bySession.delete(sessionId);
    this.publish(sessionId);
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
function installSubmitGuard(handle, staged, onSent) {
  const intercept = () => {
    const composer = handle();
    if (composer === void 0 || !composer.ready()) return false;
    const mentions = staged(composer.sessionId);
    if (mentions.length === 0) return false;
    const draft = composer.draft();
    composer.setDraft(composeSubmission(draft, mentions));
    composer.submit();
    onSent(composer.sessionId);
    return true;
  };
  const onKeyDown = (event) => {
    if (!isSendKey(event)) return;
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement)) return;
    if (target.closest("[data-composer-card]") === null || target.disabled || target.readOnly) return;
    if (target.getAttribute("aria-expanded") === "true") return;
    if (!intercept()) return;
    event.preventDefault();
    event.stopPropagation();
  };
  const onClick = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest("button");
    if (button === null || button.disabled || button.closest("[data-composer-card]") === null) return;
    if (!/_primary\b/.test(button.className)) return;
    if (!intercept()) return;
    event.preventDefault();
    event.stopPropagation();
  };
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("click", onClick, true);
  return () => {
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("click", onClick, true);
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
   * Record one acquired file against the path it was referenced by.
   *
   * Idempotent per path: a second drop of the same file keeps the first
   * asset, so a card never flickers through a new object URL for identical
   * bytes.
   * @param path - the absolute path inserted into the draft.
   * @param file - the dropped file that path stands for.
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
async function resolveInPlace(path, file, signal) {
  const claim = { path, size: file.size, lastModified: file.lastModified };
  try {
    const response = await fetch(RESOLVE_ROUTE, {
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
async function stage(file, signal) {
  const response = await fetch(STAGE_ROUTE, {
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
async function acquire(file, hints, signal) {
  const hint = hintFor(file, hints);
  if (hint !== void 0) {
    const confirmed = await resolveInPlace(hint, file, signal);
    if (confirmed !== void 0) return { path: confirmed, how: "in-place" };
  }
  return { path: await stage(file, signal), how: "copied" };
}

// src/client/index.ts
var name = "@crosery/dsh-drop";
function claimsTransfer(transfer) {
  if (transfer === null) return false;
  if (!transfer.types.includes("Files")) return false;
  const types = [];
  for (const item of transfer.items) {
    if (item.kind === "file") types.push(item.type);
  }
  return types.length > 0 || transfer.files.length > 0;
}
function readEntries(transfer) {
  const entries = [];
  for (const item of transfer.items) {
    if (item.kind !== "file") continue;
    const entry = typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null;
    entries.push({ file: item.getAsFile(), isDirectory: entry?.isDirectory ?? false });
  }
  if (entries.length === 0) {
    for (const file of transfer.files) entries.push({ file, isDirectory: false });
  }
  return entries;
}
function readHints(transfer) {
  const hints = uriListPaths(transfer.getData("text/uri-list"));
  if (hints.length > 0) return hints;
  return uriListPaths(transfer.getData("text/plain"));
}
function stageReferences(attached, sessionId, acquired) {
  for (const { path } of acquired) attached.add(sessionId, path);
  return acquired.length;
}
function handImagesToComposer(intake, images) {
  if (images.length === 0) return;
  intake.current()?.(images);
}
function apply(ctx) {
  const previews = new PreviewStore();
  ctx.effect(() => () => {
    previews.dispose();
  }, "@crosery/dsh-drop: preview material");
  const images = imageIntakeBridge();
  const attached = new AttachedFiles();
  const composer = composerBridge();
  installDropStyles(ctx);
  installPreviewRail(ctx, previews, images, composer, attached);
  ctx.effect(
    () => installSubmitGuard(
      () => composer.current(),
      (sessionId) => attached.list(sessionId).map((entry) => mentionFor(entry.path)),
      (sessionId) => {
        attached.clear(sessionId);
      }
    ),
    "@crosery/dsh-drop: submit guard"
  );
  ctx.inject(["sessions", "conversation"], (scoped) => {
    scoped.effect(() => {
      const sessions = scoped.get("sessions");
      if (sessions === void 0) return () => {
      };
      const overlay = createOverlay();
      const disposeReferenceFit = installReferenceFit();
      const aborter = new AbortController();
      let depth = 0;
      const currentSession = () => sessions.list.getSnapshot().current;
      const currentInput = () => {
        const id = currentSession();
        if (id === void 0) return void 0;
        const agent = sessions.scope(id);
        if (agent === void 0) return void 0;
        return scoped.conversation.input.for(agent);
      };
      const consume = (transfer) => {
        const plan = planDrop(readEntries(transfer));
        const hints = readHints(transfer);
        handImagesToComposer(images, plan.images);
        if (plan.staged.length === 0) {
          if (plan.directories) currentInput()?.notify("error", messages().directories);
          return;
        }
        const sessionId = currentSession();
        const input = currentInput();
        if (sessionId === void 0 || input === void 0) {
          currentInput()?.notify("error", messages().noSession);
          return;
        }
        void (async () => {
          const acquired = [];
          for (const file of plan.staged) {
            try {
              const one = await acquire(file, hints, aborter.signal);
              previews.put(one.path, file);
              acquired.push(one);
            } catch (error) {
              if (aborter.signal.aborted) return;
              console.warn("[dsh-drop] could not acquire a file", error);
            }
          }
          if (acquired.length === 0) {
            input.notify("error", messages().failed);
            return;
          }
          const landed = stageReferences(attached, sessionId, acquired);
          if (plan.directories) {
            const copy2 = messages();
            input.notify("info", `${copy2.added(landed)}\uFF08${copy2.directories}\uFF09`);
          }
        })();
      };
      const reset = () => {
        depth = 0;
        overlay.hide();
      };
      const onDragEnter = (event) => {
        if (!claimsTransfer(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        depth += 1;
        overlay.show();
      };
      const onDragOver = (event) => {
        const transfer = event.dataTransfer;
        if (!claimsTransfer(transfer)) return;
        event.preventDefault();
        event.stopPropagation();
        if (transfer !== null) transfer.dropEffect = "copy";
        overlay.show();
      };
      const onDragLeave = (event) => {
        if (!claimsTransfer(event.dataTransfer)) return;
        event.stopPropagation();
        depth = Math.max(0, depth - 1);
        if (depth === 0) overlay.hide();
      };
      const onDrop = (event) => {
        const transfer = event.dataTransfer;
        if (!claimsTransfer(transfer) || transfer === null) return;
        event.preventDefault();
        event.stopPropagation();
        reset();
        consume(transfer);
      };
      const onPaste = (event) => {
        const transfer = event.clipboardData;
        if (!claimsTransfer(transfer) || transfer === null) return;
        event.preventDefault();
        event.stopPropagation();
        consume(transfer);
      };
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
        overlay.dispose();
        disposeReferenceFit();
      };
    }, "@crosery/dsh-drop: composer file transfer");
  });
}
return module.exports; } });
