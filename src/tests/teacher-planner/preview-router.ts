export function useBlocker() {
  return { status: "idle" as const, reset: () => {}, proceed: () => {} };
}
