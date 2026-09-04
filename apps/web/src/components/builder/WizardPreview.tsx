import type { DeckConfig, SessionState } from "@aeon/types";
import { computeAutoDiscount } from "@aeon/types";
import * as React from "react";
import { deckColorVars } from "~/components/deck/deckColors";
import { getSlides } from "~/components/deck/getSlides";
import { DiscoveryNotesPanel } from "~/components/discovery/DiscoveryNotesPanel";

// Live preview for the Deck Builder. Deliberately NOT a second rendering path: slides
// come from the same getSlides() + slide components DeckPlayer presents with, themed by
// the same deckColorVars(), just rendered at a fixed 1120x700 design size and scaled to
// fit the pane — so what you see while building is exactly what presenting looks like.
// In "notes" mode it renders the real DiscoveryNotesPanel instead, fully interactive
// against a local preview session, so tier gating can be tried out while editing.

const DESIGN_W = 1120;
const DESIGN_H = 700;

function initialPreviewState(deck: DeckConfig): SessionState {
  const answers: SessionState["answers"] = {};
  for (const m of deck.pricingModels) answers[m.id] = 20;
  return {
    selected: deck.services.map((s) => s.id),
    toggles: {},
    answers,
    discount: computeAutoDiscount(deck.services, deck.discountRules, deck.services.map((s) => s.id), []),
  };
}

export function WizardPreview({
  deck,
  targetSlideId,
  mode,
}: {
  deck: DeckConfig;
  targetSlideId: string | null;
  mode: "slides" | "notes";
}) {
  const [state, setState] = React.useState<SessionState>(() => initialPreviewState(deck));
  const [clientName, setClientName] = React.useState("");
  const [idx, setIdx] = React.useState(0);

  // Keep the preview session coherent as the draft changes shape: newly added services
  // start opted-in (matching initStateForDeck), removed services drop out of selection,
  // and every pricing model (deck default plus any per-service assignment) gets a sample
  // value so those prices render, including one just created via the wizard's "+ Create
  // new model" round trip.
  const knownSvcIds = React.useRef<Set<string>>(new Set(deck.services.map((s) => s.id)));
  React.useEffect(() => {
    const current = new Set(deck.services.map((s) => s.id));
    const added = [...current].filter((id) => !knownSvcIds.current.has(id));
    setState((prev) => {
      const selected = [...prev.selected.filter((id) => current.has(id)), ...added];
      const answers = { ...prev.answers };
      for (const m of deck.pricingModels) {
        if (answers[m.id] === undefined || answers[m.id] === null) answers[m.id] = 20;
      }
      // Recompute only while still on the (untouched) auto suggestion — this also keeps the
      // preview reacting live to discountRules being edited on the Pricing Model step, not
      // just to services being added/removed.
      const discount = prev.discount.auto
        ? computeAutoDiscount(deck.services, deck.discountRules, selected, prev.discount.appliedCategoryDiscounts)
        : prev.discount;
      return { ...prev, selected, answers, discount };
    });
    knownSvcIds.current = current;
  }, [deck]);

  const slides = React.useMemo(() => getSlides(deck, state), [deck, state]);
  const clamped = Math.min(idx, slides.length - 1);
  const primaryModel = deck.pricingModels.find((m) => m.isPrimary) ?? deck.pricingModels[0];
  const primaryValue = primaryModel ? state.answers[primaryModel.id] : undefined;

  React.useEffect(() => {
    if (!targetSlideId) return;
    const target = slides.findIndex((s) => s.id === targetSlideId);
    if (target >= 0) setIdx(target);
    // Only re-follow when the requested slide changes, not on every content keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetSlideId, slides.length]);

  // Scale-to-fit wrapper
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(0.4);
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setScale(Math.min(el.clientWidth / DESIGN_W, el.clientHeight / DESIGN_H));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);

  if (mode === "notes") {
    return (
      <div className="builder-preview-pane" style={deckColorVars(deck.colors)}>
        <div className="builder-preview-toolbar">
          <span className="builder-preview-label">LIVE PREVIEW · DISCOVERY NOTES (interactive — try the tier gating)</span>
        </div>
        <div className="builder-notes-preview">
          <DiscoveryNotesPanel deck={deck} state={state} setState={setState} clientName={clientName} setClientName={setClientName} />
        </div>
      </div>
    );
  }

  return (
    <div className="builder-preview-pane" style={deckColorVars(deck.colors)}>
      <div className="builder-preview-toolbar">
        <button type="button" className="mini-btn" disabled={clamped === 0} onClick={() => setIdx((i) => Math.max(0, i - 1))}>
          ‹
        </button>
        <span className="builder-preview-label">
          LIVE PREVIEW · {slides[clamped]?.label?.toUpperCase()} ({clamped + 1}/{slides.length})
        </span>
        <button
          type="button"
          className="mini-btn"
          disabled={clamped >= slides.length - 1}
          onClick={() => setIdx((i) => Math.min(slides.length - 1, i + 1))}
        >
          ›
        </button>
        <span className="builder-preview-driver">
          {primaryModel?.unit || "units"}:
          <input
            type="number"
            min={0}
            value={primaryValue === undefined || primaryValue === null ? "" : String(primaryValue)}
            onChange={(e) =>
              setState((p) => ({
                ...p,
                answers: { ...p.answers, ...(primaryModel ? { [primaryModel.id]: e.target.value === "" ? undefined : e.target.value } : {}) },
              }))
            }
          />
        </span>
      </div>
      <div className="builder-preview-stagewrap" ref={wrapRef}>
        <div
          className="builder-preview-canvas"
          style={{
            width: DESIGN_W,
            height: DESIGN_H,
            transform: `translate(-50%, -50%) scale(${scale})`,
          }}
        >
          <div className="slide" style={{ maxWidth: "100%" }} key={slides[clamped]?.id}>
            {slides[clamped]?.render()}
          </div>
        </div>
      </div>
    </div>
  );
}
