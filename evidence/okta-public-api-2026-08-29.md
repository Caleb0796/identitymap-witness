# Evidence: Okta public Profile Mappings API has no preview/evaluate surface

Captured 2026-08-29 by rendering the official API reference
(https://developer.okta.com/docs/api/openapi/okta-management/management/tag/ProfileMapping/)
in a JS-capable browser and reading the endpoint list verbatim.

Complete endpoint inventory of the Profile Mappings API:

| endpoint | scope | capability |
|---|---|---|
| `GET /api/v1/mappings` | okta.profileMappings.read | list saved mappings (paginated, sourceId/targetId filters) |
| `GET /api/v1/mappings/{mappingId}` | okta.profileMappings.read | read one saved mapping (properties.expression, pushStatus) |
| `POST /api/v1/mappings/{mappingId}` | okta.profileMappings.manage | update saved mapping properties |

There is NO preview, evaluate, dry-run, or batch-apply-against-users endpoint on the
documented surface. The API reads and writes **saved** expressions only.

Verdict against the idea card's kill line "若 preview endpoint 可批量接收任意 profile，
则优势消失": **NOT FIRED** at the documented-API tier.

Disclosed remainder: the Okta admin console's Preview button necessarily calls an
UNDOCUMENTED internal endpoint. Whether it accepts unsaved expressions / batches, and
whether it is callable outside an admin browser session, is UNTESTED (requires an
Integrator Free Plan org: work-email + reCAPTCHA gated, human-only signup). That
endpoint belongs to the CDP/session arm of the benchmark, which is designed-not-run
(EVAL.md). This limitation is stated wherever arm results are shown.

Related second-source observations (same day, admin consoles of adjacent products):
Auth0 tenant dev-nhp4ufcct3tfn0q2 has Actions draft test-runner but no profile-mapping
editor at all (different product surface); first-party "draft + preview" exists across
Okta/Auth0/Adobe/DocuSign — which is why SPEC §2 concedes draft-preview and claims only
the invariant→minimal-witness→provenance→closure loop.
