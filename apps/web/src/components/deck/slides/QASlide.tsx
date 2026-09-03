import type { DeckConfig } from "@aeon/types";
import { DeckLogo } from "../Logo";

// Thank You / Q&A closing slide (Templates redesign, split light+dark category): a dark
// branded statement panel paired with a light practical-contact panel — same .about-split
// convention as the About slide, dark side first since it's the slide's headline moment.
export function QASlide({ deck }: { deck: DeckConfig }) {
  const q = deck.staticContent.qa;
  return (
    <div className="about-split">
      <div className="split-panel-dark" style={{ alignItems: "center", textAlign: "center" }}>
        <DeckLogo logo={deck.logo} className="cover-logo" colors={deck.colors} onDark />
        <div className="qa-title">{q.title}</div>
        <p className="qa-sub">{q.sub}</p>
      </div>
      <div className="split-panel-light">
        <div className="split-heading">Get In Touch</div>
        <div className="qa-contact-col">
          <div className="qa-contact-item">
            <span className="qlabel">Email</span>
            <span>{q.email}</span>
          </div>
          <div className="qa-contact-item">
            <span className="qlabel">Phone</span>
            <span>{q.phone}</span>
          </div>
          <div className="qa-contact-item">
            <span className="qlabel">Web</span>
            <span>{q.web}</span>
          </div>
          <div className="qa-contact-item">
            <span className="qlabel">Address</span>
            <span>{q.address}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
