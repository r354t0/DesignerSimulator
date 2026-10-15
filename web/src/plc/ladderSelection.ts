/**
 * Selection geometry for editable Ladder operands.
 *
 * Matches the compact Logix-style selection: a thin blue outline covers the
 * comment, tag and symbol, but only the tag name receives a solid blue fill.
 * Measurements are offsets relative to the instruction's SVG center (x, y).
 */
export const LADDER_SELECTION_BLUE = "#087bd1";

export function getInstructionSelectionFrame(commentLineCount: number, labelWidth = 96) {
  const safeLineCount = Math.max(0, Math.min(2, Math.floor(commentLineCount) || 0));
  // Keep selection narrower than a 104px contact cell, avoiding adjacent blocks.
  const width = Math.max(72, Math.min(100, labelWidth + 4));
  // Reduce surplus top border on two-line comments, without obscuring text.
  const top = safeLineCount === 0 ? -40 : safeLineCount === 1 ? -55 : -64;
  const bottom = 14;
  return {
    left: -width / 2,
    top,
    width,
    height: bottom - top,
    tagLeft: -width / 2 + 1,
    tagTop: -37,
    tagWidth: width - 2,
    tagHeight: 18,
  };
}
