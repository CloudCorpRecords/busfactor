# busfactor

Every codebase has files that only one person really knows.
If that person is away — on holiday, off sick, gone from
the team — those files are the ones nobody can safely
change. busfactor works out where that risk sits. You give
it, for each file, who wrote it and how many commits each
author made, plus who reviewed changes to it, and it gives
back a factual map:

- **Per-file entries** — for every file, its
  `total_commits`, how many distinct authors it has, its
  `top_author` and that author's `top_share` of the file's
  commits, and `external_reviewers`: how many of its
  reviewers are not authors of the file. A review by one of
  the file's own authors does not count as external review,
  so a file checked only by the people who wrote it reads
  as never reviewed.
- **Two flags, one list** — a file is `dominated` when its
  top author's share reaches the threshold (0.8 by
  default), and `never_reviewed` when it has no external
  reviewers. A file that is both is `at_risk`, and
  `at_risk_files` collects exactly those paths. The list is
  a statement of fact about concentration and coverage; it
  carries no judgement about the people involved.
- **Summary counts** — how many files were analysed, how
  many are at risk, how many have a single author, and how
  many were never externally reviewed.

Duplicate author names inside one file are merged by
summing their commits before anything is computed, and
reviewer names are de-duplicated. The top-author share is
rounded to four decimal places, and the domination check
compares that rounded share — the number the report itself
shows — against the threshold, so a file reported at
exactly the threshold is always flagged dominated. Every
list in the result is sorted ascending, so the same data
always yields exactly the same map. Malformed input — a
missing or empty file list, a duplicate path, an author
with no commits — is a validation error naming the
offending path (for example
`files[1].authors[0].commits must be an integer >= 1`),
and no partial map is produced. The computation is pure
and local: no network, no configuration, no files read
beyond the input you pass in.

## CLI

```bash
npx @reneturcios/busfactor analyze --input args.json
npx @reneturcios/busfactor --version
```

`args.json` contains the full arguments object:

```json
{
  "files": [
    { "path": "src/solo.ts", "authors": [{ "name": "amy", "commits": 10 }] },
    {
      "path": "src/shared.ts",
      "authors": [
        { "name": "amy", "commits": 5 },
        { "name": "bob", "commits": 5 }
      ],
      "reviewers": ["amy", "cleo"]
    }
  ]
}
```

`reviewers` defaults to `[]` per file, and `threshold`
defaults to `0.8`. Here `src/solo.ts` is single-author and
unreviewed, while `src/shared.ts` is split evenly and was
externally reviewed by cleo. The map is printed as JSON:

```json
{
  "files": [
    {
      "path": "src/shared.ts",
      "total_commits": 10,
      "distinct_authors": 2,
      "top_author": "amy",
      "top_share": 0.5,
      "external_reviewers": 1,
      "never_reviewed": false,
      "dominated": false,
      "at_risk": false
    },
    {
      "path": "src/solo.ts",
      "total_commits": 10,
      "distinct_authors": 1,
      "top_author": "amy",
      "top_share": 1,
      "external_reviewers": 0,
      "never_reviewed": true,
      "dominated": true,
      "at_risk": true
    }
  ],
  "at_risk_files": ["src/solo.ts"],
  "summary": {
    "total_files": 2,
    "at_risk_count": 1,
    "single_author_count": 1,
    "never_reviewed_count": 1
  }
}
```

Exit codes: `0` on success, `1` on a runtime error (including
an unreadable or invalid input file, or invalid input), `2`
on a usage error.

## MCP server

```bash
npx -y @reneturcios/busfactor mcp
```

MCP client config:

```json
{
  "mcpServers": {
    "busfactor": {
      "command": "npx",
      "args": ["-y", "@reneturcios/busfactor", "mcp"]
    }
  }
}
```

### Tools

- `analyze_bus_factor` — Map single-author, never-reviewed
  files from authorship and review data.
  - `files` (array, required, at least one) — files as
    `{path, authors, reviewers?}` objects; `path` is unique
    across the set, each `authors` entry is a `{name,
    commits}` pair with at least 1 commit, and `reviewers`
    lists names that reviewed changes to the file
  - `threshold` (number, optional, default 0.8) — the
    top-author share at or above which a file counts as
    dominated by one author; must be > 0 and <= 1

  Returns `{files, at_risk_files, summary}`.

## Docker

```bash
docker run -i ghcr.io/cloudcorprecords/busfactor
docker run --rm -v "$PWD:/w" ghcr.io/cloudcorprecords/busfactor analyze --input /w/args.json
```

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # tsx --test test/*.test.ts (pure local, no network)
npm run dev     # run the CLI from source
```

## License

MIT — Copyright (c) 2026 Rene Turcios
