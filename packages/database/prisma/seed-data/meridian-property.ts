import type { DeckConfig } from "@aeon/types";

// Ported verbatim from Presentation_Platform.html (PROPERTY_DECK, lines 855-985) — every
// service, price band, surcharge, discovery question, and static slide copy is an exact
// copy of the prototype's data, not a re-creation from the spec description.
//
// Colors intentionally specify only amber/teal (matching the source exactly) — the rest
// fall back to PLATFORM_DEFAULT_COLORS at render time, same as the prototype's
// PLATFORM_THEME_DEFAULTS fallback in bootDeckPlayer(). None of this deck's services
// define a reportSlide in the source, so it has no "Sample:" slides — that's a faithful
// port, not a gap (getSlides() already gates that slide on `if (s.reportSlide)`).
export const meridianPropertyDeck: DeckConfig = {
  id: "meridian-property",
  industry: "Property Management",
  companyName: "Meridian Property Partners",
  tagline: "Back-office support for residential and commercial property owners and operators.",
  logo: { type: "text", wordmark: "Meridian", sub: "Property Partners" },
  colors: { amber: "#D9A441", teal: "#4FA8A0" },
  pricingModels: [{ id: "primary", label: "Units managed", unit: "units", questionText: "How many units do you currently manage?", isPrimary: true }],
  services: [
    {
      id: "leasing",
      name: "Tenant Screening & Leasing Coordination",
      team: "Leasing Team",
      category: "major",
      pricingModelId: "primary",
      bandLabel: "Unit-based · 4 bands",
      handle: [
        "Rental application intake, review, and applicant communication",
        "Credit, background, and rental history checks on every applicant",
        "Lease drafting, e-signature coordination, and move-in scheduling",
        "Renewal processing and rent adjustment notices ahead of lease expiry",
        "Listing syndication and showing coordination for vacant units",
        "Move-out inspection scheduling and security deposit documentation",
      ],
      stats: [
        { v: "↓ 40%", l: "Faster unit placement from listing to lease" },
        { v: "100%", l: "Applicants screened before lease offer" },
      ],
      dashboards: ["Leasing Funnel", "Vacancy Report", "Renewal Tracker", "Applicant Screening Log"],
      priceBands: [
        { upTo: 25, price: 300 },
        { upTo: 50, price: 450 },
        { upTo: 100, price: 650 },
        { upTo: null, price: 900 },
      ],
    },
    {
      id: "maintenance",
      name: "Maintenance Coordination",
      team: "Maintenance Operations Team",
      category: "major",
      pricingModelId: "primary",
      bandLabel: "Unit-based · 4 bands",
      handle: [
        "Work order intake from tenants and owners across all channels",
        "Vendor dispatch, scheduling, and follow-up through job completion",
        "Vendor invoice validation against approved scope and pricing",
        "Preventive maintenance scheduling to catch issues before they escalate",
        "Emergency work order triage and priority routing",
        "Vendor performance tracking — response time, cost, and quality",
      ],
      stats: [
        { v: "↓ 30%", l: "Faster average work order turnaround" },
        { v: "100%", l: "Vendor invoices validated before payment" },
      ],
      dashboards: ["Work Order Summary", "Vendor Performance Report", "Response Time Dashboard", "Preventive Maintenance Calendar"],
      priceBands: [
        { upTo: 25, price: 350 },
        { upTo: 50, price: 500 },
        { upTo: 100, price: 750 },
        { upTo: null, price: 1000 },
      ],
      surcharge: { questionId: "emergencyLine", amount: 150 },
    },
    {
      id: "rentfinance",
      name: "Rent Collection & Financial Reporting",
      team: "Finance Team",
      category: "strategic",
      pricingModelId: "primary",
      bandLabel: "Flat · 2 bands",
      handle: [
        "Rent collection tracking and automated late fee processing",
        "Delinquency follow-up and payment plan coordination",
        "Monthly owner statements with income and expense detail",
        "Bank reconciliation across operating and trust accounts",
        "Security deposit accounting and disposition letters",
        "Year-end financial summaries for tax preparation",
      ],
      stats: [
        { v: "↓ 25%", l: "Reduction in average days-late on rent" },
        { v: "100%", l: "Owner statements delivered on schedule" },
      ],
      dashboards: ["Rent Roll", "Owner Statement", "Collections Report", "Trust Account Reconciliation"],
      priceBands: [
        { upTo: 50, price: 300 },
        { upTo: null, price: 400 },
      ],
    },
    {
      id: "relations",
      name: "Owner & Tenant Relations",
      team: "Client Services Team",
      category: "strategic",
      pricingModelId: "primary",
      bandLabel: "Flat · 2 bands",
      handle: [
        "First-line tenant communication and issue triage",
        "Dispute resolution support between tenants and owners",
        "Scheduled owner reporting calls and portfolio performance reviews",
        "Tenant satisfaction tracking and move-out reason analysis",
        "Escalation management for high-priority owner or tenant issues",
      ],
      stats: [
        { v: "↑ Satisfaction", l: "Tenant satisfaction score trend" },
        { v: "100%", l: "Escalations logged and tracked to close" },
      ],
      dashboards: ["Satisfaction Score Dashboard", "Escalation Log", "Owner Reporting Calendar"],
      priceBands: [
        { upTo: 50, price: 250 },
        { upTo: null, price: 350 },
      ],
    },
  ],
  team: [
    { initials: "JM", name: "Jordan Marsh", title: "Chief Executive Officer · Co-Founder", email: "jordan.marsh@meridianpp.com", phone: "+1 (415) 200-3312" },
    { initials: "CT", name: "Camille Torres", title: "VP, Leasing & Client Services", email: "camille.torres@meridianpp.com", phone: "+1 (415) 200-3345" },
    { initials: "DK", name: "Devon Kaur", title: "Director of Maintenance Operations", email: "devon.kaur@meridianpp.com", phone: "+1 (415) 200-3378" },
    { initials: "SL", name: "Sam Liu", title: "Director of Finance", email: "sam.liu@meridianpp.com", phone: "+1 (415) 200-3391" },
  ],
  staticContent: {
    cover: {
      title1: "The Back Office Behind",
      title2: "Growing Property Portfolios",
      sub: "Meridian Property Partners runs leasing, maintenance, and financial operations so owners and operators can focus on growth, not paperwork.",
    },
    about: {
      title1: "One partner.",
      title2: "One property team.",
      body: "Meridian Property Partners is a dedicated back-office team built specifically for residential and commercial property owners and operators. We're not a call center that happens to answer property questions — our team specializes in leasing, maintenance coordination, and property financials, and stays with your portfolio as it grows.",
      bullets: [
        "A single point of contact across leasing, maintenance, and financial reporting",
        "The same team learns your properties once and carries that context forward",
        "Transparent monthly reporting so owners always know where things stand",
      ],
    },
    how: {
      steps: [
        { t: "Understanding", d: "We learn your portfolio — unit mix, current vendors, tenant communication habits, and where time or money is currently being lost." },
        { t: "Implementation", d: "Our team is onboarded to your property management software and vendor network, aligned to your reporting cadence, and live within 2-3 weeks." },
        { t: "Optimization", d: "Ongoing tracking of vacancy, collections, and maintenance turnaround — tightening operations as your portfolio expands." },
      ],
    },
    challenges: {
      items: [
        "Vacant units sitting longer than they should, costing real income",
        "Maintenance requests falling through the cracks or getting overcharged by vendors",
        "Late rent and inconsistent collections eating into cash flow",
        "Owners fielding tenant calls at all hours instead of running their business",
        "Spreadsheets and sticky notes instead of one clear operational picture",
        "Compliance and documentation gaps that surface at the worst time",
        "No time to properly vet new vendors or negotiate better rates",
      ],
    },
    benefits: {
      items: [
        "A dedicated team handling leasing, maintenance, and financials — not a rotating help desk",
        "Faster unit turnover and reduced vacancy through structured leasing coordination",
        "Vendor invoices validated before payment, catching overcharges early",
        "Consistent, on-time owner reporting every month",
        "A single escalation path for both tenants and owners",
        "Predictable, unit-based pricing that scales as your portfolio grows",
      ],
    },
    qa: {
      title: "Questions?",
      sub: "Let's talk about what running your portfolio's back office with Meridian would look like.",
      email: "hello@meridianpp.com",
      phone: "+1 (415) 200-3300",
      web: "www.meridianpropertypartners.com",
      address: "220 Market St, Suite 1100, San Francisco, CA 94111",
    },
  },
  discoveryQuestions: [
    { id: "ownerName", section: "general", label: "Owner / management company name", type: "text", placeholder: "e.g. Bayview Holdings LLC" },
    { id: "portfolioType", section: "general", label: "What type of properties are in the portfolio?", type: "text", placeholder: "e.g. Multifamily, mixed residential/commercial" },
    { id: "currentPM", section: "general", label: "What property management software do you currently use?", type: "text", placeholder: "e.g. AppFolio, Buildium" },
    {
      id: "emergencyLine",
      section: "surcharge",
      label: "Do you need a 24/7 emergency maintenance line?",
      type: "toggle",
      options: ["No — business hours only", "Yes — 24/7 emergency line"],
      surchargeFor: "maintenance",
      hint: "Adds a surcharge to Maintenance Coordination only, shown as one combined rate.",
    },
    { id: "yearsManaging", section: "general", label: "How long have you been managing this portfolio?", type: "text", placeholder: "e.g. 4 years" },
    { id: "currentProcess", section: "general", label: "Walk me through how you currently handle leasing, maintenance, and rent collection.", type: "textarea" },
  ],
};
