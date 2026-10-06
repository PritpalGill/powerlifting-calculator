/**
 * Powerlifting relative-strength scores: IPF GL points, DOTS and Wilks.
 *
 * Every function works in kilograms. Each formula keeps the bodyweight rule
 * its authors published: IPF GL is undefined below its minimum bodyweight,
 * while DOTS and Wilks use the coefficient at the nearest boundary.
 */

export const KG_PER_LB = 0.45359237;

export type Sex = "male" | "female";
export type Equipment = "classic" | "equipped";
/** A three-lift total, or a single bench press result. */
export type Lift = "total" | "bench";
export type Formula = "ipfgl" | "dots" | "wilks";

export const FORMULA_NAMES: Record<Formula, string> = {
  ipfgl: "IPF GL",
  dots: "DOTS",
  wilks: "Wilks",
};

/**
 * IPF GL parameters (A, B, C), from "The IPF GL Coefficients for Relative
 * Scoring" (May 2020), Table 1. The IPF formula page still lists these as the
 * current coefficients:
 * https://www.powerlifting.sport/rules/codes/info/ipf-formula
 */
export const IPF_GL_PARAMETERS = {
  male: {
    classic: { total: [1199.72839, 1025.18162, 0.00921], bench: [320.98041, 281.40258, 0.01008] },
    equipped: { total: [1236.25115, 1449.21864, 0.01644], bench: [381.22073, 733.79378, 0.02398] },
  },
  female: {
    classic: { total: [610.32796, 1045.59282, 0.03048], bench: [142.40398, 442.52671, 0.04724] },
    equipped: { total: [758.63878, 949.31382, 0.02435], bench: [221.82209, 357.00377, 0.02937] },
  },
} as const;

/** The IPF defines GL points for "Bwt ≥ 40 kg for men and Bwt ≥ 35 kg for women". */
export const IPF_GL_MIN_BODYWEIGHT_KG: Record<Sex, number> = { male: 40, female: 35 };

/**
 * Tim Konertz's DOTS curves, highest polynomial power first.
 * https://kraftsport-colonia.de/dots and https://www.usapowerlifting.com/pro
 */
export const DOTS_FORMULAS = {
  male: {
    label: "Men",
    minWeightKg: 40,
    maxWeightKg: 210,
    coefficients: [-0.0000010930, 0.0007391293, -0.1918759221, 24.0900756, -307.75076],
  },
  female: {
    label: "Women",
    minWeightKg: 40,
    maxWeightKg: 150,
    coefficients: [-0.0000010706, 0.0005158568, -0.1126655495, 13.6175032, -57.96288],
  },
} as const;

/**
 * Robert Wilks's original formula, lowest polynomial power first:
 * coefficient = 500 ÷ (a + bW + cW² + dW³ + eW⁴ + fW⁵). The bodyweight range is
 * the one OpenPowerlifting applies to avoid the curve's asymptote.
 * https://gitlab.com/openpowerlifting/opl-data/-/blob/main/crates/coefficients/src/wilks.rs
 */
export const WILKS_FORMULAS = {
  male: {
    label: "Men",
    minWeightKg: 40,
    maxWeightKg: 201.9,
    coefficients: [-216.0475144, 16.2606339, -0.002388645, -0.00113732, 7.01863e-6, -1.291e-8],
  },
  female: {
    label: "Women",
    minWeightKg: 26.51,
    maxWeightKg: 154.53,
    coefficients: [594.31747775582, -27.23842536447, 0.82112226871, -0.00930733913, 4.731582e-5, -9.054e-8],
  },
} as const;

export type ScoreInput = {
  sex: Sex;
  /** Only IPF GL distinguishes classic (raw) from equipped lifting. */
  equipment: Equipment;
  lift: Lift;
  bodyweightKg: number;
  resultKg: number;
};

export type Score = {
  formula: Formula;
  points: number;
  coefficient: number;
  /** The bodyweight the coefficient was taken at, after any boundary rule. */
  formulaWeightKg: number;
  bodyweightWasClamped: boolean;
};

function requireSex(sex: Sex) {
  if (sex !== "male" && sex !== "female") throw new RangeError("Choose the men's or women's formula.");
}

function requirePositive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`Enter a ${label} greater than 0.`);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** The DOTS coefficient, after applying the nearest-boundary rule. */
export function dotsCoefficient(sex: Sex, bodyweightKg: number) {
  requireSex(sex);
  const formula = DOTS_FORMULAS[sex];
  const formulaWeightKg = clamp(bodyweightKg, formula.minWeightKg, formula.maxWeightKg);
  const [a, b, c, d, e] = formula.coefficients;
  const w = formulaWeightKg;
  const denominator = a * w ** 4 + b * w ** 3 + c * w ** 2 + d * w + e;
  return { coefficient: 500 / denominator, formulaWeightKg };
}

/** The Wilks coefficient, after applying the nearest-boundary rule. */
export function wilksCoefficient(sex: Sex, bodyweightKg: number) {
  requireSex(sex);
  const formula = WILKS_FORMULAS[sex];
  const formulaWeightKg = clamp(bodyweightKg, formula.minWeightKg, formula.maxWeightKg);
  const [a, b, c, d, e, f] = formula.coefficients;
  const w = formulaWeightKg;
  const denominator = a + b * w + c * w ** 2 + d * w ** 3 + e * w ** 4 + f * w ** 5;
  return { coefficient: 500 / denominator, formulaWeightKg };
}

/**
 * The IPF GL coefficient, 100 ÷ (A − B·e^(−C·Bwt)), rounded to six decimals as
 * the IPF's championship workbook does before multiplying by the result.
 */
export function ipfGlCoefficient(sex: Sex, equipment: Equipment, lift: Lift, bodyweightKg: number) {
  requireSex(sex);
  const byEquipment = IPF_GL_PARAMETERS[sex][equipment];
  if (!byEquipment) throw new RangeError("Choose classic or equipped lifting.");
  const parameters = byEquipment[lift];
  if (!parameters) throw new RangeError("Choose a total or a bench press result.");
  requirePositive(bodyweightKg, "bodyweight");
  const minimum = IPF_GL_MIN_BODYWEIGHT_KG[sex];
  if (bodyweightKg < minimum) {
    const group = sex === "male" ? "men" : "women";
    throw new RangeError(`IPF GL points are defined from ${minimum} kg bodyweight for ${group}.`);
  }
  const [a, b, c] = parameters;
  const coefficient = 100 / (a - b * Math.exp(-c * bodyweightKg));
  return Math.round(coefficient * 1e6) / 1e6;
}

function coefficientFor(formula: Formula, input: Omit<ScoreInput, "resultKg">) {
  if (formula === "ipfgl") {
    const coefficient = ipfGlCoefficient(input.sex, input.equipment, input.lift, input.bodyweightKg);
    return { coefficient, formulaWeightKg: input.bodyweightKg };
  }
  requirePositive(input.bodyweightKg, "bodyweight");
  if (formula === "dots") return dotsCoefficient(input.sex, input.bodyweightKg);
  if (formula === "wilks") return wilksCoefficient(input.sex, input.bodyweightKg);
  throw new RangeError("Choose IPF GL, DOTS or Wilks.");
}

/** One score. Throws a RangeError with a readable message when it is undefined. */
export function score(formula: Formula, input: ScoreInput): Score {
  requirePositive(input.resultKg, input.lift === "bench" ? "bench press" : "total");
  const { coefficient, formulaWeightKg } = coefficientFor(formula, input);
  const points = input.resultKg * coefficient;
  if (!Number.isFinite(points) || points <= 0)
    throw new RangeError("Check the weights: this result is too large or too small.");
  return {
    formula,
    points,
    coefficient,
    formulaWeightKg,
    // Ignore floating-point noise when an exact boundary was converted from lb.
    bodyweightWasClamped: Math.abs(formulaWeightKg - input.bodyweightKg) > 1e-8,
  };
}

export type ResultToPassInput = Omit<ScoreInput, "resultKg"> & {
  /** The score to beat, on the same formula. */
  targetPoints: number;
  /** Loading step in kilograms, such as 2.5 for a meet or 5 lb × KG_PER_LB. */
  incrementKg: number;
};

/**
 * The smallest result, in whole increments, whose score is strictly greater
 * than the target. Every formula here is linear in the result at a fixed
 * bodyweight, so the answer is the target divided by the coefficient, rounded
 * up to the next loadable step.
 */
export function resultToPass(formula: Formula, input: ResultToPassInput) {
  requirePositive(input.targetPoints, "score to beat");
  requirePositive(input.incrementKg, "loading increment");
  const { coefficient } = coefficientFor(formula, input);
  const pointsFor = (steps: number) => steps * input.incrementKg * coefficient;
  let steps = Math.max(1, Math.ceil(input.targetPoints / coefficient / input.incrementKg));
  // Correct for floating-point error on either side of the exact boundary.
  while (pointsFor(steps) <= input.targetPoints) steps += 1;
  while (steps > 1 && pointsFor(steps - 1) > input.targetPoints) steps -= 1;
  const resultKg = steps * input.incrementKg;
  return { resultKg, points: pointsFor(steps), coefficient };
}
