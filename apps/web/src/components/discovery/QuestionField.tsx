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
  setAnswer: (id: string, value: string | number | null) => void;
  setToggle: (id: string, value: boolean) => void;
}) {
  const q = question;
  const dh = dependencyHint(q, allQuestions, state);

  if (q.type === "text" || q.type === "number" || q.type === "time") {
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

  if (q.type === "toggle") {
    const value = !!state.toggles[q.id];
    return (
      <div className="q-block">
        <div className="q-label">{q.label}</div>
        <div className="toggle-row">
          <div className={`toggle-opt ${!value ? "selected" : ""}`} onClick={() => setToggle(q.id, false)}>
            {q.options?.[0]}
          </div>
          <div className={`toggle-opt ${value ? "selected" : ""}`} onClick={() => setToggle(q.id, true)}>
            {q.options?.[1]}
          </div>
        </div>
        {q.hint && <div className="q-hint">{q.hint}</div>}
        {dh && <div className="q-hint">{dh}</div>}
      </div>
    );
  }

  return null;
}
