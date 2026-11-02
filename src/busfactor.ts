/**
 * busfactor core: single-author, never-reviewed files map.
 *
 *   analyzeBusFactor(files, threshold?) -> map
 *
 * Behaviour:
 * - Duplicate author names inside one file are merged by
 *   summing their commits before any computation. Reviewer
 *   names are de-duplicated.
 * - Per file: `total_commits` is the sum of merged author
 *   commits; `distinct_authors` is the number of merged
 *   authors; `top_author` is the author with the most
 *   commits, ties broken by name ascending (code-unit);
 *   `top_share` is the top author's share of the total,
 *   rounded to 4 decimal places.
 * - `external_reviewers` counts the distinct reviewers who
 *   are NOT authors of the file — a review by one of the
 *   file's own authors is not external review.
 *   `never_reviewed` is true exactly when that count is 0.
 * - `dominated` compares the ROUNDED `top_share` (the number
 *   the output itself presents) against the threshold, so
 *   the flag always agrees with the reported share.
 *   `at_risk` is dominated AND never_reviewed.
 * - `files` in the result is sorted by path ascending
 *   (code-unit); `at_risk_files` lists the at-risk paths,
 *   sorted ascending; `summary` counts the files, the
 *   at-risk files, the single-author files, and the
 *   never-reviewed files.
 *
 * Validation is strict and path-naming: any malformed input
 * throws an Error naming the offending path (for example
 * "files[1].authors[0].commits must be an integer >= 1")
 * and no partial result is produced. The threshold has one
 * fixed message: "threshold must be a number > 0 and <= 1".
 */
import type {
  BusFactorFileInput,
  BusFactorResult,
} from "./types.js";

export const VERSION = "0.1.0";

export const DEFAULT_THRESHOLD = 0.8;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Validate the raw threshold argument (default 0.8). */
function validateThreshold(threshold: unknown): number {
  if (threshold === undefined) return DEFAULT_THRESHOLD;
  if (
    typeof threshold !== "number" ||
    !Number.isFinite(threshold) ||
    threshold <= 0 ||
    threshold > 1
  ) {
    throw new Error("threshold must be a number > 0 and <= 1");
  }
  return threshold;
}

/**
 * Validate the raw `files` argument and return the normalised
 * file list (reviewers defaulted to [] and de-duplicated).
 * Author merging happens during analysis, not here.
 */
function validateFiles(files: unknown): BusFactorFileInput[] {
  if (files === undefined) throw new Error("files is required");
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("files must be a non-empty array");
  }

  const validated: BusFactorFileInput[] = [];
  const indexByPath = new Map<string, number>();
  files.forEach((raw, i) => {
    const path = `files[${i}]`;
    if (!isRecord(raw)) throw new Error(`${path} must be an object`);
    if (raw.path === undefined) throw new Error(`${path}.path is required`);
    if (typeof raw.path !== "string" || raw.path.length === 0) {
      throw new Error(`${path}.path must be a non-empty string`);
    }
    const firstIndex = indexByPath.get(raw.path);
    if (firstIndex !== undefined) {
      throw new Error(
        `${path}.path duplicates files[${firstIndex}].path "${raw.path}"`,
      );
    }
    indexByPath.set(raw.path, i);

    if (raw.authors === undefined) throw new Error(`${path}.authors is required`);
    if (!Array.isArray(raw.authors) || raw.authors.length === 0) {
      throw new Error(`${path}.authors must be a non-empty array`);
    }
    const authors = (raw.authors as unknown[]).map((authorRaw, j) => {
      const authorPath = `${path}.authors[${j}]`;
      if (!isRecord(authorRaw)) {
        throw new Error(`${authorPath} must be an object`);
      }
      if (authorRaw.name === undefined) {
        throw new Error(`${authorPath}.name is required`);
      }
      if (typeof authorRaw.name !== "string" || authorRaw.name.length === 0) {
        throw new Error(`${authorPath}.name must be a non-empty string`);
      }
      if (authorRaw.commits === undefined) {
        throw new Error(`${authorPath}.commits is required`);
      }
      if (
        typeof authorRaw.commits !== "number" ||
        !Number.isInteger(authorRaw.commits) ||
        authorRaw.commits < 1
      ) {
        throw new Error(`${authorPath}.commits must be an integer >= 1`);
      }
      return { name: authorRaw.name, commits: authorRaw.commits };
    });

    let reviewers: string[] = [];
    if (raw.reviewers !== undefined) {
      if (!Array.isArray(raw.reviewers)) {
        throw new Error(`${path}.reviewers must be an array`);
      }
      raw.reviewers.forEach((reviewer, k) => {
        if (typeof reviewer !== "string" || reviewer.length === 0) {
          throw new Error(`${path}.reviewers[${k}] must be a non-empty string`);
        }
      });
      reviewers = [...new Set(raw.reviewers as string[])];
    }

    validated.push({ path: raw.path, authors, reviewers });
  });

  return validated;
}

/** Analyse the bus factor of the supplied files. */
export function analyzeBusFactor(
  files: unknown,
  threshold?: unknown,
): BusFactorResult {
  const validFiles = validateFiles(files);
  const limit = validateThreshold(threshold);

  const entries = validFiles.map((file) => {
    // Merge duplicate author names by summing commits.
    const commitsByAuthor = new Map<string, number>();
    for (const author of file.authors) {
      commitsByAuthor.set(
        author.name,
        (commitsByAuthor.get(author.name) ?? 0) + author.commits,
      );
    }

    const totalCommits = [...commitsByAuthor.values()].reduce(
      (sum, commits) => sum + commits,
      0,
    );

    // Top author: most commits; ties broken by name ascending.
    let topAuthor = "";
    let topCommits = -1;
    for (const [name, commits] of commitsByAuthor) {
      if (
        commits > topCommits ||
        (commits === topCommits && byCodeUnit(name, topAuthor) < 0)
      ) {
        topAuthor = name;
        topCommits = commits;
      }
    }

    const topShare = Math.round((topCommits / totalCommits) * 10000) / 10000;

    const authorNames = new Set(commitsByAuthor.keys());
    const externalReviewers = file.reviewers.filter(
      (reviewer) => !authorNames.has(reviewer),
    ).length;

    const neverReviewed = externalReviewers === 0;
    const dominated = topShare >= limit;
    const atRisk = dominated && neverReviewed;

    return {
      path: file.path,
      total_commits: totalCommits,
      distinct_authors: commitsByAuthor.size,
      top_author: topAuthor,
      top_share: topShare,
      external_reviewers: externalReviewers,
      never_reviewed: neverReviewed,
      dominated,
      at_risk: atRisk,
    };
  });

  entries.sort((a, b) => byCodeUnit(a.path, b.path));

  const atRiskFiles = entries
    .filter((entry) => entry.at_risk)
    .map((entry) => entry.path);

  return {
    files: entries,
    at_risk_files: atRiskFiles,
    summary: {
      total_files: entries.length,
      at_risk_count: atRiskFiles.length,
      single_author_count: entries.filter(
        (entry) => entry.distinct_authors === 1,
      ).length,
      never_reviewed_count: entries.filter(
        (entry) => entry.never_reviewed,
      ).length,
    },
  };
}

/** Render a payload as the JSON text block MCP clients show. */
export function formatPayload(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}
