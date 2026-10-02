"use strict";

var fs = require("fs");
var path = require("path");

var FALLBACK_FILE = path.join(__dirname, "..", "..", "..", "data", "store.json");

function emptyStore() {
  return { nextCode: 400131, vouchers: {}, packages: {} };
}

function readFileStore() {
  try {
    if (!fs.existsSync(FALLBACK_FILE)) return emptyStore();
    return Object.assign(emptyStore(), JSON.parse(fs.readFileSync(FALLBACK_FILE, "utf8")));
  } catch (err) {
    return emptyStore();
  }
}

function writeFileStore(data) {
  var dir = path.dirname(FALLBACK_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(FALLBACK_FILE, JSON.stringify(data, null, 2));
}

async function withStore(mutator) {
  var blobs;
  try {
    blobs = require("@netlify/blobs");
  } catch (err) {
    blobs = null;
  }

  if (blobs && blobs.getStore) {
    var store = blobs.getStore("shimritouch-vouchers");
    var raw = await store.get("db");
    var data = raw ? Object.assign(emptyStore(), JSON.parse(raw)) : emptyStore();
    var result = await mutator(data);
    await store.set("db", JSON.stringify(data));
    return result;
  }

  var local = readFileStore();
  var out = await mutator(local);
  writeFileStore(local);
  return out;
}

module.exports = { withStore: withStore, emptyStore: emptyStore };
