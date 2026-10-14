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
      store.nextCode = 400132;
      return store;
    });
    assert.equal(listed.nextCode, 400132);
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

test("a read does not write the store back", async function () {
  var writes = 0;
  var result = await storeApi.updateWithRetry(
    async function () {
      return { data: { nextCode: 400131, vouchers: { "400131": { status: "active" } }, packages: {} }, etag: "a" };
    },
    async function () {
      writes += 1;
      return { modified: true };
    },
    function (store) {
      return store.vouchers["400131"].status;
    }
  );
  assert.equal(result, "active");
  assert.equal(writes, 0);
});

test("a conflicting save is retried until it lands", async function () {
  var version = {
    data: { nextCode: 400132, vouchers: { "400131": { status: "active", voucher_code: "400131" } }, packages: {} },
    etag: "1",
  };
  var writes = 0;
  await storeApi.updateWithRetry(
    async function () {
      return { data: JSON.parse(JSON.stringify(version.data)), etag: version.etag };
    },
    async function (data, etag) {
      writes += 1;
      if (etag !== version.etag) return { modified: false };
      if (writes === 1) return { modified: false };
      version = { data: data, etag: "2" };
      return { modified: true };
    },
    function (store) {
      store.vouchers["400131"].status = "cancelled";
    }
  );
  assert.equal(version.data.vouchers["400131"].status, "cancelled");
  assert.equal(writes, 2);
});

test("repeated conflicts stop instead of overwriting", async function () {
  await assert.rejects(
    function () {
      return storeApi.updateWithRetry(
        async function () {
          return { data: { nextCode: 400131, vouchers: {}, packages: {} }, etag: "1" };
        },
        async function () {
          return { modified: false };
        },
        function (store) {
          store.nextCode = 400132;
        }
      );
    },
    function (err) {
      return err.statusCode === 409 && err.reason === "conflict";
    }
  );
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
