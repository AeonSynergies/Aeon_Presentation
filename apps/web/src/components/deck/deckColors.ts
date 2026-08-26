import { PLATFORM_DEFAULT_COLORS, type DeckColors } from "@aeon/types";
import type * as React from "react";

// Single source for turning a deck's colors into the CSS custom properties the design
// system reads. Used by both the real DeckPlayer and the Deck Builder's live preview —
// deliberately shared so the preview can never drift from what presenting looks like.
// Fallbacks mirror the prototype's PLATFORM_THEME_DEFAULTS behavior in bootDeckPlayer().
export function deckColorVars(colors: DeckColors): React.CSSProperties {
  return {
    "--amber": colors.amber,
    "--teal": colors.teal,
    "--ink": colors.ink || PLATFORM_DEFAULT_COLORS.ink,
    "--panel": colors.panel || PLATFORM_DEFAULT_COLORS.panel,
    "--panel-2": colors.panel2 || PLATFORM_DEFAULT_COLORS.panel2,
    "--fog": colors.fog || PLATFORM_DEFAULT_COLORS.fog,
    "--paper": colors.paper || PLATFORM_DEFAULT_COLORS.paper,
    ...(colors.success ? { "--success": colors.success } : {}),
    ...(colors.danger ? { "--danger": colors.danger } : {}),
    ...(colors.gold ? { "--gold": colors.gold } : {}),
  } as React.CSSProperties;
}
