// Thin re-export — the pricing engine itself lives in @aeon/types so the web app's live
// Present-mode pricing slide and this API compute identical numbers from one source
// (see packages/types/src/pricing.ts for the ported-from-prototype implementation).
export * from "@aeon/types";
