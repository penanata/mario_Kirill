export type LifeGroup = "sport" | "learning" | "work" | "personal" | "relationships";

export const GROUP_ORDER: LifeGroup[] = ["sport", "learning", "work", "personal", "relationships"];

export const GROUPS: Record<LifeGroup, { label: string; color: string; wash: string }> = {
  sport: { label: "Спорт", color: "var(--c-sport)", wash: "var(--w-sport)" },
  learning: { label: "Обучение", color: "var(--c-learning)", wash: "var(--w-learning)" },
  work: { label: "Работа", color: "var(--c-work)", wash: "var(--w-work)" },
  personal: { label: "Личное", color: "var(--c-personal)", wash: "var(--w-personal)" },
  relationships: { label: "Отношения", color: "var(--c-relationships)", wash: "var(--w-relationships)" },
};

const SLUGS: Record<string, LifeGroup> = {
  health: "sport",
  sport: "sport",
  gym: "sport",
  learning: "learning",
  study: "learning",
  finance: "work",
  work: "work",
  business: "work",
  mind: "personal",
  personal: "personal",
  energy: "personal",
  happiness: "personal",
  relationships: "relationships",
  relationship: "relationships",
};

export function groupFromSlug(slug: string | null | undefined): LifeGroup | null {
  if (!slug) return null;
  return SLUGS[slug] ?? null;
}

export function groupFromText(text: string): LifeGroup {
  const value = text.toLowerCase();
  if (/отношен|свидан|семь|друз|друг/.test(value)) return "relationships";
  if (/зал|тренир|спорт|йога|пробеж|фитнес/.test(value)) return "sport";
  if (/обучен|урок|курс|изуч|практик|\bai\b|маркетинг/.test(value)) return "learning";
  if (/пляж|прогул|обед|завтрак|отдых|чай|медитац|счаст|энерг|личн/.test(value)) return "personal";
  if (/отчёт|отчет|поставк|платеж|платёж|встреч|бизнес|работ|сверк|клуб|дашборд/.test(value)) return "work";
  return "personal";
}

export function eventGroup(input: { groupKey?: string | null; title: string; areaSlug?: string | null }): LifeGroup {
  if (input.groupKey && input.groupKey in GROUPS) return input.groupKey as LifeGroup;
  return groupFromSlug(input.areaSlug) ?? groupFromText(input.title);
}
