import type { DiscoveryQuestion, SessionState } from "@aeon/types";

function dependencyHint(q: DiscoveryQuestion, allQuestions: DiscoveryQuestion[], state: SessionState): string {
  if (!q.dependsOn) return "";
  const parent = allQuestions.find((p) => p.id === q.dependsOn!.questionId);
  if (!parent) return "";
  const valLabel =
    parent.type === "toggle"
      ? parent.options?.[q.dependsOn.value === true || q.dependsOn.value === "true" ? 1 : 0]
      : String(q.dependsOn.value);
  return `Shown because "${parent.label}" was answered "${valLabel}".`;
}

// Deliberately permissive — this is a live discovery-call aid, not a form gate. Catches
// obviously-wrong input (letters, way too short/long) while accepting the wide range of
// real formats a client might read a number off in: "(555) 123-4567", "+1 555 123 4567", etc.
const PHONE_PATTERN = /^[+]?[\d\s()-]{7,20}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function QuestionField({
  question,
  allQuestions,
  state,
  setAnswer,
  setToggle,
}: {
  question: DiscoveryQuestion;
  allQuestions: DiscoveryQuestion[];
  state: SessionState;
  setAnswer: (id: string, value: string | number | string[] | null) => void;
  setToggle: (id: string, value: boolean) => void;
}) {
  const q = question;
  const dh = dependencyHint(q, allQuestions, state);

  if (q.type === "text" || q.type === "number" || q.type === "time" || q.type === "date") {
    const value = state.answers[q.id];
    return (
      <div className="q-block">
        <div className="q-label">{q.label}</div>
        <input
          type={q.type}
          placeholder={q.placeholder || ""}
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) => setAnswer(q.id, q.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)}
        />
        {q.hint && <div className="q-hint">{q.hint}</div>}
        {dh && <div className="q-hint">{dh}</div>}
      </div>
    );
  }

  if (q.type === "email" || q.type === "phone") {
    const value = state.answers[q.id];
    const raw = value === undefined || value === null ? "" : String(value);
    const invalid = raw !== "" && !(q.type === "email" ? EMAIL_PATTERN : PHONE_PATTERN).test(raw);
    return (
      <div className="q-block">
        <div className="q-label">{q.label}</div>
        <input
          type={q.type === "email" ? "email" : "tel"}
          placeholder={q.placeholder || (q.type === "email" ? "name@company.com" : "(555) 123-4567")}
          value={raw}
          onChange={(e) => setAnswer(q.id, e.target.value)}
        />
        {invalid && <div className="q-error">{q.type === "email" ? "Doesn't look like a valid email address." : "Doesn't look like a valid phone number."}</div>}
        {q.hint && <div className="q-hint">{q.hint}</div>}
        {dh && <div className="q-hint">{dh}</div>}
      </div>
    );
  }

  if (q.type === "textarea") {
    const value = state.answers[q.id];
    return (
      <div className="q-block">
        <div className="q-label">{q.label}</div>
        <textarea
          placeholder={q.placeholder || "Notes..."}
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) => setAnswer(q.id, e.target.value)}
        />
        {dh && <div className="q-hint">{dh}</div>}
      </div>
    );
  }

  if (q.type === "select") {
    const value = state.answers[q.id];
    return (
      <div className="q-block">
        <div className="q-label">{q.label}</div>
        <select value={value === undefined || value === null ? "" : String(value)} onChange={(e) => setAnswer(q.id, e.target.value || null)}>
          <option value="">Select…</option>
          {(q.options || []).map((o) => (
            <option value={o} key={o}>
              {o}
            </option>
          ))}
        </select>
        {q.hint && <div className="q-hint">{q.hint}</div>}
        {dh && <div className="q-hint">{dh}</div>}
      </div>
    );
  }

  if (q.type === "multiselect") {
    const raw = state.answers[q.id];
    const selected = Array.isArray(raw) ? raw : [];
    const toggleOption = (opt: string) =>
      setAnswer(q.id, selected.includes(opt) ? selected.filter((o) => o !== opt) : [...selected, opt]);
    return (
      <div className="q-block">
        <div className="q-label">{q.label}</div>
        <div className="chip-grid">
          {(q.options || []).map((opt) => (
            <label className={`chip ${selected.includes(opt) ? "selected" : ""}`} key={opt}>
              <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggleOption(opt)} />
              {opt}
            </label>
          ))}
        </div>
        {q.hint && <div className="q-hint">{q.hint}</div>}
        {dh && <div className="q-hint">{dh}</div>}
      </div>
    );
  }

  if (q.type === "toggle") {
    const options = q.options || [];
    // A toggle's answer is captured two ways at once, on purpose: the boolean toggles map
    // (index 0 = false, any other index = true) is what surcharge pricing and dependsOn
    // gating actually read (packages/types/src/pricing.ts, discovery.ts) — that logic
    // predates multi-option toggles and only ever needs on/off. The specific option label
    // goes into answers, matching how every other answer type is captured, and is what a
    // saved Meeting Record's Word export shows instead of a bare "Yes"/"No". Falling back to
    // the boolean when answers isn't set yet keeps this correct for a meeting that already
    // has toggles state but predates this field being captured into answers too.
    const answerVal = state.answers[q.id];
    const selectedValue = typeof answerVal === "string" ? answerVal : state.toggles[q.id] ? options[1] : options[0];
    return (
      <div className="q-block">
        <div className="q-label">{q.label}</div>
        <div className="toggle-row">
          {options.map((opt, i) => (
            <div
              key={i}
              className={`toggle-opt ${selectedValue === opt ? "selected" : ""}`}
              onClick={() => {
                setToggle(q.id, i !== 0);
                setAnswer(q.id, opt);
              }}
            >
              {opt}
            </div>
          ))}
        </div>
        {q.hint && <div className="q-hint">{q.hint}</div>}
        {dh && <div className="q-hint">{dh}</div>}
      </div>
    );
  }

  return null;
}
