const LABELS: Record<string, string> = {
  "high-card": "carta alta",
  pair: "un par",
  "two-pair": "doble par",
  "three-of-a-kind": "trío",
  straight: "escalera",
  flush: "color",
  "full-house": "full house",
  "four-of-a-kind": "póker",
  "straight-flush": "escalera de color",
};

export function handCategoryLabel(category?: string): string {
  if (!category) return "";
  return LABELS[category] ?? category;
}
