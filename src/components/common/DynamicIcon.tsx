/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { createElement } from 'react';
import {
  Circle,
  HeartPulseIcon,
  KeyIcon,
  LockKeyholeIcon,
  MailsIcon,
  PanelsTopLeftIcon,
  ShieldIcon,
  UsersRoundIcon,
  type LucideIcon,
} from 'lucide-react';
import { ICONS } from '@/components/common/icons.generated';

const warned = new Set<string>();

// Keep icons needed by client-only Overview/Diagnostics pages out of generated schema icon manifests.
const EXTRA_ICONS: Readonly<Record<string, LucideIcon>> = {
  'heart-pulse': HeartPulseIcon,
  'panels-top-left': PanelsTopLeftIcon,
  'users-round': UsersRoundIcon,
  shield: ShieldIcon,
  mails: MailsIcon,
  key: KeyIcon,
  'file-lock': LockKeyholeIcon,
};

function iconKey(name: string): string {
  const trimmed = name.trim();
  if (!/[A-Z]/.test(trimmed)) return trimmed;
  return trimmed.replace(/([a-z])([A-Z0-9])/g, '$1-$2').toLowerCase();
}

interface DynamicIconProps {
  name: string;
  className?: string;
  fallback?: LucideIcon;
}

export function DynamicIcon({ name, className, fallback = Circle }: DynamicIconProps) {
  const key = iconKey(name);
  const icon = Object.hasOwn(ICONS, key) ? ICONS[key] : Object.hasOwn(EXTRA_ICONS, key) ? EXTRA_ICONS[key] : undefined;
  if (!icon && import.meta.env.DEV && !warned.has(key)) {
    warned.add(key);
    console.warn(`Unknown icon name "${name}": run npm run generate:icons after schema changes`);
  }
  return createElement(icon ?? fallback, { 'aria-hidden': true, className });
}
