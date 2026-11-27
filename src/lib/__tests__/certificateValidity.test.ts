/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { describe, expect, it } from 'vitest';

import { CERT_EXPIRING_SOON_MS, certificateExpiryMs, certificateValidity } from '@/lib/certificateValidity';

describe('certificateValidity', () => {
  const now = Date.UTC(2026, 10, 1, 0, 0, 0);

  it('classifies valid, expiring soon (<=30d), expired, and missing dates consistently', () => {
    expect(certificateValidity(new Date(now + CERT_EXPIRING_SOON_MS + 86_400_000).toISOString(), now)).toBe('valid');
    expect(certificateValidity(new Date(now + 5 * 86_400_000).toISOString(), now)).toBe('expiringSoon');
    expect(certificateValidity(new Date(now - 1000).toISOString(), now)).toBe('expired');
    expect(certificateValidity(undefined, now)).toBe('expired');
    expect(certificateValidity('not-a-date', now)).toBe('expired');
  });

  it('returns sortable timestamps with invalid dates sorting first as -1', () => {
    expect(certificateExpiryMs(null)).toBe(-1);
    expect(certificateExpiryMs('invalid')).toBe(-1);
    expect(certificateExpiryMs('2026-12-01T00:00:00Z')).toBe(Date.parse('2026-12-01T00:00:00Z'));
  });
});
