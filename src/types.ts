/**
 * busfactor types.
 *
 * busfactor maps the files in a codebase whose knowledge is
 * concentrated in a single person. The caller supplies, for
 * every file, who wrote it (with commit counts) and who
 * reviewed changes to it, and busfactor reports, as pure
 * local computation:
 *
 *   - for every file, its total commits, how many distinct
 *     authors it has, its top author and that author's share
 *     of the file's commits, how many of its reviewers are
 *     external (not authors of the file), and whether the
 *     file was never externally reviewed, is dominated by
 *     one author, or is at risk on both counts
 *   - the list of at-risk file paths
 *   - summary counts for the whole set
 *
 * The report is factual: it lists concentration and missing
 * review coverage. It does not score people, rank teams, or
 * recommend action. Nothing is fetched, executed, or
 * guessed: the map comes only from the data supplied.
 */

/** One author of a file, as supplied by the caller. */
export interface BusFactorAuthor {
  /** Author name. */
  name: string;
  /** Commits by this author to this file (at least 1). */
  commits: number;
}

/** One file with its authorship and review data. */
export interface BusFactorFileInput {
  /** File path; unique across the supplied set. */
  path: string;
  /**
   * Authors of the file with commit counts (at least one).
   * Duplicate names are merged by summing commits.
   */
  authors: BusFactorAuthor[];
  /**
   * Names that reviewed changes to this file. Defaults to
   * [] when omitted; duplicate names are de-duplicated.
   */
  reviewers: string[];
}

/** One file's place in the bus-factor map. */
export interface BusFactorFileEntry {
  /** File path. */
  path: string;
  /** Sum of merged author commits for this file. */
  total_commits: number;
  /** Number of merged (distinct) authors. */
  distinct_authors: number;
  /** Author with the most commits; ties broken by name ascending. */
  top_author: string;
  /** Top author's share of total commits, rounded to 4 decimal places. */
  top_share: number;
  /** Distinct reviewers who are not authors of this file. */
  external_reviewers: number;
  /** True when external_reviewers is 0. */
  never_reviewed: boolean;
  /** True when the rounded top_share is at or above the threshold. */
  dominated: boolean;
  /** True when the file is both dominated and never reviewed. */
  at_risk: boolean;
}

/** Summary counts for the whole file set. */
export interface BusFactorSummary {
  /** Number of files analysed. */
  total_files: number;
  /** Number of at-risk files. */
  at_risk_count: number;
  /** Number of files with exactly one distinct author. */
  single_author_count: number;
  /** Number of files that were never externally reviewed. */
  never_reviewed_count: number;
}

/** The bus-factor map. */
export interface BusFactorResult {
  /** Per-file entries, sorted by path ascending. */
  files: BusFactorFileEntry[];
  /** Paths of at-risk files, sorted ascending. */
  at_risk_files: string[];
  /** Summary counts. */
  summary: BusFactorSummary;
}
