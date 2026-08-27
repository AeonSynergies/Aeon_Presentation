import type { DeckConfig, DeckService } from "@aeon/types";
import * as React from "react";
import { allIdsInUse, blankService, idFromName } from "../draft";
import { Field, MiniBtn, Row, StringListEditor, TextField } from "../fields";
import type { UpdateDraft } from "./StepBasics";

// Services step. Two things here go beyond plain fields:
// - The surcharge editor manages a PAIR atomically: the service's surcharge config and
//   its linked toggle question in discoveryQuestions (surchargeFor pointing back). The
//   pricing engine needs both halves; editing them separately is how they'd drift.
// - The alternate pricing driver hooks a service's price bands to a number-type
//   discovery question instead of the deck driver (FedEx Driver Payroll's by-driver
//   pricing) — offered only when such a question exists.

function findSurchargeQuestion(deck: DeckConfig, svc: DeckService) {
  if (!svc.surcharge) return undefined;
  return deck.discoveryQuestions.find((q) => q.id === svc.surcharge!.questionId);
}

// A service is "flat" exactly when it has one uncapped band — the same representation
// the pricing engine and every seeded deck already use for a single price with no tiers.
// This is purely a UI read of that shape, not a separate stored field: toggling the
// Flat/Tiered choice below just rewrites priceBands into (or out of) that one-band shape,
// so a deck that's always been flat (one band, upTo: null) reads as "Single flat price"
// without anyone having touched it.
function isFlatPricing(svc: DeckService): boolean {
  return svc.priceBands.length === 1 && svc.priceBands[0].upTo === null;
}

function BandsEditor({
  deck,
  svcIdx,
  update,
  aiFields,
  onAiFieldReviewed,
}: {
  deck: DeckConfig;
  svcIdx: number;
  update: UpdateDraft;
  aiFields: Set<string>;
  onAiFieldReviewed: (key: string) => void;
}) {
  const svc = deck.services[svcIdx];
  const flat = isFlatPricing(svc);

  const clearAiBadges = () => svc.priceBands.forEach((_, bi) => onAiFieldReviewed(`${svc.id}:${bi}`));

  const switchToFlat = () => {
    if (flat) return;
    // The last tier is usually the service's "standard" ongoing price (and is already
    // uncapped in most decks), so it's the more natural single price to keep — as
    // opposed to the first tier, which is usually the smallest/introductory band.
    const keepPrice = svc.priceBands[svc.priceBands.length - 1].price;
    clearAiBadges();
    update((d) => void (d.services[svcIdx].priceBands = [{ upTo: null, price: keepPrice }]));
  };

  const switchToTiered = () => {
    if (!flat) return;
    // Same operation "＋ Add band" already does: append a new uncapped band. The
    // now-second-to-last band (the former flat price) is left with upTo: null too, same
    // as clicking "Add band" on any deck today — the user fills in its real boundary,
    // exactly the existing tiered-editing flow, not a new one.
    clearAiBadges();
    update((d) => void d.services[svcIdx].priceBands.push({ upTo: null, price: null }));
  };

  if (flat) {
    const band = svc.priceBands[0];
    const aiKey = `${svc.id}:0`;
    const isAiSuggested = aiFields.has(aiKey);
    return (
      <Field label="Pricing structure">
        <div className="builder-pricing-mode-row">
          <label className="builder-pricing-mode-option">
            <input type="radio" name={`pricing-mode-${svc.id}`} checked readOnly onClick={switchToFlat} />
            Single flat price
          </label>
          <label className="builder-pricing-mode-option">
            <input type="radio" name={`pricing-mode-${svc.id}`} checked={false} onChange={switchToTiered} />
            Tiered / banded pricing
          </label>
        </div>
        <div className="builder-band-row">
          <span className="builder-band-label">$</span>
          <input
            type="number"
            min={0}
            placeholder="Custom Quote"
            value={band.price === null ? "" : String(band.price)}
            onChange={(e) => {
              update((d) => void (d.services[svcIdx].priceBands[0].price = e.target.value === "" ? null : Number(e.target.value)));
              onAiFieldReviewed(aiKey);
            }}
          />
          <span className="builder-band-label">/ month</span>
          {isAiSuggested && <span className="ai-badge" title="Populated by the AI draft — review before publishing.">✦ AI-suggested</span>}
        </div>
        <div className="q-hint">Leave the price empty for “Custom Quote”.</div>
      </Field>
    );
  }

  return (
    <Field
      label="Pricing structure"
      hint="Leave “up to” empty on the last band for an uncapped band; leave price empty for “Custom Quote”."
    >
      <div className="builder-pricing-mode-row">
        <label className="builder-pricing-mode-option">
          <input type="radio" name={`pricing-mode-${svc.id}`} checked={false} onChange={switchToFlat} />
          Single flat price
        </label>
        <label className="builder-pricing-mode-option">
          <input type="radio" name={`pricing-mode-${svc.id}`} checked readOnly onClick={switchToTiered} />
          Tiered / banded pricing
        </label>
      </div>
      {svc.priceBands.map((band, bi) => {
        const aiKey = `${svc.id}:${bi}`;
        const isAiSuggested = aiFields.has(aiKey);
        return (
          <div className="builder-band-row" key={bi}>
            <span className="builder-band-label">up to</span>
            <input
              type="number"
              min={1}
              placeholder="∞"
              value={band.upTo === null ? "" : String(band.upTo)}
              onChange={(e) => {
                update((d) => void (d.services[svcIdx].priceBands[bi].upTo = e.target.value === "" ? null : Number(e.target.value)));
                onAiFieldReviewed(aiKey);
              }}
            />
            <span className="builder-band-label">→ $</span>
            <input
              type="number"
              min={0}
              placeholder="Custom Quote"
              value={band.price === null ? "" : String(band.price)}
              onChange={(e) => {
                update((d) => void (d.services[svcIdx].priceBands[bi].price = e.target.value === "" ? null : Number(e.target.value)));
                onAiFieldReviewed(aiKey);
              }}
            />
            {isAiSuggested && <span className="ai-badge" title="Populated by the AI draft — review before publishing.">✦ AI-suggested</span>}
            <MiniBtn
              danger
              title="Remove band"
              disabled={svc.priceBands.length === 1}
              onClick={() => {
                update((d) => void d.services[svcIdx].priceBands.splice(bi, 1));
                onAiFieldReviewed(aiKey);
              }}
            >
              ✕
            </MiniBtn>
          </div>
        );
      })}
      <MiniBtn onClick={() => update((d) => void d.services[svcIdx].priceBands.push({ upTo: null, price: null }))}>＋ Add band</MiniBtn>
    </Field>
  );
}

function SurchargeEditor({ deck, svcIdx, update }: { deck: DeckConfig; svcIdx: number; update: UpdateDraft }) {
  const svc = deck.services[svcIdx];
  const question = findSurchargeQuestion(deck, svc);

  const enable = () =>
    update((d) => {
      const s = d.services[svcIdx];
      const qid = idFromName(`${s.id} surcharge`, allIdsInUse(d), `${s.id}Surcharge`);
      d.discoveryQuestions.push({
        id: qid,
        section: "surcharge",
        relatedService: s.id,
        label: `Does the client need the ${s.name} add-on?`,
        type: "toggle",
        options: ["No", "Yes"],
        surchargeFor: s.id,
        hint: `Adds a surcharge to ${s.name} only, shown as one combined rate.`,
      });
      s.surcharge = { questionId: qid, amount: 100 };
    });

  const disable = () =>
    update((d) => {
      const s = d.services[svcIdx];
      const qid = s.surcharge?.questionId;
      delete s.surcharge;
      if (qid) {
        const qi = d.discoveryQuestions.findIndex((q) => q.id === qid && q.surchargeFor === s.id);
        if (qi >= 0) d.discoveryQuestions.splice(qi, 1);
      }
    });

  if (!svc.surcharge) {
    return (
      <Field label="Surcharge" hint="A toggle in Discovery Notes that adds a flat monthly amount to this service only.">
        <MiniBtn onClick={enable}>＋ Add surcharge toggle</MiniBtn>
      </Field>
    );
  }

  const qIdx = deck.discoveryQuestions.findIndex((q) => q.id === svc.surcharge!.questionId);
  return (
    <div className="builder-subcard">
      <div className="builder-subcard-head">
        <span>SURCHARGE (paired toggle question in Discovery Notes)</span>
        <MiniBtn danger onClick={disable}>
          Remove surcharge
        </MiniBtn>
      </div>
      <Row>
        <Field label="Amount added ($/mo)">
          <input
            type="number"
            min={1}
            value={String(svc.surcharge.amount)}
            onChange={(e) => update((d) => void (d.services[svcIdx].surcharge!.amount = Number(e.target.value) || 0))}
          />
        </Field>
        <TextField
          label="Toggle question label"
          value={question?.label || ""}
          onChange={(v) => update((d) => void (qIdx >= 0 && (d.discoveryQuestions[qIdx].label = v)))}
        />
      </Row>
      <Row>
        <TextField
          label="“Off” option label"
          value={question?.options?.[0] || ""}
          onChange={(v) => update((d) => void (qIdx >= 0 && d.discoveryQuestions[qIdx].options && (d.discoveryQuestions[qIdx].options![0] = v)))}
        />
        <TextField
          label="“On” option label (applies the surcharge)"
          value={question?.options?.[1] || ""}
          onChange={(v) => update((d) => void (qIdx >= 0 && d.discoveryQuestions[qIdx].options && (d.discoveryQuestions[qIdx].options![1] = v)))}
        />
      </Row>
    </div>
  );
}

function ServiceEditor({
  deck,
  svcIdx,
  update,
  onRemove,
  aiFields,
  onAiFieldReviewed,
}: {
  deck: DeckConfig;
  svcIdx: number;
  update: UpdateDraft;
  onRemove: () => void;
  aiFields: Set<string>;
  onAiFieldReviewed: (key: string) => void;
}) {
  const svc = deck.services[svcIdx];
  const numberQuestions = deck.discoveryQuestions.filter((q) => q.type === "number");

  return (
    <div>
      <Row>
        <TextField label="Service name" value={svc.name} onChange={(v) => update((d) => void (d.services[svcIdx].name = v))} />
        <TextField
          label="Delivering team"
          value={svc.team}
          placeholder="e.g. Payroll & Compliance Team"
          onChange={(v) => update((d) => void (d.services[svcIdx].team = v))}
        />
      </Row>
      <Row>
        <Field label="Category">
          <select
            value={svc.category}
            onChange={(e) => update((d) => void (d.services[svcIdx].category = e.target.value as DeckService["category"]))}
          >
            <option value="major">Major</option>
            <option value="strategic">Strategic</option>
          </select>
        </Field>
        <TextField
          label="Band label (shown on Services overview)"
          value={svc.bandLabel}
          placeholder="e.g. Route-based · 5 bands"
          onChange={(v) => update((d) => void (d.services[svcIdx].bandLabel = v))}
        />
      </Row>

      <StringListEditor
        label="What we handle (bullets)"
        items={svc.handle}
        addLabel="Add bullet"
        onChange={(items) => update((d) => void (d.services[svcIdx].handle = items))}
      />

      <Field label="Impact stats (value + label)" hint="e.g. “↓ 80%” / “Fewer payroll exceptions reaching sign-off”.">
        {svc.stats.map((st, si) => (
          <div className="builder-list-row" key={si}>
            <input
              type="text"
              style={{ maxWidth: 110 }}
              placeholder="↓ 80%"
              value={st.v}
              onChange={(e) => update((d) => void (d.services[svcIdx].stats[si].v = e.target.value))}
            />
            <input
              type="text"
              placeholder="Fewer payroll exceptions reaching sign-off"
              value={st.l}
              onChange={(e) => update((d) => void (d.services[svcIdx].stats[si].l = e.target.value))}
            />
            <MiniBtn danger title="Remove stat" onClick={() => update((d) => void d.services[svcIdx].stats.splice(si, 1))}>
              ✕
            </MiniBtn>
          </div>
        ))}
        <MiniBtn onClick={() => update((d) => void d.services[svcIdx].stats.push({ v: "", l: "" }))}>＋ Add stat</MiniBtn>
      </Field>

      <StringListEditor
        label="Dashboards / reports delivered"
        items={svc.dashboards}
        addLabel="Add dashboard"
        onChange={(items) => update((d) => void (d.services[svcIdx].dashboards = items))}
      />

      <BandsEditor deck={deck} svcIdx={svcIdx} update={update} aiFields={aiFields} onAiFieldReviewed={onAiFieldReviewed} />

      <Field
        label="Priced by"
        hint="Default: the deck's pricing driver. A number-type discovery question can drive this service instead (like FedEx's Driver Payroll priced by driver count). Add number questions in the Discovery step."
      >
        <select
          value={svc.pricingDriverField || ""}
          onChange={(e) =>
            update((d) => {
              const s = d.services[svcIdx];
              if (e.target.value === "") {
                delete s.pricingDriverField;
                delete s.pricingDriverLabel;
              } else {
                s.pricingDriverField = e.target.value;
                const q = d.discoveryQuestions.find((qq) => qq.id === e.target.value);
                if (!s.pricingDriverLabel) s.pricingDriverLabel = q?.label || "";
              }
            })
          }
        >
          <option value="">Deck default ({deck.pricingDriver.label || "pricing driver"})</option>
          {numberQuestions.map((q) => (
            <option value={q.id} key={q.id}>
              Question: {q.label || q.id}
            </option>
          ))}
        </select>
      </Field>
      {svc.pricingDriverField && (
        <TextField
          label="Driver label shown next to this service's price"
          value={svc.pricingDriverLabel || ""}
          placeholder="e.g. Number of drivers"
          onChange={(v) => update((d) => void (d.services[svcIdx].pricingDriverLabel = v))}
        />
      )}

      <TextField
        label="Promo note (optional)"
        value={svc.promoNote || ""}
        placeholder="e.g. Free Trial: 30 Days"
        onChange={(v) => update((d) => void (v ? (d.services[svcIdx].promoNote = v) : delete d.services[svcIdx].promoNote))}
      />

      <SurchargeEditor deck={deck} svcIdx={svcIdx} update={update} />

      {svc.reportSlide ? (
        <Field label="Report & Sample slide" hint="Carried over from the cloned deck. Editing report slides in the builder comes in a later phase.">
          <div className="builder-list-row">
            <span className="builder-report-note">“{svc.reportSlide.title}” — {svc.reportSlide.cards.length} card(s)</span>
            <MiniBtn danger onClick={() => update((d) => void delete d.services[svcIdx].reportSlide)}>
              Remove sample slide
            </MiniBtn>
          </div>
        </Field>
      ) : null}

      <div style={{ marginTop: 14 }}>
        <MiniBtn danger onClick={onRemove}>
          ✕ Remove this service (and its mapped discovery questions)
        </MiniBtn>
      </div>
    </div>
  );
}

export function StepServices({
  deck,
  update,
  onFocusSlide,
  aiFields,
  onAiFieldReviewed,
}: {
  deck: DeckConfig;
  update: UpdateDraft;
  onFocusSlide: (slideId: string) => void;
  aiFields: Set<string>;
  onAiFieldReviewed: (key: string) => void;
}) {
  const [openId, setOpenId] = React.useState<string | null>(deck.services[0]?.id ?? null);

  const open = (id: string | null) => {
    setOpenId(id);
    if (id) onFocusSlide(`svc-${id}`);
  };

  // Ids are derived from the CURRENT deck prop before calling update — the update
  // mutator runs inside React's state updater, which must stay pure (no setOpenId there).
  const addService = () => {
    const name = `New Service ${deck.services.length + 1}`;
    const id = idFromName(name, allIdsInUse(deck), `service${deck.services.length + 1}`);
    update((d) => {
      d.services.push(blankService(name, id));
    });
    open(id);
  };

  const removeService = (id: string) => {
    const remaining = deck.services.filter((s) => s.id !== id);
    update((d) => {
      d.services = d.services.filter((s) => s.id !== id);
      // Its tier-3 questions (including any surcharge toggle) go with it — leaving them
      // behind would orphan relatedService references and fail server validation.
      d.discoveryQuestions = d.discoveryQuestions.filter((q) => q.relatedService !== id && q.surchargeFor !== id);
    });
    if (openId === id) setOpenId(remaining[0]?.id ?? null);
  };

  const move = (idx: number, dir: -1 | 1) =>
    update((d) => {
      const target = idx + dir;
      if (target < 0 || target >= d.services.length) return;
      const [s] = d.services.splice(idx, 1);
      d.services.splice(target, 0, s);
    });

  return (
    <>
      <p className="builder-step-intro">
        Each service becomes its own slide plus a card on the pricing summary. Open one to edit it — the preview jumps to that service's
        real slide.
      </p>
      {deck.services.map((svc, i) => {
        const hasUnreviewedAiBands = svc.priceBands.some((_, bi) => aiFields.has(`${svc.id}:${bi}`));
        return (
          <div className={`builder-svc-card${openId === svc.id ? " open" : ""}`} key={svc.id}>
            <div className="builder-svc-head" onClick={() => open(openId === svc.id ? null : svc.id)}>
              <span className="builder-svc-name">
                {svc.name || "(unnamed service)"} <span className="builder-svc-id">· {svc.id}</span>
                {hasUnreviewedAiBands && (
                  <span className="ai-badge" title="This service's price bands were populated by the AI draft — review before publishing.">
                    ✦ AI-suggested
                  </span>
                )}
              </span>
              <span className="builder-svc-tools" onClick={(e) => e.stopPropagation()}>
                <MiniBtn title="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                  ↑
                </MiniBtn>
                <MiniBtn title="Move down" disabled={i === deck.services.length - 1} onClick={() => move(i, 1)}>
                  ↓
                </MiniBtn>
                <span className="builder-svc-caret">{openId === svc.id ? "▾" : "▸"}</span>
              </span>
            </div>
            {openId === svc.id && (
              <div className="builder-svc-body">
                <ServiceEditor
                  deck={deck}
                  svcIdx={i}
                  update={update}
                  onRemove={() => removeService(svc.id)}
                  aiFields={aiFields}
                  onAiFieldReviewed={onAiFieldReviewed}
                />
              </div>
            )}
          </div>
        );
      })}
      <MiniBtn onClick={addService}>＋ Add service</MiniBtn>
    </>
  );
}
