/**
 * A framework-free powerlifting score calculator. Mount it into any element:
 *
 *   import { mountPowerliftingCalculator } from "./widget.ts";
 *   mountPowerliftingCalculator(document.querySelector("#calculator")!);
 *
 * Load widget.css alongside it. Every value is calculated in the browser;
 * nothing is sent anywhere.
 */
import {
  FORMULA_NAMES, IPF_GL_MIN_BODYWEIGHT_KG, KG_PER_LB, resultToPass, score,
  type Equipment, type Formula, type Lift, type Score, type ScoreInput, type Sex,
} from "./scores.ts";

export type Unit = "kg" | "lb";
export type Theme = "light" | "dark" | "auto" | "inherit";

/**
 * Every word the widget shows. `{name}` marks a value the widget fills in.
 * Pass a translation as `strings`; anything left out stays English.
 */
export const ENGLISH_STRINGS = {
  title: "Powerlifting score calculator",
  subtitle: "IPF GL, DOTS and original Wilks points from bodyweight and a total or bench press.",
  units: "Units",
  category: "Category",
  men: "Men",
  women: "Women",
  event: "Event",
  total: "Total",
  bench: "Bench",
  equipment: "Equipment",
  classic: "Classic",
  equipped: "Equipped",
  /** A field's label with its unit: "Bodyweight (kg)". */
  withUnit: "{label} ({unit})",
  bodyweight: "Bodyweight",
  totalResult: "Total",
  benchResult: "Bench press",
  theirBodyweight: "Their bodyweight",
  theirTotal: "Their total",
  theirBench: "Their bench press",
  score: "Score",
  loadingStep: "Loading step",
  passTitleTotal: "Total needed to pass another lifter",
  passTitleBench: "Bench press needed to pass another lifter",
  /** `{message}` is why their score could not be calculated. */
  compareTotal: "Enter their bodyweight and total to compare. {message}",
  compareBench: "Enter their bodyweight and bench press to compare. {message}",
  /** `{result}` is shown in bold; `{bodyweight}` includes its unit ("83 kg"). */
  passResult: "You need {result} at your {bodyweight} bodyweight: {points} {formula} points, against their {rivalPoints}.",
  /** `{weight}` is in kilograms. */
  clamped: "{formula} used its {weight} kg coefficient, the nearest edge of its published bodyweight range.",
  benchNote: "IPF GL has its own bench-only curves. DOTS and Wilks each have one curve, designed for three-lift totals; here it is applied to the bench result.",
  equippedNote: "Equipment changes IPF GL only. DOTS and Wilks use one curve for classic and equipped lifting.",
  attribution: "Calculator by Brolic",
  /**
   * The score module's English error messages and what to show instead. The
   * widget can show these: "Enter a bodyweight greater than 0.", "Enter a
   * total greater than 0.", "Enter a bench press greater than 0.", "IPF GL
   * points are defined from 40 kg bodyweight for men.", "IPF GL points are
   * defined from 35 kg bodyweight for women.", "Check the weights: this result
   * is too large or too small."
   */
  errors: {} as Record<string, string>,
};
export type WidgetStrings = typeof ENGLISH_STRINGS;

export type WidgetOptions = {
  unit?: Unit;
  /** "inherit" leaves the colour variables to the host page. */
  theme?: Theme;
  /** Where "Calculator by Brolic" points. Set attribution to false to hide it. */
  attributionUrl?: string;
  attribution?: boolean;
  /** The score the "total to pass" section starts on. */
  passFormula?: Formula;
  /** A BCP 47 language tag for number formatting, such as "de-DE". Defaults to "en-US". */
  locale?: string;
  /** The widget's words in another language; see ENGLISH_STRINGS. */
  strings?: Partial<WidgetStrings>;
};

const FORMULAS: Formula[] = ["ipfgl", "dots", "wilks"];
const INCREMENTS: Record<Unit, number[]> = { kg: [2.5, 0.5], lb: [5, 1] };
const DEFAULT_ATTRIBUTION_URL = "https://brolic.app/tools/powerlifting-calculator/";

type Entry = { text: string; unit: Unit };
type Field = "bodyweight" | "result" | "rivalBodyweight" | "rivalResult";

let instances = 0;

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K, className?: string, text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Append children one at a time. Element.append would do, but some host
 * projects' type definitions (Cloudflare's Workers types) redefine it.
 */
function add(parent: Node, ...children: Node[]) {
  for (const child of children) parent.appendChild(child);
}

/** Replace each `{name}` in a template with its value. */
function fill(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => values[name] ?? match);
}

function parse(text: string) {
  const value = Number(text.trim());
  return text.trim() === "" ? Number.NaN : value;
}

function toKg(entry: Entry) {
  return parse(entry.text) * (entry.unit === "lb" ? KG_PER_LB : 1);
}

/** Show an entry in the current unit without overwriting what was typed. */
function displayed(entry: Entry, unit: Unit) {
  if (entry.unit === unit || !Number.isFinite(parse(entry.text))) return entry.text;
  return String(Number((toKg(entry) / (unit === "lb" ? KG_PER_LB : 1)).toFixed(2)));
}

/** The message an embedded calculator sends its parent page; see loader.js. */
export const HEIGHT_MESSAGE = "brolic-powerlifting-calculator:height";

/**
 * Inside an iframe, report the calculator's height whenever it changes, so
 * loader.js can size the frame to fit. Measure the calculator itself rather
 * than the document, which never shrinks below the frame's current height.
 */
export function reportHeightToParent(target: HTMLElement) {
  if (window.parent === window) return;
  const post = () => window.parent.postMessage(
    { type: HEIGHT_MESSAGE, height: Math.ceil(target.getBoundingClientRect().height) }, "*",
  );
  new ResizeObserver(post).observe(target);
  post();
}

export function mountPowerliftingCalculator(root: HTMLElement, options: WidgetOptions = {}) {
  const id = `plc-${++instances}`;
  const text: WidgetStrings = { ...ENGLISH_STRINGS, ...options.strings };
  const locale = options.locale ?? "en-US";
  const formatPoints = (points: number) =>
    points.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatWeight = (value: number) =>
    Number(value.toFixed(2)).toLocaleString(locale, { maximumFractionDigits: 2 });
  const formatCoefficient = (value: number, digits: number) =>
    value.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false });
  const message = (error: Error) => text.errors[error.message] ?? error.message;
  const state = {
    unit: options.unit === "lb" ? "lb" as Unit : "kg" as Unit,
    sex: "male" as Sex,
    lift: "total" as Lift,
    equipment: "classic" as Equipment,
    passFormula: FORMULAS.includes(options.passFormula as Formula) ? options.passFormula as Formula : "dots",
    increment: 0,
  };
  const startUnit = state.unit;
  const start = (kg: number): Entry => ({
    text: startUnit === "lb" ? String(Math.round(kg / KG_PER_LB)) : String(kg),
    unit: startUnit,
  });
  const entries: Record<Field, Entry> = {
    bodyweight: start(83),
    result: start(600),
    rivalBodyweight: start(93),
    rivalResult: start(640),
  };
  state.increment = INCREMENTS[state.unit][0]!;

  const container = element("div", "plc");
  if (options.theme !== "inherit") container.dataset.theme = options.theme ?? "light";

  const head = element("div", "plc-head");
  add(head,
    element("p", "plc-title", text.title),
    element("p", "plc-sub", text.subtitle),
  );

  // Segmented controls ------------------------------------------------------
  const segmentUpdaters: (() => void)[] = [];
  function segmented<T extends string>(
    key: string, label: string, values: { value: T; label: string }[], read: () => T, write: (value: T) => void,
  ) {
    const group = element("div", "plc-segment");
    const labelId = `${id}-${key}`;
    const legend = element("span", "plc-label", label);
    legend.id = labelId;
    const buttons = element("div", "plc-segment-buttons");
    buttons.setAttribute("role", "group");
    buttons.setAttribute("aria-labelledby", labelId);
    for (const option of values) {
      const button = element("button", undefined, option.label);
      button.type = "button";
      button.addEventListener("click", () => { write(option.value); update(); });
      add(buttons, button);
      segmentUpdaters.push(() => button.setAttribute("aria-pressed", String(read() === option.value)));
    }
    add(group, legend, buttons);
    return group;
  }

  // Number fields ------------------------------------------------------------
  const inputs = {} as Record<Field, HTMLInputElement>;
  const fieldLabels = {} as Record<Field, HTMLSpanElement>;
  function numberField(field: Field) {
    const label = element("label", "plc-field");
    const caption = element("span", "plc-label");
    const input = element("input", "plc-input");
    input.type = "number";
    input.inputMode = "decimal";
    input.min = "0";
    input.step = "any";
    input.addEventListener("input", () => {
      entries[field] = { text: input.value, unit: state.unit };
      update();
    });
    add(label, caption, input);
    inputs[field] = input;
    fieldLabels[field] = caption;
    return label;
  }

  function select<T extends string | number>(
    label: string, values: () => { value: T; label: string }[], read: () => T, write: (value: T) => void,
  ) {
    const wrapper = element("label", "plc-field");
    const control = element("select", "plc-input");
    control.addEventListener("change", () => {
      const chosen = values().find((option) => String(option.value) === control.value);
      if (chosen) { write(chosen.value); update(); }
    });
    add(wrapper, element("span", "plc-label", label), control);
    const refresh = () => {
      const options = values();
      control.replaceChildren(...options.map((option) => {
        const node = element("option", undefined, option.label);
        node.value = String(option.value);
        return node;
      }));
      control.value = String(read());
    };
    return { wrapper, refresh };
  }

  const controls = element("div", "plc-grid");
  add(controls,
    segmented("units", text.units, [{ value: "kg", label: "kg" }, { value: "lb", label: "lb" }],
      () => state.unit, (unit) => {
        if (unit !== state.unit) state.increment = INCREMENTS[unit][0]!;
        state.unit = unit;
      }),
    segmented("category", text.category, [{ value: "male", label: text.men }, { value: "female", label: text.women }],
      () => state.sex, (sex) => { state.sex = sex; }),
    segmented("event", text.event, [{ value: "total", label: text.total }, { value: "bench", label: text.bench }],
      () => state.lift, (lift) => { state.lift = lift; }),
    segmented("equipment", text.equipment, [{ value: "classic", label: text.classic }, { value: "equipped", label: text.equipped }],
      () => state.equipment, (equipment) => { state.equipment = equipment; }),
    numberField("bodyweight"),
    numberField("result"),
  );

  // Scores --------------------------------------------------------------------
  const scoresRow = element("div", "plc-scores");
  scoresRow.setAttribute("aria-live", "polite");
  const scoreCells = {} as Record<Formula, { value: HTMLSpanElement; meta: HTMLSpanElement }>;
  for (const formula of FORMULAS) {
    const cell = element("div", "plc-score");
    const value = element("span", "plc-score-value", "—");
    const meta = element("span", "plc-score-meta");
    // Formula names are English names in every language; lang keeps their capitals
    // right on pages whose language uppercases differently (Turkish "WİLKS").
    const name = element("span", "plc-score-name", FORMULA_NAMES[formula]);
    name.lang = "en";
    add(cell, name, value, meta);
    add(scoresRow, cell);
    scoreCells[formula] = { value, meta };
  }
  const notes = element("ul", "plc-notes");

  // Total to pass -------------------------------------------------------------
  const pass = element("div", "plc-pass");
  const passTitle = element("p", "plc-pass-title");
  const formulaSelect = select(text.score, () => FORMULAS.map((value) => ({ value, label: FORMULA_NAMES[value] })),
    () => state.passFormula, (value) => { state.passFormula = value; });
  const incrementSelect = select(text.loadingStep, () => INCREMENTS[state.unit].map((value) => ({ value, label: `${formatWeight(value)} ${state.unit}` })),
    () => state.increment, (value) => { state.increment = value; });
  const passGrid = element("div", "plc-grid");
  add(passGrid, formulaSelect.wrapper, incrementSelect.wrapper, numberField("rivalBodyweight"), numberField("rivalResult"));
  const passResult = element("p", "plc-pass-result");
  passResult.setAttribute("aria-live", "polite");
  add(pass, passTitle, passGrid, passResult);

  add(container, head, controls, scoresRow, notes, pass);

  if (options.attribution !== false) {
    const foot = element("p", "plc-foot");
    const link = element("a", undefined, text.attribution);
    link.href = options.attributionUrl ?? DEFAULT_ATTRIBUTION_URL;
    link.target = "_blank";
    link.rel = "noopener";
    add(foot, link);
    add(container, foot);
  }

  root.replaceChildren(container);

  function scoreInput(bodyweight: Entry, result: Entry): ScoreInput {
    return {
      sex: state.sex, equipment: state.equipment, lift: state.lift,
      bodyweightKg: toKg(bodyweight), resultKg: toKg(result),
    };
  }

  function tryScore(formula: Formula, input: ScoreInput): Score | Error {
    try { return score(formula, input); } catch (error) { return error as Error; }
  }

  function update() {
    for (const refresh of segmentUpdaters) refresh();
    formulaSelect.refresh();
    incrementSelect.refresh();
    const bench = state.lift === "bench";
    const labels: Record<Field, string> = {
      bodyweight: text.bodyweight, result: bench ? text.benchResult : text.totalResult,
      rivalBodyweight: text.theirBodyweight, rivalResult: bench ? text.theirBench : text.theirTotal,
    };
    for (const field of Object.keys(entries) as Field[]) {
      fieldLabels[field].textContent = fill(text.withUnit, { label: labels[field], unit: state.unit });
      const shown = displayed(entries[field], state.unit);
      // Never rewrite the field being typed in; that would move the caret.
      if (document.activeElement !== inputs[field] || entries[field].unit !== state.unit) inputs[field].value = shown;
    }

    const messages = new Set<string>();
    const input = scoreInput(entries.bodyweight, entries.result);
    for (const formula of FORMULAS) {
      const result = tryScore(formula, input);
      const cell = scoreCells[formula];
      if (result instanceof Error) {
        cell.value.textContent = "—";
        cell.meta.textContent = "";
        messages.add(message(result));
        continue;
      }
      cell.value.textContent = formatPoints(result.points);
      cell.meta.textContent = `× ${formatCoefficient(result.coefficient, formula === "ipfgl" ? 6 : 4)}`;
      if (result.bodyweightWasClamped)
        messages.add(fill(text.clamped, { formula: FORMULA_NAMES[formula], weight: formatWeight(result.formulaWeightKg) }));
    }
    if (bench) messages.add(text.benchNote);
    else if (state.equipment === "equipped") messages.add(text.equippedNote);
    notes.replaceChildren(...[...messages].map((message) => element("li", undefined, message)));

    passTitle.textContent = bench ? text.passTitleBench : text.passTitleTotal;
    const formula = state.passFormula;
    const rival = tryScore(formula, scoreInput(entries.rivalBodyweight, entries.rivalResult));
    if (rival instanceof Error) {
      passResult.textContent = fill(bench ? text.compareBench : text.compareTotal, { message: message(rival) });
      return;
    }
    const bodyweightKg = toKg(entries.bodyweight);
    try {
      const unitKg = state.unit === "lb" ? KG_PER_LB : 1;
      const needed = resultToPass(formula, {
        sex: state.sex, equipment: state.equipment, lift: state.lift, bodyweightKg,
        targetPoints: rival.points, incrementKg: state.increment * unitKg,
      });
      const strong = element("strong", undefined, `${formatWeight(needed.resultKg / unitKg)} ${state.unit}`);
      // The sentence around the bold result, in the template's own word order.
      const [before = "", after = ""] = fill(text.passResult, {
        bodyweight: `${formatWeight(bodyweightKg / unitKg)} ${state.unit}`,
        points: formatPoints(needed.points),
        formula: FORMULA_NAMES[formula],
        rivalPoints: formatPoints(rival.points),
      }).split("{result}");
      passResult.replaceChildren(before, strong, after);
    } catch (error) {
      passResult.textContent = message(error as Error);
    }
  }

  update();
  return {
    destroy() { root.replaceChildren(); },
  };
}
