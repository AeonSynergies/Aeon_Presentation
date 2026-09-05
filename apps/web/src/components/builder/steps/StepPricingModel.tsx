import type { DeckConfig } from "@aeon/types";
import { allIdsInUse, blankBundleTier, blankCategoryDiscount, blankPricingModel, idFromName } from "../draft";
import { Field, MiniBtn, Row, TextField } from "../fields";
import type { UpdateDraft } from "./StepBasics";

// Pricing Model step — a library of pricing drivers, not a single deck-level default.
// Every service (Services step) is explicitly assigned to one of these; exactly one is
// marked "primary", which is purely which model drives the deck's own narrative copy
// (cover slide, lede text) — being primary has no effect on pricing itself.

export function StepPricingModel({
  deck,
  update,
  returningToServiceName,
  onDoneCreating,
}: {
  deck: DeckConfig;
  update: UpdateDraft;
  returningToServiceName?: string | null;
  onDoneCreating?: () => void;
}) {
  const addModel = () => {
    const id = idFromName("New pricing model", allIdsInUse(deck), `model${deck.pricingModels.length + 1}`);
    update((d) => void d.pricingModels.push(blankPricingModel(id, false)));
  };

  const removeModel = (id: string) => {
    update((d) => {
      const removed = d.pricingModels.find((m) => m.id === id);
      d.pricingModels = d.pricingModels.filter((m) => m.id !== id);
      // Promote another model to primary if the primary one was just removed — a deck
      // always needs exactly one, and leaving none would break the cover/lede copy.
      if (removed?.isPrimary && d.pricingModels.length > 0) d.pricingModels[0].isPrimary = true;
    });
  };

  const setPrimary = (id: string) =>
    update((d) => {
      for (const m of d.pricingModels) m.isPrimary = m.id === id;
    });

  const usedByCount = (id: string) => deck.services.filter((s) => s.pricingModelId === id).length;

  const categoryDiscounts = deck.discountRules?.categoryDiscounts ?? [];
  const bundleTiers = deck.discountRules?.bundleTiers ?? [];

  const addCategoryDiscount = () => {
    const id = idFromName("category discount", categoryDiscounts.map((c) => c.id), `category${categoryDiscounts.length + 1}`);
    update((d) => {
      (d.discountRules ??= { categoryDiscounts: [], bundleTiers: [] }).categoryDiscounts.push(blankCategoryDiscount(id));
    });
  };
  const removeCategoryDiscount = (id: string) =>
    update((d) => void (d.discountRules && (d.discountRules.categoryDiscounts = d.discountRules.categoryDiscounts.filter((c) => c.id !== id))));

  const addBundleTier = () =>
    update((d) => {
      (d.discountRules ??= { categoryDiscounts: [], bundleTiers: [] }).bundleTiers.push(blankBundleTier());
    });
  const removeBundleTier = (idx: number) =>
    update((d) => void (d.discountRules && d.discountRules.bundleTiers.splice(idx, 1)));

  return (
    <>
      {returningToServiceName && onDoneCreating && (
        <div className="builder-subcard builder-locked" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Creating a new pricing model for "{returningToServiceName}" — fill it in below, then head back.</span>
          <MiniBtn onClick={onDoneCreating}>‹ Back to Services</MiniBtn>
        </div>
      )}
      <p className="builder-step-intro">
        Pricing models are the numbers that drive your services' price bands — routes per day for Amazon DSP, units managed for Meridian.
        Define as many as you need here, then assign each service to one in the Services step (every service is explicitly assigned — none
        default to another). Mark exactly one model "primary" — that's the one Discovery Notes always asks first and the deck's own cover
        copy references; it doesn't affect pricing. A model only shows up as a required Discovery Notes question once a selected service
        actually uses it.
      </p>
      {deck.pricingModels.map((model, mi) => {
        const inUse = usedByCount(model.id);
        return (
          <div className="builder-subcard" key={model.id}>
            <div className="builder-subcard-head">
              <span>
                PRICING MODEL <span className="builder-svc-id">· {model.id}</span>
              </span>
              <MiniBtn
                danger
                title={inUse > 0 ? `Reassign the ${inUse} service(s) using this model first` : "Remove model"}
                disabled={deck.pricingModels.length === 1 || inUse > 0}
                onClick={() => removeModel(model.id)}
              >
                ✕ Remove
              </MiniBtn>
            </div>
            <Row>
              <TextField
                label="Model label"
                value={model.label}
                placeholder="e.g. Routes per day"
                hint="Shown next to prices, e.g. “MONTHLY INVESTMENT · 20 ROUTES PER DAY”."
                onChange={(v) => update((d) => void (d.pricingModels[mi].label = v))}
              />
              <TextField
                label="Unit (short, plural)"
                value={model.unit}
                placeholder="e.g. routes"
                hint="Used in the pricing summary lede, when this is the primary model."
                onChange={(v) => update((d) => void (d.pricingModels[mi].unit = v))}
              />
            </Row>
            <TextField
              label="Discovery question text"
              value={model.questionText}
              placeholder="e.g. How many routes do you run per day?"
              hint="Asked in Discovery Notes whenever this model is the primary, or a selected service is priced by it."
              onChange={(v) => update((d) => void (d.pricingModels[mi].questionText = v))}
            />
            <Field label="Primary model" hint="Drives the deck's cover/lede copy. Has no effect on pricing.">
              <label className="builder-pricing-mode-option">
                <input type="radio" name="primary-pricing-model" checked={model.isPrimary} onChange={() => setPrimary(model.id)} />
                Make this the primary model
              </label>
            </Field>
            {inUse > 0 && <div className="q-hint">Used by {inUse} service{inUse === 1 ? "" : "s"}.</div>}
          </div>
        );
      })}
      <MiniBtn onClick={addModel}>＋ Add pricing model</MiniBtn>

      <div className="tier-heading" style={{ marginTop: 22 }}>
        DISCOUNT RULES (optional)
      </div>
      <p className="builder-step-intro">
        Pre-decided, so a presenter never has to guess a number live on a call — but nothing here ever applies on its own. A category
        discount is checked by the presenter as applicable during a call; a bundle tier works the same way, except only the tier the
        current service count actually qualifies for (the highest threshold met) is checkable — the presenter still has to check it for
        it to apply, and it stays checked as the qualifying tier changes with the live selection, unchecking automatically only if none
        qualifies anymore.
      </p>

      <div className="builder-subcard-head">
        <span>CATEGORY DISCOUNTS</span>
      </div>
      {categoryDiscounts.map((c, ci) => (
        <div className="builder-subcard" key={c.id}>
          <div className="builder-subcard-head">
            <span>
              CATEGORY DISCOUNT <span className="builder-svc-id">· {c.id}</span>
            </span>
            <MiniBtn danger onClick={() => removeCategoryDiscount(c.id)}>
              ✕ Remove
            </MiniBtn>
          </div>
          <Row>
            <TextField
              label="Label"
              value={c.label}
              placeholder="e.g. Women-owned DSPs"
              onChange={(v) => update((d) => void (d.discountRules!.categoryDiscounts[ci].label = v))}
            />
            <Field label="Type">
              <select value={c.type} onChange={(e) => update((d) => void (d.discountRules!.categoryDiscounts[ci].type = e.target.value as "percent" | "flat"))}>
                <option value="percent">Percent off</option>
                <option value="flat">Flat $ off</option>
              </select>
            </Field>
            <Field label={c.type === "percent" ? "Percent" : "Amount ($)"}>
              <input
                type="number"
                min={0}
                value={c.value}
                onChange={(e) => update((d) => void (d.discountRules!.categoryDiscounts[ci].value = Number(e.target.value) || 0))}
              />
            </Field>
          </Row>
        </div>
      ))}
      <MiniBtn onClick={addCategoryDiscount}>＋ Add category discount</MiniBtn>

      <div className="builder-subcard-head" style={{ marginTop: 18 }}>
        <span>BUNDLE TIERS</span>
      </div>
      {bundleTiers.map((t, ti) => (
        <div className="builder-subcard" key={ti}>
          <div className="builder-subcard-head">
            <span>BUNDLE TIER</span>
            <MiniBtn danger onClick={() => removeBundleTier(ti)}>
              ✕ Remove
            </MiniBtn>
          </div>
          <Row>
            <Field label="Services selected (at least)">
              <input
                type="number"
                min={1}
                value={t.minServices}
                onChange={(e) => update((d) => void (d.discountRules!.bundleTiers[ti].minServices = Number(e.target.value) || 1))}
              />
            </Field>
            <Field label="Type">
              <select value={t.type} onChange={(e) => update((d) => void (d.discountRules!.bundleTiers[ti].type = e.target.value as "percent" | "flat"))}>
                <option value="percent">Percent off</option>
                <option value="flat">Flat $ off</option>
              </select>
            </Field>
            <Field label={t.type === "percent" ? "Percent" : "Amount ($)"}>
              <input
                type="number"
                min={0}
                value={t.value}
                onChange={(e) => update((d) => void (d.discountRules!.bundleTiers[ti].value = Number(e.target.value) || 0))}
              />
            </Field>
          </Row>
        </div>
      ))}
      <MiniBtn onClick={addBundleTier}>＋ Add bundle tier</MiniBtn>
    </>
  );
}
