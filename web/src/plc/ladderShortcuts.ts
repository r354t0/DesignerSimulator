/** Keyboard actions used only when the editable Ladder routine has focus. */
export interface LadderShortcutContext {
  key: string;
  hasSelectedInstruction: boolean;
  isTextEditing: boolean;
  isTagSelectorOpen: boolean;
  isDragging: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}

export function shouldDeleteSelectedInstruction(context: LadderShortcutContext): boolean {
  return context.key === "Delete" &&
    context.hasSelectedInstruction &&
    !context.isTextEditing &&
    !context.isTagSelectorOpen &&
    !context.isDragging &&
    !context.ctrlKey &&
    !context.altKey &&
    !context.metaKey;
}
