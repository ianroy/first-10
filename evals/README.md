# Offline evaluation baseline

`offline-baseline.v4.json` is versioned, hand-authored checker input: eight valid fictional outputs plus seven negative examples. It is bound to the SHA-256 of `src/tests/ai-eval/fixtures.v4.json` and preserves the reference outputs instead of silently replacing them after a failure.

`offline-results.v4.json` is the actual reproducible result of:

```sh
node scripts/eval-ai.mjs --baseline
```

Both artifacts explicitly report no evaluated model, no paid calls and no human review. Null cost and latency indicate missing provider measurements. Source-ID capability remains unavailable in the legacy output schemas. See the [harness instructions](../src/tests/ai-eval/README.md) for bindings, limits and remaining paid-mode gates.

The published v2/v3 baseline/results and v1/v2/v3 fixture files are retained byte-for-byte. V3 added privacy policy/migration bindings and a withheld-source projection case. V4 retains all eight prompt/source cases and reference outputs while adding budget/intent source pins and exact canonical input hashes. It does not promote a model, approve a paid route or infer real consent. The current paid CLI remains disabled, and the general app budget remains unconfigured/disabled pending operator review and remaining source/quality gates.
