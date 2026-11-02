import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeBusFactor } from "../src/busfactor.js";

/**
 * All tests are pure local computation over inline file
 * sets: no filesystem, no network. Each behaviour in the
 * spec is pinned by its own case, including author merging,
 * the rounded-share domination comparison, external review
 * coverage, sorting, summary counts, and every validation
 * path.
 */

const author = (name: string, commits: number) => ({ name, commits });

const file = (
  path: string,
  authors: Array<{ name: string; commits: number }>,
  reviewers?: string[],
) => ({
  path,
  authors,
  ...(reviewers !== undefined ? { reviewers } : {}),
});

describe("analyzeBusFactor — per-file computation", () => {
  it("reports the exact full result for a mixed set", () => {
    const out = analyzeBusFactor([
      file("src/shared.ts", [author("amy", 5), author("bob", 5)], ["amy", "cleo"]),
      file("src/solo.ts", [author("amy", 10)]),
    ]);
    assert.deepEqual(out, {
      files: [
        {
          path: "src/shared.ts",
          total_commits: 10,
          distinct_authors: 2,
          top_author: "amy",
          top_share: 0.5,
          external_reviewers: 1,
          never_reviewed: false,
          dominated: false,
          at_risk: false,
        },
        {
          path: "src/solo.ts",
          total_commits: 10,
          distinct_authors: 1,
          top_author: "amy",
          top_share: 1,
          external_reviewers: 0,
          never_reviewed: true,
          dominated: true,
          at_risk: true,
        },
      ],
      at_risk_files: ["src/solo.ts"],
      summary: {
        total_files: 2,
        at_risk_count: 1,
        single_author_count: 1,
        never_reviewed_count: 1,
      },
    });
  });

  it("merges duplicate author names inside one file by summing commits", () => {
    const out = analyzeBusFactor([
      file("a.ts", [author("amy", 3), author("bob", 4), author("amy", 2)]),
    ]);
    const entry = out.files[0];
    // amy merged to 5 commits, so amy (not bob) is top author.
    assert.equal(entry.total_commits, 9);
    assert.equal(entry.distinct_authors, 2);
    assert.equal(entry.top_author, "amy");
    assert.equal(entry.top_share, 0.5556);
  });

  it("breaks a top-author tie by name ascending (code-unit)", () => {
    const out = analyzeBusFactor([
      file("a.ts", [author("zoe", 5), author("Amy", 5), author("mia", 5)]),
    ]);
    // Code-unit order puts "Amy" before "mia" and "zoe".
    assert.equal(out.files[0].top_author, "Amy");
    assert.equal(out.files[0].top_share, 0.3333);
  });

  it("rounds top_share to 4 decimal places", () => {
    const twoThirds = analyzeBusFactor([
      file("a.ts", [author("amy", 2), author("bob", 1)]),
    ]);
    assert.equal(twoThirds.files[0].top_share, 0.6667);
    const fiveSixths = analyzeBusFactor([
      file("a.ts", [author("amy", 5), author("bob", 1)]),
    ]);
    assert.equal(fiveSixths.files[0].top_share, 0.8333);
    const exact = analyzeBusFactor([
      file("a.ts", [author("amy", 3), author("bob", 1)]),
    ]);
    assert.equal(exact.files[0].top_share, 0.75);
  });

  it("counts only reviewers who are not authors of the file as external", () => {
    const out = analyzeBusFactor([
      file("a.ts", [author("amy", 4), author("bob", 1)], ["amy", "bob", "cleo"]),
    ]);
    // amy and bob reviewed their own file: not external. cleo is.
    assert.equal(out.files[0].external_reviewers, 1);
    assert.equal(out.files[0].never_reviewed, false);
  });

  it("de-duplicates reviewer names before counting", () => {
    const out = analyzeBusFactor([
      file("a.ts", [author("amy", 4)], ["cleo", "cleo", "dan", "cleo"]),
    ]);
    assert.equal(out.files[0].external_reviewers, 2);
  });

  it("marks a file never_reviewed when reviewers are omitted, empty, or only its own authors", () => {
    const omitted = analyzeBusFactor([file("a.ts", [author("amy", 4)])]);
    assert.equal(omitted.files[0].external_reviewers, 0);
    assert.equal(omitted.files[0].never_reviewed, true);

    const empty = analyzeBusFactor([file("a.ts", [author("amy", 4)], [])]);
    assert.equal(empty.files[0].never_reviewed, true);

    const ownOnly = analyzeBusFactor([
      file("a.ts", [author("amy", 4), author("bob", 1)], ["bob", "amy", "bob"]),
    ]);
    assert.equal(ownOnly.files[0].external_reviewers, 0);
    assert.equal(ownOnly.files[0].never_reviewed, true);
  });

  it("treats an omitted reviewers field the same as an empty one", () => {
    const omitted = analyzeBusFactor([file("a.ts", [author("amy", 4)])]);
    const explicit = analyzeBusFactor([file("a.ts", [author("amy", 4)], [])]);
    assert.deepEqual(omitted, explicit);
  });
});

describe("analyzeBusFactor — domination, threshold, and at-risk", () => {
  it("uses the default threshold 0.8 when none is given", () => {
    const atPointEight = analyzeBusFactor([
      file("a.ts", [author("amy", 4), author("bob", 1)]),
    ]);
    assert.equal(atPointEight.files[0].top_share, 0.8);
    assert.equal(atPointEight.files[0].dominated, true);

    const below = analyzeBusFactor([
      file("a.ts", [author("amy", 3), author("bob", 1)]),
    ]);
    assert.equal(below.files[0].top_share, 0.75);
    assert.equal(below.files[0].dominated, false);
  });

  it("honours a custom threshold", () => {
    const files = [file("a.ts", [author("amy", 3), author("bob", 1)])];
    assert.equal(analyzeBusFactor(files, 0.7).files[0].dominated, true);
    assert.equal(analyzeBusFactor(files, 0.75).files[0].dominated, true);
    assert.equal(analyzeBusFactor(files, 0.9).files[0].dominated, false);

    const nearTotal = [file("a.ts", [author("amy", 9), author("bob", 1)])];
    assert.equal(analyzeBusFactor(nearTotal, 1).files[0].dominated, false);
    const total = [file("a.ts", [author("amy", 9)])];
    assert.equal(analyzeBusFactor(total, 1).files[0].dominated, true);
  });

  it("compares the ROUNDED share against the threshold: a share rounding to exactly the threshold is dominated", () => {
    // Raw share 19999 / 25000 = 0.79996, strictly below the 0.8
    // default — but it rounds to exactly 0.8, and the spec
    // compares the rounded share the output presents, so the
    // file is dominated. This pins the rounded-comparison rule.
    const out = analyzeBusFactor([
      file("a.ts", [author("amy", 19999), author("bob", 5001)]),
    ]);
    assert.equal(out.files[0].top_share, 0.8);
    assert.equal(out.files[0].dominated, true);
  });

  it("does not dominate a file whose rounded share stays below the threshold", () => {
    // 7999 / 10000 = 0.7999 exactly: no rounding rescue.
    const out = analyzeBusFactor([
      file("a.ts", [author("amy", 7999), author("bob", 2001)]),
    ]);
    assert.equal(out.files[0].top_share, 0.7999);
    assert.equal(out.files[0].dominated, false);
  });

  it("marks at_risk only when a file is both dominated and never reviewed", () => {
    const out = analyzeBusFactor([
      // Dominated but externally reviewed: not at risk.
      file("dominated-reviewed.ts", [author("amy", 9), author("bob", 1)], ["cleo"]),
      // Never reviewed but not dominated: not at risk.
      file("shared-unreviewed.ts", [author("amy", 5), author("bob", 5)]),
      // Dominated and never reviewed: at risk.
      file("both.ts", [author("amy", 9), author("bob", 1)]),
      // Neither: not at risk.
      file("fine.ts", [author("amy", 5), author("bob", 5)], ["cleo"]),
    ]);
    const byPath = new Map(out.files.map((f) => [f.path, f]));
    assert.equal(byPath.get("dominated-reviewed.ts")?.at_risk, false);
    assert.equal(byPath.get("shared-unreviewed.ts")?.at_risk, false);
    assert.equal(byPath.get("both.ts")?.at_risk, true);
    assert.equal(byPath.get("fine.ts")?.at_risk, false);
    assert.deepEqual(out.at_risk_files, ["both.ts"]);
  });
});

describe("analyzeBusFactor — sorting and summary", () => {
  it("sorts per-file entries by path ascending (code-unit), independent of input order", () => {
    const files = [
      file("zebra.ts", [author("amy", 1)]),
      file("Alpha.ts", [author("amy", 1)]),
      file("mid.ts", [author("amy", 1)]),
    ];
    const out = analyzeBusFactor(files);
    assert.deepEqual(
      out.files.map((f) => f.path),
      ["Alpha.ts", "mid.ts", "zebra.ts"],
    );
    assert.deepEqual(analyzeBusFactor([...files].reverse()), out);
  });

  it("sorts at_risk_files ascending", () => {
    const out = analyzeBusFactor([
      file("z-risk.ts", [author("amy", 10)]),
      file("safe.ts", [author("amy", 5), author("bob", 5)], ["cleo"]),
      file("a-risk.ts", [author("bob", 10)]),
      file("m-risk.ts", [author("cleo", 10)]),
    ]);
    assert.deepEqual(out.at_risk_files, ["a-risk.ts", "m-risk.ts", "z-risk.ts"]);
  });

  it("counts single-author and never-reviewed files in the summary", () => {
    const out = analyzeBusFactor([
      // Single author, never reviewed.
      file("a.ts", [author("amy", 10)]),
      // Single author (after merging), externally reviewed.
      file("b.ts", [author("amy", 6), author("amy", 4)], ["cleo"]),
      // Two authors, never reviewed (only an own-author review).
      file("c.ts", [author("amy", 5), author("bob", 5)], ["amy"]),
      // Two authors, externally reviewed.
      file("d.ts", [author("amy", 5), author("bob", 5)], ["cleo"]),
    ]);
    assert.deepEqual(out.summary, {
      total_files: 4,
      at_risk_count: 1,
      single_author_count: 2,
      never_reviewed_count: 2,
    });
  });
});

describe("analyzeBusFactor — validation", () => {
  it("rejects missing, empty, or non-array files", () => {
    assert.throws(() => analyzeBusFactor(undefined), /files is required/);
    assert.throws(() => analyzeBusFactor([]), /files must be a non-empty array/);
    assert.throws(() => analyzeBusFactor("nope"), /files must be a non-empty array/);
  });

  it("rejects a file entry that is not an object, naming the path", () => {
    assert.throws(() => analyzeBusFactor([42]), /files\[0\] must be an object/);
    assert.throws(
      () => analyzeBusFactor([file("a.ts", [author("amy", 1)]), "b.ts"]),
      /files\[1\] must be an object/,
    );
  });

  it("rejects a file missing its path, naming the path", () => {
    assert.throws(
      () => analyzeBusFactor([{ authors: [author("amy", 1)] }]),
      /files\[0\]\.path is required/,
    );
  });

  it("rejects an empty or non-string file path, naming the path", () => {
    assert.throws(
      () => analyzeBusFactor([file("", [author("amy", 1)])]),
      /files\[0\]\.path must be a non-empty string/,
    );
    assert.throws(
      () => analyzeBusFactor([{ path: 42, authors: [author("amy", 1)] }]),
      /files\[0\]\.path must be a non-empty string/,
    );
  });

  it("rejects a duplicate file path, naming the second occurrence", () => {
    assert.throws(
      () =>
        analyzeBusFactor([
          file("a.ts", [author("amy", 1)]),
          file("b.ts", [author("amy", 1)]),
          file("a.ts", [author("bob", 1)]),
        ]),
      /files\[2\]\.path duplicates files\[0\]\.path "a\.ts"/,
    );
  });

  it("rejects missing authors, naming the path", () => {
    assert.throws(
      () => analyzeBusFactor([{ path: "a.ts" }]),
      /files\[0\]\.authors is required/,
    );
  });

  it("rejects empty or non-array authors, naming the path", () => {
    assert.throws(
      () => analyzeBusFactor([file("a.ts", [])]),
      /files\[0\]\.authors must be a non-empty array/,
    );
    assert.throws(
      () => analyzeBusFactor([{ path: "a.ts", authors: "amy" }]),
      /files\[0\]\.authors must be a non-empty array/,
    );
  });

  it("rejects an author entry that is not an object, naming the path", () => {
    assert.throws(
      () => analyzeBusFactor([{ path: "a.ts", authors: ["amy"] }]),
      /files\[0\]\.authors\[0\] must be an object/,
    );
  });

  it("rejects an author missing its name, naming the path", () => {
    assert.throws(
      () => analyzeBusFactor([{ path: "a.ts", authors: [{ commits: 3 }] }]),
      /files\[0\]\.authors\[0\]\.name is required/,
    );
  });

  it("rejects an empty or non-string author name, naming the path", () => {
    assert.throws(
      () => analyzeBusFactor([file("a.ts", [author("", 3)])]),
      /files\[0\]\.authors\[0\]\.name must be a non-empty string/,
    );
    assert.throws(
      () =>
        analyzeBusFactor([
          { path: "a.ts", authors: [{ name: 42, commits: 3 }] },
        ]),
      /files\[0\]\.authors\[0\]\.name must be a non-empty string/,
    );
  });

  it("rejects an author missing commits, naming the path", () => {
    assert.throws(
      () => analyzeBusFactor([{ path: "a.ts", authors: [{ name: "amy" }] }]),
      /files\[0\]\.authors\[0\]\.commits is required/,
    );
  });

  it("rejects commits below 1, naming the path", () => {
    assert.throws(
      () => analyzeBusFactor([file("a.ts", [author("amy", 0)])]),
      /files\[0\]\.authors\[0\]\.commits must be an integer >= 1/,
    );
    assert.throws(
      () => analyzeBusFactor([file("a.ts", [author("amy", -2)])]),
      /files\[0\]\.authors\[0\]\.commits must be an integer >= 1/,
    );
  });

  it("rejects non-integer commits, naming the path", () => {
    assert.throws(
      () => analyzeBusFactor([file("a.ts", [author("amy", 1.5)])]),
      /files\[0\]\.authors\[0\]\.commits must be an integer >= 1/,
    );
    assert.throws(
      () =>
        analyzeBusFactor([
          { path: "a.ts", authors: [{ name: "amy", commits: "3" }] },
        ]),
      /files\[0\]\.authors\[0\]\.commits must be an integer >= 1/,
    );
  });

  it("rejects a non-array reviewers field, naming the path", () => {
    assert.throws(
      () =>
        analyzeBusFactor([
          { path: "a.ts", authors: [author("amy", 1)], reviewers: "cleo" },
        ]),
      /files\[0\]\.reviewers must be an array/,
    );
  });

  it("rejects an empty or non-string reviewer entry, naming the path", () => {
    assert.throws(
      () => analyzeBusFactor([file("a.ts", [author("amy", 1)], ["cleo", ""])]),
      /files\[0\]\.reviewers\[1\] must be a non-empty string/,
    );
    assert.throws(
      () =>
        analyzeBusFactor([
          { path: "a.ts", authors: [author("amy", 1)], reviewers: [42] },
        ]),
      /files\[0\]\.reviewers\[0\] must be a non-empty string/,
    );
  });

  it("rejects an out-of-bounds threshold with the exact spec message", () => {
    const files = [file("a.ts", [author("amy", 1)])];
    for (const bad of [0, -0.5, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "0.8"]) {
      assert.throws(() => analyzeBusFactor(files, bad), {
        message: "threshold must be a number > 0 and <= 1",
      });
    }
  });

  it("accepts threshold values at the valid edges", () => {
    const files = [file("a.ts", [author("amy", 1)])];
    assert.doesNotThrow(() => analyzeBusFactor(files, 1));
    assert.doesNotThrow(() => analyzeBusFactor(files, 0.0001));
    // At threshold 1 a single-author file (share 1) is dominated;
    // at any threshold the share-1 file stays dominated.
    assert.equal(analyzeBusFactor(files, 1).files[0].dominated, true);
  });
});
