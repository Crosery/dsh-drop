// src/index.ts
import { dshHomePath } from "@deepseek-ai/dsh-home-paths";

// src/contract.ts
var STAGE_ROUTE = "/crosery/dsh-drop/stage";
var RESOLVE_ROUTE = "/crosery/dsh-drop/resolve";
var DROP_SETTINGS_NAMESPACE = "crosery-drop";
var NAME_HEADER = "x-dsh-drop-name";
var STAGE_DIR = "drops";
var MAX_BYTES_FIELD = "maxBytes";
var KEEP_DAYS_FIELD = "keepDays";
var DEFAULT_MAX_BYTES = 512 * 1024 * 1024;
var DEFAULT_KEEP_DAYS = 30;
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
  const cleaned = segment.replace(/[\u0000-\u001F\u007F"]/g, "").trim();
  if (cleaned === "" || /^\.+$/.test(cleaned)) return FALLBACK_NAME;
  const dot = cleaned.lastIndexOf(".");
  const hasExt = dot > 0 && dot < cleaned.length - 1;
  const base = hasExt ? cleaned.slice(0, dot) : cleaned;
  const ext = hasExt ? cleaned.slice(dot) : "";
  const fit = (value, budget) => {
    let result = "";
    const encoder = new TextEncoder();
    for (const character of value) {
      if (encoder.encode(result + character).length > budget) break;
      result += character;
    }
    return result;
  };
  const trimmed = fit(base, MAX_BASE_LENGTH);
  return trimmed === "" ? FALLBACK_NAME : trimmed + fit(ext, 32);
}
function stageCandidate(name2, attempt) {
  if (attempt === 0) return name2;
  const dot = name2.lastIndexOf(".");
  const hasExt = dot > 0 && dot < name2.length - 1;
  const base = hasExt ? name2.slice(0, dot) : name2;
  const ext = hasExt ? name2.slice(dot) : "";
  return `${base}-${attempt + 1}${ext}`;
}
function mentionFor(path) {
  return /[\s"]/.test(path) ? `@"${path}"` : `@${path}`;
}
function fileNameOf(path) {
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const name2 = cut < 0 ? path : path.slice(cut + 1);
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
  [MAX_BYTES_FIELD]: z.natural().default(DEFAULT_MAX_BYTES),
  [KEEP_DAYS_FIELD]: z.natural().default(DEFAULT_KEEP_DAYS)
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
function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  res.end(payload);
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
    if (req.method !== "POST") {
      json(res, 405, { error: "method" });
      return;
    }
    if (typeof req.headers[NAME_HEADER] !== "string" || req.headers["sec-fetch-site"] !== void 0 && req.headers["sec-fetch-site"] !== "same-origin") {
      req.resume();
      json(res, 403, { error: "forbidden" });
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
import { stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
var MAX_BODY_BYTES = 8192;
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
function resolveHandler() {
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
    if (req.method !== "POST") {
      json2(res, 405, { error: "method" });
      return;
    }
    const claim = await readClaim(req);
    if (claim === void 0 || !isAbsolute(claim.path) || /[\u0000-\u001f\u007f"]/.test(claim.path)) {
      json2(res, 404, { error: "no-match" });
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

// src/prune.ts
import { readdir, rm as rm2 } from "node:fs/promises";
import { join as join2 } from "node:path";
async function pruneStage(root, keepDays, now) {
  if (keepDays <= 0) return [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const removed = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!isPrunableStageDir(entry.name, keepDays, now)) continue;
    const path = join2(root, entry.name);
    try {
      await rm2(path, { recursive: true, force: true });
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
function apply(ctx, config) {
  let source = () => config;
  const root = dshHomePath(STAGE_DIR);
  ctx.inject(["webServer"], (scoped) => {
    scoped.effect(() => scoped.webServer.register({
      kind: "exact",
      path: STAGE_ROUTE,
      handler: stageHandler({
        root: () => root,
        maxBytes: () => source().maxBytes
      })
    }), "@crosery/dsh-drop: stage route");
    scoped.effect(() => scoped.webServer.register({
      kind: "exact",
      path: RESOLVE_ROUTE,
      handler: resolveHandler()
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
    }
  });
  prune();
}
export {
  COMPOSER_IMAGE_MEDIA_TYPES,
  Config,
  DROP_NAMESPACE,
  DROP_SETTINGS_NAMESPACE,
  DropSettingsSchema,
  MTIME_TOLERANCE_MS,
  RESOLVE_ROUTE,
  STAGE_DIR,
  STAGE_ROUTE,
  apply,
  claimMatches,
  fileNameOf,
  insideRoot,
  isComposerImageType,
  isPrunableStageDir,
  mentionFor,
  mountSettingsSection,
  name,
  pathFromFileUrl,
  pruneStage,
  publishStage,
  readClaim,
  requestedName,
  resolveHandler,
  safeStageName,
  stageCandidate,
  stageDayDir,
  stageHandler,
  uriListPaths
};
