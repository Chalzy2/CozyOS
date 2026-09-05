'use strict';

// CozyOS — Exact Decimal Arithmetic (Phase 5.3 Step 2)
// File Reference: server/webauthn-rp/decimal-math.js
//
// WHY THIS FILE EXISTS
// ---------------------
// This round's own instructions are explicit: "Do not build
// cryptoAmount = fiatAmount / rate using ordinary floating-point values
// and then trust the result financially." JavaScript's Number type
// cannot represent most decimal fractions exactly (0.1 + 0.2 !== 0.3),
// which is unacceptable for a currency conversion. Every function here
// operates on BigInt and decimal STRINGS only — never a float — so a
// conversion result is exact by construction, not "close enough."
//
// REPRESENTATION
//   - A "decimal string" is /^\d+(\.\d+)?$/ — e.g. "0.0077", "100",
//     "1.5". Parsed into an exact (numerator, denominator) BigInt pair.
//   - An amount is always an integer count of the asset's smallest
//     unit (minor units for fiat, atomic units for crypto — e.g.
//     satoshis for BTC at 8 decimals, or USDT's 6-decimal atomic unit).

function assertDecimalString(value, label) {
  if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value)) {
    throw new TypeError(`[decimal-math] ${label} must be an exact decimal string matching /^\\d+(\\.\\d+)?$/ (e.g. "0.0077"), never a float. Got: ${JSON.stringify(value)}.`);
  }
}

/** parseDecimalString — "0.0077" -> { numerator: 77n, denominator: 10000n }. Exact, no floating-point intermediate step. */
function parseDecimalString(value) {
  assertDecimalString(value, 'value');
  const [intPart, fracPart = ''] = value.split('.');
  const denominator = 10n ** BigInt(fracPart.length);
  const numerator = BigInt(intPart + fracPart);
  return { numerator, denominator };
}

const ROUNDING_MODES = Object.freeze(['ROUND_DOWN', 'ROUND_UP', 'NEAREST']);

/** divideWithRounding — exact integer division of non-negative BigInts with an explicit, deterministic rounding mode. Never uses floating-point division. */
function divideWithRounding(numerator, denominator, mode) {
  if (!ROUNDING_MODES.includes(mode)) {
    throw new TypeError(`[decimal-math] rounding mode must be one of ${ROUNDING_MODES.join(', ')}.`);
  }
  const quotient = numerator / denominator; // BigInt division truncates toward zero (ROUND_DOWN for non-negative values)
  const remainder = numerator % denominator;
  if (remainder === 0n) return quotient;
  if (mode === 'ROUND_DOWN') return quotient;
  if (mode === 'ROUND_UP') return quotient + 1n;
  return remainder * 2n >= denominator ? quotient + 1n : quotient; // NEAREST: round-half-up
}

/**
 * convertAmount — the one real conversion function every quote
 * calculation goes through. Computes, EXACTLY:
 *
 *   result = baseMinorUnits * rateNumerator * 10^resultDecimals
 *            ------------------------------------------------
 *            10^baseDecimals * rateDenominator
 *
 * entirely in BigInt arithmetic — no Number division ever occurs.
 *
 * @param {bigint|number} baseMinorUnits - integer count of the base asset's minor/atomic units.
 * @param {number} baseDecimals - the base asset's decimal places (e.g. KES=2).
 * @param {string} rate - exact decimal string: quoteAsset per 1 MAJOR unit of base.
 * @param {number} resultDecimals - the quote asset's decimal places (e.g. USDT=6, BTC=8).
 * @param {string} [roundingMode='ROUND_DOWN'] - safe default for a customer-facing amount, never rounds in the customer's favor by accident.
 * @returns {bigint} exact integer atomic amount of the quote asset.
 */
function convertAmount(baseMinorUnits, baseDecimals, rate, resultDecimals, roundingMode = 'ROUND_DOWN') {
  const base = typeof baseMinorUnits === 'bigint' ? baseMinorUnits : BigInt(baseMinorUnits);
  if (base < 0n) throw new TypeError('[decimal-math] baseMinorUnits must not be negative.');
  if (!Number.isInteger(baseDecimals) || baseDecimals < 0) throw new TypeError('[decimal-math] baseDecimals must be a non-negative integer.');
  if (!Number.isInteger(resultDecimals) || resultDecimals < 0) throw new TypeError('[decimal-math] resultDecimals must be a non-negative integer.');
  const { numerator: rateNum, denominator: rateDen } = parseDecimalString(rate);
  if (rateNum <= 0n) throw new TypeError('[decimal-math] rate must be strictly positive.');

  const numerator = base * rateNum * (10n ** BigInt(resultDecimals));
  const denominator = (10n ** BigInt(baseDecimals)) * rateDen;
  return divideWithRounding(numerator, denominator, roundingMode);
}

/**
 * applyPercentageFee — exact fee amount as a percentage of
 * `atomicAmount`, e.g. feePercent="0.02" for 2%. Defaults to ROUND_UP
 * (a fee CozyOS charges should never under-collect by rounding error) —
 * the opposite default from convertAmount's customer-facing ROUND_DOWN,
 * and that asymmetry is intentional, not an inconsistency.
 */
function applyPercentageFee(atomicAmount, feePercent, roundingMode = 'ROUND_UP') {
  const amount = typeof atomicAmount === 'bigint' ? atomicAmount : BigInt(atomicAmount);
  const { numerator: feeNum, denominator: feeDen } = parseDecimalString(feePercent);
  return divideWithRounding(amount * feeNum, feeDen, roundingMode);
}

module.exports = { assertDecimalString, parseDecimalString, divideWithRounding, convertAmount, applyPercentageFee, ROUNDING_MODES };
