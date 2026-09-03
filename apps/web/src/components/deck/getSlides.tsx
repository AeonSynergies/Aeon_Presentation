import type { DeckConfig, SessionState } from "@aeon/types";
import type { ReactNode } from "react";
import { AboutSlide } from "./slides/AboutSlide";
import { BenefitsSlide, ChallengesSlide } from "./slides/ChallengesBenefitsSlide";
import { CoverSlide } from "./slides/CoverSlide";
import { HowWeWorkSlide } from "./slides/HowWeWorkSlide";
import { PortfolioSlide } from "./slides/PortfolioSlide";
import { PricingSlide } from "./slides/PricingSlide";
import { QASlide } from "./slides/QASlide";
import { ServiceIntroSlide } from "./slides/ServiceIntroSlide";
import { ServiceReportSlide } from "./slides/ServiceReportSlide";
import { ServiceSlide } from "./slides/ServiceSlide";
import { TeamSlide } from "./slides/TeamSlide";

export interface SlideEntry {
  id: string;
  label: string;
  render: () => ReactNode;
}

// Ported from Presentation_Platform.html's getSlides(): fixed intro slides, then one
// slide per opted-in service (with its Report & Sample slide spliced immediately after,
// gated on state.selected — Requirements Spec Section 4), then the fixed tail.
export function getSlides(deck: DeckConfig, state: SessionState): SlideEntry[] {
  const fixed: SlideEntry[] = [
    { id: "cover", label: "Welcome", render: () => <CoverSlide deck={deck} /> },
    { id: "about", label: "About Us", render: () => <AboutSlide deck={deck} /> },
    { id: "how", label: "How We Work", render: () => <HowWeWorkSlide deck={deck} /> },
    { id: "portfolio", label: "Services", render: () => <PortfolioSlide deck={deck} /> },
    { id: "challenges", label: "Challenges", render: () => <ChallengesSlide deck={deck} /> },
    { id: "benefits", label: "Benefits", render: () => <BenefitsSlide deck={deck} /> },
  ];

  const svcSlides: SlideEntry[] = [];
  deck.services
    .filter((s) => state.selected.includes(s.id))
    .forEach((s) => {
      svcSlides.push({
        id: "svc-intro-" + s.id,
        label: s.name.split(" ").slice(0, 2).join(" "),
        render: () => <ServiceIntroSlide svc={s} />,
      });
      svcSlides.push({
        id: "svc-" + s.id,
        label: s.name.split(" ").slice(0, 2).join(" ") + " Details",
        render: () => <ServiceSlide deck={deck} svc={s} state={state} />,
      });
      // One nav slide per SERVICE's whole set of reports, not one per report — a service
      // can carry several (e.g. Route Performance Management showing both a CDF and a DSB
      // incident breakdown), and those render together as a card grid on a single slide
      // (see ServiceReportSlide) rather than as separate slides. A lone report still gets
      // its own full-size slide, unchanged. Never regroups which service a report belongs
      // to — this only changes how many slides its own already-assigned reports span.
      const reports = s.reportSlides ?? [];
      if (reports.length > 0) {
        const label = reports.length === 1 ? "Sample: " + reports[0].title.split(",")[0].split(" ").slice(0, 3).join(" ") : "Sample: " + s.name.split(" ").slice(0, 2).join(" ");
        svcSlides.push({
          id: "report-" + s.id,
          label,
          render: () => <ServiceReportSlide svc={s} reports={reports} />,
        });
      }
    });

  const tail: SlideEntry[] = [
    { id: "team", label: "Our Team", render: () => <TeamSlide deck={deck} /> },
    { id: "pricing", label: "Pricing", render: () => <PricingSlide deck={deck} state={state} /> },
    { id: "qa", label: "Q&A", render: () => <QASlide deck={deck} /> },
  ];

  return [...fixed, ...svcSlides, ...tail];
}
