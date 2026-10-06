import assert from "node:assert/strict";
import test from "node:test";
import {
  dotsCoefficient, ipfGlCoefficient, KG_PER_LB, resultToPass, score, wilksCoefficient,
  type Formula, type ScoreInput,
} from "../src/scores.ts";

function near(actual: number, expected: number, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should equal ${expected}`);
}

const base: ScoreInput = { sex: "male", equipment: "classic", lift: "total", bodyweightKg: 83, resultKg: 600 };

// Rows from the IPF's own "Championships-IPF-GL-example.xlsm" scoresheet:
// division, bodyweight, total, the workbook's coefficient and its points.
test("IPF GL matches the IPF championship workbook to the last digit", () => {
  for (const [sex, bodyweightKg, resultKg, coefficient, points] of [
    ["male", 58.51, 520, 0.146539, 76.20028],
    ["male", 58.54, 610, 0.146481, 89.35341],
    ["male", 58.36, 557.5, 0.146833, 81.8593975],
    ["female", 68, 497.5, 0.173197, 86.1655075],
    ["female", 46.15, 487.5, 0.222194, 108.319575],
    ["female", 46.25, 412.5, 0.221824, 91.5024],
  ] as const) {
    assert.equal(ipfGlCoefficient(sex, "equipped", "total", bodyweightKg), coefficient);
    near(score("ipfgl", { ...base, sex, equipment: "equipped", bodyweightKg, resultKg }).points, points);
  }
  assert.equal(ipfGlCoefficient("male", "equipped", "total", 58.98), 0.145629);
});

// Published IPF results, as cross-checked by OpenPowerlifting's goodlift.rs.
// Results lists print two decimals; the IPF workbook keeps six and defines no
// two-decimal rounding rule, so these agree to within the last printed digit.
test("IPF GL reproduces published championship points", () => {
  // Dmitry Inzarkin, 2019 IPF World Open Equipped Powerlifting: 112.85.
  const inzarkin = score("ipfgl", { ...base, equipment: "equipped", bodyweightKg: 92.04, resultKg: 1035 });
  near(inzarkin.points, 112.85, 0.01);
  // Susanna Törrönen, 2019 World Open Classic Bench Press: 96.78.
  const torronen = score("ipfgl", { ...base, sex: "female", lift: "bench", bodyweightKg: 70.5, resultKg: 122.5 });
  near(torronen.points, 96.78, 0.01);
});

test("IPF GL uses all eight published parameter sets", () => {
  const coefficients = new Set<number>();
  for (const sex of ["male", "female"] as const)
    for (const equipment of ["classic", "equipped"] as const)
      for (const lift of ["total", "bench"] as const)
        coefficients.add(ipfGlCoefficient(sex, equipment, lift, 70));
  assert.equal(coefficients.size, 8);
});

test("IPF GL is undefined below the IPF's minimum bodyweight", () => {
  assert.throws(() => ipfGlCoefficient("male", "classic", "total", 39.9), /40 kg bodyweight for men/);
  assert.throws(() => ipfGlCoefficient("female", "classic", "total", 34.9), /35 kg bodyweight for women/);
  assert.doesNotThrow(() => ipfGlCoefficient("male", "classic", "total", 40));
  assert.doesNotThrow(() => ipfGlCoefficient("female", "classic", "total", 35));
});

// Independently evaluated with Python Decimal (40-digit precision) from the
// published polynomials; the 100 kg men's and 60 kg women's values also
// match OpenPowerlifting's wilks.rs tests.
test("Wilks matches independent reference fixtures", () => {
  for (const [sex, bodyweightKg, resultKg, points] of [
    ["male", 100, 1000, 608.5890719066509],
    ["male", 83, 600, 400.49965596201517],
    ["male", 59, 450, 389.77847092180028],
    ["male", 120, 800, 459.93711419658473],
    ["male", 201.9, 1000, 531.50284688898335],
    ["male", 40, 300, 400.62685988615941],
    ["female", 60, 500, 557.44343764652522],
    ["female", 52, 350, 436.32294630055293],
    ["female", 72, 420, 409.93681553610023],
    ["female", 26.51, 200, 335.48403722341131],
    ["female", 154.53, 550, 422.48207322760126],
    ["female", 100, 1000, 832.58331673682278],
  ] as const) {
    const result = score("wilks", { ...base, sex, bodyweightKg, resultKg });
    near(result.points, points, 1e-8);
    assert.equal(result.bodyweightWasClamped, false);
  }
});

test("Wilks and DOTS use the coefficient at the nearest published boundary", () => {
  for (const [formula, sex, entered, boundary] of [
    ["wilks", "male", 35, 40], ["wilks", "male", 230, 201.9],
    ["wilks", "female", 20, 26.51], ["wilks", "female", 170, 154.53],
    ["dots", "male", 35, 40], ["dots", "male", 240, 210],
    ["dots", "female", 35, 40], ["dots", "female", 160, 150],
  ] as const) {
    const clamped = score(formula, { ...base, sex, bodyweightKg: entered });
    const edge = score(formula, { ...base, sex, bodyweightKg: boundary });
    near(clamped.points, edge.points);
    assert.equal(clamped.formulaWeightKg, boundary);
    assert.equal(clamped.bodyweightWasClamped, true);
  }
  // The women's DOTS ceiling must not be applied to the men's curve.
  assert.equal(dotsCoefficient("male", 160).formulaWeightKg, 160);
  assert.equal(wilksCoefficient("male", 160).formulaWeightKg, 160);
});

// Fixtures shared with brolic.app's DOTS calculator, evaluated with Python
// Decimal from https://kraftsport-colonia.de/dots.
test("DOTS matches independent reference fixtures", () => {
  for (const [sex, bodyweightKg, resultKg, points] of [
    ["male", 83, 500, 337.54368782723394],
    ["female", 60, 400, 443.4182498659204],
    ["male", 100, 600, 369.30945873576098],
    ["female", 75, 450, 438.28996298617522],
  ] as const) {
    near(score("dots", { ...base, sex, bodyweightKg, resultKg }).points, points);
  }
});

test("every formula rejects missing or impossible weights", () => {
  for (const formula of ["ipfgl", "dots", "wilks"] as Formula[]) {
    assert.throws(() => score(formula, { ...base, bodyweightKg: 0 }), /bodyweight/);
    assert.throws(() => score(formula, { ...base, resultKg: Number.NaN }), /total/);
    assert.throws(() => score(formula, { ...base, lift: "bench", resultKg: -5 }), /bench press/);
  }
});

test("the result to pass is the smallest loadable step that scores strictly more", () => {
  for (const formula of ["ipfgl", "dots", "wilks"] as Formula[]) {
    for (const incrementKg of [2.5, 0.5, 5 * KG_PER_LB]) {
      const rival = score(formula, { ...base, bodyweightKg: 93, resultKg: 650 });
      const needed = resultToPass(formula, { ...base, targetPoints: rival.points, incrementKg });
      const steps = needed.resultKg / incrementKg;
      near(steps, Math.round(steps));
      assert.ok(needed.points > rival.points);
      near(needed.points, score(formula, { ...base, resultKg: needed.resultKg }).points);
      const oneStepLess = score(formula, { ...base, resultKg: needed.resultKg - incrementKg }).points;
      assert.ok(oneStepLess <= rival.points);
    }
  }
});

test("matching a rival's exact score is a tie, so the result to pass is one step more", () => {
  // Same bodyweight, same total: the rival's score is matched exactly at 600 kg.
  const rival = score("dots", base);
  const needed = resultToPass("dots", { ...base, targetPoints: rival.points, incrementKg: 2.5 });
  assert.equal(needed.resultKg, 602.5);
});
