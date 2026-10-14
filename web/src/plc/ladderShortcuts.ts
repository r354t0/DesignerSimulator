/** Keyboard actions used only when the editable Ladder routine has focus. */
export interface LadderShortcutContext {
  key: string;
  hasSelectedInstruction: boolean;
  hasSelectedRung?: boolean;
  isTextEditing: boolean;
  isTagSelectorOpen: boolean;
  isDragging: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}

export type LadderDeleteAction = "instruction" | "rung" | null;

/**
 * A selected instruction wins over a selected rung. No Delete action may
 * steal keystrokes from text controls, popups, or an active drag.
 */
export function resolveLadderDeleteAction(context: LadderShortcutContext): LadderDeleteAction {
  if (context.key !== "Delete" || context.isTextEditing ||
      context.isTagSelectorOpen || context.isDragging ||
      context.ctrlKey || context.altKey || context.metaKey) return null;

  if (context.hasSelectedInstruction) return "instruction";
  if (context.hasSelectedRung) return "rung";
  return null;
}

export function shouldDeleteSelectedInstruction(context: LadderShortcutContext): boolean {
  return resolveLadderDeleteAction(context) === "instruction";
}

export function shouldDeleteSelectedRung(context: LadderShortcutContext): boolean {
  return resolveLadderDeleteAction(context) === "rung";
}
