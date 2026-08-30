# IdentityMap Witness：WebMCP Challenge 获奖准备度、实现、测试与竞品评审

> 评审快照：2026-08-29（America/Los_Angeles）  
> 仓库：[`Caleb0796/identitymap-witness`](https://github.com/Caleb0796/identitymap-witness)  
> 代码版本：`afc9a39`  
> Live：[`identitymap-witness.onrender.com`](https://identitymap-witness.onrender.com)  
> 官方截止：2026-09-03 13:00 PT

## 1. 结论先行

IdentityMap Witness 有真实且目前未发现直接同类的竞争优势：它不是泛化的“agent 提案、human approve”，而是在**浏览器页面内尚未保存的 identity/profile mapping 草稿**上，寻找覆盖全部业务不变量的**最小反例 persona 集合**，展示 losing source，并让相关人工编辑立即使证据失效。

这个内核同时匹配 WebMCP Leverage 和 Creativity。但当前版本还不能直接冻结参赛：最危险的问题不是功能少，而是几处实现与“safe contract”宣传相反。非法或空 invariant 可以得到假 GREEN；旧 GREEN packet 在编辑后仍保持 GREEN 并启用 Apply；错误返回绕过 PII 清洗；`stage_mapping_invariants` 可能返回失败却已经改变状态；可见页面也无法修改 source priority。任何一项在评委演示中出现，都会比缺少一个新功能更伤。

建议的总策略是：

1. **先把 trust contract 做到不可绕过。** 这是一票否决级工作。
2. **再把完整的人机闭环做成 30 秒内可见的评委路径。** 不让评委读 SPEC 才知道亮点。
3. **最后补一项 Impact 证据。** 首选浏览器本地 SCIM-shaped JSON 导入与可下载 review packet，不做真实写入 API。
4. **不要临近截止扩成通用平台。** 不增加后端签名服务、动态 commit/apply、几十个工具或跨站 portal。

推荐统一使用的一句话定位：

> On an unsaved identity-mapping draft, IdentityMap Witness finds the smallest set of synthetic people that proves every violated business invariant, then invalidates that evidence when the human changes what it depended on.

这句话比 “the agent proves, the human signs” 更有辨识度；后者在本次公开候选中已经高度同质化。

## 2. 官方比赛要求与当前提交资格

权威来源：

- [Devpost 官方规则](https://webmcp.devpost.com/rules)
- [Devpost 比赛主页](https://webmcp.devpost.com/)
- [官方 Resources / FAQ](https://webmcp.devpost.com/resources)
- [OpenAI WebMCP Challenge 页面](https://openai.com/webmcp-challenge/)
- [Chrome WebMCP secure tools 指南](https://developer.chrome.com/docs/ai/webmcp/secure-tools)
- [Chrome WebMCP evals 指南](https://developer.chrome.com/docs/ai/webmcp/evals)

正式评审先经过主题/API 适配的 pass/fail，再按四项等权评分：

1. WebMCP Leverage
2. Execution
3. Potential Impact
4. Creativity & Ambition

同分时先比较 WebMCP Leverage，然后依次比较后续指标。因此，“为什么必须在页面当前 session 中做”应是视频和文案的第一证明，而不是附录。

### 2.1 提交硬要求检查

| 要求 | 当前状态 | 结论 / 动作 |
|---|---|---|
| 实际使用 `document.modelContext.registerTool(...)` | 已完成 | `app.js:104-128`，live 实测 5/5 tools 可注册、可调用 |
| 可由评委访问的 live URL | 已完成 | Render live 可打开；本次实际走通 read → stage → find → prepare |
| 英文项目说明 | 草稿存在，但过期 | `docs/DEVPOST-DRAFT.md:36-42` 仍称 oracle unaudited；须按真实状态重写 |
| `<3 分钟`、公开 YouTube、有音频、展示真实运行 | 未完成 | **提交 P0**；Resources 中一句 “no video” 与正式规则冲突，应以正式规则为准 |
| 公开源码仓库 | 未完成 | GitHub API 在评审时显示仓库仍为 `private`；**提交 P0** |
| GitHub 可识别的开源 LICENSE | 未完成 | 当前无 LICENSE；**提交 P0** |
| 全部源码、资产、运行说明 | 部分完成 | 有源码与命令，但缺 clone/serve/browser flag/评委路径的完整说明 |
| 英文或附英文翻译 | 基本满足 | 页面和草稿为英文；最终 Devpost 内容必须保持英文 |
| 评审期持续可访问、免费、无阻碍 | 尚需冻结验证 | 截止前用干净 profile 重跑 remote flow；评审期不要关闭 Render |
| 截止后冻结 submission/repo/live | 尚未执行 | FAQ 口径比规则更严格，建议 09-03 提交后到公布前全部冻结 |

GitHub 展示层也尚未准备：`description`、`homepage`、`topics` 均为空。它们不是算法功能，但会直接影响评委第一印象和项目可发现性。

### 2.2 当前非官方评分体检

以下是基于实际代码和 live 的内部 reviewer heuristic，不是官方预测；一旦未满足 public repo/LICENSE/video，技术分再高也可能无法进入正式评分。

| 指标 | 当前体感 | 依据 | 修复后的合理目标 |
|---|---:|---|---:|
| WebMCP Leverage | 4.2 / 5 | dirty expressions、priority、pins 只存在于当前页面；5 个原生工具；可见 UI 与 agent 共用状态 | 4.6 / 5：加入真实 human confirmation、judge path、tool/UI 状态同步证据 |
| Execution | 2.5 / 5 | 核心引擎和 live 可运行，但存在多个假 GREEN/状态原子性/PII 与 UI 闭环缺陷 | 4.1 / 5：完成本报告 P0 并增加真 DOM E2E |
| Potential Impact | 2.4 / 5 | identity mapping 问题真实，但目前只有 8 个固定 synthetic personas，4,000 用户只是叙事 | 3.6 / 5：本地 SCIM-shaped 导入、可扩展 witness、可下载审计包 |
| Creativity & Ambition | 4.0 / 5 | minimal witness、losing-source provenance、dirty-state evidence invalidation 组合独特 | 4.4 / 5：把失效和最小性做成可视化的核心体验 |

## 3. 实际实现：已经做对了什么

### 3.1 可验证的完成项

| 模块 | 实际状态 | 证据 |
|---|---|---|
| 5 个 least-privilege WebMCP tools | 已实现 | `src/tools/defs.mjs:153-187`、`app.js:110-128` |
| 表达式 parser / evaluator | 已实现 | 支持 priority、present-empty、null、ternary、case transform |
| 来源候选链与 UI provenance rail | 引擎和页面已实现 | `app.js:14-39` |
| 3 类业务 invariant | 已实现，但边界校验不足 | `src/engine/invariants.mjs:6-39` |
| exhaustive minimal witness | 已实现且有 anti-greedy 测试 | 当前固定 8 persona 下真实返回 `[P2,P3,P4]` |
| revision fencing | 工具入口已实现 | mutating/read flows 均使用 expected revision |
| evidence fingerprint staling | 部分实现 | expression、priority、pin mutation 可 stale evidence |
| PII redactor | 成功路径有效 | 对 keys、values、identity diff 有单测 |
| 远程原生 WebMCP round trip | 已实现 | live 实测 modelContext present、5 tools、r17 round trip |
| ChatGPT in-app browser 证据 | 已存在 | `evidence/chatgpt-run.png/json` |
| audited oracle | 已完成 | `data/oracle.json` 为 `audited:true` |

### 3.2 Live 体验实测

本次直接打开了部署页面，并通过当前页面注册的工具走通：

1. `read_mapping_session`：返回 r17。
2. `stage_mapping_invariants`：3 条 pins，进入 r18。
3. `find_mapping_counterexample`：返回最小 witness `[P2,P3,P4]`、4 条 violation、证据 `E-1`。
4. `prepare_mapping_review(E-1)`：正确显示 3 条 blocker。

这证明 live 不是静态 mock，也证明 WebMCP 入口本身可用。实际页面同时暴露了几个评委会立刻遇到的问题：首屏没有复制即用 prompt、guided flow、reset 或业务背景；priority 只有文本；GREEN 后没有真正的 review/export 结果；版面信息密度低但技术术语多，评委需要自行理解操作顺序。

## 4. P0：提交前必须修复的信任与闭环问题

### 4.1 旧 GREEN packet 在人工编辑后仍是 GREEN，Apply 仍 enabled

`src/store/reducer.mjs:13-15` 只会 stale evidence，不会 stale packet。页面在 `app.js:87-101` 只检查旧 packet 的 `blockers.length`，既不比较 packet revision 与当前 revision，也不检查其 evidence 是否 stale。

独立复现结果：

```json
{
  "currentRevision": 22,
  "evidenceStale": true,
  "storedPacketRevision": 21,
  "storedPacketBlockers": [],
  "uiWouldEnableApply": true
}
```

这与 `docs/DEVPOST-DRAFT.md:11-12` 的 “review packet dies the moment you edit” 正面冲突，也是最可能被评委现场撞到的 safety bug。

修复标准：任何 expression、priority、pin 内容或 pin 集合变化后，旧 packet 必须立即显示 STALE，并禁用 human action；只有 fresh closing evidence + fresh prepare 才能恢复。

### 4.2 非法 invariant 可以绕过检查并产生假 GREEN

`stage_mapping_invariants` 只验证 type 对应字段“存在”，没有验证 target mapping field、source、ID、值类型或枚举（`src/tools/defs.mjs:42-57`）。`checkInvariants` 遇到不存在的 output field 时因为 `got` 为 falsy 而静默跳过（`src/engine/invariants.mjs:21-30`）。

实测提交 `null_if_missing(field:"ghost", dependsOn:"ghost")` 后：

```json
{
  "find": "NO_COUNTEREXAMPLE",
  "coverage": { "ghost": true },
  "blockers": []
}
```

字段拼错就能让安全门假绿，必须 fail-closed。严格 schema 之外，handler 内也要做语义校验：合法 target fields、合法 sources、非空唯一 ID、每类 invariant 的精确 shape、无额外字段。

### 4.3 零条 invariant 也能直接得到 GREEN

初始 r17 直接调用 `prepare_mapping_review({evidenceIds:[]})`，当前返回：

```json
{
  "coverage": {},
  "blockers": []
}
```

`stage_mapping_invariants` 又是 full replace 且接受 `[]`，因此 agent 可以移除全部约束再生成假 GREEN。更根本的问题是：文案说“human states invariants”，实际工具却直接写入 authoritative pins，页面只显示 id/type，human 看不到完整规则内容。

修复标准：

- 零 pins 时 prepare 返回 `NO_INVARIANTS` 或明确 blocker；
- agent 只能 stage pending invariant proposal；
- 页面显示每个规则的完整、规范化内容；
- human 点击确认后规则才进入 authoritative pin set；
- 规则内容和确认状态纳入 fingerprint/hash。

### 4.4 错误响应绕过 PII redaction 和 payload guard

`runTool` 在 `src/tools/defs.mjs:204-206` 对 `!r.ok` 直接返回；redaction、canary assertion、1,500 字符预算都只发生在成功 payload（`207-214`）。

实测：

```json
{
  "ok": false,
  "error": {
    "code": "UNKNOWN_PERSONA",
    "personaId": "CANARY_SECRET"
  }
}
```

错误对象最终又由 `app.js:123` 直接序列化给 agent。公开的“no CANARY ever leaves any tool”因此只在现有 happy-path corpus 上成立。

修复标准：成功与失败 envelope 走同一个 finalizer：redact → canary assert → output budget → serialize。每个工具、每个错误码都必须做最终 WebMCP 文本结果测试。

### 4.5 `stage_mapping_invariants` 可以“报失败但状态已改变”

handler 在 `src/tools/defs.mjs:55` 先 dispatch、revision +1，外层在 `209-213` 才检查输出预算。传入 2,000 字符的 pin ID 时，工具返回：

```json
{
  "result": {
    "ok": false,
    "error": {
      "code": "EVALUATOR_FAILED",
      "reason": "payload budget exceeded"
    }
  },
  "revision": 18,
  "pinIdLength": 2000
}
```

这破坏“失败没有副作用”的基本协议，也不会被当前 unauthorized-write 计数发现，因为错误响应没有 revision。应在 mutation 前完成 schema、语义、预算和序列化验证；或者构造事务，在任何失败时不提交。

### 4.6 可见 UI 无法完成 source-of-truth 修复

SPEC 需要 priority selector，但 `index.html:25` 只有 `<span>`，`app.js:44` 只写文本，没有任何 `SET_PRIORITY` UI listener。10-round E2E 在 `harness/relay.mjs:151-154` 直接通过 `window.__imw.store.dispatch` 修改 priority，绕过了真实用户界面。

所以当前评委只能看到 source-of-truth violation，却不能通过受支持的 UI 把它修到 clean。必须增加明确、可键盘操作的 priority 控件，并让 E2E 用真实 DOM event 完成。

### 4.7 clean sweep 后页面仍保留旧红色 matrix

clean sweep 被实现为 `ok:false / NO_COUNTEREXAMPLE`，同时携带 closing evidence；但 `app.js:120` 只在 `r.ok` 时更新 `ui.lastFind`。修复完成后，页面仍可能显示旧的 stale/red violation matrix，而下方是新的 GREEN packet。

建议把 clean sweep 设计为成功型、结构化结果；至少在收到 `NO_COUNTEREXAMPLE` + evidence ID 时清空旧 matrix，显示明确的 “0 violations across 8 personas” all-clear state。

### 4.8 评测 PASS 实际评分了旧 trace

`eval/scorer.mjs:13-18` 将 hashed filename 字典序排序并取最后一个，误把 hash 的字典序当时间。完整评测刚生成 `relay-afc9a39.json` 后，`report.json` 仍选择：

```json
{
  "reportSha": "afc9a39",
  "traceFile": "eval/out/relay-daae768.json"
}
```

`eval/run.mjs:27` 注释声称读取 fresh E2E trace，但实际没有建立绑定。这会使 9/9 PASS 成为旧结果假阳性。E2E 应显式返回刚写入的 trace path，scorer 接收该 path，并断言 `report.sha === trace.sha === HEAD`。

### 4.9 提交资格 P0

在任何功能扩展前补齐：

- 将 repo 设为 public；
- 添加 GitHub 可识别的 LICENSE；
- 补 description、homepage、topics；
- 录制并公开 `<3 分钟` YouTube 视频；
- 更新 README、Devpost draft、evidence checklist 的过期状态；
- 09-03 12:00 PT 前做一次完整干净环境 rehearsal，留 1 小时 buffer。

## 5. P1：高回报的产品与实现增强

### 5.1 完整的 30 秒 judge mode

页面顶部提供：一句业务风险、一个 “Copy judge prompt” 按钮、一个 “Reset demo” 按钮、五步状态条。

推荐流程：

1. Human confirms 3 exact rules。
2. Agent finds `[P2,P3,P4]` covering 4 violations。
3. Human clicks P4/department，看到 AD winner 与 HRIS losing source。
4. Human fixes group、managerId、priority；old evidence/packet visibly dies。
5. Agent rechecks；0 violations；human exports packet。

首屏 10–15 秒先展示结果，不先讲 architecture。

### 5.2 两阶段 invariant authority

将现有 `stage_mapping_invariants` 改成真正的 stage：工具只产生 pending rule cards 与 canonical digest；human 在页面逐条/批量确认；只有确认后的 rule 才进入 active pins。这样既修复零 pin/恶意替换，又让“human states the rules”成为页面可见事实。

不建议仿照其他项目增加 agent commit/apply 工具；IdentityMap 的差异正是 agent never applies。

### 5.3 真正的 review packet 与导出

当前 packet 只是内存对象，Apply 只是 alert（`app.js:108`）。应把按钮改为 “Finalize & download review packet”，输出 JSON 或 Markdown：

- current revision；
- canonical mapping hash；
- confirmed invariant snapshot/hash；
- minimal witness personas；
- violations 与 coverage；
- provenance snapshot；
- evidence IDs 与 fingerprints；
- clean sweep 范围；
- limitations（synthetic data、not a signature）；
- human finalized timestamp。

SHA-256 可作为完整性摘要，但不要称为数字签名。

### 5.4 Evidence / agent activity timeline

增加 page-local timeline：actor、tool/action、before/after revision、duration、result/error、evidence ID、stale reason。让评委无需打开开发者工具就能看到：agent read、human edit、old evidence rejected、agent recovered。

这是从多个强竞品中最值得吸收的 execution 设计，同时直接强化本项目自己的核心。

### 5.5 Patch preview panel

`preview_mapping_patch` 已有 handler，但页面不保存或展示 preview。增加 before/after、affected personas、remaining violations、全池 regression sweep 和 “human adopts expression” 动作。采用后自动让旧 evidence/packet stale，再提示 agent re-find。

### 5.6 让 agent 真正拿到 redacted provenance

工具描述承诺 field-level provenance，但 `find_mapping_counterexample` 的返回只有 persona IDs、violations、coverage、evidence IDs（`src/tools/defs.mjs:85-91`）。provenance 只留在页面内部；现有 `prov.test.mjs` 也只测 engine。

应返回受预算约束的 source chain：winner、present/absent losing candidates、branch/input refs；identity values 继续 redacted。尤其让 P4/P5 明确证明 losing HRIS 与 present-empty AD。

### 5.7 修正 WebMCP annotations

`find_mapping_counterexample` 和 `preview_mapping_patch` 会记录 evidence，`prepare_mapping_review` 会记录 packet 并改变 UI，却都标了 `readOnlyHint:true`。按 WebMCP 语义，read-only 表示不修改状态；这些工具至少修改了 session-derived state，应重新审视标注或把记录动作与纯计算拆开。

表达式、human-authored rule、profile-derived detail 都属于不可信内容。按 [Chrome secure tools 指南](https://developer.chrome.com/docs/ai/webmcp/secure-tools) 增加 `untrustedContentHint:true`，并加 contract test。工具 description、name、parameter description 和输出也应遵循官方长度预算。

### 5.8 小规模真实模型 eval

当前真实 ChatGPT 只有一次人工证据，10-round relay 是 scripted protocol test，不是 agent-quality eval。按 [Chrome evals 指南](https://developer.chrome.com/docs/ai/webmcp/evals) 建立独立冷启动矩阵：

- 直接指令：明确给出 pins 和目标；
- 模糊业务指令：让模型选择正确工具和顺序；
- 参数错误恢复；
- wrong revision 恢复；
- 中链 human edit → stale → re-read/re-find；
- clean sweep 后停止，不重复调用；
- prompt injection / contaminated profile detail。

内部门槛可设为：所有 safety invariant 100% 通过；任务成功率至少 90%；每类至少 5 次冷启动。公开报告原始次数与失败，不只给一个百分比。

### 5.9 收紧工具 contract 与页面错误恢复

还有几项会让 agent 或 human 走入不可恢复状态的 contract drift：

- `maxPersonas` 出现在 schema，却未被 handler 使用；实测传 `0 / 1 / 2 / 8 / 9 / -1` 都返回 3-person witness；
- invariant schema 的 items 只有 `{type:"object"}`，模型得不到每类规则的必要字段、枚举和边界；
- expression input 的 change handler 先提交任意字符串，再无保护地调用 `evaluateAll`（`app.js:46,55-59`）；常见半成品表达式可让整次 render 抛错；
- `package.json:6` 声称 Node ≥20，但 `harness/cdp.mjs:1` 明确依赖 Node ≥21 的原生 WebSocket；
- README 和 Devpost draft 仍写 70+ tests、PASS-UNAUDITED、oracle pending，与当前 54 tests / audited oracle 不一致。

建议为每个 tool 建立一张表驱动 contract matrix；页面对表达式做 inline parse validation，非法内容不得提交 revision，并给 human/agent 明确的恢复建议。

## 6. P2：有时间再做的 Impact / Ambition 增强

### 6.1 浏览器本地 SCIM-shaped JSON 导入

这是最值得做的一项新功能，但必须排在全部 P0 后：

- 文件只在浏览器解析，不上传；
- UI 显示 schema mapping 与 validation summary；
- agent 只收到 opaque persona IDs 和 redacted witness；
- 提供内置 sample，评委无需准备数据；
- 限制数据规模与字段，避免临时做真实 Okta/SCIM 写入。

它能把“8 个合成 persona 的算法 demo”升级为“能承接真实 admin export 形态的本地安全工作台”。

### 6.2 可扩展 minimal witness

当前 exhaustive search 对 8 personas 清晰可靠，但如果要声称支持数千用户，不应继续枚举 persona 子集。由于 invariant 上限只有 8，可把每个 persona 映射为 violation bitmask，然后做 `N × 2^M` 的 DP / shortest cover；同时保留固定 tie-break 和 exact minimality。

视频不需要演示 4,000 行，但可以展示 1,000+ synthetic personas 在明确预算内完成，并公布 p50/p95/max。

### 6.3 少量高价值 invariant

只增加 3–4 个真正体现 identity 风险的规则，不做大规则库：

- privileged group exclusion；
- conditional required field；
- email domain / enum policy；
- manager self-cycle。

每条都必须有一个明显、可讲故事的 synthetic carrier 和 fail-closed validation。

### 6.4 更精确的 evidence granularity

当前 find fingerprint 覆盖全部 fields/personas，因此改一个 field 会 stale 整张 matrix；页面 stale 后的 provenance rail又用当前 state 重新计算，而不是保存“证据产生当时”的快照。这弱于 “everything it depended on, nothing else” 的宣传。

可以按 violation row / invariant 保存 provenance snapshot 与依赖 fingerprint，并在 UI 并排展示 “then vs now”。这是加分项，不应阻塞 P0 的 whole-packet safety 修复。

## 7. 测试体系审计

### 7.1 实测基线

| 检查 | 结果 | 解读 |
|---|---|---|
| `npm test` | 54/54 pass，0 fail，0 skip | 引擎层基础扎实；但不是 README 的 “70+” |
| Node native coverage | lines 99.53%、branches 90.81%、functions 97.31% | 只统计测试加载到的 `src/**` 和 tests；不含 `app.js`、harness、eval、verify，不能称全仓覆盖率 |
| `node harness/relay.mjs --smoke` | 3 次冷启动全部 PASS | Chrome 152 原生 WebMCP 注册与调用可用 |
| `node harness/relay.mjs --e2e` | 10 rounds PASS | scripted protocol path 可用；human steps 绕过 DOM |
| `node eval/run.mjs` | 显示 PASS | 但 scorer 读取旧 trace，当前 PASS 不能作为 fresh-run 证明 |
| `node tools/verify.mjs` | CODE_COMPLETE；video / Devpost TODO | 工具正确指出剩余 human gates，但未检查 LICENSE/public repo/文档一致性 |

现有测试值得保留的部分：oracle 全 persona/field 对照、4 类缺陷精确集合、anti-greedy exact witness、same-ID rule content replacement staling、preview evidence 不得关闭真实 packet、stale revision 优先、3 次浏览器冷启动。

### 7.2 P0 测试补强矩阵

| 测试 | 必须证明的性质 | 建议层级 |
|---|---|---|
| success/error finalizer matrix | 每个工具每个错误码最终文本无 `CANARY_`、≤1,500 chars | unit + native WebMCP E2E |
| invalid invariant matrix | unknown field/source、wrong type、empty/duplicate ID、extra field 全部 BAD_RULE，状态不变 | unit + tool contract |
| zero-pin closure | 无 active confirmed pins 时绝不能 GREEN | tool + DOM E2E |
| failed call atomicity | 任意错误的 before/after revision、pins、expressions hash 完全相同 | tool + protocol trace |
| green → edit | packet 立即 stale、Apply/Finalize disabled；fresh find/prepare 后才能恢复 | 真实 DOM E2E |
| visible priority flow | 通过 select/keyboard 修 priority；不使用 `window.__imw.store.dispatch` | DOM E2E |
| clean-sweep UI | 旧 violation matrix 被清除，显示 0 violations，packet 与 matrix 一致 | DOM E2E |
| fresh trace binding | scorer 只接收本轮 path；SHA 不一致、旧 trace、损坏 trace 必须 fail | scorer unit + eval integration |
| tool provenance | P4/P5 输出含完整、redacted source chain | tool + native E2E |
| `maxPersonas` | 0/负数/非整数/超限拒绝；最小 witness 超 cap 时给可恢复错误 | contract tests |

### 7.3 P1 测试补强

| 范围 | 当前缺口 | 建议 |
|---|---|---|
| Schema | invariant items 只是 `{type:"object"}`；缺 `required`/`oneOf`/enum/limits/`additionalProperties:false` | 表驱动 schema + runtime validation；真实 host 再跑 |
| Packet storage | `pinsCovered` 使用 `Object.keys(coverage)`，可能包含 coverage=false 的 pin | 断言只存 coverage=true，并与返回 payload 一致 |
| Unauthorized write | 当前只统计 Completed call 的正向 revision delta | 每 round 比较完整 state hash；stage 必须恰好 +1，其余恰好 0 |
| Fixture canaries | 测试只在字段存在时检查；实际 firstName/lastName/email 数量为 Okta `8/8/8`、HRIS `1/0/0`、AD `0/0/0`，并非 every source 都有三类 identity canary | 明确 fixture contract，补齐数据或收窄文案；覆盖 error args/candidates |
| UI robustness | 无 invalid expression、unpin、rail、stale banner、packet、Apply 的真事件测试 | 用 change/click/keyboard；非法半成品表达式不能让 render 崩溃 |
| Scorer / verify | `eval/*.mjs` 和 `tools/verify.mjs` 无单测 | missing round、Canceled、invocation mismatch、wrong SHA、malformed JSON 全部 fail |
| Model behavior | scripted relay 已知工具名和参数 | 真实模型 direct/ambiguous/recovery eval，保留失败 trace |
| Security | 无 contaminated output、description injection、replay、concurrent revision、in-flight edit | 采用 Tripwire 类攻击语料，但只测本项目边界 |
| Accessibility | inputs 无显式 label，matrix row 仅鼠标 click，动态状态无 `aria-live` | keyboard flow、accessibility tree/axe、200% zoom、窄屏 |
| Performance | trace 有 ms 但无预算；无最坏输入/并发/取消 | engine p95/max、8 pins、large dataset、race、AbortSignal |
| Static server | `startsWith(ROOT)` 是字符串前缀边界，缺 dotfile allowlist/traversal 测试 | production allowlist、encoded traversal、`.git`、404、MIME tests |
| Runtime contract | `package.json` 声称 Node ≥20；`harness/cdp.mjs:1` 依赖 Node ≥21 WebSocket | 对齐 engines；CI 跑最低版和当前版 |

### 7.4 关于“70+ tests”

当前公开文案 `README.md:17` 写 70+，`EVAL.md:34` 设目标 ≥70，实测只有 54。不要为了数字补 16 个填充测试。应该先加入上面的安全与 UI 用例；如果最终仍不到 70，就删除数量型宣传，只报告真实命令输出和关键风险覆盖。

### 7.5 提交冻结前验收门

所有条件必须同时满足：

- public repo + visible LICENSE + live + public video；
- 全部 P0 回归测试绿色；
- fresh trace SHA 与 HEAD 一致；
- 所有成功/失败 tool output 无 canary 且在预算内；
- 任意 failed call state hash 不变；
- zero pins / invalid pin 永不 GREEN；
- GREEN 后任意相关 edit 立即禁用 packet action；
- 一次干净 profile 的 remote judge flow；
- 至少一组真实模型 direct、ambiguous、stale-recovery 原始 trace；
- README、Devpost draft、video、evidence checklist 的数字和状态一致。

## 8. GitHub 竞品扫描

### 8.1 方法与限制

检索时间为 2026-08-29 PT；GitHub 时间戳部分已进入 2026-08-30 UTC。查询数量会快速变化：

| GitHub query | 结果数 | 含义 |
|---|---:|---|
| `webmcp challenge created:>=2026-08-25` | 113 | 较保守的元信息发现口径 |
| `"WebMCP Challenge" in:name,description,readme created:>=2026-08-25` | 412 | README 也计入，包含模板/引用，不等于提交数 |
| `webmcp in:name,description,readme created:>=2026-08-25` | 877 | 很宽的生态上限 |
| `topic:webmcp created:>=2026-08-25` | 159 | topic 口径 |
| `"human approval" "WebMCP Challenge" ...` | 70 | human approval 叙事已拥挤 |
| `evidence "WebMCP Challenge" ...` | 143 | evidence/receipt 叙事已拥挤 |
| `"SCIM" "WebMCP Challenge" ...` | 0 | 未发现直接 SCIM 竞品 |
| `"profile mapping" webmcp ...` | 1 | 仅发现 IdentityMap Witness |

Devpost gallery 当时返回 JavaScript/反爬页，公开搜索也没有可靠的 project URL。因此下列只能称为**公开 README 自报参赛候选**，不能称为已确认 Devpost 正式提交；功能和测试数字除注明 live/CI 实测外，也属于公开仓库自报。

### 8.2 八个重点候选

#### A. ChangeGate

- Repo：[`febert0001-tech/changegate-webmcp`](https://github.com/febert0001-tech/changegate-webmcp)
- Live：[`changegate-webmcp.vercel.app`](https://changegate-webmcp.vercel.app/)，检索时 HTTP 200。
- 做什么：合成退款变更控制。Agent 只能检查、提案、请求评审；批准、执行、验证都没有 WebMCP 工具。Human 批准不可变精确提案，再单独执行，系统从独立 ledger 读回验证。
- 强项：权限边界极易解释；“approval ≠ execution”；精确 proposal digest；对越权金额、替换、重放、伪造证据有攻击测试；README 自报 335/335 tests。
- 短板：单一 synthetic refund；WebMCP 可能停留在 proposal 层；测试数字没有公开 CI 佐证。
- 值得吸收：exact authorization binding、独立 readback、攻击证明、可直接照做的 judge path。
- 对本项目威胁：Execution / trust polish 明显更强；但 minimal witness 和 page-only dirty identity state 仍是本项目差异。

#### B. AgentDesk

- Repo：[`agentdesksdk/agentdesk`](https://github.com/agentdesksdk/agentdesk)
- Live：检索时未发现公开部署。
- 做什么：把 78 个内部 capability 动态路由为当下最多 6 个原生工具；提供批准、计划漂移、回执、读回验证和回滚。
- 强项：WebMCP Leverage 很强；同 catalog/handler 的公平 baseline 把峰值工具面从 82 降至 9，schema bytes 从 27,286 降至 3,728；动态注册、tombstone 恢复、activity timeline；公开 CI 成功。
- 短板：没有 live 是硬伤；SDK/平台故事抽象；测了工具面大小，但没有真实模型选择质量。
- 值得吸收：结构化 tool availability/stale recovery、peak surface 指标、真实客户端差异记录、完整 activity timeline。
- 不要照搬：不要把 IdentityMap 扩成通用 dynamic router；只在阶段转换能明显减少误用时考虑动态注册。

#### C. Staged

- Repo：[`kero12345ro/staged-webmcp`](https://github.com/kero12345ro/staged-webmcp)
- Live：[`staged-webmcp.yihan.chatgpt.site`](https://staged-webmcp.yihan.chatgpt.site/)，检索时 HTTP 200。
- 做什么：human 批准 exact diff 前，`commit_plan` 工具根本不存在；批准后只出现 60 秒、单次使用、空入参的 capability；成功后才暴露 receipt-bound undo。
- 强项：“不是 denied，而是 capability 不存在”非常有记忆点；状态机、SHA-256 digest、并发去重、native WebMCP lifecycle tests 都清晰。
- 短板：tab-local、可逆 board demo；digest 不是签名；无 ChatGPT agent 证据。
- 值得吸收：一句可记忆的核心不变量、可见 authority 状态、dynamic registry indicator。
- 不要照搬：不要加入动态 commit tool，它会破坏 IdentityMap 的 agent-never-applies 差异。

#### D. Release Sentinel

- Repo：[`zafersari82/release-sentinel-webmcp`](https://github.com/zafersari82/release-sentinel-webmcp)
- Live：检索时没有公开部署。
- 做什么：release trust workbench；agent 可攻击、找反例并最小化、提出修复、重建 hash 和复验；最终 GO/NO_GO 由独立 Gatekeeper 决定。
- 强项：与 IdentityMap 最接近的算法/证据竞争者；counterexample minimization、hash-bound evidence、固定 oracle、P-256 signed evidence、独立 Go gatekeeper；公开 CI 成功。
- 短板：复杂且部署负担大；大量能力为赛前已有；page-only session state 的必要性不如 IdentityMap。
- 值得吸收：packet 的 revision/hash 身份、旧证明不继承到新 revision 的可视化、严格限定“0 observed escapes”的 claim。
- 对本项目威胁：它会让普通“我们也有反例和证据”失去新鲜感；必须突出 identity dirty-state minimal persona cover，而非泛化 safety。

#### E. Closeout: Proof of Handoff

- Repo：[`bullyopswork/closeout-proof-of-handoff`](https://github.com/bullyopswork/closeout-proof-of-handoff)
- Live：[`closeout-proof-of-handoff.vercel.app`](https://closeout-proof-of-handoff.vercel.app/)，检索时 HTTP 200。
- 做什么：施工交付清单；agent read/plan/stage，human 决定；批准后 agent 消费一次精确 token 执行允许变更。
- 强项：generation、nonce、token、revision、evidence fingerprint、payload digest、page write lock；README 自报 ChatGPT/Chrome 完整流程。
- 短板：10 个工具和故事较复杂；agent 最终可 apply；自动测试和公开 raw trace 相对少。
- 值得吸收：stale rejection 作为第一等可见状态；cross-generation/replay/concurrent tests；packet 展示 revision、fingerprint、一次性状态。

#### F. REPLAY

- Repo：[`artem-musii/replay`](https://github.com/artem-musii/replay)
- Live：[`artem-musii.github.io/replay`](https://artem-musii.github.io/replay/)，检索时 HTTP 200。
- 做什么：本地优先的事故重建工作台，结合 visual scene/timeline、evidence、statement、dispute、inference、proposal 和 human-only finalization。
- 强项：产品完成度和视觉 execution 很强；91 个 test-like 文件、Pages deployment 成功、移动端/可访问性/screenshot regression、30 秒 judge prompt。
- 短板：18 个工具可能增加选择难度；范围大；README 仍标 uncoached native model trace pending。
- 值得吸收：页面内 30 秒评委路径、复制 prompt、截图回归、移动端/可访问性、不同证据语义的视觉编码。
- 对本项目威胁：即使算法不直接竞争，评委会用它的完成度作为 Execution 标尺。

#### G. Tripwire

- Repo：[`vincentsider/tripwire`](https://github.com/vincentsider/tripwire)
- Live：[`tripwire.vincent-7e0.workers.dev`](https://tripwire.vincent-7e0.workers.dev/)，检索时 HTTP 200。
- 做什么：运行 hostile WebMCP tool corpus，检测 agent 是否调用不应调用的工具；另有 tool-surface audit、fingerprint-bound badge 和 URL scan。
- 强项：Creativity/Ambition 强，直接覆盖新协议安全缺口；包含 hostile tool swap、prompt injection、false annotations、签名报告。
- 短板：范围大；部分能力依赖配置；普通浏览器 demo 的 polyfill/simulated agent 容易与真实证据混淆；无公开 CI。
- 值得吸收的不是产品，而是测试语料：contaminated output、tool-description injection、false `readOnlyHint`、stale/replaced tool、replay、forged evidence、cross-origin relay。

#### H. RapidSync Submission Triage

- Repo：[`jkdorman-creator/rapidsync-submission-triage`](https://github.com/jkdorman-creator/rapidsync-submission-triage)
- Live：[`jkdorman-creator.github.io/rapidsync-submission-triage`](https://jkdorman-creator.github.io/rapidsync-submission-triage/)，检索时 HTTP 200。
- 做什么：工伤险材料分拣；浏览器解析 PDF、运行 deterministic underwriting rules、记录来源；缺值与真实冲突分别路由给不同人，agent 只拟路线/回复。
- 强项：Potential Impact 叙事强；真实 PDF 形态、side-by-side receipt、恢复型错误、`untrustedContentHint` 和预算设计较成熟；Pages CI 成功。
- 短板：script replay 不是实际模型证据；README 的 7/8 tool 数字不一致；仍是 synthetic data。
- 值得吸收：把三种 invariant 分别翻译成真实业务损失；side-by-side losing-source；每个错误明确告诉 agent 下一步；所有外部/human-authored 内容标 untrusted。

### 8.3 竞品综合判断

当前公开候选给出的最重要信号：

1. **Human approval 已不是差异化。** 至少 70 个搜索结果直接使用该叙事。
2. **Evidence/receipt 也不是差异化。** 必须说明 evidence 证明什么、依赖什么、何时失效。
3. **高分候选把 trust 变成可见状态机。** 不是只在 README 声称安全。
4. **Execution 标杆都有 judge path、reset、timeline、receipt、移动端或视觉 regression。**
5. **本项目尚有独特空间。** 未发现另一个 profile mapping/SCIM + minimal witness 的直接竞品。

最值得吸收的组合不是复制任一对手，而是：

- ChangeGate 的 exact digest / independent readback；
- Staged 的 visible authority lifecycle；
- REPLAY 的 30 秒 judge path；
- RapidSync 的业务风险语言和 recovery hints；
- Tripwire 的 adversarial corpus；
- Release Sentinel 的 hash-bound evidence identity；
- AgentDesk 的 activity timeline 和客户端兼容记录。

这些能力都应服务于 IdentityMap 自己的核心闭环，不应成为新产品方向。

## 9. 截止日前的推荐执行顺序

### Phase 0：Trust hotfix，完成前不录最终视频

- strict invariant schema + semantic validation；
- zero pins / unconfirmed pins 不得 GREEN；
- success/error 统一 redaction/budget；
- stage 原子性；
- packet revision/stale 联动，GREEN 后 edit 立即禁用；
- scorer 显式绑定 fresh trace；
- 为以上每项加入 P0 regression tests。

### Phase 1：可见完整闭环

- priority selector；
- inline expression validation；
- clean-sweep all-clear；
- pending/confirmed invariant cards；
- patch preview panel；
- reset + copy prompt + five-step judge mode；
- 真 DOM E2E 替换 human-sim 后门。

### Phase 2：一个高回报加分包

优先选择：downloadable hashed review packet + activity timeline。两者范围可控，能同时提升 Execution、Leverage 和视频表现。

如果全部 P0/P1 已稳定，再选择 SCIM-shaped local import；不要同时做 scalable DP、新 invariant、大数据导入三个方向。

### Phase 3：提交与冻结

- 统一 README、Devpost、evidence checklist、测试数字；
- repo public + LICENSE + metadata；
- 真实 ChatGPT 多次冷启动；
- 录 2:15–2:40 的有声视频；
- 从干净 profile 走一次 live；
- 09-03 12:00 PT 前完成并冻结，保留 1 小时提交缓冲。

推荐视频节奏：

| 时间 | 内容 |
|---|---|
| 0:00–0:15 | 直接展示 `[P2,P3,P4]` 覆盖 4 个风险；一句话说明这是未保存草稿 |
| 0:15–0:45 | human 确认 3 条规则，agent 调 5 个 least-privilege tools |
| 0:45–1:20 | 点开 P4/P5，展示 winner/loser/present-empty provenance |
| 1:20–1:50 | human 修改表达式和 priority；旧 evidence/packet 立刻 STALE |
| 1:50–2:15 | agent 恢复、re-find、0 violations、fresh GREEN packet |
| 2:15–2:35 | 导出 receipt；说明 agent never applies、数据 synthetic/local、限制是什么 |

## 10. 明确不建议做的事情

- 不新增 agent apply/commit capability；
- 不做真实 Okta/SCIM 写 API；
- 不做后端签名或账号系统；
- 不把 5 个工具扩成十几个 CRUD tools；
- 不把 by-construction ablation 包装成竞争 benchmark；
- 不声称 fingerprint 已经做到 row-exact；
- 不声称所有 source profile 都有 identity canary，除非数据与测试真的满足；
- 不用测试数量代替风险覆盖；
- 不在截止后修 repo/live/submission。

## 11. 本次验证记录

为避免污染仓库，本次把当前 HEAD 复制到临时目录，复跑权威路径；临时产物不作为提交证据。

| 命令 / 检查 | 结果 |
|---|---|
| `npm test` | 54 pass / 0 fail / 0 skip |
| `node --test --experimental-test-coverage` | loaded files：99.53% lines / 90.81% branches / 97.31% functions |
| `node harness/relay.mjs --smoke` | PASS，3 cold sessions |
| `node harness/relay.mjs --e2e` | PASS，10 rounds，fresh file `relay-afc9a39.json` |
| `node eval/run.mjs` | 显示 PASS；但 report 实际选择旧 `relay-daae768.json` |
| `node tools/verify.mjs` | CODE_COMPLETE；video 与 Devpost 为 TODO |
| Live in-app browser | modelContext present；5/5 tools；read/stage/find/prepare 实际完成 |
| GitHub repository metadata | private；无 LICENSE；description/homepage/topics 为空 |
| 安全 probes | error canary leak、ghost invariant false-green、zero-pin green、failed-but-mutated、ignored maxPersonas、stale GREEN packet 均复现 |

创建本报告前，初始状态和全部 probes 后的主工作区均保持 clean；本报告是唯一新增文件。

## 12. 最终优先级清单

如果只能完成五件事，按这个顺序：

1. 修复所有假 GREEN：invalid/empty/unconfirmed invariant、stale packet。
2. 修复 error redaction 与 failed-call atomicity。
3. 增加可见 priority 控件、clean all-clear、真 DOM closing loop。
4. 修复 fresh trace scorer，并补真实模型 direct/ambiguous/stale-recovery eval。
5. 完成 public repo、LICENSE、video、metadata、文档一致性与冻结 rehearsal。

如果还能完成两件：

6. 可下载、hash-bound、明确非签名的 review packet。
7. 页面内 activity/evidence timeline + 30 秒 judge mode。

如果 P0 全部稳定后仍有余量：

8. 浏览器本地 SCIM-shaped import，或 scalable witness DP，二选一。

最终判断：**项目值得继续冲奖，差异化内核成立；当前最大的获奖增益来自把现有 safety story 做真、做可见、做不可绕过，而不是继续堆功能。**
