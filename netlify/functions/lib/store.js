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

async function withBlobs(mutator, event) {
  var blobs = loadBlobs();
  if (!blobs || !blobs.getStore) {
    throw new Error("חסר מודול @netlify/blobs");
  }
  if (event && typeof blobs.connectLambda === "function") {
    blobs.connectLambda(event);
  }
  var store = blobs.getStore(STORE_NAME);
  var raw = await store.get(STORE_KEY, { type: "json" });
  var data = parseStore(raw);
  var result = await mutator(data);
  await store.setJSON(STORE_KEY, data);
  return result;
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
  var local = readFileStore(file);
  var out = await mutator(local);
  writeFileStore(file, local);
  return out;
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

module.exports = { withStore: withStore, emptyStore: emptyStore };
