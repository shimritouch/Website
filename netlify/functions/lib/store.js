"use strict";

var fs = require("fs");
var path = require("path");

var STORE_NAME = "shimritouch-vouchers";
var STORE_KEY = "db";

function emptyStore() {
  return { nextCode: 400131, vouchers: {}, packages: {} };
}

function isServerlessRuntime() {
  return Boolean(
    process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT
  );
}

function loadBlobs() {
  try {
    return require("@netlify/blobs");
  } catch (err) {
    return null;
  }
}

function parseStore(raw) {
  if (!raw) return emptyStore();
  if (typeof raw === "object") return Object.assign(emptyStore(), raw);
  return Object.assign(emptyStore(), JSON.parse(raw));
}

function conflictError() {
  var err = new Error("השמירה התנגשה עם פעולה אחרת. נסו שוב.");
  err.statusCode = 409;
  err.reason = "conflict";
  return err;
}

async function updateWithRetry(read, write, mutator) {
  for (var attempt = 0; attempt < 5; attempt += 1) {
    var current = await read();
    var before = parseStore(current && current.data);
    var snapshot = JSON.stringify(before);
    var data = JSON.parse(snapshot);
    var result = await mutator(data);
    if (JSON.stringify(data) === snapshot) return result;
    var written = await write(data, current && current.etag);
    if (!written || written.modified !== false) return result;
  }
  throw conflictError();
}

async function withBlobs(mutator, event) {
  var blobs = loadBlobs();
  if (!blobs || !blobs.getStore) {
    throw new Error("חסר מודול @netlify/blobs");
  }
  if (event && typeof blobs.connectLambda === "function") {
    blobs.connectLambda(event);
  }
  var store = blobs.getStore({ name: STORE_NAME, consistency: "strong" });
  return updateWithRetry(
    async function () {
      var current = await store.getWithMetadata(STORE_KEY, { type: "json", consistency: "strong" });
      return { data: current && current.data, etag: current && current.etag };
    },
    function (data, etag) {
      if (etag) return store.setJSON(STORE_KEY, data, { onlyIfMatch: etag });
      return store.setJSON(STORE_KEY, data, { onlyIfNew: true });
    },
    mutator
  );
}

function localFilePath() {
  if (process.env.VOUCHER_STORE_FILE) return process.env.VOUCHER_STORE_FILE;
  return path.join(process.cwd(), "data", "store.json");
}

function readFileStore(file) {
  try {
    if (!fs.existsSync(file)) return emptyStore();
    return parseStore(fs.readFileSync(file, "utf8"));
  } catch (err) {
    return emptyStore();
  }
}

function writeFileStore(file, data) {
  var dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

async function withFileStore(mutator) {
  var file = localFilePath();
  return updateWithRetry(
    async function () {
      return { data: readFileStore(file), etag: "" };
    },
    async function (data) {
      writeFileStore(file, data);
      return { modified: true };
    },
    mutator
  );
}

async function withStore(mutator, event) {
  if (isServerlessRuntime()) {
    return withBlobs(mutator, event);
  }
  try {
    return await withBlobs(mutator, event);
  } catch (err) {
    return withFileStore(mutator);
  }
}

module.exports = { withStore: withStore, emptyStore: emptyStore, updateWithRetry: updateWithRetry };
