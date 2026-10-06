# Powerlifting score calculator

IPF GL points, DOTS and Wilks in one small, dependency-free TypeScript module,
plus a calculator widget that meet directors, federations and gyms can embed
on their own sites for free.

The widget answers two questions:

- **What is this lift worth?** IPF GL, DOTS and Wilks points from bodyweight
  and a three-lift total or bench press, in kilograms or pounds, for classic
  or equipped lifting.
- **What do I need to pass someone?** The smallest total, in loadable steps
  (2.5 kg, 0.5 kg, 5 lb or 1 lb), that scores strictly more than another
  lifter at your bodyweight.

Try it at [brolic.app/tools/powerlifting-calculator](https://brolic.app/tools/powerlifting-calculator/).

## Embed it on your site

Paste this where the calculator should appear. It resizes to fit its content:

```html
<div class="brolic-powerlifting-calculator"></div>
<p><a href="https://brolic.app/tools/powerlifting-calculator/">Powerlifting calculator</a> by Brolic</p>
<script src="https://brolic.app/embed/powerlifting-calculator.js" async></script>
```

If your site builder does not allow scripts (Google Sites, some Squarespace
blocks), use the frame on its own:

```html
<iframe src="https://brolic.app/embed/powerlifting-calculator/" title="Powerlifting score calculator: IPF GL, DOTS and Wilks" width="100%" height="780" style="border:0;max-width:680px" loading="lazy"></iframe>
<p><a href="https://brolic.app/tools/powerlifting-calculator/">Powerlifting calculator</a> by Brolic</p>
```

Options, as `data-` attributes on the `div` or query parameters on the frame:

| Option | Values | Default |
| --- | --- | --- |
| `unit` | `kg`, `lb` | `kg` |
| `theme` | `light`, `dark`, `auto` (follows the visitor's system setting) | `light` |
| `score` | `dots`, `ipfgl`, `wilks`: the score the "total to pass" section starts on | `dots` |

The hosted calculator sets no cookies and loads no analytics. Every
calculation runs in the visitor's browser.

## Use the formulas in your own code

```ts
import { score, resultToPass } from "./src/scores.ts";

const lifter = { sex: "male", equipment: "classic", lift: "total", bodyweightKg: 83, resultKg: 600 } as const;
score("ipfgl", lifter).points; // 83.0562
score("dots", lifter).points;  // 405.05…

// The smallest total, in 2.5 kg steps, that beats 420 DOTS at 83 kg.
resultToPass("dots", { ...lifter, targetPoints: 420, incrementKg: 2.5 }).resultKg; // 622.5
```

Everything is in kilograms; multiply pounds by `KG_PER_LB` (0.45359237).
`score` throws a `RangeError` with a readable message when a score is not
defined, such as IPF GL below its minimum bodyweight.

To mount the widget yourself instead of using the hosted frame, build it and
load `dist/widget.js` and `dist/widget.css`:

```ts
import { mountPowerliftingCalculator } from "./dist/widget.js";
mountPowerliftingCalculator(document.querySelector("#calculator"), { unit: "lb", theme: "auto" });
```

## The formulas

| Score | Formula | Bodyweight rule | Source |
| --- | --- | --- | --- |
| IPF GL | Result × 100 ÷ (A − B·e^(−C·Bwt)), with A, B, C for each sex, classic or equipped, and total or bench | Defined from 40 kg for men and 35 kg for women; no upper limit | [IPF GL Coefficients (2020)](https://www.powerlifting.sport/fileadmin/ipf/data/ipf-formula/IPF_GL_Coefficients-2020.pdf), still listed as current on the [IPF formula page](https://www.powerlifting.sport/rules/codes/info/ipf-formula) |
| DOTS | Total × 500 ÷ (aW⁴ + bW³ + cW² + dW + e) | 40–210 kg (men), 40–150 kg (women); outside the range, the boundary coefficient | [Tim Konertz](https://kraftsport-colonia.de/dots), [USA Powerlifting](https://www.usapowerlifting.com/pro) |
| Wilks | Total × 500 ÷ (a + bW + cW² + dW³ + eW⁴ + fW⁵) | 40–201.9 kg (men), 26.51–154.53 kg (women); outside the range, the boundary coefficient | [OpenPowerlifting](https://gitlab.com/openpowerlifting/opl-data/-/blob/main/crates/coefficients/src/wilks.rs) |

Notes:

- **IPF GL rounding.** The coefficient is rounded to six decimals before it is
  multiplied by the result, exactly as the IPF's championship workbook
  (`Championships-IPF-GL.xlsm` on the formula page) does. Points keep full
  precision; the widget shows two decimals.
- **Wilks 2020 is not included.** Its author published coefficient tables but
  not the formula behind them, and said they could change. The original Wilks
  formula is still what most federations mean by "Wilks".
- **Bench-only DOTS and Wilks.** Each has one curve, designed for three-lift
  totals. The widget applies it to a bench result and says so.

## Tests

```sh
npm install
npm run verify   # typecheck, tests, build
```

The tests check IPF GL against every example row in the IPF's own workbook and
two published championship results, and DOTS and Wilks against values computed
independently at 40-digit precision. They need Node 24 or later, which runs
TypeScript tests directly.

## License

MIT. Made by [Brolic](https://brolic.app), the iPhone app for food, training
and protocols. Corrections are welcome: open an issue with a source.
