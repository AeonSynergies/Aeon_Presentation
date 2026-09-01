import type { DeckConfig, DiscoveryQuestion } from "@aeon/types";
import { allIdsInUse, blankQuestion, idFromName } from "../draft";
import { Field, MiniBtn, Row, StringListEditor, TextField } from "../fields";
import type { UpdateDraft } from "./StepBasics";

// Discovery Questions step, kept deliberately three-tier — the same structure the
// Discovery Notes panel renders for every existing deck, not a flattened list:
//   Tier 1: the pricing driver + services selector. Structural — every deck has them,
//           so they're shown here read-only (the driver text is edited in Pricing Model).
//   Tier 2: general questions — always visible in a meeting.
//   Tier 3: service-mapped questions — only visible when their service is opted in.
//           Surcharge toggles live here too but are managed as a pair from the Services
//           step, so they're shown locked rather than editable/deletable.
// The preview pane for this step is the REAL DiscoveryNotesPanel, interactive, so the
// gating being configured can be exercised immediately.

const TYPE_OPTIONS: Array<{ value: DiscoveryQuestion["type"]; label: string }> = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "textarea", label: "Long text" },
  { value: "select", label: "Select (dropdown)" },
  { value: "toggle", label: "Toggle (two options)" },
  { value: "time", label: "Time" },
];

function QuestionEditor({ deck, qIdx, update }: { deck: DeckConfig; qIdx: number; update: UpdateDraft }) {
  const q = deck.discoveryQuestions[qIdx];
  const needsOptions = q.type === "select" || q.type === "toggle";

  return (
    <div className="builder-subcard">
      <div className="builder-subcard-head">
        <span>
          {q.id}
          {q.dependsOn ? " · has a depends-on rule (preserved)" : ""}
        </span>
        <MiniBtn danger onClick={() => update((d) => void d.discoveryQuestions.splice(qIdx, 1))}>
          ✕ Remove
        </MiniBtn>
      </div>
      <TextField label="Question label" value={q.label} onChange={(v) => update((d) => void (d.discoveryQuestions[qIdx].label = v))} />
      <Row>
        <Field label="Answer type">
          <select
            value={q.type}
            onChange={(e) =>
              update((d) => {
                const question = d.discoveryQuestions[qIdx];
                question.type = e.target.value as DiscoveryQuestion["type"];
                if (question.type === "toggle") question.options = ["No", "Yes"];
                else if (question.type === "select") question.options = question.options?.length ? question.options : ["Option 1"];
                else delete question.options;
              })
            }
          >
            {TYPE_OPTIONS.map((t) => (
              <option value={t.value} key={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Applies to" hint="General = always shown. A service = only shown when that service is opted in.">
          <select
            value={q.relatedService || ""}
            onChange={(e) =>
              update((d) => {
                const question = d.discoveryQuestions[qIdx];
                if (e.target.value === "") delete question.relatedService;
                else question.relatedService = e.target.value;
              })
            }
          >
            <option value="">General (tier 2)</option>
            {deck.services.map((s) => (
              <option value={s.id} key={s.id}>
                {s.name || s.id} (tier 3)
              </option>
            ))}
          </select>
        </Field>
      </Row>
      {q.type === "toggle" && (
        <Row>
          <TextField
            label="“Off” option"
            value={q.options?.[0] || ""}
            onChange={(v) => update((d) => void (d.discoveryQuestions[qIdx].options![0] = v))}
          />
          <TextField
            label="“On” option"
            value={q.options?.[1] || ""}
            onChange={(v) => update((d) => void (d.discoveryQuestions[qIdx].options![1] = v))}
          />
        </Row>
      )}
      {q.type === "select" && (
        <StringListEditor
          label="Options"
          items={q.options || []}
          addLabel="Add option"
          onChange={(items) => update((d) => void (d.discoveryQuestions[qIdx].options = items))}
        />
      )}
      <Row>
        <TextField
          label="Placeholder (optional)"
          value={q.placeholder || ""}
          onChange={(v) => update((d) => void (v ? (d.discoveryQuestions[qIdx].placeholder = v) : delete d.discoveryQuestions[qIdx].placeholder))}
        />
        <TextField
          label="Hint (optional)"
          value={q.hint || ""}
          onChange={(v) => update((d) => void (v ? (d.discoveryQuestions[qIdx].hint = v) : delete d.discoveryQuestions[qIdx].hint))}
        />
      </Row>
    </div>
  );
}

export function StepDiscovery({ deck, update }: { deck: DeckConfig; update: UpdateDraft }) {
  const questions = deck.discoveryQuestions;
  const generalIdx = questions.map((q, i) => i).filter((i) => !questions[i].relatedService && !questions[i].surchargeFor);

  const addQuestion = (relatedService?: string) => {
    const id = idFromName(relatedService ? `${relatedService} question` : "general question", allIdsInUse(deck), "question1");
    update((d) => {
      const q = blankQuestion(id);
      if (relatedService) q.relatedService = relatedService;
      d.discoveryQuestions.push(q);
    });
  };

  return (
    <>
      <p className="builder-step-intro">
        The Discovery Notes panel every meeting runs on. Three tiers, same as every existing deck — the preview on the right is the real
        panel, live: opt services in and out to watch tier-3 questions appear and disappear.
      </p>

      <div className="tier-heading">1 · STRUCTURAL — every deck has these</div>
      {deck.pricingModels.map((model) => (
        <div className="builder-subcard builder-locked" key={model.id}>
          <div className="q-label">{model.questionText || "(pricing model question — set in the Pricing Model step)"}</div>
          <div className="q-hint">
            {model.isPrimary
              ? "Required — the primary model, always asked. Edit its wording in the Pricing Model step."
              : "Required only once a service using this model is opted in. Edit its wording in the Pricing Model step."}
          </div>
        </div>
      ))}
      <div className="builder-subcard builder-locked">
        <div className="q-label">Which services is the client opting into?</div>
        <div className="q-hint">The services selector — generated from the Services step; drives slides, pricing, and tier-3 gating.</div>
      </div>

      <div className="tier-heading" style={{ marginTop: 22 }}>
        2 · GENERAL QUESTIONS — always shown
      </div>
      {generalIdx.map((i) => (
        <QuestionEditor deck={deck} qIdx={i} update={update} key={questions[i].id} />
      ))}
      <MiniBtn onClick={() => addQuestion()}>＋ Add general question</MiniBtn>

      <div className="tier-heading" style={{ marginTop: 22 }}>
        3 · SERVICE QUESTIONS — shown only when that service is opted in
      </div>
      {deck.services.map((svc) => {
        const svcQIdx = questions.map((q, i) => i).filter((i) => (questions[i].relatedService || questions[i].surchargeFor) === svc.id);
        return (
          <div key={svc.id} style={{ marginBottom: 18 }}>
            <div className="q-group-heading">{(svc.name || svc.id).toUpperCase()}</div>
            {svcQIdx.length === 0 && <div className="q-hint" style={{ marginBottom: 8 }}>No questions mapped to this service yet.</div>}
            {svcQIdx.map((i) =>
              questions[i].surchargeFor ? (
                <div className="builder-subcard builder-locked" key={questions[i].id}>
                  <div className="q-label">{questions[i].label}</div>
                  <div className="q-hint">
                    Surcharge toggle — paired with this service's pricing, so it's managed in the Services step (amount, labels, on/off
                    options).
                  </div>
                </div>
              ) : (
                <QuestionEditor deck={deck} qIdx={i} update={update} key={questions[i].id} />
              ),
            )}
            <MiniBtn onClick={() => addQuestion(svc.id)}>＋ Add question for {svc.name || svc.id}</MiniBtn>
          </div>
        );
      })}
    </>
  );
}
