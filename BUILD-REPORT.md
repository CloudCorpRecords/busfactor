# busfactor — Build Report

MCP Rebuild 1000, Batch 15. Original program build from the
packages-100 plan (cluster D #48), built from the spec in
`~/workspace/mcp-rebuild-100/specs-batch15/busfactor.md`
(read first). There is no external original; the tool surface
is the program's defined spec. Local build only — nothing
pushed or published.

Identity: repo `busfactor`, npm `@reneturcios/busfactor`,
MCP name `io.github.CloudCorpRecords/busfactor`, version
`0.1.0`, bin `busfactor` → `dist/cli.js`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json`, `server.json` (description "Map
  single-author, never-reviewed files from authorship
  and review data: a factual risk list.", 93 chars ≤100;
  npm entry carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/busfactor:0.1.0` carries **no**
  `version` field), `Dockerfile` (node:20-alpine two-stage,
  label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/busfactor"`),
  `tsconfig.json`, `.gitignore`, `LICENSE` (MIT, Copyright
  (c) 2026 Rene Turcios), `README.md` (fresh text),
  `CHANGELOG.md` (single 0.1.0 entry, 2026-10-27),
  `package-lock.json` (Route 3, see below)
- `src/index.ts`, `src/cli.ts` (`analyze --input <args.json>`
  where the file holds the full arguments object, `mcp`,
  `--version`; exit 2 usage / 1 runtime error, argument
  validation before any file read), `src/mcp.ts`,
  `src/types.ts`, `src/busfactor.ts` (core,
  `VERSION = "0.1.0"`)
- `test/busfactor.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (publish-container `IMAGE = ghcr.io/cloudcorprecords/busfactor`,
  smoke-test server-name assertion `busfactor`)

## Tools implemented (1)

- `analyze_bus_factor` — arguments: `files` (array,
  required, minItems 1) of `{path (string, required,
  non-empty, unique), authors (array, required, minItems 1)
  of {name (string, required, non-empty), commits (integer,
  required, >= 1)}, reviewers (array of strings, optional,
  default [])}` and `threshold` (number, optional, default
  0.8, must be > 0 and <= 1).

  Returns `{files, at_risk_files, summary}`. Duplicate
  author names inside one file are merged by summing their
  commits before any computation, and reviewer names are
  de-duplicated. Per file: `total_commits` is the sum of
  merged author commits; `distinct_authors` is the number
  of merged authors; `top_author` has the most commits with
  ties broken by name ascending (code-unit); `top_share`
  is the top author's share rounded to 4 decimal places;
  `external_reviewers` counts the distinct reviewers who
  are NOT authors of the file, so a review by one of the
  file's own authors never counts as external review;
  `never_reviewed` is exactly "external_reviewers == 0";
  `dominated` compares the ROUNDED `top_share` — the number
  the output itself presents — against the threshold, so
  the flag always agrees with the reported share;
  `at_risk` is dominated AND never_reviewed. `files` is
  sorted by path ascending (code-unit), `at_risk_files`
  lists the at-risk paths sorted ascending, and `summary`
  counts total files, at-risk files, single-author files
  (`distinct_authors == 1`), and never-reviewed files.

  The fixture literal
  (`harness/fixtures/busfactor-tools-original.json`) and the
  `src/mcp.ts` literal are identical, with no `$schema`
  and no `additionalProperties`.

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with an
  explicit inputSchema literal exactly matching the fixture,
  per the standing fleet rule (no McpServer/zod schema
  conversion). Every `tools/call` is validated by the core
  itself, so the MCP and CLI paths share one validation
  implementation.
- Validation is path-naming and total: missing/empty
  `files`, a file entry that is not an object, a missing /
  empty / non-string or duplicated `path`, missing/empty
  `authors`, an author entry that is not an object, an
  author's missing / empty / non-string `name`, `commits`
  missing, not an integer, or < 1, or `reviewers` present
  but not an array or holding an empty/non-string entry
  throws an Error naming the offending path (e.g.
  `files[1].authors[0].commits must be an integer >= 1`)
  and produces no partial result (MCP: `isError`; CLI:
  exit 1). An invalid threshold throws the one fixed spec
  message, `threshold must be a number > 0 and <= 1`.
- The report is factual only — concentration and review
  coverage, no scoring of people and no recommendations —
  per the plan line "Factual risk list, no judgement."

## Verification (foreground, this session)

- `npx tsc` exit 0 (`dist/cli.js` built)
- `npm test` (`tsx --test test/*.test.ts`): **33 tests,
  33 pass, 0 fail** — the exact full result for a mixed
  set, duplicate author merging by sum (merged author
  becoming top author), a top-author tie broken by name
  ascending in code-unit order, `top_share` rounding to
  4 decimal places (0.6667 / 0.8333 / exact 0.75), external
  reviewers excluding the file's own authors, reviewer
  de-duplication, `never_reviewed` for omitted / empty /
  own-authors-only reviewer lists, omitted vs explicit
  empty reviewers, the default threshold 0.8 (share 0.8
  dominated, 0.75 not), a custom threshold (including
  threshold 1 dominating only a share-1 file), the
  rounded-comparison boundary (raw share 0.79996 rounds to
  exactly the 0.8 threshold → dominated true; raw 0.7999
  stays below → dominated false), `at_risk` requiring both
  domination and never-reviewed (all four combinations),
  per-file sorting by path in code-unit order with
  input-order independence, `at_risk_files` sorting, summary
  counts (single-author after merging, never-reviewed),
  and every validation path (missing/empty/non-array
  `files`, non-object file entry, missing/empty/non-string
  path, duplicate path naming the second occurrence,
  missing/empty/non-array `authors`, non-object author
  entry, missing/empty/non-string author name, missing
  commits, commits < 1, non-integer commits, non-array
  `reviewers`, empty/non-string reviewer entry, threshold
  bounds 0 / negative / > 1 / NaN / Infinity / non-number
  asserted against the exact spec message, and threshold
  valid edges 1 and 0.0001 accepted)
- `dist/cli.js --version` → `0.1.0`; unknown command exits
  2 with usage; `analyze` with no `--input` exits 2;
  `analyze --input <missing file>` exits 1 naming the file;
  `analyze --input <valid file>` exits 0 and prints the map
  JSON (verified against the README example: a single-author
  unreviewed `src/solo.ts` at risk, an evenly split
  `src/shared.ts` externally reviewed by cleo — amy counted
  as an own-author reviewer only); `analyze --input
  <invalid file>` exits 1 with
  `files[1].authors[0].commits must be an integer >= 1`;
  an out-of-bounds threshold exits 1 with
  `threshold must be a number > 0 and <= 1`
- Parity: `harness/parity.py` vs
  `harness/fixtures/busfactor-tools-original.json` →
  **PASS, parity 100.0, identical_tools 1/1** (run with the
  rebuild path as an absolute path; the harness does not
  expand a `~` inside the quoted stdio command string)

## Lockfile status

`package-lock.json` generated clean via Route 3 (temp copy
without `node_modules`/`dist`/`package-lock.json`, offline
`npm install --package-lock-only --ignore-scripts
--offline`), verified: parses, name
`@reneturcios/busfactor`, **128 package entries**. It
differs from depmap's lock only in the root name and one
transitive version (qs 6.17.0 vs 6.16.1, the current
resolution of the same range).

## Gaps / honest notes

- **Pinned judgement call — threshold schema bounds:** the
  spec's threshold bound is exclusive on the low end
  (> 0 and <= 1). The inputSchema literal carries the rule
  in the property description and the core enforces it with
  the exact spec message, but the literal has no
  `minimum`/`maximum` keywords for `threshold`: a plain
  `minimum: 0` would claim 0 is valid, which the spec
  forbids. (The inclusive bound that CAN be stated exactly
  is stated: `commits` carries `minimum: 1`, and both
  arrays carry `minItems: 1`.) Pinned by the validation
  tests asserting the exact threshold message for 0,
  negative, > 1, NaN, Infinity, and non-number inputs.
- **Pinned judgement call — duplicate-path error wording:**
  the spec requires the error to name the second
  occurrence's path but does not fix the wording; the
  message used is
  `files[<second>].path duplicates files[<first>].path "<path>"`,
  matching the fleet pattern, and a dedicated test pins it.
  The other validation messages likewise follow the fleet
  path-naming pattern and are pinned by tests.
- **Local node_modules provenance:** a fresh
  `npm install --ignore-scripts --offline` in this VM fails
  with ENOTCACHED on the qs 6.17.0 tarball (the cached
  packument resolves it, but its tarball is not in the npm
  cache). Local build/test therefore ran against a copy of
  the sibling depmap build's `node_modules` — identical
  top-level dependencies and ranges; the only locked
  difference is that one transitive version. The committed
  `package-lock.json` itself is the clean Route 3 artifact
  above, and CI / Docker consume it via `npm ci` at
  publish time. `node_modules` is gitignored.
- Container build not exercised locally; the
  publish-container workflow smoke-tests the image at
  publish time.
- Nothing pushed or published; this is a local build only.
