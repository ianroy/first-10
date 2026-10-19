import { OPTION_CASE_DATA } from "./option-case-data";
export const GUEST_GROWTH_OPTION_CASE_POLICY = OPTION_CASE_DATA.version;
export function growthCaseRange(
  n: number,
  ranges: readonly (readonly [number, number])[],
): boolean {
  let lo = 0,
    hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1,
      r = ranges[mid]!;
    if (n < r[0]) hi = mid - 1;
    else if (n > r[1]) lo = mid + 1;
    else return true;
  }
  return false;
}
/** Unicode17 default lowercase, including contextual Final_Sigma. Bounded to one120-codepoint option. */
export function growthOptionLower(text: string): string {
  const chars = Array.from(text);
  if (chars.length > 120) throw Error("Option exceeds the closed120-codepoint bound");
  const cp = chars.map((c) => c.codePointAt(0)!);
  return chars
    .map((c, i) => {
      if (cp[i] !== 0x3a3) return OPTION_CASE_DATA.lower[cp[i]!] ?? c;
      let left = i - 1,
        right = i + 1;
      // Ignore Case_Ignorable FIRST, including codepoints that are also Cased.
      while (left >= 0 && growthCaseRange(cp[left]!, OPTION_CASE_DATA.ignorable)) left--;
      while (right < cp.length && growthCaseRange(cp[right]!, OPTION_CASE_DATA.ignorable)) right++;
      const before = left >= 0 && growthCaseRange(cp[left]!, OPTION_CASE_DATA.cased),
        after = right < cp.length && growthCaseRange(cp[right]!, OPTION_CASE_DATA.cased);
      return before && !after ? "ς" : "σ";
    })
    .join("");
}
const jsWhitespace = new Set([
  9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201,
  8202, 8232, 8233, 8239, 8287, 12288, 65279,
]);
export function growthOptionTrim(text: string): string {
  const chars = Array.from(text);
  let lo = 0,
    hi = chars.length;
  while (lo < hi && jsWhitespace.has(chars[lo]!.codePointAt(0)!)) lo++;
  while (hi > lo && jsWhitespace.has(chars[hi - 1]!.codePointAt(0)!)) hi--;
  return chars.slice(lo, hi).join("");
}
export const growthOptionKey = (text: string) => growthOptionLower(growthOptionTrim(text));
