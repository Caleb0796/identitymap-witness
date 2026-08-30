// Session store — SPEC.md r2 §8. Mutations bump revision and stale-mark evidence
// by recorded fingerprint; derived records (evidence, packets) never bump.

export function packetFresh(pkt, state) {
  return pkt.revision === state.revision
    && pkt.evidenceIds.every((id) =>
      Object.prototype.hasOwnProperty.call(state.evidence, id) && !state.evidence[id].stale);
}

export function createStore(initial) {
  let state = structuredClone(initial);
  let nextId = 0;
  const uid = (p) => `${p}-${++nextId}`;
  state.pins = state.pins ?? [];
  state.evidence = {};
  state.packets = {};

  function staleWhere(pred) {
    for (const e of Object.values(state.evidence)) if (!e.stale && pred(e)) e.stale = true;
  }

  return {
    getState: () => state,

    snapshot: () => ({ state: structuredClone(state), nextId }),

    restore(snap) {
      state = structuredClone(snap.state);
      nextId = snap.nextId;
    },

    dispatch(action) {
      switch (action.type) {
        case "EDIT_EXPRESSION": {
          if (!(action.field in state.expressions))
            throw Object.assign(new Error(`unknown field ${action.field}`), { code: "INVALID_AST" });
          state.expressions[action.field] = action.expr;
          state.revision += 1;
          staleWhere((e) => e.fingerprint.fields.includes(action.field));
          break;
        }
        case "SET_PRIORITY": {
          state.priority = [...action.priority];
          state.revision += 1;
          staleWhere(() => true);
          break;
        }
        case "PIN_INVARIANTS": {
          // SAFETY (run2 review): a pin "changes" when its MEMBERSHIP changes OR
          // its canonical rule CONTENT changes under an unchanged id — either way
          // evidence that checked it must die.
          const canon = (p) => JSON.stringify(Object.fromEntries(Object.entries(p).sort()));
          const before = new Map(state.pins.map((p) => [p.id, canon(p)]));
          const after = new Map(action.invariants.map((p) => [p.id, canon(p)]));
          const changed = [...new Set([...before.keys(), ...after.keys()])]
            .filter((id) => before.get(id) !== after.get(id));
          state.pins = structuredClone(action.invariants);
          state.revision += 1;
          staleWhere((e) => e.fingerprint.invariants.some((id) => changed.includes(id)));
          break;
        }
        case "UNPIN": {
          state.pins = state.pins.filter((p) => p.id !== action.id);
          state.revision += 1;
          staleWhere((e) => e.fingerprint.invariants.includes(action.id));
          break;
        }
        default:
          throw Object.assign(new Error(`unknown action ${action.type}`), { code: "EVALUATOR_FAILED" });
      }
    },

    recordEvidence(kind, fingerprint, payload) {
      const id = uid("E");
      state.evidence[id] = {
        id, kind, revision: state.revision, stale: false,
        fingerprint: {
          fields: [...(fingerprint.fields ?? [])],
          invariants: [...(fingerprint.invariants ?? [])],
          personas: [...(fingerprint.personas ?? [])],
        },
        payload,
      };
      return id;
    },

    recordPacket(evidenceIds, pinsCovered, blockers) {
      const id = uid("PKT");
      state.packets[id] = { id, revision: state.revision, evidenceIds: [...evidenceIds], pinsCovered, blockers };
      return id;
    },

    listEvidence: () => Object.values(state.evidence),
  };
}
