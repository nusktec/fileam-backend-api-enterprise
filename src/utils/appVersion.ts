/** Compare semver-like strings (major.minor.patch). Returns -1 if a<b, 0 if equal, 1 if a>b. */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const parse = (value: string): number[] => {
    const core = value.trim().split("-")[0] ?? value.trim();
    return core.split(".").map((part) => {
      const n = Number.parseInt(part, 10);
      return Number.isFinite(n) ? n : 0;
    });
  };

  const left = parse(a);
  const right = parse(b);
  const len = Math.max(left.length, right.length);

  for (let i = 0; i < len; i++) {
    const lv = left[i] ?? 0;
    const rv = right[i] ?? 0;
    if (lv < rv) return -1;
    if (lv > rv) return 1;
  }

  return 0;
}

export function isVersionBelow(current: string, target: string): boolean {
  return compareSemver(current, target) < 0;
}
