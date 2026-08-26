import type { DeckConfig } from "@aeon/types";
import { Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { trpc } from "~/lib/trpc";
import { WizardPreview } from "./WizardPreview";
import { blankDeck, cloneDeckAsDraft } from "./draft";
import { StepBasics, type UpdateDraft } from "./steps/StepBasics";
import { StepContent } from "./steps/StepContent";
import { StepDiscovery } from "./steps/StepDiscovery";
import { StepPricingModel } from "./steps/StepPricingModel";
import { StepReview } from "./steps/StepReview";
import { StepServices } from "./steps/StepServices";
import { StepTeam } from "./steps/StepTeam";

// The Deck Builder wizard. A short sequence of focused steps with a live preview
// alongside — explicitly NOT a port of the prototype's single long scrolling form,
// which was flagged as a weak creation experience. Cloning an existing deck is the
// default starting point; blank-slate exists but is listed last.

const STEPS = [
  { key: "basics", label: "Basics" },
  { key: "pricing", label: "Pricing Model" },
  { key: "services", label: "Services" },
  { key: "team", label: "Team" },
  { key: "content", label: "Content" },
  { key: "discovery", label: "Discovery Questions" },
  { key: "review", label: "Review" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

// Which slide the preview should follow for each step (services/content refine this
// per-selection via onFocusSlide). Discovery switches the preview to the real
// interactive Discovery Notes panel instead of a slide.
const STEP_SLIDE: Partial<Record<StepKey, string>> = {
  basics: "cover",
  pricing: "pricing",
  services: "portfolio",
  team: "team",
  content: "cover",
  review: "cover",
};

function StartScreen({ onPick }: { onPick: (source: DeckConfig | null) => void }) {
  const { data: decks, isLoading } = trpc.deck.list.useQuery();
  const utils = trpc.useUtils();
  const [loadingSlug, setLoadingSlug] = React.useState<string | null>(null);

  const pickClone = async (slug: string) => {
    setLoadingSlug(slug);
    try {
      const full = await utils.deck.getBySlug.fetch({ slug });
      onPick(cloneDeckAsDraft(full.config));
    } finally {
      setLoadingSlug(null);
    }
  };

  return (
    <div className="home-view">
      <div className="home-wordmark">
        <span className="dot" />
        Aeon
      </div>
      <h1 className="home-title">New deck</h1>
      <p className="home-sub">
        Start from an existing deck — its services, pricing structure, and discovery questions become your editable starting point. Or
        start blank.
      </p>
      {isLoading && <div className="empty-state">Loading decks…</div>}
      <div className="deck-grid">
        {decks?.map((deck: { id: string; slug: string; companyName: string; industry: string; tagline: string; colors: { amber: string; teal: string } }) => (
          <div key={deck.id} className="deck-card" onClick={() => void pickClone(deck.slug)}>
            <div className="dc-badge" style={{ background: `linear-gradient(135deg, ${deck.colors.teal}, ${deck.colors.amber})` }}>
              {loadingSlug === deck.slug ? "…" : "⧉"}
            </div>
            <div>
              <div className="dc-industry">START FROM</div>
              <div className="dc-name">{deck.companyName}</div>
            </div>
            <div className="dc-tagline">
              {deck.industry} — clones its services, price bands, surcharges, and discovery questions as an editable draft.
            </div>
          </div>
        ))}
        <div className="deck-card builder-blank-card" onClick={() => onPick(null)}>
          <div className="dc-badge" style={{ background: "linear-gradient(135deg, #5E7E84, #8D97A6)" }}>＋</div>
          <div>
            <div className="dc-industry">OR</div>
            <div className="dc-name">Start blank</div>
          </div>
          <div className="dc-tagline">An empty deck with just the structure — you fill in everything.</div>
        </div>
      </div>
      <div style={{ marginTop: 26 }}>
        <Link to="/" className="back-home-btn">
          ← Back to Home
        </Link>
      </div>
    </div>
  );
}

// editingSlug + initialDraft turn the same wizard into an editor for an existing deck:
// the start screen is skipped, Review calls deck.update instead of deck.create, and
// "Discard" returns to the deck itself rather than Home. One component, one code path —
// editing isn't a fork of creating, just a different save target.
export function DeckWizard({ editingSlug, initialDraft }: { editingSlug?: string; initialDraft?: DeckConfig }) {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const editing = !!editingSlug;
  const [draft, setDraft] = React.useState<DeckConfig | null>(initialDraft ?? null);
  const [stepIdx, setStepIdx] = React.useState(0);
  const [focusSlide, setFocusSlide] = React.useState<string | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const createDeck = trpc.deck.create.useMutation();
  const updateDeck = trpc.deck.update.useMutation();
  const saving = editing ? updateDeck.isPending : createDeck.isPending;

  const update: UpdateDraft = React.useCallback((mutate) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const copy: DeckConfig = JSON.parse(JSON.stringify(prev));
      mutate(copy);
      return copy;
    });
  }, []);

  if (!draft) {
    if (editing) return null; // caller (the edit route) supplies initialDraft once loaded
    return <StartScreen onPick={(source) => setDraft(source ?? blankDeck())} />;
  }

  const step = STEPS[stepIdx];
  const targetSlide = focusSlide ?? STEP_SLIDE[step.key] ?? null;

  const discard = () => {
    if (editing && editingSlug) navigate({ to: "/decks/$slug", params: { slug: editingSlug } });
    else navigate({ to: "/" });
  };

  const goTo = (idx: number) => {
    setStepIdx(Math.max(0, Math.min(STEPS.length - 1, idx)));
    setFocusSlide(null);
  };

  const onSave = async () => {
    setServerError(null);
    try {
      if (editing && editingSlug) {
        await updateDeck.mutateAsync({ slug: editingSlug, config: draft });
        await utils.deck.getBySlug.invalidate({ slug: editingSlug });
        await utils.deck.list.invalidate();
        navigate({ to: "/decks/$slug", params: { slug: editingSlug } });
      } else {
        const result = (await createDeck.mutateAsync({ config: draft })) as { slug: string };
        await utils.deck.list.invalidate();
        navigate({ to: "/decks/$slug", params: { slug: result.slug } });
      }
    } catch (err) {
      setServerError(err instanceof Error ? err.message : `${editing ? "Saving" : "Creating"} the deck failed.`);
    }
  };

  return (
    <div className="builder-shell">
      <div className="builder-form-pane">
        <div className="builder-form-head">
          <div className="builder-form-title">
            {editing ? "Edit deck" : "New deck"}
            {draft.companyName ? `: ${draft.companyName}` : ""}
            <button type="button" className="back-home-btn" style={{ marginLeft: "auto" }} onClick={discard}>
              ✕ Discard
            </button>
          </div>
          <div className="builder-steps">
            {STEPS.map((s, i) => (
              <button
                type="button"
                key={s.key}
                className={`builder-step-chip${i === stepIdx ? " active" : ""}${i < stepIdx ? " done" : ""}`}
                onClick={() => goTo(i)}
              >
                {i + 1} · {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="builder-form-body">
          {step.key === "basics" && <StepBasics deck={draft} update={update} />}
          {step.key === "pricing" && <StepPricingModel deck={draft} update={update} />}
          {step.key === "services" && <StepServices deck={draft} update={update} onFocusSlide={setFocusSlide} />}
          {step.key === "team" && <StepTeam deck={draft} update={update} />}
          {step.key === "content" && <StepContent deck={draft} update={update} onFocusSlide={setFocusSlide} />}
          {step.key === "discovery" && <StepDiscovery deck={draft} update={update} />}
          {step.key === "review" && (
            <StepReview deck={draft} onCreate={() => void onSave()} creating={saving} serverError={serverError} editing={editing} />
          )}
        </div>

        <div className="builder-footer">
          <button type="button" className="mini-btn" disabled={stepIdx === 0} onClick={() => goTo(stepIdx - 1)}>
            ‹ {stepIdx > 0 ? STEPS[stepIdx - 1].label : "Back"}
          </button>
          <span className="builder-footer-progress">
            {stepIdx + 1} / {STEPS.length}
          </span>
          <button type="button" className="mini-btn" disabled={stepIdx === STEPS.length - 1} onClick={() => goTo(stepIdx + 1)}>
            {stepIdx < STEPS.length - 1 ? STEPS[stepIdx + 1].label : "Next"} ›
          </button>
        </div>
      </div>

      <WizardPreview deck={draft} targetSlideId={targetSlide} mode={step.key === "discovery" ? "notes" : "slides"} />
    </div>
  );
}
