# `@opute/dsh-plugin-tool-retrieval`

Projects a bounded authorized tool surface onto DSH the same way Platform
chat does: dense hash-vector cosine plus bounded lexical rerank
(`dense-lexical-rank-fusion-v1`, lexical weight 0.25), then the top 10.

This is not a lift of `platform.opute.io/chat`. Ranking stays advisory —
rank-1 is never a tool-choice imperative. The ranking query is the last
claimed user text only (no conversation-tail views). Enriched query variants
are document-side views: parse the sibling generated
`tool-retrieval-documents.ts` assignment object (`= {`); bundled
`query-variants.json` is the merge fallback if that file is missing or not JSON.

DSH assembles the prompt *before* `agent/pre-step`, so the plugin records the
user text on `agent/inbox/claimed` and filters `assembly.tools` in
`system-prompt/assemble`. Ranking failures restore the full catalog.
