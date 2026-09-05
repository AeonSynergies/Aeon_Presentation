import type { DeckConfig, ManualDiscount, SessionState } from "@aeon/types";
import { activeBundleTier, appliedBundleTier, computeDiscountBreakdown, groupQuestionsByService, visibleGeneralQuestions, visibleServiceQuestions } from "@aeon/types";
import * as React from "react";
import { QuestionField } from "./QuestionField";

interface Props {
  deck: DeckConfig;
  state: SessionState;
  setState: React.Dispatch<React.SetStateAction<SessionState>>;
  clientName: string;
  setClientName: (v: string) => void;
}

function fmtDiscountValue(item: { type: "percent" | "flat"; value: number }): string {
  return item.type === "percent" ? `${item.value}%` : `$${item.value}`;
}

// In-page Discovery Notes panel — Phase 1 scope per CLAUDE.md Section 2: no popup, since
// that workaround existed only for the prototype's no-backend/no-screen-share constraint.
// Renders the same three tiers as the prototype: (1) driver + services selector, always
// present; (2) general questions; (3) service-mapped questions, gated on opt-in.
export function DiscoveryNotesPanel({ deck, state, setState, clientName, setClientName }: Props) {
  const questions = deck.discoveryQuestions;

  const setAnswer = (id: string, value: string | number | string[] | null) => {
    setState((prev) => ({ ...prev, answers: { ...prev.answers, [id]: value ?? undefined } }));
  };
  const setToggle = (id: string, value: boolean) => {
    setState((prev) => ({ ...prev, toggles: { ...prev.toggles, [id]: value } }));
  };
  const toggleService = (id: string) => {
    setState((prev) => ({
      ...prev,
      selected: prev.selected.includes(id) ? prev.selected.filter((s) => s !== id) : [...prev.selected, id],
    }));
  };
  const setModelValue = (modelId: string, v: string) => {
    setState((prev) => ({ ...prev, answers: { ...prev.answers, [modelId]: v === "" ? undefined : v } }));
  };

  // Category discounts and the bundle tier (checkboxes below) both feed the additive
  // discount stack independently of the manual override — see computeDiscountBreakdown/
  // discountItemsForService (@aeon/types). Checking one category never affects any other,
  // and none of this is ever auto-selected — including the bundle tier, which only becomes
  // checkable once the live selection count qualifies for it (see activeBundleTier below)
  // but still requires the presenter to actually check it.
  const toggleCategoryDiscount = (id: string) => {
    setState((prev) => ({
      ...prev,
      discount: {
        ...prev.discount,
        appliedCategoryDiscounts: prev.discount.appliedCategoryDiscounts.includes(id)
          ? prev.discount.appliedCategoryDiscounts.filter((c) => c !== id)
          : [...prev.discount.appliedCategoryDiscounts, id],
      },
    }));
  };

  const toggleBundleTier = () => {
    setState((prev) => ({ ...prev, discount: { ...prev.discount, bundleTierEnabled: !prev.discount.bundleTierEnabled } }));
  };

  // The manual "additional discount" control — always adds on top of the bundle tier and
  // any checked category discounts above; it never replaces them.
  const setManualDiscount = (patch: Partial<ManualDiscount>) => {
    setState((prev) => ({ ...prev, discount: { ...prev.discount, manual: { ...prev.discount.manual, ...patch } } }));
  };
  const setManualScope = (scope: ManualDiscount["scope"]) => {
    setManualDiscount({ scope, services: scope === "all" ? deck.services.map((s) => s.id) : state.discount.manual.services });
  };
  const toggleManualService = (id: string) => {
    const services = state.discount.manual.services.includes(id)
      ? state.discount.manual.services.filter((s) => s !== id)
      : [...state.discount.manual.services, id];
    setManualDiscount({ services });
  };

  const generalQs = visibleGeneralQuestions(questions, state);
  const serviceQs = visibleServiceQuestions(questions, state);
  const serviceGroups = groupQuestionsByService(serviceQs);

  // The tier the live selection count qualifies for right now — only this one is checkable
  // below; it does NOT mean the bundle tier discount is applying (see appliedBundleTier via
  // computeDiscountBreakdown below, which also requires bundleTierEnabled).
  const qualifyingBundleTier = activeBundleTier(deck.discountRules, state.selected.length);
  const breakdown = computeDiscountBreakdown(deck.discountRules, state);
  const hasAnyDiscount = breakdown.totalPercent > 0 || breakdown.totalFlat > 0;

  // If the presenter has the bundle tier checked but service selection changes such that no
  // tier qualifies anymore, uncheck it automatically — there's no longer a valid tier to
  // apply. (If a DIFFERENT tier now qualifies instead, this does nothing: the checkbox stays
  // checked and computeDiscountBreakdown above already reflects the newly-qualifying tier's
  // own percentage on every re-render, no extra state update needed.)
  React.useEffect(() => {
    if (state.discount.bundleTierEnabled && !qualifyingBundleTier) {
      setState((prev) => ({ ...prev, discount: { ...prev.discount, bundleTierEnabled: false } }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qualifyingBundleTier, state.discount.bundleTierEnabled]);

  // Tier 1 is one question per "active" pricing model: the primary model always (it
  // drives the deck's own cover/lede copy), plus any other model actually assigned to a
  // currently-selected service — a model nobody's using yet shouldn't clutter this panel.
  const activeModels = React.useMemo(() => {
    const primary = deck.pricingModels.find((m) => m.isPrimary);
    const otherActive = deck.pricingModels.filter(
      (m) => !m.isPrimary && deck.services.some((s) => state.selected.includes(s.id) && s.pricingModelId === m.id)
    );
    return primary ? [primary, ...otherActive] : otherActive;
  }, [deck.pricingModels, deck.services, state.selected]);

  return (
    <div className="notes-body">
      <div className="notes-wrap">
        <h2>Discovery Notes</h2>
        <p className="notes-sub">
          {deck.companyName} · {deck.industry}. Driver value and services below update the deck and pricing live — the rest are for your reference.
        </p>

        <div className="q-block">
          <div className="q-label">Client name (for Send to Client / records)</div>
          <input type="text" placeholder="e.g. Coleman Logistics LLC" value={clientName} onChange={(e) => setClientName(e.target.value)} />
        </div>

        <div className="tier-heading">
          1 · DISCOVERY QUESTIONS <span className="q-hint" style={{ display: "inline" }}>— required, drive pricing and the deck's own copy</span>
        </div>
        {activeModels.map((model) => {
          const raw = state.answers[model.id];
          return (
            <div className="q-block" key={model.id}>
              <span className="q-num">REQUIRED · DRIVES PRICING{model.isPrimary ? " · PRIMARY" : ""}</span>
              <div className="q-label">{model.questionText}</div>
              <input
                type="number"
                placeholder="e.g. 20"
                min={0}
                value={raw === undefined || raw === null ? "" : String(raw)}
                onChange={(e) => setModelValue(model.id, e.target.value)}
              />
            </div>
          );
        })}

        <div className="q-block">
          <span className="q-num">REQUIRED · DRIVES SLIDES &amp; PRICING</span>
          <div className="q-label">Which services is the client opting into?</div>
          <div className="chip-grid">
            {deck.services.map((s) => {
              const selected = state.selected.includes(s.id);
              return (
                <label className={`chip ${selected ? "selected" : ""}`} key={s.id}>
                  <input type="checkbox" checked={selected} onChange={() => toggleService(s.id)} />
                  {s.name}
                </label>
              );
            })}
          </div>
        </div>

        {deck.discountRules && (deck.discountRules.categoryDiscounts.length > 0 || deck.discountRules.bundleTiers.length > 0) && (
          <div className="q-block">
            <span className="q-num">PRE-DECIDED DISCOUNTS</span>
            <div className="q-label">
              Check any category discounts that apply — any number at once, each adds its own value. The bundle tier is the same:
              check it to apply it. Nothing here ever applies on its own.
            </div>
            {deck.discountRules.categoryDiscounts.length > 0 && (
              <div className="chip-grid">
                {deck.discountRules.categoryDiscounts.map((c) => {
                  const applied = state.discount.appliedCategoryDiscounts.includes(c.id);
                  return (
                    <label className={`chip ${applied ? "selected" : ""}`} key={c.id}>
                      <input type="checkbox" checked={applied} onChange={() => toggleCategoryDiscount(c.id)} />
                      {c.label} ({fmtDiscountValue(c)})
                    </label>
                  );
                })}
              </div>
            )}
            {deck.discountRules.bundleTiers.length > 0 && (
              <>
                <div className="chip-grid">
                  {[...deck.discountRules.bundleTiers]
                    .sort((a, b) => a.minServices - b.minServices)
                    .map((t) => {
                      // Only the tier the live selection count actually qualifies for is
                      // checkable — every other tier is shown (so the presenter can see the
                      // whole ladder) but disabled, since it doesn't apply right now.
                      const qualifies = qualifyingBundleTier?.minServices === t.minServices;
                      const checked = qualifies && state.discount.bundleTierEnabled;
                      const chipClass = ["chip", checked && "selected", !qualifies && "chip-disabled"].filter(Boolean).join(" ");
                      return (
                        <label className={chipClass} key={t.minServices}>
                          <input type="checkbox" checked={checked} disabled={!qualifies} onChange={toggleBundleTier} />
                          {t.minServices}+ services = {fmtDiscountValue(t)}
                        </label>
                      );
                    })}
                </div>
                <div className="q-hint">
                  Currently {state.selected.length} selected
                  {qualifyingBundleTier
                    ? ` — the ${fmtDiscountValue(qualifyingBundleTier)} tier qualifies${state.discount.bundleTierEnabled ? " and is checked." : "; check it above to apply it."}`
                    : " — no tier qualifies yet."}
                </div>
              </>
            )}
          </div>
        )}

        <div className="q-block">
          <span className="q-num">ADDITIONAL DISCOUNT · MANUAL OVERRIDE</span>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={state.discount.manual.enabled}
              onChange={(e) => setManualDiscount({ enabled: e.target.checked })}
            />
            Add an additional discount (adds on top of any pre-decided discounts above — it never replaces them)
          </label>
          {state.discount.manual.enabled && (
            <>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div className="q-label">Scope</div>
                  <select value={state.discount.manual.scope} onChange={(e) => setManualScope(e.target.value as ManualDiscount["scope"])}>
                    <option value="all">All services</option>
                    <option value="multiple">Multiple services</option>
                    <option value="single">Single service</option>
                  </select>
                </div>
                <div>
                  <div className="q-label">Type</div>
                  <select
                    value={state.discount.manual.type}
                    onChange={(e) => setManualDiscount({ type: e.target.value as ManualDiscount["type"] })}
                  >
                    <option value="percent">Percent off</option>
                    <option value="flat">Flat $ off</option>
                  </select>
                </div>
                <div>
                  <div className="q-label">{state.discount.manual.type === "percent" ? "Percent" : "Amount ($)"}</div>
                  <input
                    type="number"
                    min={0}
                    value={state.discount.manual.value}
                    onChange={(e) => setManualDiscount({ value: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>
              {state.discount.manual.scope === "single" && (
                <select
                  value={state.discount.manual.services[0] ?? ""}
                  onChange={(e) => setManualDiscount({ services: e.target.value ? [e.target.value] : [] })}
                >
                  <option value="">— choose a service —</option>
                  {deck.services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
              {state.discount.manual.scope === "multiple" && (
                <div className="chip-grid">
                  {deck.services.map((s) => {
                    const on = state.discount.manual.services.includes(s.id);
                    return (
                      <label className={`chip ${on ? "selected" : ""}`} key={s.id}>
                        <input type="checkbox" checked={on} onChange={() => toggleManualService(s.id)} />
                        {s.name}
                      </label>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {hasAnyDiscount && (
          <div className="q-block discount-breakdown">
            <span className="q-num">DISCOUNT BREAKDOWN</span>
            <ul className="plain-list">
              {breakdown.bundleTier && (
                <li>
                  Bundle tier ({breakdown.bundleTier.minServices}+ services): {fmtDiscountValue(breakdown.bundleTier)}
                </li>
              )}
              {breakdown.categories.map((c) => (
                <li key={c.id}>
                  {c.label}: {fmtDiscountValue(c)}
                </li>
              ))}
              {breakdown.manual && (
                <li>
                  Additional discount (
                  {breakdown.manual.scope === "all"
                    ? "all services"
                    : breakdown.manual.scope === "single"
                      ? deck.services.find((s) => s.id === breakdown.manual!.services[0])?.name || "one service"
                      : `${breakdown.manual.services.length} service${breakdown.manual.services.length === 1 ? "" : "s"}`}
                  ): {fmtDiscountValue(breakdown.manual)}
                </li>
              )}
            </ul>
            <div className="q-hint">
              Total stacked:{" "}
              {[breakdown.totalPercent > 0 ? `${breakdown.totalPercent}% off` : null, breakdown.totalFlat > 0 ? `$${breakdown.totalFlat} off` : null]
                .filter(Boolean)
                .join(" + ")}
            </div>
          </div>
        )}

        <hr className="section-divider" />
        <div className="tier-heading">
          2 · GENERAL QUESTIONS <span className="q-hint" style={{ display: "inline" }}>— optional, always shown</span>
        </div>
        {generalQs.map((q) => (
          <QuestionField key={q.id} question={q} allQuestions={questions} state={state} setAnswer={setAnswer} setToggle={setToggle} />
        ))}

        <hr className="section-divider" />
        <div className="tier-heading">
          3 · SERVICE QUESTIONS <span className="q-hint" style={{ display: "inline" }}>— optional, shown only when that service is opted in</span>
        </div>
        {serviceGroups.map((group) => {
          const svc = group.serviceId ? deck.services.find((s) => s.id === group.serviceId) : null;
          return (
            <div key={group.serviceId ?? "__general__"}>
              {svc && <div className="q-group-heading">{svc.name.toUpperCase()} · OPTED IN</div>}
              {group.questions.map((q) => (
                <div className="q-block" key={q.id} style={{ marginBottom: 0 }}>
                  {q.section === "surcharge" && <span className="q-num">DRIVES PRICING</span>}
                  <QuestionField question={q} allQuestions={questions} state={state} setAnswer={setAnswer} setToggle={setToggle} />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
