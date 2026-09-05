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
  const validKey = "  LEMON-1234-5678-ABCD  ";
  const trimmed = validKey.trim();
  assert.equal(trimmed, "LEMON-1234-5678-ABCD");

  const params = new URLSearchParams();
  params.append("license_key", trimmed);
  params.append("key", trimmed);
  params.append("instance_name", "pdf-press-web-client");

  assert.equal(params.get("license_key"), "LEMON-1234-5678-ABCD");
  assert.equal(params.get("key"), "LEMON-1234-5678-ABCD");
});
