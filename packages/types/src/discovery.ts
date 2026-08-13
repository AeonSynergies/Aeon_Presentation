// Discovery Notes visibility rules — ported exactly from Presentation_Platform.html
// (~lines 2575-2595). Three tiers per CLAUDE.md Key Requirement #2:
//   1. driver + services-selector — always present, handled by the caller directly
//   2. general questions — no service mapping, shown whenever dependencyMet()
//   3. service-mapped questions — shown only when their service is opted in AND dependencyMet()
import type { DiscoveryQuestion } from "./deck.js";
import type { SessionState } from "./session.js";

export function dependencyMet(q: DiscoveryQuestion, allQuestions: DiscoveryQuestion[], st: SessionState): boolean {
  if (!q.dependsOn) return true;
  const parent = allQuestions.find((p) => p.id === q.dependsOn!.questionId);
  if (!parent) return true; // parent question no longer exists — fail open rather than hide forever
  if (parent.type === "toggle") {
    return !!st.toggles[parent.id] === (q.dependsOn.value === true || q.dependsOn.value === "true");
  }
  if (parent.type === "select") {
    return st.answers[parent.id] === q.dependsOn.value;
  }
  return true;
}

/** Tier 2 — General Questions: no service mapping at all, regardless of `section`. */
export function visibleGeneralQuestions(questions: DiscoveryQuestion[], st: SessionState): DiscoveryQuestion[] {
  return questions.filter((q) => {
    const rel = q.relatedService || q.surchargeFor;
    return !rel && dependencyMet(q, questions, st);
  });
}

/** Tier 3 — Service Questions: has a service mapping, regardless of `section`. */
export function visibleServiceQuestions(questions: DiscoveryQuestion[], st: SessionState): DiscoveryQuestion[] {
  return questions.filter((q) => {
    const rel = q.relatedService || q.surchargeFor;
    return !!rel && st.selected.includes(rel) && dependencyMet(q, questions, st);
  });
}

/** Groups a question list by their related service (or "__general__"), preserving first-seen order. */
export function groupQuestionsByService(
  questions: DiscoveryQuestion[]
): Array<{ serviceId: string | null; questions: DiscoveryQuestion[] }> {
  const groups = new Map<string, DiscoveryQuestion[]>();
  const order: string[] = [];
  for (const q of questions) {
    const key = q.relatedService || q.surchargeFor || "__general__";
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(q);
  }
  return order.map((key) => ({
    serviceId: key === "__general__" ? null : key,
    questions: groups.get(key)!,
  }));
}
