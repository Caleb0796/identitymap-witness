import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validatePersonasFixture } from "../src/engine/personas.mjs";

const loadFixture = async () => JSON.parse(await readFile(
  new URL("../data/personas.json", import.meta.url),
  "utf8",
));

test("validatePersonasFixture accepts the complete P1–P8 fixture", async () => {
  const fixture = await loadFixture();
  assert.equal(validatePersonasFixture(fixture), fixture);
});

test("validatePersonasFixture rejects every fail-closed corruption shape", async (t) => {
  const valid = await loadFixture();
  const cases = [
    ["non-array", () => ({})],
    ["empty array", () => []],
    ["missing persona", () => structuredClone(valid).slice(0, -1)],
    ["duplicate ID", () => {
      const fixture = structuredClone(valid);
      fixture[7].id = "P1";
      return fixture;
    }],
    ["unexpected ID", () => {
      const fixture = structuredClone(valid);
      fixture[7].id = "P9";
      return fixture;
    }],
    ["missing category", () => {
      const fixture = structuredClone(valid);
      delete fixture[0].category;
      return fixture;
    }],
    ["profiles is not a plain object", () => {
      const fixture = structuredClone(valid);
      fixture[0].profiles = [];
      return fixture;
    }],
    ["source profile is not a plain object", () => {
      const fixture = structuredClone(valid);
      fixture[0].profiles.ad = [];
      return fixture;
    }],
    ["profile attribute is not a string", () => {
      const fixture = structuredClone(valid);
      fixture[0].profiles.okta.managerId = 100;
      return fixture;
    }],
  ];

  for (const [name, corrupt] of cases) {
    await t.test(name, () => {
      assert.throws(() => validatePersonasFixture(corrupt()), TypeError);
    });
  }
});
