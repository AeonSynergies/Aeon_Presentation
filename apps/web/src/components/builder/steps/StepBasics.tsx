import type { DeckConfig, LogoConfig } from "@aeon/types";
import { PLATFORM_DEFAULT_COLORS } from "@aeon/types";
import * as React from "react";
import { Field, Row, TextAreaField, TextField } from "../fields";

export type UpdateDraft = (mutate: (d: DeckConfig) => void) => void;

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div className="builder-color-row">
        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#888888"} onChange={(e) => onChange(e.target.value)} />
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="#16A6CE" />
      </div>
    </Field>
  );
}

export function StepBasics({ deck, update }: { deck: DeckConfig; update: UpdateDraft }) {
  const [showAdvanced, setShowAdvanced] = React.useState(false);

  const setLogoType = (type: LogoConfig["type"]) => {
    update((d) => {
      if (type === "text") d.logo = { type: "text", wordmark: d.companyName || "New Deck", sub: "" };
      if (type === "image") d.logo = { type: "image", src: "" };
      if (type === "imagePair") d.logo = { type: "imagePair", srcLight: "", srcDark: "" };
    });
  };

  return (
    <>
      <p className="builder-step-intro">
        Who is this deck for? Name, industry, and the accent colors that theme every slide. The preview on the right is the real cover
        slide — it updates as you type.
      </p>
      <TextField
        label="Company / deck name"
        value={deck.companyName}
        placeholder="e.g. Harbor Freight Brokers"
        onChange={(v) =>
          update((d) => {
            // A text logo that hasn't been customized follows the company name, so a
            // blank-slate deck doesn't ship with the placeholder "New Deck" wordmark.
            if (d.logo.type === "text" && (d.logo.wordmark === d.companyName || d.logo.wordmark === "New Deck")) {
              d.logo.wordmark = v;
            }
            d.companyName = v;
          })
        }
      />
      <TextField
        label="Industry"
        value={deck.industry}
        placeholder="e.g. Freight Brokerage"
        onChange={(v) => update((d) => void (d.industry = v))}
      />
      <TextAreaField
        label="Tagline"
        value={deck.tagline}
        placeholder="One sentence on what this deck offers."
        onChange={(v) => update((d) => void (d.tagline = v))}
      />

      <div className="tier-heading">ACCENT COLORS</div>
      <Row>
        <ColorInput label="Primary accent (amber)" value={deck.colors.amber} onChange={(v) => update((d) => void (d.colors.amber = v))} />
        <ColorInput label="Secondary accent (teal)" value={deck.colors.teal} onChange={(v) => update((d) => void (d.colors.teal = v))} />
      </Row>
      <button type="button" className="mini-btn" onClick={() => setShowAdvanced((s) => !s)}>
        {showAdvanced ? "▾ Hide" : "▸ Show"} advanced palette (background, panels, text)
      </button>
      {showAdvanced && (
        <div style={{ marginTop: 12 }}>
          <div className="q-hint" style={{ marginBottom: 10 }}>
            Left empty, these inherit the platform defaults — most decks only set the two accents.
          </div>
          <Row>
            <ColorInput
              label={`Page background (default ${PLATFORM_DEFAULT_COLORS.ink})`}
              value={deck.colors.ink || ""}
              onChange={(v) => update((d) => void (d.colors.ink = v || undefined))}
            />
            <ColorInput
              label={`Card background (default ${PLATFORM_DEFAULT_COLORS.panel})`}
              value={deck.colors.panel || ""}
              onChange={(v) => update((d) => void (d.colors.panel = v || undefined))}
            />
          </Row>
          <Row>
            <ColorInput
              label={`Secondary panel (default ${PLATFORM_DEFAULT_COLORS.panel2})`}
              value={deck.colors.panel2 || ""}
              onChange={(v) => update((d) => void (d.colors.panel2 = v || undefined))}
            />
            <ColorInput
              label={`Muted text (default ${PLATFORM_DEFAULT_COLORS.fog})`}
              value={deck.colors.fog || ""}
              onChange={(v) => update((d) => void (d.colors.fog = v || undefined))}
            />
          </Row>
          <Row>
            <ColorInput
              label={`Primary text (default ${PLATFORM_DEFAULT_COLORS.paper})`}
              value={deck.colors.paper || ""}
              onChange={(v) => update((d) => void (d.colors.paper = v || undefined))}
            />
            <div />
          </Row>
        </div>
      )}

      <div className="tier-heading" style={{ marginTop: 22 }}>
        LOGO
      </div>
      <Field label="Logo type">
        <select value={deck.logo.type} onChange={(e) => setLogoType(e.target.value as LogoConfig["type"])}>
          <option value="text">Text wordmark</option>
          <option value="image">Single image URL</option>
          <option value="imagePair">Light/dark image pair (URLs)</option>
        </select>
      </Field>
      {deck.logo.type === "text" && (
        <Row>
          <TextField
            label="Wordmark"
            value={deck.logo.wordmark}
            onChange={(v) => update((d) => void (d.logo.type === "text" && (d.logo.wordmark = v)))}
          />
          <TextField
            label="Sub-label (optional)"
            value={deck.logo.sub || ""}
            onChange={(v) => update((d) => void (d.logo.type === "text" && (d.logo.sub = v)))}
          />
        </Row>
      )}
      {deck.logo.type === "image" && (
        <TextField
          label="Image URL"
          value={deck.logo.src}
          placeholder="/brand/your-logo.svg"
          onChange={(v) => update((d) => void (d.logo.type === "image" && (d.logo.src = v)))}
        />
      )}
      {deck.logo.type === "imagePair" && (
        <Row>
          <TextField
            label="Light-background URL"
            value={deck.logo.srcLight}
            onChange={(v) => update((d) => void (d.logo.type === "imagePair" && (d.logo.srcLight = v)))}
          />
          <TextField
            label="Dark-background URL"
            value={deck.logo.srcDark}
            onChange={(v) => update((d) => void (d.logo.type === "imagePair" && (d.logo.srcDark = v)))}
          />
        </Row>
      )}
    </>
  );
}
