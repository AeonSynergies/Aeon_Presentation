import type { DeckConfig } from "@aeon/types";

// Ported verbatim from Presentation_Platform.html (FEDEX_DECK, lines 987-1203) — every
// service, price band, surcharge, discovery question, and static slide copy is an exact
// copy of the prototype's data, not a re-creation from the spec description.
//
// logo/secondaryLogo/watermark reuse the same Aeon Synergies brand assets as Amazon DSP
// (the source references the identical window.__ASSETS__ keys — aeonSynergiesLightBg,
// aeonMilesLightBg, aeonIcon — as amazon-dsp.ts, just resolved to real URLs instead of
// the prototype's base64 asset registry).
//
// Two things confirmed present from the source, since both were added in later rounds of
// work on the prototype:
//   1. Settlement Reconciliation's surcharge (backlogRecon, multi-week backlog
//      reconciliation) — the surcharge field on the service AND the matching
//      surchargeFor toggle question below, same paired pattern as Amazon DSP's
//      Virtual Dispatch Operator / hoursOver12.
//   2. Recruitment Assistance — the deck's 4th service, priced route-based like the
//      other three, with its own discovery questions (bgvVendorFedex,
//      hiringRequirementFedex, marijuanaTestingFedex) gated on relatedService so they
//      only show once the service is opted in.
export const fedexPdDeck: DeckConfig = {
  id: "fedex-pd",
  industry: "FedEx Pickup & Delivery (P&D)",
  companyName: "FedEx P&D",
  tagline: "Settlement reconciliation, driver payroll, and expense management built for FedEx P&D contractors.",
  logo: { type: "imagePair", srcLight: "/brand/aeon-synergies-light-bg.svg", srcDark: "/brand/aeon-synergies-dark-bg.svg" },
  secondaryLogo: { type: "imagePair", srcLight: "/brand/aeon-miles-light-bg.svg", srcDark: "/brand/aeon-miles-dark-bg.svg" },
  watermark: { type: "image", src: "/brand/aeon-icon.png" },
  colors: { amber: "#16A6CE", teal: "#0C7B82", ink: "#F1F5F5", panel: "#FFFFFF", panel2: "#E4EDEF", fog: "#5C6E73", paper: "#15282D" },
  pricingModels: [
    { id: "primary", label: "Routes per day", unit: "routes", questionText: "How many routes do you run per day?", isPrimary: true },
    // Migrated from the old per-service pricingDriverField override on Driver Payroll
    // Management — same discovery question ("How many drivers do you currently have?"),
    // now a named model in the library instead of an ad hoc alternate driver.
    { id: "numDrivers", label: "Number of drivers", unit: "drivers", questionText: "How many drivers do you currently have?", isPrimary: false },
  ],
  services: [
    {
      id: "settlement",
      name: "Settlement Reconciliation",
      team: "Accounting & Finance Team",
      tagline: "Catch every missed dollar",
      category: "major",
      pricingModelId: "primary",
      bandLabel: "Stop-based · 3 bands",
      handle: [
        "Weekly FedEx settlement statement review against contract terms",
        "Line-by-line matching of fixed revenue, stop-based revenue, package revenue, and fuel surcharges",
        "Missing or incorrect payment identification with full supporting documentation",
        "Weekly contractor revenue reconciliation against expected contract terms",
        "Discrepancy escalation and follow-up through resolution",
        "Revenue recovery reporting on every corrected settlement",
      ],
      stats: [
        { v: "↑ Recovery", l: "On every missed or incorrect settlement payment" },
        { v: "100%", l: "Settlements reconciled every week" },
      ],
      dashboards: ["Settlement Reconciliation Summary", "Revenue Recovery Dashboard", "Discrepancy Aging Report", "Fuel Surcharge Validation Report"],
      priceBands: [
        { upTo: 20, price: 400 },
        { upTo: 35, price: 550 },
        { upTo: null, price: 700 },
      ],
      surcharge: { questionId: "backlogRecon", amount: 150 },
      reportSlide: {
        title: "Settlement Reconciliation Summary",
        illustrative: true,
        cards: [
          {
            type: "metrics",
            title: "Weekly Settlement Snapshot",
            meta: "WEEK OF 06/15/2025",
            rows: [
              { label: "Fixed Revenue Expected", value: "$12,400.00" },
              { label: "Stop-Based Revenue Expected", value: "$8,150.00" },
              { label: "Package Revenue Expected", value: "$3,200.00" },
              { label: "Fuel Surcharge Expected", value: "$1,050.00" },
            ],
            highlight: { label: "Discrepancy Identified", value: "$620.00" },
          },
          {
            type: "table",
            title: "Discrepancy Log",
            columns: ["Line Item", "Expected", "Received", "Variance"],
            rows: [
              ["Fixed Revenue", "$12,400.00", "$12,400.00", "$0"],
              ["Stop-Based Revenue", "$8,150.00", "$7,890.00", "-$260.00"],
              ["Fuel Surcharge", "$1,050.00", "$690.00", "-$360.00"],
            ],
          },
        ],
      },
    },
    {
      id: "driverpay",
      name: "Driver Payroll Management",
      team: "Payroll & Compliance Team",
      tagline: "Accurate, on-time driver pay",
      category: "major",
      pricingModelId: "numDrivers",
      bandLabel: "Driver-based · 5 bands",
      handle: [
        "Driver pay processing across fixed daily, hourly, or stop-based pay structures",
        "Hours, stops, deductions, and reimbursement validation every pay cycle",
        "Payroll error reduction through pre-submission review",
        "On-time payment support aligned to your existing pay schedule",
        "Driver trust building through transparent, accurate pay statements",
        "Internal control support via consistent payroll documentation",
      ],
      stats: [
        { v: "↓ 80%", l: "Fewer payroll errors reaching drivers" },
        { v: "100%", l: "Pay cycles validated before submission" },
      ],
      dashboards: ["Payroll Summary", "Payroll Exception Report", "Hours & Stops Validation Report", "Deductions & Reimbursements Log"],
      priceBands: [
        { upTo: 20, price: 500 },
        { upTo: 50, price: 650 },
        { upTo: 100, price: 800 },
        { upTo: 200, price: 1050 },
        { upTo: null, price: null },
      ],
      reportSlide: {
        title: "Driver Payroll Validation",
        illustrative: true,
        cards: [
          {
            type: "metrics",
            title: "Weekly Payroll Snapshot",
            meta: "PAY WEEK 06/15–06/21/25",
            rows: [
              { label: "Total Driver Pay", value: "$34,200.00" },
              { label: "Overtime & Bonuses", value: "$2,150.00" },
              { label: "Deductions", value: "-$980.00" },
            ],
            highlight: { label: "Net Payroll Issued", value: "$35,370.00" },
          },
          {
            type: "table",
            title: "Exceptions Flagged This Cycle",
            columns: ["Driver", "Issue", "Resolution"],
            rows: [
              ["Martinez, Carlos", "Missing stop count", "Corrected before payout"],
              ["Thompson, Reese", "Duplicate deduction", "Removed before payout"],
              ["Alvarez, Diego", "Unapproved overtime", "Verified and approved"],
            ],
          },
        ],
      },
    },
    {
      id: "expenserecon",
      name: "Expense Reconciliation",
      team: "Accounting & Finance Team",
      tagline: "Stop overbilling before it costs you",
      category: "strategic",
      pricingModelId: "primary",
      bandLabel: "Flat · 1 band",
      handle: [
        "Vendor invoice matching against approved charges and supporting records",
        "Duplicate, inflated, or unapproved expense flagging",
        "Route-profitability cost tracking across vendors and categories",
        "Overbilling recovery and missed-credit identification",
        "Monthly expense summary and variance reporting",
        "Vendor-by-vendor spend tracking to support renegotiation",
      ],
      stats: [
        { v: "↑ Recovery", l: "On duplicate, inflated, or unapproved charges" },
        { v: "100%", l: "Vendor invoices reconciled monthly" },
      ],
      dashboards: ["Expense Reconciliation Summary", "Vendor Spend Dashboard", "Overbilling Recovery Report", "Route Profitability Impact Report"],
      priceBands: [{ upTo: null, price: 500 }],
      reportSlide: {
        title: "Expense Reconciliation Overview",
        illustrative: true,
        cards: [
          {
            type: "chart",
            title: "Expense Breakdown",
            segments: [
              { label: "Fuel", pct: 38, color: "#16A6CE" },
              { label: "Vehicle Maintenance", pct: 24, color: "#0C7B82" },
              { label: "Insurance", pct: 18, color: "#1E9E8A" },
              { label: "Other Vendor Costs", pct: 20, color: "#E8A13C" },
            ],
          },
          {
            type: "table",
            title: "Flagged Vendor Charges",
            columns: ["Vendor", "Issue", "Amount"],
            rows: [
              ["FleetCare Services", "Duplicate charge", "$340.00"],
              ["QuickFuel Corp", "Rate above contract", "$210.00"],
              ["Metro Insurance Group", "Unapproved fee", "$95.00"],
            ],
          },
        ],
      },
    },
    {
      id: "recruitAssist",
      name: "Recruitment Assistance",
      team: "Talent Acquisition Team",
      tagline: "Faster, fully tracked hiring",
      category: "major",
      pricingModelId: "primary",
      bandLabel: "Route-based · 3 bands",
      handle: [
        "Job posting and listing management across Indeed and other platforms",
        "Applicant screening and shortlisting as candidates apply",
        "FADV profile completion and submission for every applicant",
        "Drug test and DOT physical scheduling and coordination",
        "Ground Cloud training scheduling and coordination",
        "E-Verify and Safety Information Guide completion through the MyBiz account",
        "Payroll application onboarding once a candidate is hired",
      ],
      stats: [
        { v: "↓ 35%", l: "Faster time-to-hire on average" },
        { v: "100%", l: "Onboarding steps tracked to completion" },
      ],
      dashboards: ["Hiring Funnel", "Time to Hire", "Recruitment Dashboard", "Hiring Status Report"],
      priceBands: [
        { upTo: 15, price: 600 },
        { upTo: 25, price: 700 },
        { upTo: null, price: 950 },
      ],
      reportSlide: {
        title: "Recruitment Pipeline Tracker",
        illustrative: true,
        cards: [
          {
            type: "table",
            wide: true,
            title: "Candidate Pipeline",
            columns: ["Candidate", "Job Posting", "FADV", "Drug Test/DOT", "Ground Cloud", "E-Verify", "Payroll"],
            rows: [
              ["Alvarez, Maria", "Applied", "Completed", "Scheduled", "Not Started", "Not Started", "Not Started"],
              ["Grant, Terrell", "Screening", "In-Progress", "Completed", "Scheduled", "Not Started", "Not Started"],
              ["Nguyen, Kevin", "Hired", "Completed", "Completed", "Completed", "Completed", "In-Progress"],
              ["Ibrahim, Yusuf", "Hired", "Completed", "Completed", "Completed", "Completed", "Completed"],
            ],
          },
          {
            type: "metrics",
            title: "Pipeline Summary — This Period",
            rows: [
              { label: "Candidates Screened", value: "22" },
              { label: "FADV Completed", value: "16" },
              { label: "Drug Test / DOT Scheduled", value: "11" },
            ],
            highlight: { label: "Hired & Onboarded", value: "6" },
          },
        ],
      },
    },
  ],
  team: [
    { initials: "BP", name: "Bharath Prasad", title: "Chief Executive Officer · Co-Founder", email: "bharathprasad@aeonsynergies.com", phone: "+1 (323) 426-7978" },
    { initials: "AH", name: "Abbie Joseph-Harrington", title: "Partner, Regional Head (US) · Former DSP Owner", email: "abbieJosephHarrington@aeonsynergies.com", phone: "+1 (951) 525-5745" },
    { initials: "RH", name: "Raghotham Harisha", title: "Chief Technical Officer (CTO) · Co-Founder", email: "raghotham.harisha@aeonsynergies.com", phone: "+1 (951) 525-5745" },
    { initials: "NA", name: "Nihal Alphons", title: "DSP Manager, Finance & Payroll · Co-Founder", email: "nihal.alphons@aeonsynergies.com", phone: "+1 (302) 305-2419" },
    { initials: "RD", name: "Roshan Dsouza", title: "DSP Manager, Recruitment & Dispatch · Co-Founder", email: "roshan.dsouza@aeonsynergies.com", phone: "+1 (302) 300-1147" },
  ],
  staticContent: {
    cover: {
      title1: "The Expert Team Behind",
      title2: "FedEx P&D Contractors",
      sub: "Our expert operations team reconciles your settlements, manages driver payroll, and tracks expenses so you can run the business.",
    },
    about: {
      eyebrow: "WHO WE ARE",
      title1: "One partner.",
      title2: "One expert team.",
      body: "Aeon Synergies is a dedicated back-office team built specifically for **FedEx Pickup & Delivery contractors** — purpose-built to support __settlement reconciliation, driver payroll, and expense management__.\n\nOne team, embedded in your daily operations, not a rotating cast of vendors.",
      bullets: [
        "A single contract and account relationship — no coordinating between separate vendors",
        "The same expert team learns your settlement structure once and carries that context across every service",
        "One escalation path — no \"that's the other team's issue\"",
      ],
      focusLabel: "WHO WE SERVE",
      focusAreas: [
        { primary: "FedEx P&D", secondary: "Contractors" },
        { primary: "Settlement", secondary: "Reconciliation" },
        { primary: "Driver Payroll", secondary: "& Compliance" },
        { primary: "Expense &", secondary: "Vendor Management" },
      ],
    },
    how: {
      steps: [
        { t: "Understanding", d: "We learn your FedEx P&D contract terms, settlement structure, payroll setup, and current vendor relationships — and where reconciliation is falling short today." },
        { t: "Implementation", d: "Our expert team is onboarded to your settlement statements, payroll system, and vendor invoices, aligned to your weekly cadence, and live inside your operation." },
        { t: "Optimization", d: "Ongoing reconciliation and reporting — recovering more revenue, tightening payroll accuracy, and sharpening profitability visibility as your business grows." },
      ],
    },
    challenges: {
      items: [
        { title: "Complex Settlements", description: "Settlement statements too complex to verify line by line every week" },
        { title: "Missing Payments", description: "Missing or incorrect payments quietly eating into revenue" },
        { title: "Payroll Errors", description: "Driver payroll errors creating disputes and eroding trust" },
        { title: "Vendor Overbilling", description: "Vendor invoices with duplicate or inflated charges going unnoticed" },
        { title: "Profitability Blindspots", description: "No clear picture of which routes are actually profitable" },
        { title: "Fragmented Data", description: "Manual spreadsheets instead of one source of financial truth" },
        { title: "Owner Time Drain", description: "Owners buried in back-office work instead of growing the business" },
      ],
    },
    benefits: {
      items: [
        { title: "Dedicated Expert Team", description: "A dedicated expert team handling your settlements, payroll, and expenses — not a rotating help desk" },
        { title: "Clear Financial Visibility", description: "Clearer weekly and monthly financial visibility across every FedEx settlement" },
        { title: "True Profitability Insight", description: "Help understanding true route and business profitability, not just top-line revenue" },
        { title: "Decision-Ready Reporting", description: "Clean, organized reporting that supports real decision-making" },
        { title: "Recovered Revenue", description: "Recovered revenue through rigorous settlement and expense reconciliation" },
        { title: "Stronger Driver Trust", description: "Reduced payroll errors and stronger driver trust through accurate, on-time pay" },
        { title: "Predictable Pricing", description: "Predictable, route-based pricing that scales as your fleet grows" },
      ],
    },
    qa: {
      title: "Questions?",
      sub: "Let's talk about what running your back office with Aeon would look like.",
      email: "info@aeonsynergies.com",
      phone: "+1 (302) 498-9899",
      web: "www.aeonsynergies.com",
      address: "800 N King St, Suite 304 #3725, Wilmington, DE 19801",
    },
  },
  discoveryQuestions: [
    { id: "businessName", section: "general", label: "Business name", type: "text", placeholder: "e.g. Coleman P&D LLC" },
    { id: "location", section: "general", label: "Which FedEx terminal/station are you contracted under?", type: "text", placeholder: "e.g. Newark, NJ (EWR)" },
    { id: "tenure", section: "general", label: "How long have you been a FedEx P&D contractor?", type: "text", placeholder: "e.g. 3 years" },
    { id: "currentProcess", section: "general", label: "Walk me through how you currently handle settlement reconciliation, payroll, and expense tracking.", type: "textarea" },

    // ---- Service Questions: Settlement Reconciliation ----
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

    // ---- Service Questions: Driver Payroll Management ----
    // "How many drivers do you currently have?" is no longer a stored DiscoveryQuestion —
    // it's the numDrivers pricing model's own questionText (packages/types/src/deck.ts),
    // synthesized as a Tier-1-style question dynamically whenever a selected service uses
    // that model (see DiscoveryNotesPanel.tsx), same visibility this question always had.
    { id: "payStructure", section: "general", relatedService: "driverpay", label: "How are drivers currently paid?", type: "select", options: ["Fixed Daily", "Hourly", "Stop-Based", "Mixed"] },
    { id: "payFrequency", section: "general", relatedService: "driverpay", label: "What is your payroll frequency?", type: "toggle", options: ["Weekly", "Bi-Weekly"] },

    // ---- Service Questions: Expense Reconciliation ----
    { id: "vendorCount", section: "general", relatedService: "expenserecon", label: "How many vendors do you currently reconcile invoices against?", type: "number", placeholder: "e.g. 8" },

    // ---- Service Questions: Recruitment Assistance ----
    { id: "bgvVendorFedex", section: "general", relatedService: "recruitAssist", label: "Who is your vendor for BGV & Drug Test?", type: "text" },
    { id: "hiringRequirementFedex", section: "general", relatedService: "recruitAssist", label: "What is your hiring requirement? (drivers to be fully hired per month/week)", type: "text", placeholder: "e.g. 4 per month" },
    { id: "marijuanaTestingFedex", section: "general", relatedService: "recruitAssist", label: "Do you have Marijuana testing?", type: "toggle", options: ["No", "Yes"] },
  ],
};
