# ENTRY_READY — the human checklist

`tools/verify.mjs` saying CODE_COMPLETE means the code and local evidence are
done. ENTRY_READY is THIS list, all boxes, human hands only. Deadline
2026-09-03 13:00 PT. Sequence honors the outpocket interlock (their D4 video
records before ours; conflicts resolve in outpocket's favor until their D5).

- [ ] **Deploy** (20m): Render static site from `render.yaml` (publish path `.`).
      Paste the live URL into README.md. Verify `/`, `/app.js`,
      `/data/personas.json` load from the remote origin, AND that
      `/src/tools/defs.mjs` comes back with a JavaScript content-type
      (module loading dies silently on a wrong `.mjs` MIME).
- [ ] **ChatGPT-browser evidence** (45m): ⌘T to the deployed URL in the ChatGPT
      built-in browser. Consent gate → allow. Confirm 5 tools listed. Run the
      witness round trip AND the stale/recovery beat live (edit managerId in the
      grid mid-session; watch the packet get rejected). Capture
      `evidence/chatgpt-run.png` + transcribe to `evidence/chatgpt-run.json`
      (V1 style: transcribe only what the pixels show, never infer).
- [ ] **Oracle audit** (60m): row-by-row check of `data/golden-walk.md` against
      SPEC §6 by hand; then flip `data/oracle.json` `audited:true` and commit with
      trailer `Oracle-Audited: yes`. `eval/run.mjs` must then exit 0.
- [ ] **Video** (2–3h, AFTER outpocket D4): follow `docs/DEMO-SCRIPT.md`. When
      final: write the filename + duration into `evidence/video-final.txt`.
- [ ] **Repo public + submit** (45m, 09-03 morning): add MIT LICENSE, flip repo
      public, submit the four answers from `docs/DEVPOST-DRAFT.md`; then write
      the submission URL into `evidence/devpost-submitted.txt`.
- [ ] **Freeze rehearsal** (30m): clean profile / incognito walk of the deployed
      demo + video link + repo, before 12:00 PT on 09-03.
