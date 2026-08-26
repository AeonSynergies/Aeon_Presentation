// Role/permission matrix — ported verbatim from the requirements spec's Team & Role
// Management section. Single source of truth for both sides of the boundary: the API
// imports `can()` to make the real (backend) decision, the web app imports the same
// `can()` to decide what to show/hide. They can never drift because it's one function,
// not two independent implementations of the same table.
export const ROLES = ["SALES_EXECUTIVE", "OPERATIONS_MANAGER", "BD_MANAGER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  SALES_EXECUTIVE: "Sales Executive",
  OPERATIONS_MANAGER: "Operations Manager",
  BD_MANAGER: "BD Manager",
  ADMIN: "Admin",
};

export type Permission =
  | "present" // open/present a deck
  | "discoveryNotes" // view + fill in Discovery Notes during a live session
  | "sendToClient" // hand off the deck/quote to the client (mailto draft)
  | "export" // export the rate card
  | "editDeck" // edit an existing deck's content/pricing
  | "createDeck" // create a new deck (Deck Builder wizard)
  | "manageUsers"; // Team Management: add/edit/remove users

// The table, exactly as spec'd:
//   Role                | Present | Discovery Notes | Send to Client | Export | Edit Deck | Create Deck | (+ user mgmt for Admin)
//   Sales Executive      |  Yes    |  Yes             |  Yes           |  No    |  Yes      |  Yes        |
//   Operations Manager   |  Yes    |  Yes             |  No            |  No    |  No       |  No         |
//   BD Manager           |  Yes    |  Yes             |  Yes           |  Yes   |  Yes      |  Yes        |
//   Admin                |  Yes    |  Yes             |  Yes           |  Yes   |  Yes      |  Yes        |  Yes
const MATRIX: Record<Role, Record<Permission, boolean>> = {
  SALES_EXECUTIVE: {
    present: true,
    discoveryNotes: true,
    sendToClient: true,
    export: false,
    editDeck: true,
    createDeck: true,
    manageUsers: false,
  },
  OPERATIONS_MANAGER: {
    present: true,
    discoveryNotes: true,
    sendToClient: false,
    export: false,
    editDeck: false,
    createDeck: false,
    manageUsers: false,
  },
  BD_MANAGER: {
    present: true,
    discoveryNotes: true,
    sendToClient: true,
    export: true,
    editDeck: true,
    createDeck: true,
    manageUsers: false,
  },
  ADMIN: {
    present: true,
    discoveryNotes: true,
    sendToClient: true,
    export: true,
    editDeck: true,
    createDeck: true,
    manageUsers: true,
  },
};

/** `role` is untyped `string` at the boundary (JWT claim, DB column read as string in
 * some contexts) — an unrecognized role fails closed (false), never open. */
export function can(role: string, permission: Permission): boolean {
  return MATRIX[role as Role]?.[permission] ?? false;
}

export function isValidRole(role: string): role is Role {
  return (ROLES as readonly string[]).includes(role);
}
