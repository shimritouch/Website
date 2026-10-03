"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var os = require("os");
var path = require("path");
var storeApi = require("../netlify/functions/lib/store");

function clearServerlessEnv() {
  delete process.env.NETLIFY;
  delete process.env.AWS_LAMBDA_FUNCTION_NAME;
  delete process.env.LAMBDA_TASK_ROOT;
}

test("local store writes next to the project, not /data", async function () {
  clearServerlessEnv();
  var file = path.join(os.tmpdir(), "shimritouch-store-" + Date.now() + ".json");
  process.env.VOUCHER_STORE_FILE = file;
  try {
    var listed = await storeApi.withStore(function (store) {
      return storeApi.emptyStore().vouchers === store.vouchers ? store : store;
    });
    assert.equal(listed.nextCode, 400131);
    assert.equal(fs.existsSync("/data"), false);
    assert.equal(fs.existsSync(file), true);
  } finally {
    delete process.env.VOUCHER_STORE_FILE;
    try {
      fs.unlinkSync(file);
    } catch (err) {
      // ignore
    }
  }
});

test("serverless runtime does not mkdir /data", async function () {
  process.env.AWS_LAMBDA_FUNCTION_NAME = "api";
  delete process.env.NETLIFY_BLOBS_CONTEXT;
  try {
    await storeApi.withStore(function (store) {
      return store;
    }, {});
    assert.fail("should not fall back to a local file on Netlify");
  } catch (err) {
    assert.ok(err && err.message);
    assert.equal(String(err.message).indexOf("mkdir '/data'") === -1, true);
    assert.equal(fs.existsSync("/data"), false);
  } finally {
    delete process.env.AWS_LAMBDA_FUNCTION_NAME;
  }
});
