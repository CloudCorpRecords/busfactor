# Changelog

## 0.1.0 (2026-10-27)

- Initial release: `analyze_bus_factor` MCP tool and
  `analyze` CLI command mapping single-author,
  never-reviewed files from authorship and review data.
- Per-file `total_commits` / `distinct_authors` /
  `top_author` / `top_share` entries (duplicate author
  names merged by summing commits, top-author ties broken
  by name ascending, share rounded to 4 decimal places),
  `external_reviewers` counting only distinct reviewers who
  are not authors of the file, and `never_reviewed` /
  `dominated` / `at_risk` flags — with domination comparing
  the rounded share against the threshold (default 0.8).
- The at-risk list (dominated and never-reviewed files,
  sorted ascending) and summary counts for total,
  at-risk, single-author, and never-reviewed files, with
  path-naming validation errors for malformed input.
