import type { DeckConfig } from "@aeon/types";
import { DeckLogo } from "../Logo";

export function QASlide({ deck }: { deck: DeckConfig }) {
  const q = deck.staticContent.qa;
  return (
    <div className="qa-wrap">
      <DeckLogo logo={deck.logo} className="cover-logo" colors={deck.colors} />
      <div className="qa-title">{q.title}</div>
      <p className="qa-sub">{q.sub}</p>
      <div className="qa-contact-row">
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
  );
}
