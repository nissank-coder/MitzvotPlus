/**
 * Versioned scoring rules (round 8, finding A02).
 *
 * Every entry recorded with `rules: 'score-2'` is scored with THIS frozen table, never with the
 * live action table in src/data/actions.ts. Changing a value in actions.ts (or adding score-3)
 * cannot rewrite the score of history. A new version is added as a new frozen table; old tables
 * are never edited. Values are not approved by the owner yet (scoring-rules.md) – they are the
 * score-2 values as shipped, frozen so that a later decision is applied explicitly.
 */
export type RuleEntry = {
  points: number;
  dailyCap: number;
  /** Once a day. Without refScoped the identity is the action itself (refId is ignored). */
  oncePerDay?: boolean;
  /** Once a day PER ITEM (refId = track/date, mitzvah id, content id@version). */
  refScoped?: boolean;
  minyanBonus?: number;
  onTimeBonus?: number;
};

export type RuleSet = {
  version: string;
  blessingGoalBonus: number;
  actions: Readonly<Record<string, Readonly<RuleEntry>>>;
};

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

const SCORE_2: RuleSet = deepFreeze({
  version: 'score-2',
  blessingGoalBonus: 30,
  actions: {
    shacharit: {points: 25, dailyCap: 1, oncePerDay: true, minyanBonus: 10, onTimeBonus: 5},
    mincha: {points: 15, dailyCap: 1, oncePerDay: true, minyanBonus: 10},
    arvit: {points: 15, dailyCap: 1, oncePerDay: true, minyanBonus: 10},
    musaf: {points: 15, dailyCap: 1, oncePerDay: true, minyanBonus: 10},
    tefillin: {points: 20, dailyCap: 1, oncePerDay: true},
    shema: {points: 10, dailyCap: 1, oncePerDay: true},
    birkotHashachar: {points: 10, dailyCap: 1, oncePerDay: true},
    hallel: {points: 20, dailyCap: 1, oncePerDay: true},
    tehillim: {points: 10, dailyCap: 3},
    prayer: {points: 20, dailyCap: 3},
    blessing: {points: 2, dailyCap: 150},
    birkatHamazon: {points: 8, dailyCap: 4},
    torahStudy: {points: 10, dailyCap: 6},
    dailyTorah: {points: 10, dailyCap: 1, oncePerDay: true, refScoped: true},
    learningTrack: {points: 10, dailyCap: 8, oncePerDay: true, refScoped: true},
    mitzvahStudy: {points: 10, dailyCap: 3, oncePerDay: true, refScoped: true},
    charity: {points: 15, dailyCap: 3},
    chesed: {points: 15, dailyCap: 5},
    parents: {points: 15, dailyCap: 3},
    guests: {points: 15, dailyCap: 3},
    visitSick: {points: 20, dailyCap: 2},
    cleanSpeech: {points: 20, dailyCap: 1, oncePerDay: true},
    candleLighting: {points: 30, dailyCap: 1, oncePerDay: true},
    challah: {points: 30, dailyCap: 1, oncePerDay: true},
    shnayimMikra: {points: 20, dailyCap: 1, oncePerDay: true},
    kiddush: {points: 20, dailyCap: 2},
    shabbatMeal: {points: 15, dailyCap: 3},
    havdalah: {points: 20, dailyCap: 1, oncePerDay: true},
    fullShabbat: {points: 30, dailyCap: 1, oncePerDay: true},
    omer: {points: 20, dailyCap: 1, oncePerDay: true},
    chanukahCandles: {points: 30, dailyCap: 1, oncePerDay: true},
    megillah: {points: 40, dailyCap: 2},
    mishloachManot: {points: 30, dailyCap: 1, oncePerDay: true},
    matanotLaevyonim: {points: 30, dailyCap: 1, oncePerDay: true},
    purimSeuda: {points: 30, dailyCap: 1, oncePerDay: true},
    shofar: {points: 50, dailyCap: 1, oncePerDay: true},
    sukkah: {points: 30, dailyCap: 1, oncePerDay: true},
    lulav: {points: 40, dailyCap: 1, oncePerDay: true},
    bedikatChametz: {points: 40, dailyCap: 1, oncePerDay: true},
    seder: {points: 50, dailyCap: 1, oncePerDay: true},
    fastDay: {points: 30, dailyCap: 1, oncePerDay: true},
  },
});

export const RULESETS: Readonly<Record<string, RuleSet>> = deepFreeze({ 'score-2': SCORE_2 });

/** The rules new entries are recorded with. */
export const CURRENT_RULES = 'score-2' as const;
export type RulesVersion = keyof typeof RULESETS;

export function ruleSet(version: string | undefined): RuleSet | null {
  return version ? (RULESETS[version] ?? null) : null;
}

/** Rule for an action under a version; null for an unknown version or action (scored 0, flagged). */
export function ruleFor(version: string | undefined, actionKey: string | undefined): RuleEntry | null {
  const set = ruleSet(version);
  return set && actionKey ? (set.actions[actionKey] ?? null) : null;
}
