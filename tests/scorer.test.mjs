import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { score, scoreTrace } from "../eval/scorer.mjs";

const HEAD = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
const VIOLATIONS = [
  { personaId: "P2", invariantId: "inv-forbid", field: "group" },
  { personaId: "P3", invariantId: "inv-null", field: "managerId" },
  { personaId: "P4", invariantId: "inv-sot", field: "department" },
  { personaId: "P5", invariantId: "inv-sot", field: "department" },
];

const counterexample = (overrides = {}) => ({
  round: 3,
  kind: "tool",
  toolName: "find_mapping_counterexample",
  invocationId: "invocation-counterexample",
  status: "Completed",
  matched: true,
  payload: { personaIds: ["P2", "P3", "P4"], violations: VIOLATIONS },
  ...overrides,
});

async function writeTrace(t, body) {
  const dir = await mkdtemp(join(tmpdir(), "identitymap-scorer-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, "relay.json");
  await writeFile(file, typeof body === "string" ? body : JSON.stringify(body));
  return file;
}

test("score reads the explicit trace path", async (t) => {
  const file = await writeTrace(t, { sha: HEAD, trace: [counterexample()] });

  const result = await score(file);

  assert.equal(result.traceFile, file);
  assert.equal(result.recall, "4/4");
});

test("score rejects a trace from a different HEAD", async (t) => {
  const file = await writeTrace(t, { sha: `not-${HEAD}`, trace: [counterexample()] });

  await assert.rejects(score(file), /trace sha .* does not match current HEAD/i);
});

test("score rejects malformed JSON", async (t) => {
  const file = await writeTrace(t, "{ malformed");

  await assert.rejects(score(file), SyntaxError);
});

test("scoreTrace scores the bound document without reopening its path", async (t) => {
  const file = await writeTrace(t, "{ replaced after binding");

  const result = await scoreTrace({ sha: HEAD, trace: [counterexample()] }, file, HEAD);

  assert.equal(result.traceFile, file);
  assert.equal(result.recall, "4/4");
});

test("locator skips malformed finds before the completed counterexample", async (t) => {
  const invalidPayload = { personaIds: ["INVALID"], violations: VIOLATIONS };
  const candidates = [
    ["clean sweep", { payload: { personaIds: [], violations: [] } }],
    ["non-completed status", { status: "Failed", payload: invalidPayload }],
    ["unmatched invocation", { matched: false, payload: invalidPayload }],
    ["empty invocation id", { invocationId: "", payload: invalidPayload }],
  ];

  for (const [name, overrides] of candidates) await t.test(name, async (t) => {
    const file = await writeTrace(t, {
      sha: HEAD,
      trace: [counterexample(overrides), counterexample()],
    });

    const result = await score(file);

    assert.equal(result.recall, "4/4");
    assert.deepEqual(result.witness, ["P2", "P3", "P4"]);
  });
});

test("score rejects a trace with no qualifying counterexample find", async (t) => {
  const file = await writeTrace(t, {
    sha: HEAD,
    trace: [
      counterexample({ payload: { personaIds: [], violations: [] } }),
      counterexample({ status: "Failed" }),
      counterexample({ matched: false }),
      counterexample({ invocationId: null }),
    ],
  });

  await assert.rejects(score(file), /no qualifying find_mapping_counterexample/);
});
