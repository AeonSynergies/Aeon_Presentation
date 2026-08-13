import type { DeckConfig, SessionState } from "@aeon/types";
import { groupQuestionsByService, visibleGeneralQuestions, visibleServiceQuestions } from "@aeon/types";
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

  const setAnswer = (id: string, value: string | number | null) => {
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
  const setDriverValue = (v: string) => {
    setState((prev) => ({ ...prev, driverValue: v === "" ? null : v }));
  };

  const generalQs = visibleGeneralQuestions(questions, state);
  const serviceQs = visibleServiceQuestions(questions, state);
  const serviceGroups = groupQuestionsByService(serviceQs);

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
          1 · DISCOVERY QUESTION <span className="q-hint" style={{ display: "inline" }}>— required, drives the whole deck</span>
        </div>
        <div className="q-block">
          <span className="q-num">REQUIRED · DRIVES PRICING</span>
          <div className="q-label">{deck.pricingDriver.questionText}</div>
          <input
            type="number"
            placeholder="e.g. 20"
            min={0}
            value={state.driverValue === null ? "" : String(state.driverValue)}
            onChange={(e) => setDriverValue(e.target.value)}
          />
        </div>

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
