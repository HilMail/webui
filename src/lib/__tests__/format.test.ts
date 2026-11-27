/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { afterEach, describe, expect, it } from 'vitest';

import { formatDateTime, formatLocalTime, formatTime, localeClock } from '@/lib/format';
import { DEFAULT_LOCALE, useAccountStore } from '@/stores/accountStore';

describe('12-hour AM/PM time formatting', () => {
  afterEach(() => {
    useAccountStore.setState({ locale: DEFAULT_LOCALE });
  });

  it('formats UTC datetimes, times, and local times in AM/PM format even under 24-hour default locales', () => {
    // en-GB defaults to 24-hour clocks in Intl unless hour12 is forced.
    useAccountStore.setState({ locale: 'en-GB' });

    const isoEvening = new Date(2026, 10, 27, 20, 51, 9).toISOString();
    const mediumDateTime = formatDateTime(isoEvening, 'medium');
    expect(mediumDateTime).toMatch(/8:51:09\s*(?:pm|PM)/);
    expect(mediumDateTime).not.toContain('20:51:09');

    const timeWithSeconds = formatTime(isoEvening, { seconds: true });
    expect(timeWithSeconds).toMatch(/8:51:09\s*(?:pm|PM)/);

    const localAfternoon = formatLocalTime('14:30');
    expect(localAfternoon).toMatch(/2:30\s*(?:pm|PM)/);
    expect(localAfternoon).not.toContain('14:30');

    expect(localeClock().hour12).toBe(true);
  });
});
