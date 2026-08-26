import type { DeckConfig } from "@aeon/types";
import { MiniBtn, Row, TextField } from "../fields";
import type { UpdateDraft } from "./StepBasics";

export function StepTeam({ deck, update }: { deck: DeckConfig; update: UpdateDraft }) {
  return (
    <>
      <p className="builder-step-intro">The people on the “Our Team” slide. Initials fill the monogram tile next to each name.</p>
      {deck.team.map((m, i) => (
        <div className="builder-subcard" key={i}>
          <div className="builder-subcard-head">
            <span>MEMBER {i + 1}</span>
            <MiniBtn danger disabled={deck.team.length === 1} onClick={() => update((d) => void d.team.splice(i, 1))}>
              ✕ Remove
            </MiniBtn>
          </div>
          <Row>
            <TextField
              label="Name"
              value={m.name}
              onChange={(v) =>
                update((d) => {
                  d.team[i].name = v;
                  if (!d.team[i].initials.trim() && v.trim()) {
                    d.team[i].initials = v
                      .trim()
                      .split(/\s+/)
                      .map((w) => w[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase();
                  }
                })
              }
            />
            <TextField
              label="Initials (2-3 letters)"
              value={m.initials}
              onChange={(v) => update((d) => void (d.team[i].initials = v.toUpperCase().slice(0, 3)))}
            />
          </Row>
          <TextField
            label="Title"
            value={m.title}
            placeholder="e.g. Chief Executive Officer · Co-Founder"
            onChange={(v) => update((d) => void (d.team[i].title = v))}
          />
          <Row>
            <TextField label="Email" value={m.email} onChange={(v) => update((d) => void (d.team[i].email = v))} />
            <TextField label="Phone" value={m.phone} onChange={(v) => update((d) => void (d.team[i].phone = v))} />
          </Row>
        </div>
      ))}
      <MiniBtn onClick={() => update((d) => void d.team.push({ initials: "", name: "", title: "", email: "", phone: "" }))}>
        ＋ Add team member
      </MiniBtn>
    </>
  );
}
