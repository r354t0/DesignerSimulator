/** Display semantics deliberately separate coil state from incoming conductor power.
 * OTE follows rung power; retentive OTL/OTU follow the stored BOOL value.
 * Wires always follow actual rung power, even if the bit remains latched.
 */
export function getCoilVisualState(
  kind: "OTE" | "OTL" | "OTU",
  online: boolean,
  rungPower: boolean,
  storedBit: boolean,
): { symbolLive: boolean; conductorLive: boolean } {
  return {
    symbolLive: online && (kind === "OTE" ? rungPower : storedBit),
    conductorLive: online && rungPower,
  };
}
