# Offline evaluation baseline

`offline-baseline.v2.json` is versioned, hand-authored checker input: eight valid fictional outputs plus seven negative examples. It is bound to the SHA-256 of `src/tests/ai-eval/fixtures.v2.json` and preserves the reference outputs instead of silently replacing them after a failure.

`offline-results.v2.json` is the actual reproducible result of:

```sh
node scripts/eval-ai.mjs --baseline
```

Both artifacts explicitly report no evaluated model, no paid calls and no human review. Null cost and latency indicate missing provider measurements. Source-ID capability remains unavailable in the legacy output schemas. See the [harness instructions](../src/tests/ai-eval/README.md) for bindings, limits and remaining paid-mode gates.
