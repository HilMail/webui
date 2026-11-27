/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { filteredListSearch } from '@/components/lists/listUrlState';
import { isLinkAccessible, layoutViewFor } from '@/lib/layout';
import type { PermissionCheckers } from '@/lib/permissions';
import type { Schema } from '@/types/schema';

export const QUEUE_DELIVERY_TRACE_VIEW = 'CustomComponent/LiveDelivery';
export const QUEUE_LOG_ENTRIES_VIEW = 'x:Log';

export interface QueueRowJump {
  key: string;
  label: string;
  href: string;
}

/** Extracts clean sender and recipient addresses from an `x:QueuedMessage` row. */
export function queuedMessageAddresses(item: Record<string, unknown>): {
  sender: string | null;
  recipients: string[];
} {
  const rawSender = typeof item.returnPath === 'string' ? item.returnPath.trim() : '';
  const sender = rawSender.includes('@') ? rawSender : null;
  const rawRcpts = item.recipients;
  const recipients =
    rawRcpts && typeof rawRcpts === 'object' && !Array.isArray(rawRcpts)
      ? Object.keys(rawRcpts)
          .map((r) => r.trim())
          .filter(Boolean)
      : [];
  return { sender, recipients };
}

/**
 * Builds contextual row navigation jumps from a queued message to Delivery Trace
 * (`?target=<rcpt>`) and Log Entries (`?f.text=<address>`), gated by permissions.
 */
export function buildQueuedMessageJumps(
  item: Record<string, unknown>,
  schema: Schema,
  viewToSection: Record<string, string>,
  edition: string,
  checkers: Pick<PermissionCheckers, 'canGet' | 'hasPermission'>,
  labels: {
    traceTarget: (address: string) => string;
    logsFor: (address: string) => string;
  },
): QueueRowJump[] {
  const { sender, recipients } = queuedMessageAddresses(item);
  const jumps: QueueRowJump[] = [];

  const canTrace = isLinkAccessible(
    schema,
    QUEUE_DELIVERY_TRACE_VIEW,
    edition,
    checkers.canGet,
    checkers.hasPermission,
  );
  const canLogs = isLinkAccessible(schema, QUEUE_LOG_ENTRIES_VIEW, edition, checkers.canGet, checkers.hasPermission);

  const traceSection = viewToSection[QUEUE_DELIVERY_TRACE_VIEW];
  if (canTrace && traceSection) {
    // Limit inline trace jumps to the first 3 recipients so giant multi-recipient rows don't overflow the menu.
    for (const rcpt of recipients.slice(0, 3)) {
      jumps.push({
        key: `trace:${rcpt}`,
        label: labels.traceTarget(rcpt),
        href: `/${traceSection}/${QUEUE_DELIVERY_TRACE_VIEW}?target=${encodeURIComponent(rcpt)}`,
      });
    }
  }

  const logView = layoutViewFor(schema, viewToSection, QUEUE_LOG_ENTRIES_VIEW);
  const logSection = logView ? viewToSection[logView] : undefined;
  if (canLogs && logView && logSection) {
    const addresses = [...new Set([...(sender ? [sender] : []), ...recipients.slice(0, 2)])];
    for (const address of addresses) {
      jumps.push({
        key: `logs:${address}`,
        label: labels.logsFor(address),
        href: `/${logSection}/${logView}?${filteredListSearch('text', address)}`,
      });
    }
  }

  return jumps;
}
