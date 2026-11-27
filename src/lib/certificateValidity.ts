/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

/** Certificates expiring within this window count as "expiring soon". */
export const CERT_EXPIRING_SOON_MS = 30 * 24 * 60 * 60 * 1000;

export type CertificateValidity = 'valid' | 'expiringSoon' | 'expired';

/**
 * Classifies a TLS certificate from its `notValidAfter` wire property.
 * Missing or unparseable dates are treated conservatively as expired.
 */
export function certificateValidity(notValidAfter: unknown, now: number = Date.now()): CertificateValidity {
  if (typeof notValidAfter !== 'string') return 'expired';
  const expiry = Date.parse(notValidAfter);
  if (!Number.isFinite(expiry) || expiry <= now) return 'expired';
  if (expiry - now <= CERT_EXPIRING_SOON_MS) return 'expiringSoon';
  return 'valid';
}

/**
 * Returns the expiry timestamp in ms for sorting; missing/invalid values sort first as `-1`.
 */
export function certificateExpiryMs(notValidAfter: unknown): number {
  if (typeof notValidAfter !== 'string') return -1;
  const expiry = Date.parse(notValidAfter);
  return Number.isFinite(expiry) ? expiry : -1;
}
