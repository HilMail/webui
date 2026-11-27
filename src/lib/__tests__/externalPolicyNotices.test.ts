/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { describe, expect, it } from 'vitest';

import { getExternalPolicyFieldNotice } from '@/lib/externalPolicyNotices';

describe('getExternalPolicyFieldNotice', () => {
  it('returns null when no external directory is active', () => {
    expect(getExternalPolicyFieldNotice('x:Account/User', 'aliases', false)).toBeNull();
    expect(getExternalPolicyFieldNotice('x:Account/User', 'quotas', false)).toBeNull();
    expect(getExternalPolicyFieldNotice('x:Domain', 'allowRelaying', false)).toBeNull();
  });

  it('returns HilMail sync notices for managed account and domain policy fields', () => {
    expect(getExternalPolicyFieldNotice('x:Account/User', 'aliases', true)?.titleKey).toBe('form.hilmailAliasesTitle');
    expect(getExternalPolicyFieldNotice('x:Account/User', 'quotas', true)?.titleKey).toBe('form.hilmailQuotasTitle');

    for (const field of [
      'enable',
      'allowRelaying',
      'subAddressing',
      'catchAllAddress',
      'dkimManagement',
      'dnsManagement',
    ]) {
      expect(getExternalPolicyFieldNotice('x:Domain', field, true)?.titleKey).toBe('form.hilmailDomainFieldTitle');
    }
  });

  it('ignores non-synced fields and unrelated forms', () => {
    expect(getExternalPolicyFieldNotice('x:Account/User', 'roles', true)).toBeNull();
    expect(getExternalPolicyFieldNotice('x:Domain', 'description', true)).toBeNull();
    expect(getExternalPolicyFieldNotice('x:Role', 'name', true)).toBeNull();
  });
});
