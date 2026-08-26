import type { DeckConfig } from "@aeon/types";
import { TextField } from "../fields";
import type { UpdateDraft } from "./StepBasics";

export function StepPricingModel({ deck, update }: { deck: DeckConfig; update: UpdateDraft }) {
  return (
    <>
      <p className="builder-step-intro">
        The pricing driver is the one number that drives every service's price bands — routes per day for Amazon DSP, units managed for
        Meridian. It's also Discovery Notes tier 1: the required question asked at the top of every meeting. Individual services can
        override it with their own driver later (in the Services step), like FedEx's Driver Payroll pricing by driver count.
      </p>
      <TextField
        label="Driver label"
        value={deck.pricingDriver.label}
        placeholder="e.g. Routes per day"
        hint="Shown next to prices, e.g. “MONTHLY INVESTMENT · 20 ROUTES PER DAY”."
        onChange={(v) => update((d) => void (d.pricingDriver.label = v))}
      />
      <TextField
        label="Unit (short, plural)"
        value={deck.pricingDriver.unit}
        placeholder="e.g. routes"
        hint="Used in the pricing summary lede: “20 routes across 4 services selected”."
        onChange={(v) => update((d) => void (d.pricingDriver.unit = v))}
      />
      <TextField
        label="Discovery question text"
        value={deck.pricingDriver.questionText}
        placeholder="e.g. How many routes do you run per day?"
        hint="Asked as the required tier-1 question in Discovery Notes."
        onChange={(v) => update((d) => void (d.pricingDriver.questionText = v))}
      />
    </>
  );
}
