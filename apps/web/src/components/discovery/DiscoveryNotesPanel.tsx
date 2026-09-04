import type { DeckConfig, DiscountConfig, SessionState } from "@aeon/types";
import { computeAutoDiscount, groupQuestionsByService, visibleGeneralQuestions, visibleServiceQuestions } from "@aeon/types";
import * as React from "react";
import { QuestionField } from "./QuestionField";

interface Props {
  deck: DeckConfig;
  state: SessionState;
  setState: React.Dispatch<React.SetStateAction<SessionState>>;
  clientName: string;
  setClientName: (v: string) => void;
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
    setState((prev) => {
      const selected = prev.selected.includes(id) ? prev.selected.filter((s) => s !== id) : [...prev.selected, id];
      return {
        ...prev,
        selected,
        discount: prev.discount.auto
          ? computeAutoDiscount(deck.services, deck.discountRules, selected, prev.discount.appliedCategoryDiscounts)
          : prev.discount,
      };
    });
  };
  const setModelValue = (modelId: string, v: string) => {
    setState((prev) => ({ ...prev, answers: { ...prev.answers, [modelId]: v === "" ? undefined : v } }));
  };

  // Manual discount editing: any direct field edit sets auto:false, freezing the value
  // until the presenter re-triggers a rule (checks a category box) or hits "use recommended".
  const setDiscount = (patch: Partial<DiscountConfig>) => {
    setState((prev) => ({ ...prev, discount: { ...prev.discount, ...patch, auto: false } }));
  };
  const setScope = (scope: DiscountConfig["scope"]) => {
    setState((prev) => ({
      ...prev,
      discount: {
        ...prev.discount,
        scope,
        services: scope === "all" ? [] : prev.discount.services,
        auto: false,
      },
    }));
  };
  const toggleDiscountService = (id: string) => {
    setState((prev) => {
      const services = prev.discount.services.includes(id)
        ? prev.discount.services.filter((s) => s !== id)
        : [...prev.discount.services, id];
      return { ...prev, discount: { ...prev.discount, services, auto: false } };
    });
  };
  const toggleCategoryDiscount = (id: string) => {
    setState((prev) => {
      const appliedCategoryDiscounts = prev.discount.appliedCategoryDiscounts.includes(id)
        ? prev.discount.appliedCategoryDiscounts.filter((c) => c !== id)
        : [...prev.discount.appliedCategoryDiscounts, id];
      return {
        ...prev,
        discount: {
          ...computeAutoDiscount(deck.services, deck.discountRules, prev.selected, appliedCategoryDiscounts),
        },
      };
    });
  };
  const useRecommendedDiscount = () => {
    setState((prev) => ({
      ...prev,
      discount: computeAutoDiscount(deck.services, deck.discountRules, prev.selected, prev.discount.appliedCategoryDiscounts),
    }));
  };

  const generalQs = visibleGeneralQuestions(questions, state);
  const serviceQs = visibleServiceQuestions(questions, state);
  const serviceGroups = groupQuestionsByService(serviceQs);

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
            <div className="q-label">Mark a category discount as applicable, or let the bundle tier apply automatically</div>
            {deck.discountRules.categoryDiscounts.length > 0 && (
              <div className="chip-grid">
                {deck.discountRules.categoryDiscounts.map((c) => {
                  const applied = state.discount.appliedCategoryDiscounts.includes(c.id);
                  return (
                    <label className={`chip ${applied ? "selected" : ""}`} key={c.id}>
                      <input type="checkbox" checked={applied} onChange={() => toggleCategoryDiscount(c.id)} />
                      {c.label} ({c.type === "percent" ? `${c.value}%` : `$${c.value}`})
                    </label>
                  );
                })}
              </div>
            )}
            {deck.discountRules.bundleTiers.length > 0 && (
              <div className="q-hint">
                Bundle tiers:{" "}
                {[...deck.discountRules.bundleTiers]
                  .sort((a, b) => a.minServices - b.minServices)
                  .map((t) => `${t.minServices}+ services = ${t.type === "percent" ? `${t.value}%` : `$${t.value}`}`)
                  .join(" · ")}
                . Currently {state.selected.length} selected.
              </div>
            )}
          </div>
        )}

        <div className="q-block">
          <span className="q-num">MANUAL · IN-CALL OVERRIDE</span>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={state.discount.enabled}
              onChange={(e) => setDiscount({ enabled: e.target.checked })}
            />
            Apply a discount
          </label>
          {state.discount.enabled && (
            <>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div className="q-label">Scope</div>
                  <select value={state.discount.scope} onChange={(e) => setScope(e.target.value as DiscountConfig["scope"])}>
                    <option value="all">All services</option>
                    <option value="multiple">Multiple services</option>
                    <option value="single">Single service</option>
                  </select>
                </div>
                <div>
                  <div className="q-label">Type</div>
                  <select value={state.discount.type} onChange={(e) => setDiscount({ type: e.target.value as DiscountConfig["type"] })}>
                    <option value="percent">Percent off</option>
                    <option value="flat">Flat $ off</option>
                  </select>
                </div>
                <div>
                  <div className="q-label">{state.discount.type === "percent" ? "Percent" : "Amount ($)"}</div>
                  <input
                    type="number"
                    min={0}
                    value={state.discount.value}
                    onChange={(e) => setDiscount({ value: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>
              {state.discount.scope === "single" && (
                <select
                  value={state.discount.services[0] ?? ""}
                  onChange={(e) => setDiscount({ services: e.target.value ? [e.target.value] : [] })}
                >
                  <option value="">— choose a service —</option>
                  {deck.services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
              {state.discount.scope === "multiple" && (
                <div className="chip-grid">
                  {deck.services.map((s) => {
                    const on = state.discount.services.includes(s.id);
                    return (
                      <label className={`chip ${on ? "selected" : ""}`} key={s.id}>
                        <input type="checkbox" checked={on} onChange={() => toggleDiscountService(s.id)} />
                        {s.name}
                      </label>
                    );
                  })}
                </div>
              )}
            </>
          )}
          {!state.discount.auto && deck.discountRules && (
            <div className="q-hint">
              Manually overridden.{" "}
              <button type="button" className="mini-btn" onClick={useRecommendedDiscount}>
                Use recommended
              </button>
            </div>
          )}
        </div>

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
