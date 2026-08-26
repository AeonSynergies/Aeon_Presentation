import type { DeckConfig } from "@aeon/types";
import { validateDraft } from "../draft";

export function StepReview({
  deck,
  onCreate,
  creating,
  serverError,
}: {
  deck: DeckConfig;
  onCreate: () => void;
  creating: boolean;
  serverError: string | null;
}) {
  const issues = validateDraft(deck);
  const tier2 = deck.discoveryQuestions.filter((q) => !q.relatedService && !q.surchargeFor).length;
  const tier3 = deck.discoveryQuestions.length - tier2;
  const surcharges = deck.services.filter((s) => s.surcharge).length;

  return (
    <>
      <p className="builder-step-intro">
        Final check before the deck is created. Use the preview's arrows to click through every slide — it's the exact renderer the
        presentation uses.
      </p>

      <div className="builder-subcard">
        <div className="builder-subcard-head">
          <span>SUMMARY</span>
        </div>
        <ul className="builder-summary-list">
          <li>
            <strong>{deck.companyName || "(no name)"}</strong> · {deck.industry || "(no industry)"}
          </li>
          <li>
            Priced by <strong>{deck.pricingDriver.label || "(driver not set)"}</strong>
          </li>
          <li>
            {deck.services.length} service{deck.services.length === 1 ? "" : "s"}
            {surcharges > 0 ? ` (${surcharges} with a surcharge toggle)` : ""}
          </li>
          <li>
            {deck.team.length} team member{deck.team.length === 1 ? "" : "s"}
          </li>
          <li>
            Discovery: {tier2} general question{tier2 === 1 ? "" : "s"}, {tier3} service-mapped
          </li>
        </ul>
      </div>

      {issues.length > 0 && (
        <div className="builder-issues">
          <div className="q-label" style={{ marginBottom: 8 }}>
            Fix before creating:
          </div>
          <ul>
            {issues.map((iss, i) => (
              <li key={i}>{iss}</li>
            ))}
          </ul>
        </div>
      )}

      {serverError && <div className="auth-error">{serverError}</div>}

      <button type="button" className="btn-primary" disabled={issues.length > 0 || creating} onClick={onCreate}>
        {creating ? "Creating deck…" : "Create deck"}
      </button>
      <div className="q-hint" style={{ marginTop: 10 }}>
        Creating saves the deck to the database and opens it in the real player — it appears on Home for everyone immediately.
      </div>
    </>
  );
}
