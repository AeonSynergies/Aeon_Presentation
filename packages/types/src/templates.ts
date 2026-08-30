// Deck templates (Phase 5c) — replace "clone from an existing live deck" as Create Deck's
// starting point. A real client's live deck (Amazon DSP, Meridian Property Partners, FedEx
// P&D) should never double as another client's template, so this file is the only source
// of starting structures the wizard (and AI drafting's structural grounding, see
// apps/api/src/lib/ai-draft.ts) offers.
//
// Two categories:
//   - "generic": invented, industry-flavored structures not tied to any real company.
//   - "anonymized": same structural shape (service categories, price-band patterns,
//     surcharge/alternate-driver mechanisms, question tiers) as one of the three seeded
//     decks, with the real company name, logo, team, contact details, and any
//     company-specific program jargon (e.g. Amazon's "AMZL/AMXL", "DSP") stripped and
//     replaced with generic language. Deliberately excludes reportSlide — that's the most
//     content-heavy, most identifying part (specific illustrative dollar figures and
//     dates), and isn't part of the shape a template needs to provide (services, price
//     bands, team, static content, discovery questions).
//
// Identity fields (companyName, logo, team, staticContent.qa contact fields) are left
// blank on every template, same as blankDeck() — a template's job is to supply STRUCTURE
// a consultant adapts for a new client, not a placeholder identity to first delete.
import type { DeckConfig } from "./deck.js";

export interface DeckTemplate {
  key: string;
  label: string;
  category: "generic" | "anonymized";
  summary: string;
  config: DeckConfig;
}

function blankIdentity() {
  return {
    companyName: "",
    logo: { type: "text" as const, wordmark: "", sub: "" },
    team: [{ initials: "", name: "", title: "", email: "", phone: "" }],
  };
}

function blankQa(title: string, sub: string) {
  return { title, sub, email: "", phone: "", web: "", address: "" };
}

// ============================================================================
// Generic templates — invented, not derived from any real deck.
// ============================================================================

const fieldServicesTemplate: DeckConfig = {
  id: "",
  industry: "Field Services & Trade Operations",
  tagline: "Back-office support for HVAC, plumbing, electrical, and other field-technician-based trades.",
  colors: { amber: "#C97A3A", teal: "#3A7D6B" },
  pricingDriver: { label: "Technicians", unit: "technicians", questionText: "How many field technicians are on your team?" },
  ...blankIdentity(),
  services: [
    {
      id: "dispatch",
      name: "Dispatch & Scheduling Coordination",
      team: "Dispatch Team",
      category: "major",
      bandLabel: "Technician-based · 3 bands",
      handle: [
        "Inbound service request intake and technician scheduling",
        "Real-time route adjustments for same-day and emergency calls",
        "Customer confirmation and appointment-window communication",
        "Technician arrival tracking and no-show follow-up",
      ],
      stats: [
        { v: "↓ 25%", l: "Fewer missed or late appointment windows" },
        { v: "100%", l: "Service requests confirmed same day" },
      ],
      dashboards: ["Daily Dispatch Board", "Technician Utilization Report"],
      priceBands: [
        { upTo: 5, price: 250 },
        { upTo: 15, price: 450 },
        { upTo: null, price: 700 },
      ],
      surcharge: { questionId: "afterHoursDispatch", amount: 150 },
    },
    {
      id: "payroll",
      name: "Technician Payroll & Compliance",
      team: "Payroll & Compliance Team",
      category: "major",
      bandLabel: "Technician-based · 3 bands",
      handle: [
        "Timecard review and hours validation each pay cycle",
        "Overtime and prevailing-wage compliance checks",
        "PTO tracking and payroll exception flagging",
      ],
      stats: [
        { v: "↓ 60%", l: "Fewer payroll exceptions reaching sign-off" },
        { v: "100%", l: "Timecards reviewed before payroll runs" },
      ],
      dashboards: ["Payroll Summary", "Compliance Exception Report"],
      priceBands: [
        { upTo: 5, price: 200 },
        { upTo: 15, price: 350 },
        { upTo: null, price: 550 },
      ],
    },
    {
      id: "invoicing",
      name: "Customer Invoicing & Collections",
      team: "Finance Team",
      category: "strategic",
      bandLabel: "Flat · 2 bands",
      handle: [
        "Job-completion invoicing and payment collection follow-up",
        "Aging accounts tracking and delinquency outreach",
        "Monthly revenue and collections reporting",
      ],
      stats: [
        { v: "↓ 30%", l: "Reduction in average days-to-payment" },
        { v: "100%", l: "Completed jobs invoiced within 24 hours" },
      ],
      dashboards: ["Collections Report", "Revenue Summary"],
      priceBands: [
        { upTo: 15, price: 250 },
        { upTo: null, price: 350 },
      ],
    },
    {
      id: "recruiting",
      name: "Technician Recruitment & Onboarding",
      team: "Talent Acquisition Team",
      category: "strategic",
      bandLabel: "Flat · 2 bands",
      handle: [
        "Job posting, applicant screening, and interview scheduling",
        "License and certification verification before hire",
        "Onboarding paperwork and first-week check-ins",
      ],
      stats: [{ v: "↓ 40%", l: "Faster time-to-hire" }, { v: "100%", l: "Certifications verified before start date" }],
      dashboards: ["Hiring Pipeline", "Time-to-Hire Report"],
      priceBands: [
        { upTo: 10, price: 300 },
        { upTo: null, price: 450 },
      ],
    },
  ],
  staticContent: {
    cover: { title1: "The Back Office Behind", title2: "Growing Field Service Teams", sub: "" },
    about: {
      title1: "One partner.",
      title2: "One field-service team.",
      body: "A dedicated back-office team built for field-service trades — dispatch, technician payroll, invoicing, and recruiting handled by people who specialize in it, not a rotating help desk.",
      bullets: [
        "A single point of contact across dispatch, payroll, and billing",
        "The same team learns your service area and technicians once",
        "Transparent monthly reporting so you always know where things stand",
      ],
    },
    how: {
      steps: [
        { t: "Understanding", d: "We learn your service area, technician roster, and current scheduling/payroll process." },
        { t: "Implementation", d: "Our team is onboarded to your scheduling and payroll systems and live within 2-3 weeks." },
        { t: "Optimization", d: "Ongoing tracking of dispatch efficiency, payroll accuracy, and collections as your team grows." },
      ],
    },
    challenges: {
      items: [
        "Missed or late appointment windows costing repeat business",
        "Technician payroll errors creating compliance exposure",
        "Slow invoicing and collections eating into cash flow",
        "Owners fielding dispatch calls instead of running the business",
      ],
    },
    benefits: {
      items: [
        "A dedicated team handling dispatch, payroll, and billing",
        "Faster technician response and fewer missed appointments",
        "Cleaner payroll with fewer exceptions reaching sign-off",
        "Predictable, technician-based pricing that scales with your team",
      ],
    },
    qa: blankQa("Questions?", ""),
  },
  discoveryQuestions: [
    { id: "businessName", section: "general", label: "Business name", type: "text", placeholder: "e.g. Coastal Comfort HVAC" },
    { id: "serviceArea", section: "general", label: "What's your primary service area?", type: "text", placeholder: "e.g. Tri-county, 30-mile radius" },
    { id: "currentSoftware", section: "general", label: "What scheduling/dispatch software do you currently use?", type: "text", placeholder: "e.g. ServiceTitan, Housecall Pro" },
    { id: "currentProcess", section: "general", label: "Walk me through how you currently handle dispatch, payroll, and invoicing.", type: "textarea" },
    {
      id: "afterHoursDispatch",
      section: "surcharge",
      relatedService: "dispatch",
      label: "Do you need after-hours / emergency dispatch coverage?",
      type: "toggle",
      options: ["Business hours only", "Yes — after-hours coverage"],
      surchargeFor: "dispatch",
      hint: "Adds a surcharge to Dispatch & Scheduling Coordination only, shown as one combined rate.",
    },
    { id: "payFrequency", section: "general", relatedService: "payroll", label: "What is your payroll frequency?", type: "toggle", options: ["Weekly", "Bi-Weekly"] },
    { id: "invoicingSystem", section: "general", relatedService: "invoicing", label: "What system do you currently invoice through?", type: "text", placeholder: "e.g. QuickBooks" },
  ],
};

const professionalRetainerTemplate: DeckConfig = {
  id: "",
  industry: "Professional Services & Consulting",
  tagline: "Back-office support for agencies and consultancies running retainer-based client engagements.",
  colors: { amber: "#B08D57", teal: "#4A6670" },
  pricingDriver: { label: "Active clients", unit: "clients", questionText: "How many active retainer clients do you manage?" },
  ...blankIdentity(),
  services: [
    {
      id: "onboarding",
      name: "Client Onboarding & Account Management",
      team: "Account Management Team",
      category: "major",
      bandLabel: "Client-based · 3 bands",
      handle: [
        "New client onboarding and kickoff coordination",
        "Ongoing account check-ins and scope tracking",
        "Renewal and upsell conversation preparation",
      ],
      stats: [{ v: "↓ 35%", l: "Faster time-to-first-deliverable" }, { v: "100%", l: "Clients onboarded with a documented scope" }],
      dashboards: ["Account Health Dashboard", "Onboarding Tracker"],
      priceBands: [
        { upTo: 10, price: 400 },
        { upTo: 25, price: 650 },
        { upTo: null, price: 950 },
      ],
    },
    {
      id: "billing",
      name: "Billing & Retainer Reconciliation",
      team: "Finance Team",
      category: "major",
      bandLabel: "Invoice-based · 3 bands",
      pricingDriverField: "invoicesPerMonth",
      pricingDriverLabel: "Invoices issued per month",
      handle: [
        "Monthly retainer invoicing and time/scope reconciliation",
        "Overage and true-up billing for out-of-scope work",
        "Accounts receivable follow-up on past-due invoices",
      ],
      stats: [{ v: "↓ 20%", l: "Reduction in average days-to-payment" }, { v: "100%", l: "Invoices reconciled against scope before sending" }],
      dashboards: ["Billing Summary", "AR Aging Report"],
      priceBands: [
        { upTo: 20, price: 350 },
        { upTo: 50, price: 550 },
        { upTo: null, price: 800 },
      ],
    },
    {
      id: "reporting",
      name: "Client Reporting & Analytics",
      team: "Analytics Team",
      category: "strategic",
      bandLabel: "Flat · 2 bands",
      handle: [
        "Recurring client-facing performance reports",
        "Internal utilization and profitability dashboards",
        "Ad hoc reporting requests from account leads",
      ],
      stats: [{ v: "↑ Consistency", l: "On-time report delivery rate" }, { v: "100%", l: "Reports reviewed before client delivery" }],
      dashboards: ["Utilization Dashboard", "Client Reporting Calendar"],
      priceBands: [
        { upTo: 20, price: 300 },
        { upTo: null, price: 450 },
      ],
    },
    {
      id: "contracts",
      name: "Contract & SOW Administration",
      team: "Operations Team",
      category: "strategic",
      bandLabel: "Flat · 2 bands",
      handle: [
        "SOW drafting support and redline coordination",
        "Contract renewal tracking and expiration alerts",
        "Central repository for signed agreements",
      ],
      stats: [{ v: "100%", l: "Contracts tracked with renewal alerts" }, { v: "↓ 50%", l: "Fewer lapsed agreements" }],
      dashboards: ["Contract Renewal Tracker"],
      priceBands: [
        { upTo: 25, price: 250 },
        { upTo: null, price: 350 },
      ],
    },
  ],
  staticContent: {
    cover: { title1: "The Operations Team Behind", title2: "Growing Client Rosters", sub: "" },
    about: {
      title1: "One partner.",
      title2: "One operations team.",
      body: "A dedicated back-office team for agencies and consultancies — onboarding, billing, reporting, and contract administration handled by people who specialize in retainer-based client work.",
      bullets: [
        "A single point of contact across onboarding, billing, and reporting",
        "The same team learns your client roster once and carries that context forward",
        "Transparent monthly reporting so you always know where things stand",
      ],
    },
    how: {
      steps: [
        { t: "Understanding", d: "We learn your client roster, retainer structure, and current billing/reporting process." },
        { t: "Implementation", d: "Our team is onboarded to your project and billing systems, aligned to your reporting cadence, and live within 2-3 weeks." },
        { t: "Optimization", d: "Ongoing tracking of utilization, billing accuracy, and client reporting as your roster grows." },
      ],
    },
    challenges: {
      items: [
        "Retainer scope creep going untracked until it hurts margins",
        "Billing errors and slow invoicing eating into cash flow",
        "Client reporting handled ad hoc instead of on a reliable cadence",
        "Contracts and renewals tracked in scattered spreadsheets",
      ],
    },
    benefits: {
      items: [
        "A dedicated team handling onboarding, billing, and reporting",
        "Cleaner retainer reconciliation and fewer billing disputes",
        "Consistent, on-time client reporting every month",
        "Predictable, client-based pricing that scales with your roster",
      ],
    },
    qa: blankQa("Questions?", ""),
  },
  discoveryQuestions: [
    { id: "businessName", section: "general", label: "Business/agency name", type: "text", placeholder: "e.g. Northbound Consulting" },
    { id: "clientMix", section: "general", label: "What's your typical client mix?", type: "text", placeholder: "e.g. Mid-market SaaS, 6-12 month retainers" },
    { id: "currentSoftware", section: "general", label: "What project/billing software do you currently use?", type: "text", placeholder: "e.g. Harvest, QuickBooks, Asana" },
    { id: "currentProcess", section: "general", label: "Walk me through how you currently handle onboarding, billing, and client reporting.", type: "textarea" },
    { id: "invoicesPerMonth", section: "general", relatedService: "billing", label: "How many invoices do you issue per month?", type: "number", placeholder: "e.g. 30", hint: "Drives pricing for Billing & Retainer Reconciliation." },
    { id: "billingFrequency", section: "general", relatedService: "billing", label: "What is your billing frequency?", type: "toggle", options: ["Monthly", "Bi-Weekly"] },
    { id: "reportingCadence", section: "general", relatedService: "reporting", label: "How often do clients expect performance reports?", type: "select", options: ["Weekly", "Monthly", "Quarterly"] },
  ],
};

// ============================================================================
// Anonymized templates — same structural shape as a seeded deck (services, price-band
// patterns, surcharge/alternate-driver mechanisms, question tiers), real identity and
// company-specific jargon stripped.
// ============================================================================

const lastMileDeliveryTemplate: DeckConfig = {
  id: "",
  industry: "Last-Mile Delivery Operations",
  tagline: "Back-office and virtual operations for contracted last-mile delivery fleets.",
  colors: { amber: "#16A6CE", teal: "#0C7B82" },
  pricingDriver: { label: "Routes per day", unit: "routes", questionText: "How many routes do you run per day?" },
  ...blankIdentity(),
  services: [
    {
      id: "payroll",
      name: "Payroll Compliance Management",
      team: "Payroll & Compliance Team",
      category: "major",
      bandLabel: "Route-based · 5 bands",
      handle: [
        "Daily timecard review with missing-punch, duplicate-punch, and break validation",
        "Payroll validation, hours audit, and bonus/incentive calculations each cycle",
        "PTO tracking and approval support so nothing slips past a pay run",
        "Daily driver attendance monitoring — late arrivals, no-shows, call-outs",
        "Overtime validation to catch errors before they hit payroll",
      ],
      stats: [
        { v: "↓ 80%", l: "Fewer payroll exceptions reaching sign-off" },
        { v: "100%", l: "Daily attendance logged & tracked" },
      ],
      dashboards: ["Payroll Summary", "Payroll Exception Report", "Attendance Analytics"],
      priceBands: [
        { upTo: 15, price: 500 },
        { upTo: 25, price: 600 },
        { upTo: 35, price: 650 },
        { upTo: 50, price: 850 },
        { upTo: null, price: null },
      ],
    },
    {
      id: "invoicedispute",
      name: "Invoice Dispute Management",
      team: "Accounting & Finance Team",
      category: "strategic",
      bandLabel: "Flat · 2 bands",
      handle: [
        "Route, vehicle, and equipment invoice validation against contract terms",
        "Dispute filing and follow-through on billing discrepancies",
        "Recovered-revenue tracking across every disputed line item",
      ],
      stats: [{ v: "↓ 90%", l: "Unvalidated invoices reaching payment" }, { v: "100%", l: "Disputes filed within contract deadlines" }],
      dashboards: ["Invoice Validation Summary", "Dispute Recovery Report"],
      priceBands: [
        { upTo: 25, price: 350 },
        { upTo: null, price: 400 },
      ],
    },
    {
      id: "compliance",
      name: "Driver Compliance Management",
      team: "Payroll & Compliance Team",
      category: "strategic",
      bandLabel: "Route-based · 3 bands",
      handle: [
        "Workers' comp claim tracking from report through resolution",
        "Certification and license expiration monitoring",
        "Incident documentation and compliance file maintenance",
      ],
      stats: [{ v: "100%", l: "Claims tracked from report to close" }, { v: "↓ 40%", l: "Faster claim resolution time" }],
      dashboards: ["Open Claims Overview", "Compliance Dashboard"],
      priceBands: [
        { upTo: 20, price: 350 },
        { upTo: 35, price: 500 },
        { upTo: null, price: 650 },
      ],
    },
    {
      id: "bookkeeping",
      name: "Expert Bookkeeping",
      team: "Accounting & Finance Team",
      category: "strategic",
      bandLabel: "Flat · 2 bands",
      handle: [
        "Monthly expense and revenue bifurcation by category",
        "Profitability tracking at the route and fleet level",
        "Books closed and reconciled on a consistent monthly cadence",
      ],
      stats: [{ v: "100%", l: "Books closed on a consistent monthly cadence" }, { v: "↑ Visibility", l: "Route-level profitability tracking" }],
      dashboards: ["Profitability Dashboard", "Expense Bifurcation Report"],
      priceBands: [
        { upTo: 25, price: 300 },
        { upTo: null, price: 350 },
      ],
    },
    {
      id: "recruitment",
      name: "Driver Recruitment Management",
      team: "Talent Acquisition Team",
      category: "major",
      bandLabel: "Route-based · 3 bands",
      handle: [
        "Job posting, applicant screening, and interview scheduling",
        "Background check and drug test vendor coordination",
        "Offer letter timing and onboarding handoff",
      ],
      stats: [{ v: "↓ 35%", l: "Faster time-to-hire" }, { v: "100%", l: "Candidates screened before offer" }],
      dashboards: ["Hiring Funnel", "Time to Hire"],
      priceBands: [
        { upTo: 15, price: 600 },
        { upTo: 25, price: 700 },
        { upTo: null, price: 950 },
      ],
    },
    {
      id: "dispatch",
      name: "Virtual Dispatch Operator",
      team: "Virtual Assistance Team",
      category: "major",
      bandLabel: "Route-based · 4 bands",
      handle: [
        "Real-time route monitoring from first stop to end-of-day",
        "Driver communication and issue triage throughout the shift",
        "End-of-day completion summary and exception reporting",
      ],
      stats: [{ v: "↓ 50%", l: "Faster response to in-route issues" }, { v: "100%", l: "Routes monitored start to finish" }],
      dashboards: ["EOD Route Completion", "Dispatch Summary"],
      priceBands: [
        { upTo: 15, price: 1300 },
        { upTo: 30, price: 1800 },
        { upTo: 50, price: 2200 },
        { upTo: null, price: null },
      ],
      surcharge: { questionId: "hoursOver12", amount: 200 },
    },
    {
      id: "routeperf",
      name: "Route Performance Management",
      team: "Virtual Assistance Team",
      category: "strategic",
      bandLabel: "Route-based · 3 bands",
      handle: [
        "Weekly driver scorecard tracking and trend analysis",
        "Performance coaching notes for underperforming routes",
        "Fleet-wide performance summary for ownership review",
      ],
      stats: [{ v: "↑ 20%", l: "Improvement in tracked performance metrics" }, { v: "100%", l: "Scorecards reviewed weekly" }],
      dashboards: ["Driver Scorecards", "Weekly Scorecard Snapshot"],
      priceBands: [
        { upTo: 20, price: 500 },
        { upTo: 35, price: 600 },
        { upTo: null, price: 800 },
      ],
    },
  ],
  staticContent: {
    cover: { title1: "The Expert Team Behind", title2: "Last-Mile Delivery Fleets", sub: "" },
    about: {
      title1: "One partner.",
      title2: "One expert team.",
      body: "A dedicated back-office and virtual operations team built specifically for the last-mile delivery ecosystem. One team, embedded in your daily operations across payroll, hiring, dispatch, compliance, and finance — not a rotating cast of vendors.",
      bullets: [
        "A single contract and account relationship — no coordinating between separate vendors",
        "The same expert team learns your operation once and carries that context across every service",
        "One escalation path — no \"that's the other team's issue\"",
      ],
    },
    how: {
      steps: [
        { t: "Understanding", d: "We learn your routes and how you currently handle payroll, hiring, dispatch, and disputes — and where it's costing you time or money today." },
        { t: "Implementation", d: "Our expert team is onboarded to your systems and SOPs, aligned to your reporting cadence, and live inside your operation." },
        { t: "Optimization", d: "Ongoing KPI tracking and process refinement — recovering more revenue, tightening compliance, and expanding coverage as your fleet grows." },
      ],
    },
    challenges: {
      items: [
        "Thin margins under constant rate and cost pressure",
        "High driver turnover with a recruiting pipeline that can't keep pace",
        "Manual payroll and timecard errors creating compliance exposure",
        "Revenue quietly leaking through unvalidated invoices and missed disputes",
        "Owners doing back-office work instead of growing the fleet",
      ],
    },
    benefits: {
      items: [
        "A dedicated expert team embedded in your operation — not a rotating help desk",
        "Recovered revenue through rigorous invoice dispute management",
        "Reduced compliance exposure across payroll and workers' comp",
        "A faster, cleaner hiring pipeline that keeps routes covered",
        "Predictable, route-based pricing that scales as your fleet grows",
      ],
    },
    qa: blankQa("Questions?", ""),
  },
  discoveryQuestions: [
    { id: "businessName", section: "general", label: "Business name", type: "text", placeholder: "e.g. Coleman Logistics LLC" },
    { id: "location", section: "general", label: "Which location/region do you operate from?", type: "text", placeholder: "e.g. Newark, NJ" },
    { id: "tenure", section: "general", label: "How long have you been operating this business?", type: "text", placeholder: "e.g. 2.5 years" },
    { id: "driverComms", section: "general", label: "What driver communication software do you use?", type: "text", placeholder: "e.g. WhatsApp, Slack, Detrack" },
    { id: "currentProcess", section: "general", label: "Walk me through your current process for payroll, hiring, invoice disputes, and other operations.", type: "textarea" },
    { id: "payrollApp", section: "general", relatedService: "payroll", label: "What payroll application do you use?", type: "text", placeholder: "e.g. Gusto, ADP, QuickBooks Payroll" },
    { id: "numDrivers", section: "general", relatedService: "payroll", label: "How many drivers do you currently have?", type: "number", placeholder: "e.g. 35" },
    { id: "bgvVendor", section: "general", relatedService: "recruitment", label: "Who is your vendor for background checks & drug testing?", type: "text" },
    {
      id: "hoursOver12",
      section: "surcharge",
      relatedService: "dispatch",
      label: "What are your typical route hours?",
      type: "toggle",
      options: ["Up to 12 hrs/day", "More than 12 hrs/day"],
      surchargeFor: "dispatch",
      hint: "Adds a surcharge to Virtual Dispatch Operator only, shown as one combined rate.",
    },
  ],
};

const propertyManagementTemplate: DeckConfig = {
  id: "",
  industry: "Property Management",
  tagline: "Back-office support for residential and commercial property owners and operators.",
  colors: { amber: "#D9A441", teal: "#4FA8A0" },
  pricingDriver: { label: "Units managed", unit: "units", questionText: "How many units do you currently manage?" },
  ...blankIdentity(),
  services: [
    {
      id: "leasing",
      name: "Tenant Screening & Leasing Coordination",
      team: "Leasing Team",
      category: "major",
      bandLabel: "Unit-based · 4 bands",
      handle: [
        "Rental application intake, review, and applicant communication",
        "Credit, background, and rental history checks on every applicant",
        "Lease drafting, e-signature coordination, and move-in scheduling",
        "Renewal processing and rent adjustment notices ahead of lease expiry",
        "Listing syndication and showing coordination for vacant units",
      ],
      stats: [
        { v: "↓ 40%", l: "Faster unit placement from listing to lease" },
        { v: "100%", l: "Applicants screened before lease offer" },
      ],
      dashboards: ["Leasing Funnel", "Vacancy Report", "Renewal Tracker"],
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
      bandLabel: "Unit-based · 4 bands",
      handle: [
        "Work order intake from tenants and owners across all channels",
        "Vendor dispatch, scheduling, and follow-up through job completion",
        "Vendor invoice validation against approved scope and pricing",
        "Preventive maintenance scheduling to catch issues before they escalate",
      ],
      stats: [
        { v: "↓ 30%", l: "Faster average work order turnaround" },
        { v: "100%", l: "Vendor invoices validated before payment" },
      ],
      dashboards: ["Work Order Summary", "Vendor Performance Report"],
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
      bandLabel: "Flat · 2 bands",
      handle: [
        "Rent collection tracking and automated late fee processing",
        "Delinquency follow-up and payment plan coordination",
        "Monthly owner statements with income and expense detail",
        "Bank reconciliation across operating and trust accounts",
      ],
      stats: [
        { v: "↓ 25%", l: "Reduction in average days-late on rent" },
        { v: "100%", l: "Owner statements delivered on schedule" },
      ],
      dashboards: ["Rent Roll", "Owner Statement", "Collections Report"],
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
      bandLabel: "Flat · 2 bands",
      handle: [
        "First-line tenant communication and issue triage",
        "Dispute resolution support between tenants and owners",
        "Scheduled owner reporting calls and portfolio performance reviews",
      ],
      stats: [
        { v: "↑ Satisfaction", l: "Tenant satisfaction score trend" },
        { v: "100%", l: "Escalations logged and tracked to close" },
      ],
      dashboards: ["Satisfaction Score Dashboard", "Escalation Log"],
      priceBands: [
        { upTo: 50, price: 250 },
        { upTo: null, price: 350 },
      ],
    },
  ],
  staticContent: {
    cover: { title1: "The Back Office Behind", title2: "Growing Property Portfolios", sub: "" },
    about: {
      title1: "One partner.",
      title2: "One property team.",
      body: "A dedicated back-office team built specifically for residential and commercial property owners and operators — not a call center that happens to answer property questions. This team specializes in leasing, maintenance coordination, and property financials, and stays with your portfolio as it grows.",
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
      ],
    },
    benefits: {
      items: [
        "A dedicated team handling leasing, maintenance, and financials — not a rotating help desk",
        "Faster unit turnover and reduced vacancy through structured leasing coordination",
        "Vendor invoices validated before payment, catching overcharges early",
        "Predictable, unit-based pricing that scales as your portfolio grows",
      ],
    },
    qa: blankQa("Questions?", ""),
  },
  discoveryQuestions: [
    { id: "ownerName", section: "general", label: "Owner / management company name", type: "text", placeholder: "e.g. Bayview Holdings LLC" },
    { id: "portfolioType", section: "general", label: "What type of properties are in the portfolio?", type: "text", placeholder: "e.g. Multifamily, mixed residential/commercial" },
    { id: "currentPM", section: "general", label: "What property management software do you currently use?", type: "text", placeholder: "e.g. AppFolio, Buildium" },
    {
      id: "emergencyLine",
      section: "surcharge",
      relatedService: "maintenance",
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

const contractedDeliveryTemplate: DeckConfig = {
  id: "",
  industry: "Contracted Delivery Operations",
  tagline: "Settlement reconciliation, driver payroll, and expense management for contracted pickup & delivery operators.",
  colors: { amber: "#16A6CE", teal: "#0C7B82" },
  pricingDriver: { label: "Routes per day", unit: "routes", questionText: "How many routes do you run per day?" },
  ...blankIdentity(),
  services: [
    {
      id: "settlement",
      name: "Settlement Reconciliation",
      team: "Accounting & Finance Team",
      category: "major",
      bandLabel: "Stop-based · 3 bands",
      handle: [
        "Weekly settlement statement validation line by line",
        "Discrepancy identification and recovery filing",
        "Fuel surcharge and accessorial charge verification",
      ],
      stats: [{ v: "↓ 90%", l: "Unvalidated settlement lines reaching close" }, { v: "100%", l: "Discrepancies filed within contract deadlines" }],
      dashboards: ["Settlement Reconciliation Summary", "Discrepancy Aging Report"],
      priceBands: [
        { upTo: 20, price: 400 },
        { upTo: 35, price: 550 },
        { upTo: null, price: 700 },
      ],
      surcharge: { questionId: "backlogRecon", amount: 150 },
    },
    {
      id: "driverpay",
      name: "Driver Payroll Management",
      team: "Payroll & Compliance Team",
      category: "major",
      bandLabel: "Driver-based · 5 bands",
      pricingDriverField: "numDrivers",
      pricingDriverLabel: "Number of drivers",
      handle: [
        "Weekly driver payroll validation against hours and stops",
        "Deductions and reimbursements tracking",
        "Payroll exception flagging before each pay run",
      ],
      stats: [{ v: "↓ 70%", l: "Fewer payroll exceptions reaching sign-off" }, { v: "100%", l: "Hours & stops validated before payroll" }],
      dashboards: ["Payroll Summary", "Hours & Stops Validation Report"],
      priceBands: [
        { upTo: 20, price: 500 },
        { upTo: 50, price: 650 },
        { upTo: 100, price: 800 },
        { upTo: 200, price: 1050 },
        { upTo: null, price: null },
      ],
    },
    {
      id: "expenserecon",
      name: "Expense Reconciliation",
      team: "Accounting & Finance Team",
      category: "strategic",
      bandLabel: "Flat · 1 band",
      handle: [
        "Vendor invoice validation against approved scope and pricing",
        "Duplicate and overbilling detection across vendor charges",
        "Monthly expense reporting by category",
      ],
      stats: [{ v: "↓ 90%", l: "Overbilled vendor charges reaching payment" }, { v: "100%", l: "Vendor invoices validated monthly" }],
      dashboards: ["Expense Reconciliation Summary", "Overbilling Recovery Report"],
      priceBands: [{ upTo: null, price: 500 }],
    },
    {
      id: "recruitAssist",
      name: "Recruitment Assistance",
      team: "Talent Acquisition Team",
      category: "major",
      bandLabel: "Route-based · 3 bands",
      handle: [
        "Job posting, applicant screening, and interview scheduling",
        "Background check and drug test vendor coordination",
        "Offer letter timing and onboarding handoff",
      ],
      stats: [{ v: "↓ 35%", l: "Faster time-to-hire" }, { v: "100%", l: "Candidates screened before offer" }],
      dashboards: ["Hiring Funnel", "Time to Hire"],
      priceBands: [
        { upTo: 15, price: 600 },
        { upTo: 25, price: 700 },
        { upTo: null, price: 950 },
      ],
    },
  ],
  staticContent: {
    cover: { title1: "The Expert Team Behind", title2: "Contracted Delivery Operators", sub: "" },
    about: {
      title1: "One partner.",
      title2: "One expert team.",
      body: "A dedicated back-office team built specifically for contracted pickup & delivery operators — purpose-built to support settlement reconciliation, driver payroll, and expense management. One team, embedded in your daily operations, not a rotating cast of vendors.",
      bullets: [
        "A single contract and account relationship — no coordinating between separate vendors",
        "The same expert team learns your settlement structure once and carries that context across every service",
        "One escalation path — no \"that's the other team's issue\"",
      ],
    },
    how: {
      steps: [
        { t: "Understanding", d: "We learn your contract terms, settlement structure, payroll setup, and current vendor relationships — and where reconciliation is falling short today." },
        { t: "Implementation", d: "Our expert team is onboarded to your settlement statements, payroll system, and vendor invoices, aligned to your weekly cadence, and live inside your operation." },
        { t: "Optimization", d: "Ongoing reconciliation and reporting — recovering more revenue, tightening payroll accuracy, and sharpening profitability visibility as your business grows." },
      ],
    },
    challenges: {
      items: [
        "Settlement statements too complex to verify line by line every week",
        "Missing or incorrect payments quietly eating into revenue",
        "Driver payroll errors creating disputes and eroding trust",
        "Vendor invoices with duplicate or inflated charges going unnoticed",
      ],
    },
    benefits: {
      items: [
        "A dedicated expert team handling your settlements, payroll, and expenses",
        "Clearer weekly and monthly financial visibility across every settlement",
        "Recovered revenue through rigorous settlement and expense reconciliation",
        "Predictable, route-based pricing that scales as your fleet grows",
      ],
    },
    qa: blankQa("Questions?", ""),
  },
  discoveryQuestions: [
    { id: "businessName", section: "general", label: "Business name", type: "text", placeholder: "e.g. Coleman P&D LLC" },
    { id: "location", section: "general", label: "Which terminal/station are you contracted under?", type: "text", placeholder: "e.g. Newark, NJ (EWR)" },
    { id: "tenure", section: "general", label: "How long have you been a contracted P&D operator?", type: "text", placeholder: "e.g. 3 years" },
    { id: "currentProcess", section: "general", label: "Walk me through how you currently handle settlement reconciliation, payroll, and expense tracking.", type: "textarea" },
    {
      id: "backlogRecon",
      section: "surcharge",
      relatedService: "settlement",
      label: "Do you need multi-week backlog reconciliation (more than 4 weeks of unreconciled settlements)?",
      type: "toggle",
      options: ["Current period only", "Yes, backlog cleanup needed"],
      surchargeFor: "settlement",
      hint: "Adds a surcharge to Settlement Reconciliation only, shown as one combined rate.",
    },
    { id: "numDrivers", section: "general", relatedService: "driverpay", label: "How many drivers do you currently have?", type: "number", placeholder: "e.g. 20", hint: "Drives pricing for Driver Payroll Management." },
    { id: "payFrequency", section: "general", relatedService: "driverpay", label: "What is your payroll frequency?", type: "toggle", options: ["Weekly", "Bi-Weekly"] },
    { id: "vendorCount", section: "general", relatedService: "expenserecon", label: "How many vendors do you currently reconcile invoices against?", type: "number", placeholder: "e.g. 8" },
  ],
};

export const DECK_TEMPLATES: DeckTemplate[] = [
  {
    key: "field-services",
    label: "Field Services Operations",
    category: "generic",
    summary: "Dispatch, technician payroll, invoicing, and recruiting for HVAC/plumbing/electrical-style field trades.",
    config: fieldServicesTemplate,
  },
  {
    key: "professional-retainer",
    label: "Professional Services Retainer",
    category: "generic",
    summary: "Client onboarding, retainer billing, reporting, and contract admin for agencies and consultancies.",
    config: professionalRetainerTemplate,
  },
  {
    key: "last-mile-delivery",
    label: "Last-Mile Delivery Operations",
    category: "anonymized",
    summary: "Payroll, invoice disputes, driver compliance, bookkeeping, recruiting, dispatch, and performance tracking for delivery fleets.",
    config: lastMileDeliveryTemplate,
  },
  {
    key: "property-management",
    label: "Property Management Back Office",
    category: "anonymized",
    summary: "Leasing, maintenance coordination, rent/financial reporting, and owner-tenant relations for property portfolios.",
    config: propertyManagementTemplate,
  },
  {
    key: "contracted-delivery",
    label: "Contracted Delivery Operations",
    category: "anonymized",
    summary: "Settlement reconciliation, driver payroll, expense reconciliation, and recruitment for contracted pickup & delivery operators.",
    config: contractedDeliveryTemplate,
  },
];

export function findDeckTemplate(key: string): DeckTemplate | undefined {
  return DECK_TEMPLATES.find((t) => t.key === key);
}
