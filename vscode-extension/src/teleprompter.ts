export function buildTeleprompterText(
  parts: string[],
  activeIndex: number,
): string {
  return parts
    .map((p, idx) => (idx === activeIndex ? `**${p}**` : p))
    .join("\n\n");
}

export function buildFinalText(parts: string[], controls: string): string {
  return parts.join("\n\n") + controls;
}
