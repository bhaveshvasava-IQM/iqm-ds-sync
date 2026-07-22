// W3C DTCG JSON — nested by layer, leaves carry $value/$type/$description and
// the com.iqm.figma $extensions block. Numeric/boolean $values are restored to
// their real JSON types.
import { nestTokens } from "./_shared.js";

export function exportJson(tokens) {
  const tree = nestTokens(tokens, { coerce: true });
  return JSON.stringify(tree, null, 2) + "\n";
}
