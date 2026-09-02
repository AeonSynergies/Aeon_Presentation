import type { DeckConfig } from "@aeon/types";
import * as React from "react";
import { FocusAreaListEditor, GridItemListEditor, MiniBtn, Row, TextAreaField, TextField } from "../fields";
import type { UpdateDraft } from "./StepBasics";

// Static slide copy, one collapsible section per slide. Opening a section snaps the
// live preview to that slide, so the copy is always being written against the real
// layout it will render in.

const SECTIONS: Array<{ key: string; title: string; slideId: string }> = [
  { key: "cover", title: "COVER", slideId: "cover" },
  { key: "about", title: "ABOUT US", slideId: "about" },
  { key: "how", title: "HOW WE WORK", slideId: "how" },
  { key: "challenges", title: "CHALLENGES", slideId: "challenges" },
  { key: "benefits", title: "BENEFITS", slideId: "benefits" },
  { key: "qa", title: "Q&A / CONTACT", slideId: "qa" },
];

export function StepContent({
  deck,
  update,
  onFocusSlide,
}: {
  deck: DeckConfig;
  update: UpdateDraft;
  onFocusSlide: (slideId: string) => void;
}) {
  const [open, setOpen] = React.useState<string>("cover");
  const sc = deck.staticContent;

  const toggle = (key: string, slideId: string) => {
    setOpen((cur) => (cur === key ? "" : key));
    onFocusSlide(slideId);
  };

  return (
    <>
      <p className="builder-step-intro">The fixed slides that frame every presentation. Open a section — the preview follows.</p>
      {SECTIONS.map(({ key, title, slideId }) => (
        <div className={`builder-svc-card${open === key ? " open" : ""}`} key={key}>
          <div className="builder-svc-head" onClick={() => toggle(key, slideId)}>
            <span className="builder-svc-name">{title}</span>
            <span className="builder-svc-caret">{open === key ? "▾" : "▸"}</span>
          </div>
          {open === key && (
            <div className="builder-svc-body">
              {key === "cover" && (
                <>
                  <Row>
                    <TextField
                      label="Title line 1"
                      value={sc.cover.title1}
                      onChange={(v) => update((d) => void (d.staticContent.cover.title1 = v))}
                    />
                    <TextField
                      label="Title line 2 (accent color)"
                      value={sc.cover.title2}
                      onChange={(v) => update((d) => void (d.staticContent.cover.title2 = v))}
                    />
                  </Row>
                  <TextAreaField
                    label="Subtitle"
                    value={sc.cover.sub}
                    onChange={(v) => update((d) => void (d.staticContent.cover.sub = v))}
                  />
                </>
              )}
              {key === "about" && (
                <>
                  <TextField
                    label="Eyebrow (small label above the heading)"
                    value={sc.about.eyebrow || ""}
                    placeholder="ABOUT US"
                    onChange={(v) => update((d) => void (d.staticContent.about.eyebrow = v))}
                  />
                  <Row>
                    <TextField
                      label="Title line 1"
                      value={sc.about.title1}
                      onChange={(v) => update((d) => void (d.staticContent.about.title1 = v))}
                    />
                    <TextField
                      label="Title line 2 (accent color)"
                      value={sc.about.title2}
                      onChange={(v) => update((d) => void (d.staticContent.about.title2 = v))}
                    />
                  </Row>
                  <TextAreaField
                    label="Body"
                    value={sc.about.body}
                    hint="Use **word** to bold a key term, or __word__ to bold it in accent color. A blank line between paragraphs starts a new one."
                    onChange={(v) => update((d) => void (d.staticContent.about.body = v))}
                  />
                  <TextField
                    label="Focus panel label (right-side dark panel)"
                    value={sc.about.focusLabel || ""}
                    placeholder="INDUSTRIES WE SERVE"
                    onChange={(v) => update((d) => void (d.staticContent.about.focusLabel = v))}
                  />
                  <FocusAreaListEditor
                    label="Focus areas (right-panel tiles — left empty to omit the right panel entirely)"
                    items={sc.about.focusAreas ?? []}
                    addLabel="Add focus area"
                    onChange={(items) => update((d) => void (d.staticContent.about.focusAreas = items))}
                  />
                </>
              )}
              {key === "how" && (
                <>
                  {sc.how.steps.map((step, i) => (
                    <div className="builder-subcard" key={i}>
                      <div className="builder-subcard-head">
                        <span>STEP {i + 1}</span>
                        <MiniBtn
                          danger
                          disabled={sc.how.steps.length === 1}
                          onClick={() => update((d) => void d.staticContent.how.steps.splice(i, 1))}
                        >
                          ✕
                        </MiniBtn>
                      </div>
                      <TextField
                        label="Step title"
                        value={step.t}
                        onChange={(v) => update((d) => void (d.staticContent.how.steps[i].t = v))}
                      />
                      <TextAreaField
                        label="Step description"
                        value={step.d}
                        onChange={(v) => update((d) => void (d.staticContent.how.steps[i].d = v))}
                      />
                    </div>
                  ))}
                  <MiniBtn onClick={() => update((d) => void d.staticContent.how.steps.push({ t: "", d: "" }))}>＋ Add step</MiniBtn>
                </>
              )}
              {key === "challenges" && (
                <GridItemListEditor
                  label="Challenge items (the problems this deck speaks to)"
                  items={sc.challenges.items}
                  addLabel="Add challenge"
                  onChange={(items) => update((d) => void (d.staticContent.challenges.items = items))}
                />
              )}
              {key === "benefits" && (
                <GridItemListEditor
                  label="Benefit items"
                  items={sc.benefits.items}
                  addLabel="Add benefit"
                  onChange={(items) => update((d) => void (d.staticContent.benefits.items = items))}
                />
              )}
              {key === "qa" && (
                <>
                  <Row>
                    <TextField label="Title" value={sc.qa.title} onChange={(v) => update((d) => void (d.staticContent.qa.title = v))} />
                    <TextField label="Subtitle" value={sc.qa.sub} onChange={(v) => update((d) => void (d.staticContent.qa.sub = v))} />
                  </Row>
                  <Row>
                    <TextField label="Email" value={sc.qa.email} onChange={(v) => update((d) => void (d.staticContent.qa.email = v))} />
                    <TextField label="Phone" value={sc.qa.phone} onChange={(v) => update((d) => void (d.staticContent.qa.phone = v))} />
                  </Row>
                  <Row>
                    <TextField label="Website" value={sc.qa.web} onChange={(v) => update((d) => void (d.staticContent.qa.web = v))} />
                    <TextField
                      label="Address"
                      value={sc.qa.address}
                      onChange={(v) => update((d) => void (d.staticContent.qa.address = v))}
                    />
                  </Row>
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </>
  );
}
