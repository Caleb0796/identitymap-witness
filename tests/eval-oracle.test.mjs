import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { auditTrace } from "../eval/oracle.mjs";

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const clone = (value) => structuredClone(value);
const RULE = { group: "employees", id: "pin-1", personaCategory: "contractor", type: "forbidden_group" };
const fnv1a = (text) => {
  let digest = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    digest ^= byte;
    digest = Math.imul(digest, 0x01000193) >>> 0;
  }
  return digest.toString(16).padStart(8, "0");
};
const RULE_DIGEST = fnv1a(JSON.stringify([RULE]));
const TOOL_NAMES = [
  "read_mapping_session",
  "stage_mapping_invariants",
  "find_mapping_counterexample",
  "preview_mapping_patch",
  "prepare_mapping_review",
];
const authoritative = (snapshot) => ({
  revision: snapshot.state.revision,
  priority: snapshot.state.priority,
  expressions: snapshot.state.expressions,
  pins: snapshot.state.pins,
});
const base = () => ({
  state: {
    revision: 17,
    priority: ["ad", "hris"],
    expressions: { group: 'user.userType == "contractor" ? "contractors" : "employees"' },
    pins: [],
    pending: null,
    evidence: {},
    packets: {},
  },
  nextId: 0,
  nextPendingVersion: 0,
});

const readPayload = (snapshot) => ({
  revision: snapshot.state.revision,
  priority: clone(snapshot.state.priority),
  fields: Object.entries(snapshot.state.expressions)
    .map(([field, expr]) => ({ field, expr, defectFree: null })),
  pinIds: snapshot.state.pins.map((rule) => rule.id),
  pendingRuleIds: snapshot.state.pending?.rules.map((rule) => rule.id) ?? [],
  pendingVersion: snapshot.state.pending?.version ?? null,
  personaCount: 8,
});

const findPayload = (evidenceId) => ({
  revision: 17,
  cleanSweep: false,
  fullSweep: true,
  checkedInvariantIds: ["pin-1"],
  personaIds: ["P-1"],
  violations: [{
    invariantId: "pin-1", personaId: "P-1", field: "group", detail: "synthetic violation",
  }],
  coverage: { "pin-1": true },
  evidenceIds: [evidenceId],
});

const previewPayload = (evidenceId) => ({
  revision: 17,
  field: "group",
  diffs: [],
  remainingViolations: 0,
  evidenceId,
});

const preparePayload = (packetId) => ({
  revision: 17,
  packetId,
  coverage: { "pin-1": true },
  blockers: [],
  evidenceIds: ["E-1"],
});

const evidenceRecord = (id, kind = "counterexample") => ({
  id,
  kind,
  revision: 17,
  stale: false,
  fingerprint: { fields: [], invariants: [], personas: [] },
  payload: {},
});

const packetRecord = (id, evidenceIds = []) => ({
  id,
  revision: 17,
  evidenceIds,
  pinsCovered: [],
  blockers: [],
});

function entry(toolName, before, after, payload, extra = {}) {
  return {
    round: 1,
    kind: "tool",
    toolName,
    invocationId: "invocation-1",
    status: "Completed",
    matched: true,
    stateHashBefore: hash(before),
    stateHashAfter: hash(after),
    authoritativeHashBefore: hash(authoritative(before)),
    authoritativeHashAfter: hash(authoritative(after)),
    snapshotBefore: before,
    snapshotAfter: after,
    payload,
    ...extra,
  };
}

test("four-hash allowlist accepts only each tool's exact derived-state delta", () => {
  const stagedBefore = base();
  const stagedAfter = clone(stagedBefore);
  stagedAfter.nextPendingVersion = 1;
  stagedAfter.state.pending = {
    version: 1,
    digest: RULE_DIGEST,
    rules: [RULE],
  };
  const stagePayload = {
    revision: 17,
    status: "pending_confirmation",
    pendingVersion: 1,
    pendingRuleIds: ["pin-1"],
    digest: RULE_DIGEST,
    nextStep: "the human must review and confirm the pending rules on the page; then call read_mapping_session",
  };

  const derivedBefore = base();
  derivedBefore.state.pins = clone(stagedAfter.state.pending.rules);
  derivedBefore.nextPendingVersion = 1;
  const findAfter = clone(derivedBefore);
  findAfter.nextId = 1;
  findAfter.state.evidence["E-1"] = evidenceRecord("E-1");
  const previewAfter = clone(findAfter);
  previewAfter.nextId = 2;
  previewAfter.state.evidence["E-2"] = evidenceRecord("E-2", "patch-preview");
  const prepareAfter = clone(previewAfter);
  prepareAfter.nextId = 3;
  prepareAfter.state.packets["PKT-3"] = packetRecord("PKT-3", ["E-1"]);

  const failed = entry("find_mapping_counterexample", prepareAfter, prepareAfter, {
    error: { code: "REVISION_MISMATCH", currentRevision: 17 },
  });
  const trace = [
    entry("stage_mapping_invariants", stagedBefore, stagedAfter, stagePayload),
    entry("stage_mapping_invariants", stagedAfter, stagedAfter, stagePayload),
    entry("find_mapping_counterexample", derivedBefore, findAfter, findPayload("E-1")),
    entry("preview_mapping_patch", findAfter, previewAfter, previewPayload("E-2")),
    entry("prepare_mapping_review", previewAfter, prepareAfter, preparePayload("PKT-3")),
    entry("read_mapping_session", prepareAfter, prepareAfter, readPayload(prepareAfter)),
    failed,
  ];

  assert.deepEqual(auditTrace(trace), {
    failedCallHashFailures: [],
    writeOracleFailures: [],
  });
});

test("allowlist sees hidden allocator changes and enforces exact increments", () => {
  const before = base();
  const badStage = clone(before);
  badStage.nextPendingVersion = 2;
  badStage.state.pending = { version: 2, digest: RULE_DIGEST, rules: [RULE] };
  const badFind = clone(before);
  badFind.nextId = 2;
  badFind.state.evidence["E-1"] = evidenceRecord("E-1");
  badFind.state.evidence["E-2"] = evidenceRecord("E-2");
  const badRead = clone(before);
  badRead.nextPendingVersion = 1;

  for (const [toolName, after, payload, reason] of [
    ["stage_mapping_invariants", badStage, {
      revision: 17, status: "pending_confirmation",
      pendingVersion: 2, pendingRuleIds: ["pin-1"], digest: RULE_DIGEST,
      nextStep: "the human must review and confirm the pending rules on the page; then call read_mapping_session",
    }, /nextPendingVersion must increment by exactly 1/],
    ["find_mapping_counterexample", badFind, findPayload("E-1"), /nextId must increment by exactly 1/],
    ["read_mapping_session", badRead, readPayload(badRead), /read must leave the full snapshot unchanged/],
  ]) {
    const result = auditTrace([entry(toolName, before, after, payload)]);
    assert.ok(result.writeOracleFailures.some((failure) => reason.test(failure.reason)),
      `${toolName}: ${JSON.stringify(result.writeOracleFailures)}`);
  }
});

test("allowlist rejects authoritative writes and wrong returned derived ids", () => {
  const before = base();
  const authoritativeWrite = clone(before);
  authoritativeWrite.state.revision = 18;
  const findAfter = clone(before);
  findAfter.nextId = 1;
  findAfter.state.evidence["E-1"] = evidenceRecord("E-1");

  const authResult = auditTrace([entry("read_mapping_session", before, authoritativeWrite,
    readPayload(authoritativeWrite))]);
  assert.ok(authResult.writeOracleFailures.some((failure) => /authoritative slice changed/.test(failure.reason)));
  assert.ok(authResult.writeOracleFailures.some((failure) => /revision changed/.test(failure.reason)));

  const idResult = auditTrace([
    entry("find_mapping_counterexample", before, findAfter, findPayload("E-wrong")),
  ]);
  assert.ok(idResult.writeOracleFailures.some((failure) => /returned evidence ids/.test(failure.reason)));
});

test("failed and malformed calls require valid equal full-state hashes", () => {
  const snapshot = base();
  const malformed = entry("find_mapping_counterexample", snapshot, snapshot, null, {
    status: "Error",
    matched: false,
  });
  delete malformed.stateHashAfter;

  const result = auditTrace([malformed]);
  assert.equal(result.failedCallHashFailures.length, 1);
  assert.ok(result.writeOracleFailures.some((failure) => /four valid SHA-256 hashes/.test(failure.reason)));
});

test("raw snapshot and hash tampering fail closed", () => {
  const snapshot = base();
  const fakeHash = entry("read_mapping_session", snapshot, snapshot, readPayload(snapshot));
  fakeHash.stateHashAfter = "0".repeat(64);

  const extraKeyAfter = clone(snapshot);
  extraKeyAfter.state.unexpected = true;
  const extraKey = entry("read_mapping_session", snapshot, extraKeyAfter, readPayload(extraKeyAfter));

  const missingRaw = entry("read_mapping_session", snapshot, snapshot, readPayload(snapshot));
  delete missingRaw.snapshotAfter;

  for (const [tampered, reason] of [
    [fakeHash, /recorded hashes do not match/],
    [extraKey, /complete typed snapshot sections/],
    [missingRaw, /complete typed snapshot sections/],
  ]) {
    const result = auditTrace([tampered]);
    assert.ok(result.writeOracleFailures.some((failure) => reason.test(failure.reason)),
      JSON.stringify(result.writeOracleFailures));
  }
});

test("read rejects a key-order-only full-snapshot rewrite", () => {
  const before = base();
  before.nextId = 2;
  before.state.evidence = {
    "E-1": evidenceRecord("E-1"),
    "E-2": evidenceRecord("E-2"),
  };
  const after = clone(before);
  after.state.evidence = {
    "E-2": after.state.evidence["E-2"],
    "E-1": after.state.evidence["E-1"],
  };
  assert.notEqual(hash(before), hash(after));

  const result = auditTrace([entry("read_mapping_session", before, after, readPayload(after))]);
  assert.ok(result.writeOracleFailures.some((failure) => /full snapshot unchanged/.test(failure.reason)),
    JSON.stringify(result.writeOracleFailures));
});

test("old derived records, unknown tools, and malformed invocation ids fail closed", () => {
  const before = base();
  before.nextId = 1;
  before.state.evidence["E-1"] = evidenceRecord("E-1");
  const after = clone(before);
  after.nextId = 2;
  after.state.evidence["E-1"].stale = true;
  after.state.evidence["E-2"] = evidenceRecord("E-2");
  const modifiedOld = auditTrace([
    entry("find_mapping_counterexample", before, after, findPayload("E-2")),
  ]);
  assert.ok(modifiedOld.writeOracleFailures.some((failure) => /returned evidence ids/.test(failure.reason)));

  const unknown = auditTrace([entry("mystery_tool", before, before, { revision: 17 })]);
  assert.ok(unknown.writeOracleFailures.some((failure) => /unknown tool/.test(failure.reason)));

  const noInvocation = entry("read_mapping_session", before, before, readPayload(before));
  noInvocation.invocationId = "";
  const malformed = auditTrace([noInvocation]);
  assert.ok(malformed.writeOracleFailures.some((failure) => /non-empty invocationId/.test(failure.reason)));

  const whitespaceInvocation = entry("read_mapping_session", before, before, readPayload(before));
  whitespaceInvocation.invocationId = "   ";
  const whitespaceResult = auditTrace([whitespaceInvocation]);
  assert.ok(whitespaceResult.writeOracleFailures.some((failure) => /non-empty invocationId/.test(failure.reason)));

  const noKind = entry("read_mapping_session", before, before, readPayload(before));
  delete noKind.kind;
  const kindResult = auditTrace([noKind]);
  assert.ok(kindResult.writeOracleFailures.some((failure) => /kind tool/.test(failure.reason)));
});

test("malformed success and error envelopes fail closed", () => {
  const snapshot = base();
  const payloads = [
    {},
    { error: null },
    { error: false },
    { error: {} },
    { error: { code: "   " } },
    { error: { code: "MADE_UP" } },
    { revision: 17, error: { code: "REVISION_MISMATCH" } },
  ];

  for (const payload of payloads) {
    const result = auditTrace([entry("read_mapping_session", snapshot, snapshot, payload)]);
    assert.ok(result.writeOracleFailures.some((failure) => /valid success or error envelope/.test(failure.reason)),
      JSON.stringify({ payload, failures: result.writeOracleFailures }));
  }

  for (const malformed of [
    entry("read_mapping_session", snapshot, snapshot, { error: { code: "STALE_EVIDENCE" } }),
    entry("stage_mapping_invariants", snapshot, snapshot, { error: { code: "REVISION_MISMATCH" } }),
    entry("stage_mapping_invariants", snapshot, snapshot, { error: { code: "BAD_RULE" } }),
    entry("stage_mapping_invariants", snapshot, snapshot, { error: { code: "PENDING_EXISTS" } }),
    entry("find_mapping_counterexample", snapshot, snapshot, { error: { code: "WITNESS_EXCEEDS_CAP" } }),
    entry("find_mapping_counterexample", snapshot, snapshot, {
      error: { code: "WITNESS_EXCEEDS_CAP", witnessSize: 1, maxPersonas: 8 },
    }),
    entry("preview_mapping_patch", snapshot, snapshot, { error: { code: "INVALID_AST" } }),
    entry("prepare_mapping_review", snapshot, snapshot, { error: { code: "STALE_EVIDENCE" } }),
    entry("stage_mapping_invariants", snapshot, snapshot, {
      error: { code: "REVISION_MISMATCH", currentRevision: 999 },
    }),
    entry("stage_mapping_invariants", snapshot, snapshot, {
      error: { code: "REVISION_MISMATCH", reason: "detail withheld by output budget" },
    }),
    entry("find_mapping_counterexample", snapshot, snapshot, {
      error: { code: "WITNESS_EXCEEDS_CAP", reason: "detail withheld by privacy guard" },
    }),
    entry("stage_mapping_invariants", snapshot, snapshot, {
      error: { code: "PENDING_EXISTS", reason: "arbitrary" },
    }),
    entry("find_mapping_counterexample", snapshot, snapshot, {
      error: { code: "NO_INVARIANTS", reason: "arbitrary" },
    }),
    entry("prepare_mapping_review", snapshot, snapshot, {
      error: { code: "NO_EVIDENCE", reason: "detail withheld by output budget" },
    }),
    entry("prepare_mapping_review", snapshot, snapshot, {
      error: { code: "NO_EVIDENCE" },
    }, { input: { expectedRevision: 17, evidenceIds: [] } }),
  ]) {
    const result = auditTrace([malformed]);
    assert.ok(result.writeOracleFailures.some((failure) => /valid success or error envelope/.test(failure.reason)),
      JSON.stringify(result.writeOracleFailures));
  }

  const nonJson = entry("stage_mapping_invariants", snapshot, snapshot, {
    error: { code: "BAD_RULE", reason: "invalid", junk: new Date(0) },
  });
  const symbolPayload = { error: { code: "BAD_RULE", reason: "invalid" } };
  symbolPayload[Symbol("hidden")] = true;
  for (const malformed of [nonJson,
    entry("stage_mapping_invariants", snapshot, snapshot, symbolPayload)]) {
    const result = auditTrace([malformed]);
    assert.ok(result.writeOracleFailures.some((failure) => /object payload|valid success or error envelope/.test(failure.reason)),
      JSON.stringify(result.writeOracleFailures));
  }
});

test("transport failures are complete and exact for every tool", () => {
  const snapshot = base();
  for (const toolName of TOOL_NAMES) {
    for (const error of [
      { code: "ABORTED" },
      { code: "INVALID_INPUT", reason: "schema rejected input" },
    ]) {
      assert.deepEqual(auditTrace([
        entry(toolName, snapshot, snapshot, { error }),
      ]), {
        failedCallHashFailures: [],
        writeOracleFailures: [],
      }, `${toolName} ${error.code}`);
    }

    for (const error of [
      { code: "ABORTED", reason: "unexpected" },
      { reason: "missing code" },
      { code: "ABORTED", extra: true },
      { code: "INVALID_INPUT" },
      { code: "INVALID_INPUT", reason: "" },
      { code: "INVALID_INPUT", reason: "schema rejected input", extra: true },
    ]) {
      const result = auditTrace([entry(toolName, snapshot, snapshot, { error })]);
      assert.ok(result.writeOracleFailures.some((failure) =>
        /valid success or error envelope/.test(failure.reason)),
      `${toolName} ${JSON.stringify(error)}: ${JSON.stringify(result.writeOracleFailures)}`);
    }
  }
});

test("read success envelope must exactly describe the captured state", () => {
  const snapshot = base();
  const valid = readPayload(snapshot);
  assert.deepEqual(auditTrace([entry("read_mapping_session", snapshot, snapshot, valid)]), {
    failedCallHashFailures: [],
    writeOracleFailures: [],
  });

  for (const payload of [
    { ...valid, revision: 18 },
    { ...valid, pinIds: ["phantom"] },
    { ...valid, personaCount: 0 },
    { ...valid, extra: true },
  ]) {
    const result = auditTrace([entry("read_mapping_session", snapshot, snapshot, payload)]);
    assert.ok(result.writeOracleFailures.some((failure) => /valid success or error envelope/.test(failure.reason)),
      JSON.stringify(result.writeOracleFailures));
  }
});

test("derived-tool success envelopes require every contracted field", () => {
  const before = base();
  before.state.pins = [{
    group: "employees", id: "pin-1", personaCategory: "contractor", type: "forbidden_group",
  }];
  const findAfter = clone(before);
  findAfter.nextId = 1;
  findAfter.state.evidence["E-1"] = evidenceRecord("E-1");
  const previewAfter = clone(before);
  previewAfter.nextId = 1;
  previewAfter.state.evidence["E-1"] = evidenceRecord("E-1", "patch-preview");
  const prepareAfter = clone(before);
  prepareAfter.nextId = 1;
  prepareAfter.state.packets["PKT-1"] = packetRecord("PKT-1");

  for (const [toolName, after, payload] of [
    ["find_mapping_counterexample", findAfter, { revision: 17, evidenceIds: ["E-1"] }],
    ["preview_mapping_patch", previewAfter, { revision: 17, evidenceId: "E-1" }],
    ["prepare_mapping_review", prepareAfter, { revision: 17, packetId: "PKT-1" }],
  ]) {
    const result = auditTrace([entry(toolName, before, after, payload)]);
    assert.ok(result.writeOracleFailures.some((failure) => /valid success or error envelope/.test(failure.reason)),
      `${toolName}: ${JSON.stringify(result.writeOracleFailures)}`);
  }
});

test("find booleans and preview field/value semantics fail closed", () => {
  const before = base();
  before.state.pins = [RULE];
  const findAfter = clone(before);
  findAfter.nextId = 1;
  findAfter.state.evidence["E-1"] = evidenceRecord("E-1");
  const stringBoolean = { ...findPayload("E-1"), cleanSweep: "false" };
  const findResult = auditTrace([
    entry("find_mapping_counterexample", before, findAfter, stringBoolean),
  ]);
  assert.ok(findResult.writeOracleFailures.some((failure) => /valid success or error envelope/.test(failure.reason)),
    JSON.stringify(findResult.writeOracleFailures));

  const previewAfter = clone(before);
  previewAfter.nextId = 1;
  previewAfter.state.evidence["E-1"] = evidenceRecord("E-1", "patch-preview");
  const bogusPreview = {
    ...previewPayload("E-1"),
    field: "bogus",
    diffs: [{ personaId: "P-1", field: "bogus", before: {}, after: [] }],
  };
  const previewResult = auditTrace([
    entry("preview_mapping_patch", before, previewAfter, bogusPreview),
  ]);
  assert.ok(previewResult.writeOracleFailures.some((failure) => /valid success or error envelope/.test(failure.reason)),
    JSON.stringify(previewResult.writeOracleFailures));
});

test("raw derived ids cannot run ahead of the hidden allocator", () => {
  const corrupt = base();
  corrupt.state.evidence["E-1"] = evidenceRecord("E-1");
  const ahead = base();
  ahead.nextId = 100;
  for (const snapshot of [corrupt, ahead]) {
    const result = auditTrace([
      entry("read_mapping_session", snapshot, snapshot, readPayload(snapshot)),
    ]);
    assert.ok(result.writeOracleFailures.some((failure) => /complete typed snapshot sections/.test(failure.reason)),
      JSON.stringify(result.writeOracleFailures));
  }
});

test("malformed pending snapshots report failures instead of throwing", () => {
  const snapshot = base();
  snapshot.nextPendingVersion = 1;
  snapshot.state.pending = { version: 1, digest: "00000000", rules: [null] };
  const malformed = entry("read_mapping_session", snapshot, snapshot, {
    revision: 17,
    priority: ["ad", "hris"],
    fields: [{
      field: "group",
      expr: 'user.userType == "contractor" ? "contractors" : "employees"',
      defectFree: null,
    }],
    pinIds: [],
    pendingRuleIds: [],
    pendingVersion: 1,
    personaCount: 8,
  });

  let result;
  assert.doesNotThrow(() => { result = auditTrace([malformed]); });
  assert.ok(result.writeOracleFailures.some((failure) => /complete typed snapshot sections/.test(failure.reason)),
    JSON.stringify(result.writeOracleFailures));
});
