# quant-unit-guard

Your volatility is 2. Two what?

Explicit units and sanity checks for quant inputs. A small TypeScript library and offline CLI that refuses to guess whether you meant percent, decimal, daily or annual.

**Status:** unpublished 0.1.0 candidate. No live-market validation or adoption claim. Node 18+; ESM only; no runtime dependencies or network calls.

## Run from a reviewed checkout

```sh
npm ci
npm run build
npm test
node dist/cli.js --help
```

After npm publication: `npx quant-unit-guard --help` or `npm install quant-unit-guard`.

## Convert explicitly

```ts
import { convertMoment, convertCovariance, assertVolCovariance } from 'quant-unit-guard';

const dailyVol = { value: 2, kind: 'volatility', period: 'daily', scale: 'percent' } as const;
const annualVol = convertMoment(dailyVol, {
  period: 'annual', scale: 'decimal', observationsPerYear: 252
}); // value ≈ 0.31749, or 31.75% annual volatility

const dailyCov = {
  values: [[0.0004, 0.00036], [0.00036, 0.0009]],
  period: 'daily', scale: 'decimal'
} as const;
// For mutable matrix typings, pass a number[][] rather than a readonly tuple.
const cov = { ...dailyCov, values: dailyCov.values.map(row => [...row]) };
assertVolCovariance([
  { value: 0.02, kind: 'volatility', period: 'daily', scale: 'decimal' },
  { value: 0.03, kind: 'volatility', period: 'daily', scale: 'decimal' }
], cov);
const annualCov = convertCovariance(cov, {
  period: 'annual', scale: 'decimal', observationsPerYear: 252
});
```

Changing periods requires an explicit positive `observationsPerYear`. There is no hidden 252 default. A same-period conversion does not require a frequency.

| Input | Period scaling | Percent to decimal |
| --- | --- | --- |
| Volatility (standard deviation) | square root of time factor | divide by 100 |
| Mean log return | time factor | divide by 100 |
| Covariance | time factor | divide by 10,000 |

`logMean` means the mean of log returns. Arithmetic expected returns, price drift and mean log returns are not interchangeable. This package does not convert between them or insert a half-variance drift correction.

## CLI

Input can be a file or stdin (`-`). Convert exactly one moment or covariance per command:

```sh
printf '%s' '{"moment":{"value":2,"kind":"volatility","period":"daily","scale":"percent"},"target":{"period":"annual","scale":"decimal","observationsPerYear":252}}' | node dist/cli.js convert -
```

Validate a moment, a covariance, or both. Add `volatilities` to cross-check covariance diagonal and units:

```json
{
  "covariance": {"values": [[0.0004]], "period": "daily", "scale": "decimal"},
  "volatilities": [{"value": 0.02, "kind": "volatility", "period": "daily", "scale": "decimal"}]
}
```

`node dist/cli.js validate input.json` prints `{"valid":true}` on success. Errors go to stderr as JSON and exit 1. The library throws `UnitError`.

## What it checks

- Required unit labels and finite numbers; numeric strings are rejected.
- Nonnegative volatility and covariance variance diagonals.
- Square, symmetric, positive-semidefinite covariance, including singular matrices.
- Volatility squared agrees with the covariance diagonal, in identical units and asset order.
- Overflow during conversion.

Covariance validation supports 1-256 assets. Symmetry and PSD checks use a default `1e-10` tolerance relative to the largest absolute matrix entry. Volatility/diagonal agreement defaults to `1e-8` relative tolerance. Both accept a positive custom tolerance up to `1e-3`. No input matrix is repaired or mutated. Numerical tolerance can accept tiny violations, and ill-conditioned matrices can be rejected.

## Real limits

- Correct labels are the caller's responsibility. A decimal volatility of `2` is valid (200%); the library cannot know you secretly meant 2%.
- Time scaling assumes stationary, uncorrelated increments with finite variance. It is not generally valid for serial correlation or regime changes.
- `daily` means one observation period in your supplied frequency. No exchange calendars, weekends, sessions or holiday rules are inferred.
- The package checks inputs, not your simulation. It cannot see a later double-vol multiplication or a wrong Euler implementation.
- Matching diagonals do not prove asset ordering or off-diagonal correlations are correct. Supply all inputs in identical asset order.
- Uses JavaScript floating-point arithmetic. Not an exact-money/decimal library, risk model, forecasting engine or trading safeguard.
- No bps, monthly periods, arithmetic-return conversion, data fetching or order placement in v0.1.

## Release discipline

Tests cover explicit scaling, round trips, invalid metadata, singular/indefinite covariance, seeded Gram matrices, mismatch detection, overflow and CLI errors. Build and offline tests are reproducible; no provider credentials are needed.

Main-branch merge and npm publication require the owner's go-ahead. Publish from reviewed merged main with `npm publish --access public`; `prepublishOnly` rebuilds and tests. Package contents exclude tests, source and credentials. MIT.
