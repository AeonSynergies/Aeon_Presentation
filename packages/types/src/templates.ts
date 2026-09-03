// Deck templates (Phase 5c) — replace "clone from an existing live deck" as Create Deck's
// starting point. A real client's live deck (Amazon DSP, Meridian Property Partners, FedEx
// P&D) should never double as another client's template, so this file is the only source
// of starting structures the wizard (and AI drafting's structural grounding, see
// apps/api/src/lib/ai-draft.ts) offers.
//
// Two categories:
//   - "generic": invented, industry-flavored structures not tied to any real company. Each
//     one's services carry their own illustrative reportSlides (illustrative: true — the
//     schema's existing "swap in your verified client output" marker) so a drafted deck
//     reads as fully considered from the first preview, not a stripped-down shape waiting
//     for sample content. Fabricated numbers are fine here specifically because they're
//     always marked illustrative.
//   - "anonymized": same structural shape (service categories, price-band patterns,
//     surcharge/alternate-driver mechanisms, question tiers) as one of the three seeded
//     decks, with the real company name, logo, team, contact details, and any
//     company-specific program jargon (e.g. Amazon's "AMZL/AMXL", "DSP") stripped and
//     replaced with generic language. Deliberately excludes reportSlide — unlike the
//     generic templates above, this category's whole point is being a stripped mirror of a
//     real deck, and specific illustrative figures are exactly the kind of thing it strips.
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

const itManagedServicesTemplate: DeckConfig = {
  id: "",
  industry: "Managed IT Services",
  tagline: "Back-office and service-desk operations for growing IT managed service providers.",
  colors: { amber: "#4A6DE5", teal: "#2FA88E" },
  pricingModels: [
    { id: "primary", label: "Devices managed", unit: "devices", questionText: "How many devices/endpoints do you need us to manage?", isPrimary: true },
    { id: "employeeHeadcount", label: "Employee headcount", unit: "employees", questionText: "What's the total employee headcount across the client environments you support?", isPrimary: false },
  ],
  ...blankIdentity(),
  services: [
    {
      id: "helpdesk",
      name: "Helpdesk & Support",
      team: "Service Desk Team",
      tagline: "Faster resolution, fewer repeats",
      category: "major",
      pricingModelId: "primary",
      bandLabel: "Device-based · 4 bands",
      handle: [
        "Tier-1/2 ticket intake, triage, and resolution across your device fleet",
        "End-user password resets, access requests, and account troubleshooting",
        "Escalation handling and SLA tracking on every open ticket",
        "Weekly ticket volume and resolution-time reporting",
      ],
      stats: [
        { v: "↓ 45%", l: "Faster average ticket resolution time" },
        { v: "100%", l: "Tickets triaged within SLA" },
      ],
      dashboards: ["Ticket Queue Dashboard", "SLA Compliance Report"],
      priceBands: [
        { upTo: 25, price: 350 },
        { upTo: 75, price: 600 },
        { upTo: 150, price: 900 },
        { upTo: null, price: 1300 },
      ],
      surcharge: { questionId: "afterHoursSupport", amount: 250 },
      reportSlides: [
        {
          title: "Ticket Queue Summary, This Week",
          illustrative: true,
          template: {
            kind: "particulars-table",
            valueColumnLabel: "Count",
            rows: [
              { label: "Tickets Opened", value: "142", isCurrency: false },
              { label: "Tickets Resolved", value: "138", isCurrency: false },
              { label: "Escalated to Tier 2/3", value: "9", isCurrency: false },
              { label: "Open at End of Week", value: "4", isCurrency: false, bold: true, highlight: "positive" },
            ],
          },
        },
        {
          title: "Ticket Volume by Category, This Week",
          illustrative: true,
          template: {
            kind: "bar-highlights",
            chartTitle: "Tickets by Category",
            items: [
              { label: "Password Reset", count: 38 },
              { label: "Software Install", count: 29 },
              { label: "Hardware Issue", count: 22 },
              { label: "Network Connectivity", count: 18 },
              { label: "Account Access", count: 15 },
            ],
            sidebarLabel: "Top 3",
            summary: "122 tickets resolved across 5 categories this week",
            colorVariant: "teal",
          },
        },
      ],
    },
    {
      id: "patchsecurity",
      name: "Patch & Security Management",
      team: "Security Operations Team",
      tagline: "Devices patched, vulnerabilities closed",
      category: "major",
      pricingModelId: "primary",
      bandLabel: "Device-based · 3 bands",
      handle: [
        "Scheduled OS and third-party patch deployment across all managed devices",
        "Vulnerability scanning and remediation tracking",
        "Endpoint protection monitoring and alert triage",
      ],
      stats: [
        { v: "↑ 98%", l: "Devices current on critical patches" },
        { v: "↓ 60%", l: "Faster time-to-remediate flagged vulnerabilities" },
      ],
      dashboards: ["Patch Compliance Dashboard", "Vulnerability Report"],
      priceBands: [
        { upTo: 50, price: 300 },
        { upTo: 150, price: 500 },
        { upTo: null, price: 750 },
      ],
      reportSlides: [
        {
          title: "Patch Compliance Summary, This Month",
          illustrative: true,
          template: {
            kind: "particulars-table",
            valueColumnLabel: "Count",
            rows: [
              { label: "Devices Scanned", value: "312", isCurrency: false },
              { label: "Devices Fully Patched", value: "298", isCurrency: false },
              { label: "Devices Pending Patch", value: "14", isCurrency: false },
              { label: "Patch Compliance Rate", value: "95.5%", isCurrency: false, bold: true, highlight: "positive" },
            ],
          },
        },
        {
          title: "Vulnerability Remediation, This Month",
          illustrative: true,
          template: {
            kind: "particulars-table",
            valueColumnLabel: "Count",
            rows: [
              { label: "Critical Vulnerabilities Found", value: "6", isCurrency: false },
              { label: "Remediated Within SLA", value: "6", isCurrency: false },
              { label: "Open Past SLA", value: "0", isCurrency: false, bold: true, highlight: "positive" },
            ],
          },
        },
      ],
    },
    {
      id: "cloudbackup",
      name: "Cloud Backup Administration",
      team: "Infrastructure Team",
      tagline: "Verified backups, not just completed jobs",
      category: "strategic",
      pricingModelId: "primary",
      bandLabel: "Flat · 1 band",
      handle: [
        "Backup job monitoring and failure remediation across every client environment",
        "Quarterly restore testing to confirm backups are actually recoverable",
        "Retention policy administration and storage usage reporting",
      ],
      stats: [{ v: "100%", l: "Backup jobs monitored daily" }, { v: "↑ Verified", l: "Restore-tested, not just \"completed\"" }],
      dashboards: ["Backup Job Status", "Restore Test Log"],
      priceBands: [{ upTo: null, price: 450 }],
      reportSlides: [
        {
          title: "Backup Job Status, This Week",
          illustrative: true,
          template: {
            kind: "operational-table",
            columns: ["Client Environment", "Backup Job", "Last Run", "Status", "Restore Tested"],
            rows: [
              ["Beacon Retail", "Nightly File + DB", "09/01/2026 02:00", "Completed", "Yes — Passed"],
              ["Harlow Logistics", "Nightly File + DB", "09/01/2026 02:15", "Completed", "Yes — Passed"],
              ["Cinder Legal Group", "Nightly File Only", "09/01/2026 02:30", "Completed", "Not Due This Cycle"],
              ["Fenwick Dental", "Nightly File + DB", "09/01/2026 02:45", "Failed — Retried", "Yes — Passed"],
            ],
          },
        },
      ],
    },
    {
      id: "onboarding",
      name: "Onboarding & Offboarding Support",
      team: "IT Operations Team",
      tagline: "Day-one ready, same-day offboarded",
      category: "strategic",
      pricingModelId: "employeeHeadcount",
      bandLabel: "Employee-based · 3 bands",
      handle: [
        "New-hire account provisioning, device imaging, and access setup",
        "Departure checklist execution — access revocation, device recovery, data handoff",
        "Onboarding/offboarding SLA tracking against each client's start/end dates",
      ],
      stats: [{ v: "↓ 50%", l: "Faster new-hire IT-ready time" }, { v: "100%", l: "Access revoked same day on departure" }],
      dashboards: ["Onboarding Tracker", "Offboarding Checklist Log"],
      priceBands: [
        { upTo: 25, price: 250 },
        { upTo: 75, price: 400 },
        { upTo: null, price: 600 },
      ],
      reportSlides: [
        {
          title: "Onboarding & Offboarding Summary, This Month",
          illustrative: true,
          template: {
            kind: "particulars-table",
            valueColumnLabel: "Count",
            rows: [
              { label: "New Hires Onboarded", value: "11", isCurrency: false },
              { label: "Departures Offboarded", value: "6", isCurrency: false },
              { label: "Access Revoked Same Day as Departure", value: "6", isCurrency: false, bold: true, highlight: "positive" },
            ],
          },
        },
      ],
    },
  ],
  staticContent: {
    cover: { title1: "The IT Team Behind", title2: "Growing Managed Service Providers", sub: "" },
    about: {
      eyebrow: "WHO WE ARE",
      title1: "One partner.",
      title2: "One service desk.",
      body: "A dedicated back-office and service-desk team built for growing **IT managed service providers** — help desk, patching, backups, and onboarding handled by people who specialize in __MSP operations__, not a shared pool split across unrelated verticals.",
      bullets: [
        "A single point of contact across the help desk, security, and backups",
        "The same team learns your stack and ticketing conventions once",
        "Transparent monthly reporting so you always know where things stand",
      ],
      focusLabel: "WHAT WE COVER",
      focusAreas: [
        { primary: "Helpdesk &", secondary: "Support" },
        { primary: "Patch &", secondary: "Security" },
        { primary: "Cloud", secondary: "Backup" },
        { primary: "Onboarding &", secondary: "Offboarding" },
      ],
    },
    how: {
      steps: [
        { t: "Understanding", d: "We learn your device fleet, current RMM/PSA stack, and how tickets, patching, and backups are handled today." },
        { t: "Implementation", d: "Our team is onboarded to your ticketing and monitoring tools and live within 2-3 weeks." },
        { t: "Optimization", d: "Ongoing tracking of ticket resolution time, patch compliance, and backup success rate as your device fleet grows." },
      ],
    },
    challenges: {
      items: [
        { title: "Ticket Backlogs", description: "Ticket backlogs growing faster than the service desk can clear them" },
        { title: "Patch Gaps", description: "Patch and vulnerability management falling behind across the device fleet" },
        { title: "Silent Backup Failures", description: "Backup jobs failing quietly until a restore is actually needed" },
        { title: "Ad Hoc Onboarding", description: "New-hire and departure IT setup handled ad hoc instead of on a checklist" },
      ],
    },
    benefits: {
      items: [
        { title: "Dedicated Service Desk", description: "A dedicated service desk handling tickets, patching, and backups" },
        { title: "Faster Resolution", description: "Faster ticket resolution and fewer repeat issues" },
        { title: "Verified Backups", description: "Verified backup success, not just a job that ran" },
        { title: "Predictable Pricing", description: "Predictable, device-based pricing that scales with your fleet" },
      ],
    },
    qa: blankQa("Questions?", ""),
  },
  discoveryQuestions: [
    { id: "businessName", section: "general", label: "Company name", type: "text", placeholder: "e.g. Beacon IT Solutions" },
    { id: "rmmPlatform", section: "general", label: "What RMM/PSA platform do you currently use?", type: "text", placeholder: "e.g. ConnectWise, NinjaOne, Datto" },
    { id: "clientAccountCount", section: "general", label: "How many active client accounts do you support today?", type: "number", placeholder: "e.g. 40" },
    { id: "currentProcess", section: "general", label: "Describe your current process for ticket intake, patching, and backups.", type: "textarea" },
    { id: "ticketingSystem", section: "general", relatedService: "helpdesk", label: "What ticketing system do you use for the help desk?", type: "text", placeholder: "e.g. Zendesk, Autotask" },
    {
      id: "afterHoursSupport",
      section: "surcharge",
      relatedService: "helpdesk",
      label: "Do clients need 24/7 after-hours help desk coverage?",
      type: "toggle",
      options: ["Business hours only", "Yes — 24/7 after-hours coverage"],
      surchargeFor: "helpdesk",
      hint: "Adds a surcharge to Helpdesk & Support only, shown as one combined rate.",
    },
    { id: "edrCoverage", section: "general", relatedService: "patchsecurity", label: "What percentage of devices currently have an EDR/antivirus agent installed?", type: "text", placeholder: "e.g. 90%" },
    { id: "backupSolution", section: "general", relatedService: "cloudbackup", label: "What backup solution, if any, do you currently use?", type: "text", placeholder: "e.g. Datto, Veeam, none yet" },
  ],
};

const multiLocationHospitalityTemplate: DeckConfig = {
  id: "",
  industry: "Multi-Location Hospitality Management",
  tagline: "Back-office support for restaurant, hotel, and hospitality groups operating across multiple locations.",
  colors: { amber: "#D6672F", teal: "#2E6B5E" },
  pricingModels: [
    { id: "primary", label: "Active locations", unit: "locations", questionText: "How many active locations do you currently operate?", isPrimary: true },
    { id: "hiresPerQuarter", label: "Headcount hired per quarter", unit: "hires", questionText: "About how many staff do you hire per quarter across all locations?", isPrimary: false },
  ],
  ...blankIdentity(),
  services: [
    {
      id: "payrollscheduling",
      name: "Payroll & Scheduling Across Locations",
      team: "Payroll Team",
      tagline: "Consistent payroll, every location",
      category: "major",
      pricingModelId: "primary",
      bandLabel: "Location-based · 4 bands",
      handle: [
        "Multi-location payroll processing on a consistent group-wide schedule",
        "Shift scheduling support and labor-cost-to-forecast tracking per location",
        "Overtime and predictive-scheduling compliance checks by jurisdiction",
        "Payroll exception flagging before each pay run",
      ],
      stats: [
        { v: "↓ 55%", l: "Fewer payroll exceptions reaching sign-off" },
        { v: "100%", l: "Locations on the same payroll cadence" },
      ],
      dashboards: ["Group Payroll Summary", "Labor Cost by Location"],
      priceBands: [
        { upTo: 3, price: 450 },
        { upTo: 8, price: 700 },
        { upTo: 15, price: 1000 },
        { upTo: null, price: 1400 },
      ],
      reportSlides: [
        {
          title: "Group Payroll Summary, Pay Period",
          illustrative: true,
          template: {
            kind: "particulars-table",
            rows: [
              { label: "Total Gross Pay", value: "218,450.00" },
              { label: "Locations Processed", value: "6", isCurrency: false },
              { label: "Payroll Exceptions Flagged", value: "3", isCurrency: false },
              { label: "Exceptions Resolved Before Run", value: "3", isCurrency: false, bold: true, highlight: "positive" },
            ],
          },
        },
        {
          title: "Labor Cost by Location, Pay Period",
          illustrative: true,
          template: {
            kind: "operational-table",
            columns: ["Location", "Region", "Scheduled Hours", "Actual Hours", "Labor Cost", "% of Revenue"],
            rows: [
              ["Downtown", "Central", "612", "624", "$14,980", "28.4%"],
              ["Riverside", "East", "480", "471", "$11,420", "27.1%"],
              ["Uptown", "Central", "556", "560", "$13,660", "29.8%"],
              ["Airport", "West", "398", "412", "$10,240", "26.5%"],
            ],
          },
        },
      ],
    },
    {
      id: "vendorinventory",
      name: "Vendor & Inventory Reconciliation",
      team: "Operations Team",
      tagline: "Catch vendor overcharges early",
      category: "major",
      pricingModelId: "primary",
      bandLabel: "Location-based · 3 bands",
      handle: [
        "Vendor invoice validation against received inventory at every location",
        "Price-per-unit tracking to catch vendor overcharges across the group",
        "Monthly variance reporting between ordered, received, and billed quantities",
      ],
      stats: [{ v: "↓ 85%", l: "Unvalidated vendor invoices reaching payment" }, { v: "100%", l: "Locations reconciled monthly" }],
      dashboards: ["Vendor Reconciliation Summary", "Inventory Variance Report"],
      priceBands: [
        { upTo: 5, price: 400 },
        { upTo: 12, price: 600 },
        { upTo: null, price: 850 },
      ],
      surcharge: { questionId: "realTimeVendorMatching", amount: 300 },
      reportSlides: [
        {
          title: "Vendor Reconciliation Summary, This Month",
          illustrative: true,
          template: {
            kind: "particulars-table",
            rows: [
              { label: "Vendor Invoices Received", value: "96", isCurrency: false },
              { label: "Invoices Matched to Receiving", value: "91", isCurrency: false },
              { label: "Discrepancies Flagged", value: "5", isCurrency: false },
              { label: "Overcharges Caught & Recovered", value: "1,240.00", bold: true, highlight: "positive" },
            ],
          },
        },
      ],
    },
    {
      id: "financialreporting",
      name: "Multi-Location Financial Reporting",
      team: "Finance Team",
      tagline: "One consolidated financial view",
      category: "strategic",
      pricingModelId: "primary",
      bandLabel: "Flat · 1 band",
      handle: [
        "Consolidated group-wide P&L alongside per-location breakdowns",
        "Month-end close support and account reconciliation across locations",
        "Owner-facing reporting on a fixed monthly cadence",
      ],
      stats: [{ v: "100%", l: "Reports delivered on schedule" }, { v: "↑ Visibility", l: "Consolidated group-wide financial view" }],
      dashboards: ["Consolidated P&L", "Per-Location Performance Report"],
      priceBands: [{ upTo: null, price: 500 }],
      reportSlides: [
        {
          title: "Consolidated P&L Summary, This Month",
          illustrative: true,
          template: {
            kind: "particulars-table",
            showPctColumns: true,
            rows: [
              { label: "Total Revenue", suggestedPct: "100", actualPct: "100", value: "482,600.00" },
              { label: "Cost of Goods / Vendor Spend", suggestedPct: "28", actualPct: "26.1", value: "125,959.00", highlight: "positive" },
              { label: "Labor Cost", suggestedPct: "30", actualPct: "32.4", value: "156,362.00", highlight: "negative" },
              { label: "Occupancy & Overhead", suggestedPct: "12", actualPct: "11.4", value: "55,016.00", highlight: "positive" },
              { label: "Net Operating Margin", suggestedPct: "20 - 25", actualPct: "21.3", value: "102,874.00", bold: true, highlight: "positive" },
            ],
          },
        },
      ],
    },
    {
      id: "staffrecruiting",
      name: "Staff Recruiting & Onboarding",
      team: "Talent Acquisition Team",
      tagline: "Faster hiring, every location",
      category: "strategic",
      pricingModelId: "hiresPerQuarter",
      bandLabel: "Hire-based · 3 bands",
      handle: [
        "Job posting, applicant screening, and interview scheduling across all locations",
        "New-hire paperwork, background checks, and first-shift onboarding coordination",
        "Hiring pipeline reporting by location and role",
      ],
      stats: [{ v: "↓ 30%", l: "Faster time-to-hire" }, { v: "100%", l: "New hires onboarded before first shift" }],
      dashboards: ["Hiring Pipeline by Location", "Time-to-Hire Report"],
      priceBands: [
        { upTo: 5, price: 350 },
        { upTo: 15, price: 550 },
        { upTo: null, price: 800 },
      ],
      reportSlides: [
        {
          title: "Hiring Pipeline, This Quarter",
          illustrative: true,
          template: {
            kind: "operational-table",
            columns: ["Candidate", "Location", "Role", "Stage", "Start Date"],
            rows: [
              ["Alvarez, Priya", "Downtown", "Server", "Offer", "09/15/2026"],
              ["Nakamura, Jonah", "Riverside", "Line Cook", "Interview", ""],
              ["Boateng, Sasha", "Uptown", "Shift Supervisor", "Hired", "09/08/2026"],
              ["Delgado, Mateo", "Airport", "Host", "Applied", ""],
            ],
          },
        },
        {
          title: "Time-to-Hire Summary, This Quarter",
          illustrative: true,
          template: {
            kind: "particulars-table",
            valueColumnLabel: "Count",
            rows: [
              { label: "Total Hires", value: "14", isCurrency: false },
              { label: "Avg Time-to-Hire (Days)", value: "18", isCurrency: false },
              { label: "Fastest Fill (Days)", value: "9", isCurrency: false },
              { label: "Positions Still Open", value: "3", isCurrency: false, bold: true, highlight: "negative" },
            ],
          },
        },
      ],
    },
  ],
  staticContent: {
    cover: { title1: "The Back Office Behind", title2: "Multi-Location Hospitality Groups", sub: "" },
    about: {
      eyebrow: "WHO WE ARE",
      title1: "One partner.",
      title2: "One operations team.",
      body: "A dedicated back-office team built for **restaurant, hotel, and hospitality groups** running multiple locations — payroll, vendor reconciliation, and reporting handled by people who specialize in __multi-site hospitality operations__.",
      bullets: [
        "A single point of contact across payroll, vendors, and reporting for every location",
        "The same team learns your locations once and carries that context forward",
        "Transparent monthly reporting so every location manager and owner knows where things stand",
      ],
      focusLabel: "WHAT WE COVER",
      focusAreas: [
        { primary: "Payroll &", secondary: "Scheduling" },
        { primary: "Vendor &", secondary: "Inventory" },
        { primary: "Financial", secondary: "Reporting" },
        { primary: "Staff", secondary: "Recruiting" },
      ],
    },
    how: {
      steps: [
        { t: "Understanding", d: "We learn your location footprint, POS/scheduling systems, and how payroll and vendor reconciliation work today." },
        { t: "Implementation", d: "Our team is onboarded across your locations' systems and live within 2-3 weeks." },
        { t: "Optimization", d: "Ongoing tracking of labor cost, vendor spend, and reporting consistency as you add locations." },
      ],
    },
    challenges: {
      items: [
        { title: "Inconsistent Payroll", description: "Payroll and scheduling handled inconsistently from one location to the next" },
        { title: "Unreconciled Vendors", description: "Vendor invoices and inventory counts going unreconciled across sites" },
        { title: "Delayed Visibility", description: "Owners waiting weeks for a consolidated view of how the group is actually performing" },
        { title: "Hiring Bottlenecks", description: "Hiring unable to keep pace with new-location openings" },
      ],
    },
    benefits: {
      items: [
        { title: "Dedicated Multi-Site Team", description: "A dedicated team handling payroll, vendors, and reporting across every location" },
        { title: "Consistent Practices", description: "Consistent scheduling and payroll practices group-wide" },
        { title: "Reconciled Invoices", description: "Vendor invoices reconciled against actual inventory before payment" },
        { title: "Predictable Pricing", description: "Predictable, location-based pricing that scales as the group grows" },
      ],
    },
    qa: blankQa("Questions?", ""),
  },
  discoveryQuestions: [
    { id: "businessName", section: "general", label: "Group / brand name", type: "text", placeholder: "e.g. Cedar & Vine Hospitality Group" },
    { id: "conceptType", section: "general", label: "What type of hospitality concept do you operate?", type: "select", options: ["Restaurant", "Hotel", "Bar / Nightlife", "Mixed portfolio"] },
    { id: "posPlatform", section: "general", label: "What POS/scheduling platform do you use across locations?", type: "text", placeholder: "e.g. Toast, 7shifts" },
    { id: "currentProcess", section: "general", label: "Tell us how payroll, vendor management, and reporting currently work across your locations today.", type: "textarea" },
    { id: "payFrequency", section: "general", relatedService: "payrollscheduling", label: "How often do your locations run payroll?", type: "toggle", options: ["Weekly", "Bi-Weekly"] },
    {
      id: "realTimeVendorMatching",
      section: "surcharge",
      relatedService: "vendorinventory",
      label: "Do you need real-time multi-vendor invoice matching across all locations?",
      type: "toggle",
      options: ["Standard reconciliation", "Yes — real-time multi-vendor matching"],
      surchargeFor: "vendorinventory",
      hint: "Adds a surcharge to Vendor & Inventory Reconciliation only, shown as one combined rate.",
    },
    { id: "reportingCadence", section: "general", relatedService: "financialreporting", label: "How often do location managers need consolidated P&L reporting?", type: "select", options: ["Weekly", "Monthly", "Quarterly"] },
  ],
};

const staffingAgencyTemplate: DeckConfig = {
  id: "",
  industry: "Staffing & Recruiting Agency Operations",
  tagline: "Back-office support for staffing and recruiting agencies managing contractors and client placements.",
  colors: { amber: "#8A5CF5", teal: "#3E8E7E" },
  pricingModels: [
    { id: "primary", label: "Active placements", unit: "placements", questionText: "How many active placements/contractors do you currently have under management?", isPrimary: true },
    { id: "activeClientAccounts", label: "Active client accounts", unit: "accounts", questionText: "How many active client accounts do you currently manage?", isPrimary: false },
  ],
  ...blankIdentity(),
  services: [
    {
      id: "timesheetpayroll",
      name: "Timesheet & Payroll Processing",
      team: "Payroll Team",
      tagline: "Accurate, on-time contractor pay",
      category: "major",
      pricingModelId: "primary",
      bandLabel: "Placement-based · 4 bands",
      handle: [
        "Timesheet collection, approval-chasing, and exception resolution each cycle",
        "Contractor payroll processing against approved hours",
        "Pay-rate and overtime compliance checks by placement and jurisdiction",
        "Payroll exception flagging before each pay run",
      ],
      stats: [
        { v: "↓ 60%", l: "Fewer payroll exceptions reaching sign-off" },
        { v: "100%", l: "Timesheets approved before payroll runs" },
      ],
      dashboards: ["Payroll Summary", "Timesheet Exception Report"],
      priceBands: [
        { upTo: 25, price: 400 },
        { upTo: 75, price: 650 },
        { upTo: 150, price: 950 },
        { upTo: null, price: 1350 },
      ],
      reportSlides: [
        {
          title: "Payroll Summary, Pay Period",
          illustrative: true,
          template: {
            kind: "particulars-table",
            rows: [
              { label: "Total Gross Pay", value: "312,880.00" },
              { label: "Contractors Paid", value: "96", isCurrency: false },
              { label: "Timesheet Exceptions Flagged", value: "7", isCurrency: false },
              { label: "Exceptions Resolved Before Run", value: "7", isCurrency: false, bold: true, highlight: "positive" },
            ],
          },
        },
        {
          title: "Timesheet Exception Report, Pay Period",
          illustrative: true,
          template: {
            kind: "bar-highlights",
            chartTitle: "Exceptions by Type",
            items: [
              { label: "Missing Approval", count: 3 },
              { label: "Overtime Flag", count: 2 },
              { label: "Rate Mismatch", count: 1 },
              { label: "Late Submission", count: 1 },
            ],
            sidebarLabel: "Top 3",
            summary: "7 timesheet exceptions resolved before this payroll run",
            colorVariant: "amber",
          },
        },
      ],
    },
    {
      id: "clientbilling",
      name: "Client Billing & Invoicing",
      team: "Finance Team",
      tagline: "Faster, accurate client invoicing",
      category: "major",
      pricingModelId: "primary",
      bandLabel: "Placement-based · 3 bands",
      handle: [
        "Client invoicing against contracted bill rates and approved hours",
        "Margin tracking between pay rate and bill rate on every placement",
        "Accounts receivable follow-up on past-due client invoices",
      ],
      stats: [{ v: "↓ 25%", l: "Reduction in average days-to-payment" }, { v: "100%", l: "Invoices matched to approved timesheets before sending" }],
      dashboards: ["Billing Summary", "Margin by Placement Report"],
      priceBands: [
        { upTo: 40, price: 350 },
        { upTo: 100, price: 550 },
        { upTo: null, price: 800 },
      ],
      surcharge: { questionId: "rushInvoicing", amount: 200 },
      reportSlides: [
        {
          title: "Billing Summary, This Month",
          illustrative: true,
          template: {
            kind: "particulars-table",
            rows: [
              { label: "Total Client Invoices", value: "84", isCurrency: false },
              { label: "Total Billed", value: "458,900.00" },
              { label: "Total Contractor Pay", value: "312,880.00" },
              { label: "Gross Margin", value: "146,020.00", bold: true, highlight: "positive" },
            ],
          },
        },
      ],
    },
    {
      id: "compliancecred",
      name: "Compliance & Credentialing Tracking",
      team: "Compliance Team",
      tagline: "Credentials tracked, never lapsed",
      category: "strategic",
      pricingModelId: "primary",
      bandLabel: "Flat · 1 band",
      handle: [
        "License, certification, and credential expiration monitoring per placement",
        "Renewal reminders and follow-through before a credential lapses",
        "Central compliance file maintenance audit-ready at any time",
      ],
      stats: [{ v: "100%", l: "Credentials tracked with renewal alerts" }, { v: "↓ 70%", l: "Fewer lapsed credentials" }],
      dashboards: ["Credential Expiration Tracker", "Compliance Status Report"],
      priceBands: [{ upTo: null, price: 400 }],
      reportSlides: [
        {
          title: "Credential Expiration Tracker, This Month",
          illustrative: true,
          template: {
            kind: "operational-table",
            columns: ["Contractor", "Credential Type", "Expiration Date", "Status", "Renewal Reminder Sent"],
            rows: [
              ["Ramirez, Dana", "RN License", "10/12/2026", "Active", "Yes"],
              ["Okafor, Brian", "CPR/BLS Cert", "09/20/2026", "Renewal In Progress", "Yes"],
              ["Whitfield, Lucas", "Forklift Cert", "09/30/2026", "Active", "Yes"],
              ["Park, Grace", "RN License", "08/28/2026", "Expired — Suspended", "Yes"],
            ],
          },
        },
      ],
    },
    {
      id: "clientaccounts",
      name: "Client Account Management",
      team: "Account Management Team",
      tagline: "Stronger client account retention",
      category: "strategic",
      pricingModelId: "activeClientAccounts",
      bandLabel: "Account-based · 3 bands",
      handle: [
        "Ongoing client check-ins and open-role status updates",
        "Contract and rate-card renewal tracking per account",
        "Escalation handling for placement or billing disputes",
      ],
      stats: [{ v: "↑ Retention", l: "Client account retention rate" }, { v: "100%", l: "Accounts reviewed on a fixed cadence" }],
      dashboards: ["Account Health Dashboard", "Contract Renewal Tracker"],
      priceBands: [
        { upTo: 10, price: 300 },
        { upTo: 25, price: 500 },
        { upTo: null, price: 750 },
      ],
      reportSlides: [
        {
          title: "Account Health Summary, This Quarter",
          illustrative: true,
          template: {
            kind: "particulars-table",
            valueColumnLabel: "Count",
            rows: [
              { label: "Active Client Accounts", value: "22", isCurrency: false },
              { label: "Accounts Reviewed On-Cadence", value: "22", isCurrency: false },
              { label: "Escalations Opened", value: "2", isCurrency: false },
              { label: "Escalations Resolved", value: "2", isCurrency: false, bold: true, highlight: "positive" },
            ],
          },
        },
        {
          title: "Contract Renewal Tracker, This Quarter",
          illustrative: true,
          template: {
            kind: "operational-table",
            columns: ["Client Account", "Contract End Date", "Renewal Status", "Rate Card Change"],
            rows: [
              ["Meridian Health Staffing", "10/31/2026", "Renewal In Progress", "None"],
              ["Corebridge Logistics", "11/15/2026", "Renewed", "+3% bill rate"],
              ["Larkspur Manufacturing", "09/30/2026", "Renewal In Progress", "None"],
              ["Northbay Clinical Group", "12/01/2026", "Not Yet Due", "—"],
            ],
          },
        },
      ],
    },
  ],
  staticContent: {
    cover: { title1: "The Back Office Behind", title2: "Growing Staffing & Recruiting Agencies", sub: "" },
    about: {
      eyebrow: "WHO WE ARE",
      title1: "One partner.",
      title2: "One back-office team.",
      body: "A dedicated back-office team built for **staffing and recruiting agencies** managing contractors and client placements — timesheets, billing, and credentialing handled by people who specialize in __staffing operations__.",
      bullets: [
        "A single point of contact across timesheets, billing, and credentialing",
        "The same team learns your client accounts once and carries that context forward",
        "Transparent monthly reporting so you always know where placements and billing stand",
      ],
      focusLabel: "WHAT WE COVER",
      focusAreas: [
        { primary: "Timesheets &", secondary: "Payroll" },
        { primary: "Client", secondary: "Billing" },
        { primary: "Compliance &", secondary: "Credentialing" },
        { primary: "Client Account", secondary: "Management" },
      ],
    },
    how: {
      steps: [
        { t: "Understanding", d: "We learn your placement mix, ATS/VMS setup, and how timesheets, billing, and credentialing are handled today." },
        { t: "Implementation", d: "Our team is onboarded to your ATS/VMS and billing systems and live within 2-3 weeks." },
        { t: "Optimization", d: "Ongoing tracking of timesheet accuracy, billing turnaround, and credential compliance as your placements grow." },
      ],
    },
    challenges: {
      items: [
        { title: "Timesheet Errors", description: "Timesheet errors delaying contractor payroll and client billing" },
        { title: "Lapsed Credentials", description: "Credential and license expirations slipping past renewal deadlines" },
        { title: "Late Invoicing", description: "Client invoices going out late or misaligned with contract terms" },
        { title: "Recruiter Time Drain", description: "Recruiters pulled into back-office work instead of sourcing candidates" },
      ],
    },
    benefits: {
      items: [
        { title: "Dedicated Back-Office Team", description: "A dedicated team handling timesheets, billing, and credentialing" },
        { title: "Faster Accurate Payroll", description: "Faster, more accurate contractor payroll" },
        { title: "Proactive Credentialing", description: "Credentials tracked and renewed before they lapse" },
        { title: "Predictable Pricing", description: "Predictable, placement-based pricing that scales with your book of business" },
      ],
    },
    qa: blankQa("Questions?", ""),
  },
  discoveryQuestions: [
    { id: "businessName", section: "general", label: "Agency name", type: "text", placeholder: "e.g. Crestline Staffing Partners" },
    { id: "placementIndustries", section: "general", label: "What industries do you primarily place candidates into?", type: "text", placeholder: "e.g. Healthcare, light industrial, clerical" },
    { id: "atsPlatform", section: "general", label: "What ATS/VMS platform do you currently use?", type: "text", placeholder: "e.g. Bullhorn, JobDiva" },
    { id: "currentProcess", section: "general", label: "Give us a quick rundown of how timesheets, billing, and credentialing are handled today.", type: "textarea" },
    { id: "payFrequency", section: "general", relatedService: "timesheetpayroll", label: "What is your contractor payroll frequency?", type: "toggle", options: ["Weekly", "Bi-Weekly"] },
    {
      id: "rushInvoicing",
      section: "surcharge",
      relatedService: "clientbilling",
      label: "Do you need same-week rush invoicing for new placements?",
      type: "toggle",
      options: ["Standard billing cycle", "Yes — rush invoicing needed"],
      surchargeFor: "clientbilling",
      hint: "Adds a surcharge to Client Billing & Invoicing only, shown as one combined rate.",
    },
    { id: "credentialTypeCount", section: "general", relatedService: "compliancecred", label: "How many credential/license types do you need to track per placement?", type: "number", placeholder: "e.g. 4" },
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
  pricingModels: [{ id: "primary", label: "Routes per day", unit: "routes", questionText: "How many routes do you run per day?", isPrimary: true }],
  ...blankIdentity(),
  services: [
    {
      id: "payroll",
      name: "Payroll Compliance Management",
      team: "Payroll & Compliance Team",
      tagline: "Accurate, timely payments",
      category: "major",
      pricingModelId: "primary",
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
      tagline: "Protect against revenue leakage",
      category: "strategic",
      pricingModelId: "primary",
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
      tagline: "Audit-ready compliance, always",
      category: "strategic",
      pricingModelId: "primary",
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
      tagline: "Accurate, audit-ready records",
      category: "strategic",
      pricingModelId: "primary",
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
      tagline: "Hire faster, hire smarter",
      category: "major",
      pricingModelId: "primary",
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
      tagline: "On-time performance, every day",
      category: "major",
      pricingModelId: "primary",
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
      tagline: "Protect your scorecard performance",
      category: "strategic",
      pricingModelId: "primary",
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
      eyebrow: "WHO WE ARE",
      title1: "One partner.",
      title2: "One expert team.",
      body: "A dedicated back-office and virtual operations team built specifically for the **last-mile delivery ecosystem**. One team, embedded in your daily operations across __payroll, hiring, dispatch, compliance, and finance__ — not a rotating cast of vendors.",
      bullets: [
        "A single contract and account relationship — no coordinating between separate vendors",
        "The same expert team learns your operation once and carries that context across every service",
        "One escalation path — no \"that's the other team's issue\"",
      ],
      focusLabel: "WHAT WE COVER",
      focusAreas: [
        { primary: "Last-Mile", secondary: "Delivery" },
        { primary: "Payroll &", secondary: "Compliance" },
        { primary: "Dispatch &", secondary: "Routing" },
        { primary: "Fleet &", secondary: "Route Finance" },
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
        { title: "Thin Margins", description: "Thin margins under constant rate and cost pressure" },
        { title: "Driver Turnover", description: "High driver turnover with a recruiting pipeline that can't keep pace" },
        { title: "Payroll Errors", description: "Manual payroll and timecard errors creating compliance exposure" },
        { title: "Revenue Leakage", description: "Revenue quietly leaking through unvalidated invoices and missed disputes" },
        { title: "Owner Time Drain", description: "Owners doing back-office work instead of growing the fleet" },
      ],
    },
    benefits: {
      items: [
        { title: "Dedicated Expert Team", description: "A dedicated expert team embedded in your operation — not a rotating help desk" },
        { title: "Recovered Revenue", description: "Recovered revenue through rigorous invoice dispute management" },
        { title: "Reduced Compliance Risk", description: "Reduced compliance exposure across payroll and workers' comp" },
        { title: "Faster Hiring", description: "A faster, cleaner hiring pipeline that keeps routes covered" },
        { title: "Predictable Pricing", description: "Predictable, route-based pricing that scales as your fleet grows" },
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
  pricingModels: [{ id: "primary", label: "Units managed", unit: "units", questionText: "How many units do you currently manage?", isPrimary: true }],
  ...blankIdentity(),
  services: [
    {
      id: "leasing",
      name: "Tenant Screening & Leasing Coordination",
      team: "Leasing Team",
      tagline: "Faster leasing, fewer vacancies",
      category: "major",
      pricingModelId: "primary",
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
      tagline: "Faster fixes, validated vendor costs",
      category: "major",
      pricingModelId: "primary",
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
      tagline: "On-time rent, clear owner reporting",
      category: "strategic",
      pricingModelId: "primary",
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
      tagline: "One trusted point of contact",
      category: "strategic",
      pricingModelId: "primary",
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
      eyebrow: "WHO WE ARE",
      title1: "One partner.",
      title2: "One property team.",
      body: "A dedicated back-office team built specifically for **residential and commercial property owners and operators** — not a call center that happens to answer property questions. This team specializes in __leasing, maintenance coordination, and property financials__, and stays with your portfolio as it grows.",
      bullets: [
        "A single point of contact across leasing, maintenance, and financial reporting",
        "The same team learns your properties once and carries that context forward",
        "Transparent monthly reporting so owners always know where things stand",
      ],
      focusLabel: "WHAT WE COVER",
      focusAreas: [
        { primary: "Residential", secondary: "Properties" },
        { primary: "Commercial", secondary: "Properties" },
        { primary: "Leasing &", secondary: "Renewals" },
        { primary: "Maintenance &", secondary: "Vendor Management" },
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
        { title: "Prolonged Vacancy", description: "Vacant units sitting longer than they should, costing real income" },
        { title: "Maintenance Gaps", description: "Maintenance requests falling through the cracks or getting overcharged by vendors" },
        { title: "Late Rent Collections", description: "Late rent and inconsistent collections eating into cash flow" },
        { title: "Owner Time Drain", description: "Owners fielding tenant calls at all hours instead of running their business" },
      ],
    },
    benefits: {
      items: [
        { title: "Dedicated Property Team", description: "A dedicated team handling leasing, maintenance, and financials — not a rotating help desk" },
        { title: "Faster Unit Turnover", description: "Faster unit turnover and reduced vacancy through structured leasing coordination" },
        { title: "Validated Vendor Invoices", description: "Vendor invoices validated before payment, catching overcharges early" },
        { title: "Predictable Pricing", description: "Predictable, unit-based pricing that scales as your portfolio grows" },
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
  pricingModels: [
    { id: "primary", label: "Routes per day", unit: "routes", questionText: "How many routes do you run per day?", isPrimary: true },
    { id: "numDrivers", label: "Number of drivers", unit: "drivers", questionText: "How many drivers do you currently have?", isPrimary: false },
  ],
  ...blankIdentity(),
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
      tagline: "Accurate, on-time driver pay",
      category: "major",
      pricingModelId: "numDrivers",
      bandLabel: "Driver-based · 5 bands",
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
      tagline: "Stop overbilling before it costs you",
      category: "strategic",
      pricingModelId: "primary",
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
      tagline: "Faster, fully tracked hiring",
      category: "major",
      pricingModelId: "primary",
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
      eyebrow: "WHO WE ARE",
      title1: "One partner.",
      title2: "One expert team.",
      body: "A dedicated back-office team built specifically for **contracted pickup & delivery operators** — purpose-built to support __settlement reconciliation, driver payroll, and expense management__. One team, embedded in your daily operations, not a rotating cast of vendors.",
      bullets: [
        "A single contract and account relationship — no coordinating between separate vendors",
        "The same expert team learns your settlement structure once and carries that context across every service",
        "One escalation path — no \"that's the other team's issue\"",
      ],
      focusLabel: "WHAT WE COVER",
      focusAreas: [
        { primary: "Contracted P&D", secondary: "Operations" },
        { primary: "Settlement", secondary: "Reconciliation" },
        { primary: "Driver Payroll", secondary: "& Compliance" },
        { primary: "Expense &", secondary: "Vendor Management" },
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
        { title: "Complex Settlements", description: "Settlement statements too complex to verify line by line every week" },
        { title: "Missing Payments", description: "Missing or incorrect payments quietly eating into revenue" },
        { title: "Payroll Errors", description: "Driver payroll errors creating disputes and eroding trust" },
        { title: "Vendor Overbilling", description: "Vendor invoices with duplicate or inflated charges going unnoticed" },
      ],
    },
    benefits: {
      items: [
        { title: "Dedicated Expert Team", description: "A dedicated expert team handling your settlements, payroll, and expenses" },
        { title: "Clear Financial Visibility", description: "Clearer weekly and monthly financial visibility across every settlement" },
        { title: "Recovered Revenue", description: "Recovered revenue through rigorous settlement and expense reconciliation" },
        { title: "Predictable Pricing", description: "Predictable, route-based pricing that scales as your fleet grows" },
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
    { id: "payFrequency", section: "general", relatedService: "driverpay", label: "What is your payroll frequency?", type: "toggle", options: ["Weekly", "Bi-Weekly"] },
    { id: "vendorCount", section: "general", relatedService: "expenserecon", label: "How many vendors do you currently reconcile invoices against?", type: "number", placeholder: "e.g. 8" },
  ],
};

export const DECK_TEMPLATES: DeckTemplate[] = [
  {
    key: "it-managed-services",
    label: "IT Managed Services Provider",
    category: "generic",
    summary: "Helpdesk, patch/security management, cloud backup administration, and headcount-based onboarding support for MSPs.",
    config: itManagedServicesTemplate,
  },
  {
    key: "multi-location-hospitality",
    label: "Multi-Location Hospitality Group",
    category: "generic",
    summary: "Cross-location payroll/scheduling, vendor & inventory reconciliation, financial reporting, and quarterly-hire-based recruiting.",
    config: multiLocationHospitalityTemplate,
  },
  {
    key: "staffing-agency-backoffice",
    label: "Staffing & Recruiting Agency Back Office",
    category: "generic",
    summary: "Timesheet/payroll processing, client billing, compliance & credentialing, and account-based client management for staffing agencies.",
    config: staffingAgencyTemplate,
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
