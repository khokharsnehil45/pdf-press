import test from "node:test";
import assert from "node:assert/strict";

test("License validation payload handling: rejects empty keys cleanly", async () => {
  const emptyKeys = ["", "   ", null, undefined];
  for (const key of emptyKeys) {
    const rawKey = key;
    const isValidInput = !!(rawKey && typeof rawKey === "string" && rawKey.trim());
    assert.equal(isValidInput, false, `Expected ${key} to be marked invalid`);
  }
});

test("License validation payload handling: formats parameters with license_key", async () => {
  const validKey = "  688A25DC-BA6A-40BD-9A3D-D2273175DB07  ";
  const trimmed = validKey.trim();
  assert.equal(trimmed, "688A25DC-BA6A-40BD-9A3D-D2273175DB07");

  const params = new URLSearchParams();
  params.append("license_key", trimmed);

  assert.equal(params.get("license_key"), "688A25DC-BA6A-40BD-9A3D-D2273175DB07");
});

test("Lemon Squeezy Public License Validation Endpoint: validates real test license key", async () => {
  const formBody = new URLSearchParams();
  formBody.append("license_key", "688A25DC-BA6A-40BD-9A3D-D2273175DB07");

  const response = await fetch("https://api.lemonsqueezy.com/v1/licenses/validate", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formBody.toString(),
  });

  assert.equal(response.status, 200, "Lemon Squeezy validate endpoint should return HTTP 200");
  const data = await response.json();
  assert.equal(data.valid, true, "License key should be valid");
  assert.equal(data.meta.store_id, 467546, "Store ID should match");
  assert.equal(data.meta.product_id, 1340039, "Product ID should match");
  assert.equal(data.meta.variant_id, 2093513, "Variant ID should match");
});
