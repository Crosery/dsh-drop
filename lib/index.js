// src/index.ts
import { dshHomePath } from "@deepseek-ai/dsh-home-paths";

// src/contract.ts
var STAGE_ROUTE = "/crosery/dsh-drop/stage";
var RESOLVE_ROUTE = "/crosery/dsh-drop/resolve";
var BATCH_ROUTE = "/crosery/dsh-drop/batch";
var DROP_SETTINGS_NAMESPACE = "crosery-drop";
var NAME_HEADER = "x-dsh-drop-name";
var BATCH_HEADER = "x-dsh-drop-batch";
var RELPATH_HEADER = "x-dsh-drop-path";
var STAGE_DIR = "drops";
var MAX_BYTES_FIELD = "maxBytes";
var KEEP_DAYS_FIELD = "keepDays";
var FOLDER_MAX_FILES_FIELD = "folderMaxFiles";
var FOLDER_MAX_BYTES_FIELD = "folderMaxBytes";
var FOLDER_MAX_DEPTH_FIELD = "folderMaxDepth";
var FOLDER_IGNORE_FIELD = "folderIgnore";
var DEFAULT_MAX_BYTES = 512 * 1024 * 1024;
var DEFAULT_KEEP_DAYS = 30;
var DEFAULT_FOLDER_MAX_FILES = 2e3;
var DEFAULT_FOLDER_MAX_BYTES = DEFAULT_MAX_BYTES;
var DEFAULT_FOLDER_MAX_DEPTH = 32;
var DEFAULT_FOLDER_IGNORE = Object.freeze([
  ".git",
  "node_modules",
  ".DS_Store",
  "Thumbs.db",
  "__MACOSX",
  ".svn",
  ".hg"
]);
var FOLDER_SAMPLE_SIZE = 8;
function positive(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback;
}
function folderLimitsOf(settings) {
  const ignore = settings[FOLDER_IGNORE_FIELD];
  return {
    maxFiles: positive(settings[FOLDER_MAX_FILES_FIELD], DEFAULT_FOLDER_MAX_FILES),
    maxBytes: positive(settings[FOLDER_MAX_BYTES_FIELD], DEFAULT_FOLDER_MAX_BYTES),
    maxFileBytes: positive(settings[MAX_BYTES_FIELD], DEFAULT_MAX_BYTES),
    maxDepth: positive(settings[FOLDER_MAX_DEPTH_FIELD], DEFAULT_FOLDER_MAX_DEPTH),
    ignore: Array.isArray(ignore) ? ignore.filter((name2) => typeof name2 === "string" && name2 !== "") : DEFAULT_FOLDER_IGNORE
  };
}
function isIgnoredName(name2, ignore) {
  return ignore.includes(name2);
}
var COMPOSER_IMAGE_MEDIA_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif"
];
function isComposerImageType(mediaType) {
  return COMPOSER_IMAGE_MEDIA_TYPES.includes(mediaType);
}
var MTIME_TOLERANCE_MS = 2e3;
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
var MAX_BASE_LENGTH = 100;
var FALLBACK_NAME = "dropped-file";
function safeStageName(raw) {
  const segment = raw.split(/[\\/]/).pop() ?? "";
  const cleaned = segment.replace(/[\u0000-\u001F\u007F-\u009F"]/g, "").trim();
  if (cleaned === "" || /^\.+$/.test(cleaned)) return FALLBACK_NAME;
  return fitSegment(cleaned) || FALLBACK_NAME;
}
var MAX_EXT_LENGTH = 32;
function fitSegment(name2) {
  const dot = name2.lastIndexOf(".");
  const hasExt = dot > 0 && dot < name2.length - 1;
  const base = hasExt ? name2.slice(0, dot) : name2;
  const ext = hasExt ? name2.slice(dot) : "";
  const trimmed = fitBytes(base, MAX_BASE_LENGTH);
  return trimmed === "" ? "" : trimmed + fitBytes(ext, MAX_EXT_LENGTH);
}
function fitBytes(value, budget) {
  let result = "";
  let used = 0;
  const encoder = new TextEncoder();
  for (const character of value) {
    const size = encoder.encode(character).length;
    if (used + size > budget) break;
    result += character;
    used += size;
  }
  return result;
}
var MAX_RELATIVE_PATH_BYTES = 1024;
var WIN32_FORBIDDEN = /[<>:"|?*]/g;
var WIN32_RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;
function safeRelativeSegments(raw, rules) {
  const parts = raw.split(/[\\/]/).filter((part) => part !== "");
  if (parts.length > 0 && /^[A-Za-z]:$/.test(parts[0])) parts.shift();
  const segments = [];
  for (const part of parts) {
    if (part === "." || part === "..") return void 0;
    let cleaned = part.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
    if (rules.win32 === true) {
      cleaned = cleaned.replace(WIN32_FORBIDDEN, "_").replace(/[. ]+$/, "");
      if (WIN32_RESERVED.test(cleaned)) cleaned = `_${cleaned}`;
    }
    if (cleaned === "" || cleaned === "." || cleaned === "..") return void 0;
    const fitted = fitSegment(cleaned);
    if (fitted === "") return void 0;
    segments.push(fitted);
  }
  if (segments.length === 0 || segments.length > rules.maxDepth) return void 0;
  if (new TextEncoder().encode(segments.join("/")).length > MAX_RELATIVE_PATH_BYTES) return void 0;
  return segments;
}
function safeFolderName(raw) {
  const segment = raw.split(/[\\/]/).filter((part) => part !== "").pop() ?? "";
  const cleaned = segment.replace(/[\u0000-\u001F\u007F-\u009F"]/g, "").trim();
  if (cleaned === "" || /^\.+$/.test(cleaned)) return FALLBACK_FOLDER_NAME;
  return fitBytes(cleaned, MAX_BASE_LENGTH) || FALLBACK_FOLDER_NAME;
}
var FALLBACK_FOLDER_NAME = "dropped-folder";
function folderCandidate(name2, attempt) {
  return attempt === 0 ? name2 : `${name2}-${attempt + 1}`;
}
function stageCandidate(name2, attempt) {
  if (attempt === 0) return name2;
  const dot = name2.lastIndexOf(".");
  const hasExt = dot > 0 && dot < name2.length - 1;
  const base = hasExt ? name2.slice(0, dot) : name2;
  const ext = hasExt ? name2.slice(dot) : "";
  return `${base}-${attempt + 1}${ext}`;
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
var DATE_DIR = /^(\d{4})-(\d{2})-(\d{2})$/;
function isPrunableStageDir(dirName, keepDays, now) {
  if (keepDays <= 0) return false;
  const match = DATE_DIR.exec(dirName);
  if (match === null) return false;
  const [, year, month, day] = match;
  const stamp = Date.UTC(Number(year), Number(month) - 1, Number(day));
  if (!Number.isFinite(stamp)) return false;
  return now - stamp > keepDays * 864e5;
}
function stageDayDir(now) {
  return new Date(now).toISOString().slice(0, 10);
}

// src/settings.ts
import z from "@deepseek-ai/schemastery";
var DropSettingsSchema = z.object({
  [MAX_BYTES_FIELD]: z.natural().default(DEFAULT_MAX_BYTES).description("Largest file, in bytes, that a drop may copy to the Host. Default 512 MiB."),
  [KEEP_DAYS_FIELD]: z.natural().default(DEFAULT_KEEP_DAYS).description("Days to keep copied files under DSH_HOME/drops; 0 keeps them forever."),
  [FOLDER_MAX_FILES_FIELD]: z.natural().default(DEFAULT_FOLDER_MAX_FILES).description("Most files a dropped folder may hold when it has to be copied; a larger folder is refused whole. Default 2000."),
  [FOLDER_MAX_BYTES_FIELD]: z.natural().default(DEFAULT_FOLDER_MAX_BYTES).description("Most bytes, in total, a dropped folder may hold when it has to be copied. Default 512 MiB."),
  [FOLDER_MAX_DEPTH_FIELD]: z.natural().default(DEFAULT_FOLDER_MAX_DEPTH).description("Deepest nesting, in levels below the folder, a copied folder may have. Default 32."),
  [FOLDER_IGNORE_FIELD]: z.array(z.string()).default([...DEFAULT_FOLDER_IGNORE]).description("Names skipped (and counted) when a folder is copied, matched exactly against each file or folder name.")
});

// src/stage-route.ts
import { createWriteStream } from "node:fs";
import { mkdir, link, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
var TooLargeError = class extends Error {
  constructor() {
    super("upload exceeds the configured ceiling");
    this.name = "TooLargeError";
  }
};
var MAX_COLLISION_ATTEMPTS = 100;
function refused(reject, req, res) {
  let status;
  try {
    status = reject?.(req);
  } catch {
    status = 403;
  }
  if (status === void 0) return false;
  req.resume();
  const error = status === 401 ? "unauthorized" : status === 503 ? "unavailable" : "forbidden";
  const payload = JSON.stringify({ error });
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  res.end(payload);
  return true;
}
function crossSite(req) {
  const site = req.headers["sec-fetch-site"];
  return site !== void 0 && site !== "same-origin";
}
function declaresJson(req) {
  const type = req.headers["content-type"];
  return typeof type === "string" && type.split(";")[0].trim().toLowerCase() === "application/json";
}
function headerOf(req, name2) {
  const raw = req.headers[name2];
  return typeof raw === "string" ? raw : void 0;
}
function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  res.end(payload);
}
function json(res, status, body) {
  sendJson(res, status, body);
}
function requestedName(req) {
  const raw = req.headers[NAME_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === void 0) return safeStageName("");
  try {
    return safeStageName(decodeURIComponent(value));
  } catch {
    return safeStageName(value);
  }
}
async function publishStage(temp, dir, name2) {
  for (let attempt = 0; attempt <= MAX_COLLISION_ATTEMPTS; attempt += 1) {
    const candidate = join(dir, attempt === MAX_COLLISION_ATTEMPTS ? `${randomUUID()}-${name2}` : stageCandidate(name2, attempt));
    try {
      await link(temp, candidate);
      return candidate;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  throw new Error("could not publish a unique staged path");
}
function insideRoot(root, target) {
  const base = resolve(root);
  const path = resolve(target);
  return path === base || path.startsWith(base.endsWith(sep) ? base : `${base}${sep}`);
}
function stageHandler(opts) {
  const clock = opts.now ?? Date.now;
  return async (req, res) => {
    if (refused(opts.reject, req, res)) return;
    if (req.method !== "POST") {
      json(res, 405, { error: "method" });
      return;
    }
    const batch = headerOf(req, BATCH_HEADER);
    if (batch === void 0 && typeof req.headers[NAME_HEADER] !== "string" || crossSite(req)) {
      req.resume();
      json(res, 403, { error: "forbidden" });
      return;
    }
    if (batch !== void 0) {
      if (opts.batches === void 0) {
        req.resume();
        json(res, 404, { error: "unknown-batch" });
        return;
      }
      await opts.batches.receive(req, res, batch);
      return;
    }
    const root = opts.root();
    const dir = join(root, stageDayDir(clock()));
    const name2 = requestedName(req);
    const limit = opts.maxBytes();
    let temp;
    let status;
    let body;
    try {
      await mkdir(dir, { recursive: true });
      temp = join(dir, `.incoming-${randomUUID()}`);
      let seen = 0;
      const meter = new Transform({
        transform(chunk, _encoding, done) {
          seen += chunk.length;
          if (seen > limit) {
            done(new TooLargeError());
            return;
          }
          done(null, chunk);
        }
      });
      await pipeline(req, meter, createWriteStream(temp));
      const target = await publishStage(temp, dir, name2);
      if (insideRoot(root, target)) {
        await rm(temp);
        temp = void 0;
        status = 200;
        body = { path: target };
      } else {
        status = 400;
        body = { error: "write-failed" };
      }
    } catch (error) {
      status = error instanceof TooLargeError ? 413 : 500;
      body = { error: error instanceof TooLargeError ? "too-large" : "write-failed" };
    }
    if (temp !== void 0) await rm(temp, { force: true }).catch(() => {
    });
    json(res, status, body);
  };
}

// src/resolve-route.ts
import { lstat, readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, join as join2 } from "node:path";
var MAX_BODY_BYTES = 16384;
function finite(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function readSample(raw) {
  if (raw === void 0) return [];
  if (!Array.isArray(raw) || raw.length > FOLDER_SAMPLE_SIZE) return void 0;
  const sample = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return void 0;
    const path = Reflect.get(item, "path");
    const size = finite(Reflect.get(item, "size"));
    const lastModified = finite(Reflect.get(item, "lastModified"));
    if (typeof path !== "string" || path === "" || size === void 0 || lastModified === void 0) return void 0;
    sample.push({ path, size, lastModified });
  }
  return sample;
}
async function readClaim(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    const buffer = chunk;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) return void 0;
    chunks.push(buffer);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (typeof value.path !== "string" || value.path === "") return void 0;
    if (value.kind === "directory") {
      const sample = readSample(value.sample);
      if (sample === void 0) return void 0;
      return { path: value.path, size: 0, lastModified: 0, kind: "directory", sample };
    }
    if (value.kind !== void 0 && value.kind !== "file") return void 0;
    if (typeof value.size !== "number" || !Number.isFinite(value.size)) return void 0;
    if (typeof value.lastModified !== "number" || !Number.isFinite(value.lastModified)) return void 0;
    return { path: value.path, size: value.size, lastModified: value.lastModified };
  } catch {
    return void 0;
  }
}
function claimMatches(entry, claim) {
  if (entry.size !== claim.size) return false;
  return Math.abs(entry.mtimeMs - claim.lastModified) <= MTIME_TOLERANCE_MS;
}
var SUMMARY_MAX_ENTRIES = 5e4;
var SUMMARY_BUDGET_MS = 2e3;
async function summarizeDirectory(root, rules) {
  const summary = { files: 0, bytes: 0, ignored: 0, unreadable: 0, symlinks: 0, truncated: false };
  const maxEntries = rules.maxEntries ?? SUMMARY_MAX_ENTRIES;
  const deadline = Date.now() + (rules.budgetMs ?? SUMMARY_BUDGET_MS);
  let entries = 0;
  const queue = [{ dir: root, depth: 0 }];
  while (queue.length > 0) {
    const { dir, depth } = queue.shift();
    let children;
    try {
      children = await readdir(dir, { withFileTypes: true });
    } catch {
      summary.unreadable += 1;
      continue;
    }
    for (const child of children) {
      entries += 1;
      if (entries > maxEntries || Date.now() > deadline) {
        summary.truncated = true;
        return summary;
      }
      if (isIgnoredName(child.name, rules.ignore)) {
        summary.ignored += 1;
        continue;
      }
      if (child.isSymbolicLink()) {
        summary.symlinks += 1;
        continue;
      }
      const path = join2(dir, child.name);
      if (child.isDirectory()) {
        if (depth + 1 >= rules.maxDepth) summary.truncated = true;
        else queue.push({ dir: path, depth: depth + 1 });
        continue;
      }
      if (!child.isFile()) continue;
      try {
        summary.bytes += (await lstat(path)).size;
        summary.files += 1;
      } catch {
        summary.unreadable += 1;
      }
    }
  }
  return summary;
}
async function claimDirectory(path, sample, rules) {
  const entry = await stat(path);
  if (!entry.isDirectory()) return void 0;
  const real = await realpath(path);
  const seen = /* @__PURE__ */ new Set();
  for (const claim of sample) {
    const segments = safeRelativeSegments(claim.path, { maxDepth: rules.maxDepth, win32: rules.win32 });
    if (segments === void 0) return void 0;
    const key = segments.join("/");
    if (seen.has(key)) return void 0;
    seen.add(key);
    const target = join2(path, ...segments);
    const file = await lstat(target);
    if (!file.isFile() || !claimMatches(file, claim)) return void 0;
    if (!insideRoot(real, await realpath(target))) return void 0;
  }
  if (sample.length === 0) {
    const names = await readdir(path);
    if (names.some((name2) => !isIgnoredName(name2, rules.ignore))) return void 0;
  }
  const summary = await summarizeDirectory(path, rules);
  if (sample.length < Math.min(FOLDER_SAMPLE_SIZE, summary.files)) return void 0;
  return summary;
}
var DEFAULT_RULES = { ignore: DEFAULT_FOLDER_IGNORE, maxDepth: DEFAULT_FOLDER_MAX_DEPTH };
function resolveHandler(opts = {}) {
  const json2 = (res, status, body) => {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "content-length": Buffer.byteLength(payload),
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    });
    res.end(payload);
  };
  return async (req, res) => {
    if (refused(opts.reject, req, res)) return;
    if (req.method !== "POST") {
      json2(res, 405, { error: "method" });
      return;
    }
    if (!declaresJson(req) || crossSite(req)) {
      req.resume();
      json2(res, 403, { error: "forbidden" });
      return;
    }
    const claim = await readClaim(req);
    if (claim === void 0 || !isAbsolute(claim.path) || UNMENTIONABLE.test(claim.path)) {
      json2(res, 404, { error: "no-match" });
      return;
    }
    if (claim.kind === "directory") {
      const path = claim.path.length > 1 ? claim.path.replace(/[\\/]+$/, "") : claim.path;
      try {
        const summary = await claimDirectory(path, claim.sample ?? [], opts.folder?.() ?? DEFAULT_RULES);
        if (summary === void 0) json2(res, 404, { error: "no-match" });
        else json2(res, 200, { path, summary });
      } catch {
        json2(res, 404, { error: "no-match" });
      }
      return;
    }
    try {
      const entry = await stat(claim.path);
      if (!entry.isFile() || !claimMatches(entry, claim)) {
        json2(res, 404, { error: "no-match" });
        return;
      }
      json2(res, 200, { path: claim.path });
    } catch {
      json2(res, 404, { error: "no-match" });
    }
  };
}

// src/folder-stage.ts
import { createWriteStream as createWriteStream2 } from "node:fs";
import { mkdir as mkdir2, rename, rm as rm2, rmdir } from "node:fs/promises";
import { dirname, join as join3, relative, sep as sep2 } from "node:path";
import { randomUUID as randomUUID2 } from "node:crypto";
import { pipeline as pipeline2 } from "node:stream/promises";
import { Transform as Transform2 } from "node:stream";
var MAX_BODY_BYTES2 = 4096;
var DEFAULT_IDLE_MS = 30 * 6e4;
var DEFAULT_MAX_OPEN = 8;
var MAX_COLLISION_ATTEMPTS2 = 100;
var OverLimitError = class extends Error {
  limit;
  constructor(limit) {
    super(`folder upload crosses its ${limit} ceiling`);
    this.name = "OverLimitError";
    this.limit = limit;
  }
};
async function publishDirectory(tree, dir, name2) {
  for (let attempt = 0; attempt <= MAX_COLLISION_ATTEMPTS2; attempt += 1) {
    const candidate = join3(dir, attempt === MAX_COLLISION_ATTEMPTS2 ? `${randomUUID2()}-${name2}` : folderCandidate(name2, attempt));
    try {
      await mkdir2(candidate);
    } catch (error) {
      if (error.code === "EEXIST") continue;
      throw error;
    }
    try {
      await rename(tree, candidate);
      return candidate;
    } catch (error) {
      const code = error.code;
      if (code === "ENOTEMPTY" || code === "EEXIST") continue;
      if (code !== "EPERM" && code !== "EACCES") throw error;
    }
    await rmdir(candidate).catch(() => {
    });
    try {
      await rename(tree, candidate);
      return candidate;
    } catch (error) {
      const code = error.code;
      if (code !== "ENOTEMPTY" && code !== "EEXIST" && code !== "EPERM" && code !== "EACCES") throw error;
    }
  }
  throw new Error("could not publish a unique folder path");
}
async function readControl(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    const buffer = chunk;
    size += buffer.length;
    if (size > MAX_BODY_BYTES2) return void 0;
    chunks.push(buffer);
  }
  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return void 0;
  }
  if (typeof value !== "object" || value === null) return void 0;
  const op = Reflect.get(value, "op");
  if (op === "limits") return { op };
  if (op === "begin") {
    const name2 = Reflect.get(value, "name");
    return typeof name2 === "string" ? { op, name: name2 } : void 0;
  }
  if (op === "commit" || op === "abort") {
    const id = Reflect.get(value, "id");
    return typeof id === "string" && id !== "" ? { op, id } : void 0;
  }
  return void 0;
}
function batchStore(opts) {
  const clock = opts.now ?? Date.now;
  const idleMs = opts.idleMs ?? DEFAULT_IDLE_MS;
  const maxOpen = opts.maxOpen ?? DEFAULT_MAX_OPEN;
  const win32 = opts.win32 ?? process.platform === "win32";
  const batches = /* @__PURE__ */ new Map();
  let disposed = false;
  const drop = async (batch) => {
    batch.closed = true;
    batches.delete(batch.id);
    await rm2(batch.home, { recursive: true, force: true }).catch(() => {
    });
  };
  const sweep = async () => {
    const now = clock();
    const stale = [...batches.values()].filter((batch) => batch.inFlight === 0 && now - batch.touched > idleMs);
    await Promise.all(stale.map(drop));
  };
  const timer = opts.sweepEveryMs !== void 0 && opts.sweepEveryMs > 0 ? setInterval(() => {
    void sweep();
  }, opts.sweepEveryMs) : void 0;
  timer?.unref();
  const refuse = (res, status, body) => {
    sendJson(res, status, body);
  };
  const begin = async (res, name2) => {
    await sweep();
    if (batches.size >= maxOpen) {
      refuse(res, 429, { error: "busy" });
      return;
    }
    const id = randomUUID2();
    const dayDir = join3(opts.root(), stageDayDir(clock()));
    const home = join3(dayDir, `.batch-${id}`);
    const batch = {
      id,
      name: safeFolderName(name2),
      dayDir,
      home,
      tree: join3(home, "tree"),
      parts: join3(home, "parts"),
      limits: opts.limits(),
      files: 0,
      bytes: 0,
      inFlight: 0,
      touched: clock(),
      closed: false
    };
    try {
      await mkdir2(batch.tree, { recursive: true });
      await mkdir2(batch.parts, { recursive: true });
    } catch {
      await rm2(home, { recursive: true, force: true }).catch(() => {
      });
      refuse(res, 500, { error: "write-failed" });
      return;
    }
    batches.set(id, batch);
    sendJson(res, 200, { id, limits: batch.limits });
  };
  const commit = async (res, batch) => {
    if (batch.inFlight > 0) {
      refuse(res, 409, { error: "busy" });
      return;
    }
    if (batch.files === 0) {
      await drop(batch);
      refuse(res, 400, { error: "empty" });
      return;
    }
    batch.closed = true;
    batches.delete(batch.id);
    let path;
    try {
      path = await publishDirectory(batch.tree, batch.dayDir, batch.name);
    } catch {
      await rm2(batch.home, { recursive: true, force: true }).catch(() => {
      });
      refuse(res, 500, { error: "write-failed" });
      return;
    }
    await rm2(batch.home, { recursive: true, force: true }).catch(() => {
    });
    sendJson(res, 200, {
      path,
      summary: { files: batch.files, bytes: batch.bytes, ignored: 0, unreadable: 0, symlinks: 0, truncated: false }
    });
  };
  const handler = async (req, res) => {
    if (refused(opts.reject, req, res)) return;
    if (req.method !== "POST") {
      req.resume();
      refuse(res, 405, { error: "method" });
      return;
    }
    if (!declaresJson(req) || crossSite(req)) {
      req.resume();
      refuse(res, 403, { error: "forbidden" });
      return;
    }
    const control = await readControl(req);
    if (control === void 0) {
      refuse(res, 400, { error: "bad-request" });
      return;
    }
    if (disposed) {
      refuse(res, 404, { error: "unknown-batch" });
      return;
    }
    if (control.op === "limits") {
      sendJson(res, 200, { limits: opts.limits() });
      return;
    }
    if (control.op === "begin") {
      await begin(res, control.name);
      return;
    }
    await sweep();
    const batch = batches.get(control.id);
    if (batch === void 0) {
      refuse(res, 404, { error: "unknown-batch" });
      return;
    }
    if (control.op === "abort") {
      await drop(batch);
      sendJson(res, 200, { aborted: true });
      return;
    }
    await commit(res, batch);
  };
  const receive = async (req, res, id) => {
    await sweep();
    const batch = disposed ? void 0 : batches.get(id);
    if (batch === void 0) {
      req.resume();
      refuse(res, 404, { error: "unknown-batch" });
      return;
    }
    batch.touched = clock();
    let decoded;
    try {
      const raw = headerOf(req, RELPATH_HEADER);
      decoded = raw === void 0 ? void 0 : decodeURIComponent(raw);
    } catch {
      decoded = void 0;
    }
    const segments = decoded === void 0 ? void 0 : safeRelativeSegments(decoded, { maxDepth: Infinity, win32 });
    if (segments === void 0) {
      req.resume();
      refuse(res, 400, { error: "unsafe-path" });
      return;
    }
    const { limits } = batch;
    if (segments.length > limits.maxDepth) {
      req.resume();
      await drop(batch);
      refuse(res, 413, { error: "too-deep", limit: "depth" });
      return;
    }
    if (batch.files + batch.inFlight + 1 > limits.maxFiles) {
      req.resume();
      await drop(batch);
      refuse(res, 413, { error: "too-many", limit: "files" });
      return;
    }
    const target = join3(batch.tree, ...segments);
    if (!insideRoot(batch.tree, target) || target === batch.tree) {
      req.resume();
      refuse(res, 400, { error: "unsafe-path" });
      return;
    }
    batch.inFlight += 1;
    const part = join3(batch.parts, randomUUID2());
    let seen = 0;
    let status;
    let body;
    try {
      try {
        await mkdir2(dirname(target), { recursive: true });
      } catch {
        req.resume();
        throw Object.assign(new Error("path is occupied"), { unsafe: true });
      }
      const meter = new Transform2({
        transform(chunk, _encoding, done) {
          seen += chunk.length;
          batch.bytes += chunk.length;
          if (seen > limits.maxFileBytes) {
            done(new OverLimitError("file-bytes"));
            return;
          }
          if (batch.bytes > limits.maxBytes) {
            done(new OverLimitError("bytes"));
            return;
          }
          done(null, chunk);
        }
      });
      await pipeline2(req, meter, createWriteStream2(part));
      if (batch.closed) throw new Error("batch closed");
      const published = await publishStage(part, dirname(target), segments[segments.length - 1]);
      batch.files += 1;
      status = 200;
      body = { path: relative(batch.tree, published).split(sep2).join("/") };
    } catch (error) {
      batch.bytes -= seen;
      if (error instanceof OverLimitError) {
        status = 413;
        body = { error: error.limit === "files" ? "too-many" : "too-large", limit: error.limit };
        await drop(batch);
      } else if (batch.closed) {
        status = 404;
        body = { error: "unknown-batch" };
      } else if (Reflect.get(error, "unsafe") === true) {
        status = 400;
        body = { error: "unsafe-path" };
      } else {
        status = 500;
        body = { error: "write-failed" };
      }
    } finally {
      batch.inFlight -= 1;
      batch.touched = clock();
    }
    await rm2(part, { force: true }).catch(() => {
    });
    if (batch.closed && !batches.has(batch.id)) {
      await rm2(batch.home, { recursive: true, force: true }).catch(() => {
      });
    }
    sendJson(res, status, body);
  };
  return {
    handler,
    receive,
    sweep,
    open: () => batches.size,
    dispose: async () => {
      disposed = true;
      if (timer !== void 0) clearInterval(timer);
      await Promise.all([...batches.values()].map(drop));
    }
  };
}

// src/prune.ts
import { readdir as readdir2, rm as rm3 } from "node:fs/promises";
import { join as join4 } from "node:path";
async function pruneStage(root, keepDays, now) {
  if (keepDays <= 0) return [];
  let entries;
  try {
    entries = await readdir2(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const removed = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!isPrunableStageDir(entry.name, keepDays, now)) continue;
    const path = join4(root, entry.name);
    try {
      await rm3(path, { recursive: true, force: true });
      removed.push(path);
    } catch {
    }
  }
  return removed;
}

// src/index.ts
var DROP_NAMESPACE = DROP_SETTINGS_NAMESPACE;
var name = "@crosery/dsh-drop";
var Config = DropSettingsSchema;
var FIBER_DISPOSED = 4;
var FIBER_UNLOADING = 5;
function isUnloading(ctx) {
  const state = ctx.fiber?.state;
  return state === FIBER_UNLOADING || state === FIBER_DISPOSED;
}
function mountSettingsSection(ctx, config, hooks) {
  ctx.inject(["settings"], (scoped) => {
    const settings = scoped.settings;
    if (typeof settings.installSection === "function") {
      settings.installSection(ctx, DROP_NAMESPACE, DropSettingsSchema, config, hooks);
      return;
    }
    if (typeof settings.register !== "function") return;
    const scope = settings.register(DROP_NAMESPACE, DropSettingsSchema, {
      base: config,
      validate: hooks.validate
    });
    hooks.setSource(() => scope.get());
    scoped.effect(() => () => {
      if (isUnloading(ctx)) return;
      hooks.setSource(() => config);
      hooks.onChange();
    }, "@crosery/dsh-drop: settings detach");
    hooks.onChange();
    scope.watch(() => {
      if (isUnloading(ctx)) return;
      hooks.onChange();
    });
  });
}
function hostAdmission(ctx) {
  return (req) => {
    const connection = ctx.get("connection");
    if (connection === void 0 || connection === null) return 503;
    if (typeof connection.requestRejection !== "function") return void 0;
    return connection.requestRejection(req);
  };
}
function apply(ctx, config) {
  let source = () => config;
  const root = dshHomePath(STAGE_DIR);
  const reject = hostAdmission(ctx);
  ctx.inject(["webServer"], (scoped) => {
    const batches = batchStore({
      root: () => root,
      limits: () => folderLimitsOf(source()),
      sweepEveryMs: 6e4,
      reject
    });
    scoped.effect(() => () => {
      void batches.dispose();
    }, "@crosery/dsh-drop: folder batches");
    scoped.effect(() => scoped.webServer.register({
      kind: "exact",
      path: STAGE_ROUTE,
      handler: stageHandler({
        root: () => root,
        maxBytes: () => source().maxBytes,
        reject,
        batches
      })
    }), "@crosery/dsh-drop: stage route");
    scoped.effect(() => scoped.webServer.register({
      kind: "exact",
      path: BATCH_ROUTE,
      handler: batches.handler
    }), "@crosery/dsh-drop: batch route");
    scoped.effect(() => scoped.webServer.register({
      kind: "exact",
      path: RESOLVE_ROUTE,
      handler: resolveHandler({
        reject,
        folder: () => {
          const limits = folderLimitsOf(source());
          return { ignore: limits.ignore, maxDepth: limits.maxDepth };
        }
      })
    }), "@crosery/dsh-drop: resolve route");
  });
  let prunedWith;
  const prune = () => {
    const keepDays = source().keepDays;
    if (keepDays === prunedWith) return;
    prunedWith = keepDays;
    void pruneStage(root, keepDays, Date.now()).catch((error) => {
      console.warn(`[dsh-drop] could not prune ${root}`, error);
    });
  };
  mountSettingsSection(ctx, config, {
    setSource: (current) => {
      source = current;
    },
    onChange: prune,
    // `natural()` admits zero, and a zero ceiling refuses every drop while
    // looking like a configured limit rather than a mistake.
    validate: (value) => {
      if (value.maxBytes < 1) throw new Error("crosery-drop.maxBytes must be at least 1 byte");
      for (const field of ["folderMaxFiles", "folderMaxBytes", "folderMaxDepth"]) {
        const limit = value[field];
        if (limit !== void 0 && limit < 1) throw new Error(`crosery-drop.${field} must be at least 1`);
      }
    }
  });
  prune();
}
export {
  BATCH_HEADER,
  BATCH_ROUTE,
  COMPOSER_IMAGE_MEDIA_TYPES,
  Config,
  DEFAULT_FOLDER_IGNORE,
  DEFAULT_FOLDER_MAX_BYTES,
  DEFAULT_FOLDER_MAX_DEPTH,
  DEFAULT_FOLDER_MAX_FILES,
  DROP_NAMESPACE,
  DROP_SETTINGS_NAMESPACE,
  DropSettingsSchema,
  FOLDER_SAMPLE_SIZE,
  MTIME_TOLERANCE_MS,
  RELPATH_HEADER,
  RESOLVE_ROUTE,
  STAGE_DIR,
  STAGE_ROUTE,
  apply,
  batchStore,
  claimDirectory,
  claimMatches,
  crossSite,
  declaresJson,
  fileNameOf,
  folderCandidate,
  folderLimitsOf,
  hostAdmission,
  insideRoot,
  isComposerImageType,
  isIgnoredName,
  isPrunableStageDir,
  mentionFor,
  mountSettingsSection,
  name,
  pathFromFileUrl,
  pruneStage,
  publishDirectory,
  publishStage,
  readClaim,
  refused,
  requestedName,
  resolveHandler,
  safeFolderName,
  safeRelativeSegments,
  safeStageName,
  sendJson,
  stageCandidate,
  stageDayDir,
  stageHandler,
  summarizeDirectory,
  uriListPaths
};
