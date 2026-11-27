/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

export interface ExternalFieldNotice {
  titleKey: string;
  defaultTitle: string;
  descriptionKey: string;
  defaultDescription: string;
}

/**
 * Registry Domain properties continuously reconciled by HilMail API's
 * `ensure_stalwart_registry_domains` on deploy.
 */
const DOMAIN_SYNCED_FIELDS = new Set([
  'enable',
  'allowRelaying',
  'subAddressing',
  'catchAllAddress',
  'dkimManagement',
  'dnsManagement',
]);

/**
 * Returns an inline warning descriptor when a top-level form field is owned or
 * periodically overwritten by HilMail API when an external directory is active.
 */
export function getExternalPolicyFieldNotice(
  viewName: string,
  fieldName: string,
  hasExternalDirectory: boolean,
): ExternalFieldNotice | null {
  if (!hasExternalDirectory) return null;

  if (viewName === 'x:Account/User') {
    if (fieldName === 'aliases') {
      return {
        titleKey: 'form.hilmailAliasesTitle',
        defaultTitle: 'Managed by HilMail API',
        descriptionKey: 'form.hilmailAliasesDescription',
        defaultDescription:
          'Account aliases are governed by HilMail SQL and reconciled every 15 minutes. Provision or remove aliases in HilMail rather than here.',
      };
    }
    if (fieldName === 'quotas') {
      return {
        titleKey: 'form.hilmailQuotasTitle',
        defaultTitle: 'Synced by HilMail API',
        descriptionKey: 'form.hilmailQuotasDescription',
        defaultDescription:
          'Disk quota (maxDiskQuota) is overwritten by HilMail plan transitions and the daily 03:15 UTC quota sync. Manual edits here are temporary.',
      };
    }
  }

  if (viewName === 'x:Domain' && DOMAIN_SYNCED_FIELDS.has(fieldName)) {
    return {
      titleKey: 'form.hilmailDomainFieldTitle',
      defaultTitle: 'Reconciled by HilMail API',
      descriptionKey: 'form.hilmailDomainFieldDescription',
      defaultDescription:
        'HilMail enforces this domain policy setting on every release (ensure_stalwart_registry_domains). Manual changes will be reverted.',
    };
  }

  return null;
}
