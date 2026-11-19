/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { useTranslation } from 'react-i18next';
import { Info, Loader2, ShieldCheck } from 'lucide-react';
import { useJmapObject } from '@/data/objects';
import { useFormContext } from '@/components/forms/formContext';
import { ObjectIdValue } from '@/components/values/ScalarValues';
import { cn } from '@/lib/utils';

interface RoleInheritanceDescriptor {
  property: string;
  labelKey: string;
  defaultLabel: string;
}

// Schema object names may include the JMAP extension prefix, but role inheritance rules are prefix-agnostic.
function resolveRoleInheritance(objectName: string, variant: string): RoleInheritanceDescriptor | null {
  const normalizedObjectName = objectName.replace(/^x:/, '');

  if (normalizedObjectName === 'UserRoles') {
    if (variant === 'User') {
      return {
        property: 'defaultUserRoleIds',
        labelKey: 'form.inheritsDefaultUserRoles',
        defaultLabel: 'Inherited default user roles:',
      };
    }
    if (variant === 'Admin') {
      return {
        property: 'defaultAdminRoleIds',
        labelKey: 'form.inheritsDefaultAdminRoles',
        defaultLabel: 'Inherited default administrator roles:',
      };
    }
  }

  if (normalizedObjectName === 'Roles' && variant === 'Default') {
    return {
      property: 'defaultGroupRoleIds',
      labelKey: 'form.inheritsDefaultGroupRoles',
      defaultLabel: 'Inherited default group roles:',
    };
  }

  return null;
}

// JMAP map fields serialize role IDs as keys; accepting arrays keeps the display resilient to older server responses.
function extractRoleIds(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((id): id is string => typeof id === 'string');
  if (typeof raw === 'object') return Object.keys(raw);
  return [];
}

interface InheritedRoleInfoProps {
  objectName: string;
  variant: string;
  frame?: 'bare' | 'rule' | 'panel';
}

// Explain the effective server-level roles when the selected preset delegates role assignment to Authentication settings.
export function InheritedRoleInfo({ objectName, variant, frame = 'panel' }: InheritedRoleInfoProps) {
  const { t } = useTranslation();
  const { schema } = useFormContext();
  const descriptor = resolveRoleInheritance(objectName, variant);
  const { data: authentication, isLoading } = useJmapObject('x:Authentication', 'singleton');

  if (!descriptor) return null;

  const roleIds = extractRoleIds(authentication?.[descriptor.property]);

  return (
    <div
      className={cn(
        frame === 'panel' ? 'py-3' : 'py-2',
        'flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground',
      )}
      role="status"
    >
      <Info className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span>{t(descriptor.labelKey, descriptor.defaultLabel)}</span>
      {isLoading ? (
        <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
      ) : roleIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {roleIds.map((id) => (
            <ObjectIdValue key={id} schema={schema} objectName="x:Role" id={id} />
          ))}
        </div>
      ) : (
        <span className="italic">{t('form.noDefaultRolesConfigured', 'None configured')}</span>
      )}
    </div>
  );
}

// Clarify that the preset intentionally inherits permissions instead of exposing a separate editable override.
export function InheritedPermissionsInfo({ frame = 'panel' }: { frame?: 'bare' | 'rule' | 'panel' }) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(frame === 'panel' ? 'py-3' : 'py-2', 'flex items-center gap-2 text-[13px] text-muted-foreground')}
      role="status"
    >
      <ShieldCheck className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span>
        {t('form.permissionsInheritedFromRoles', 'Permissions are automatically inherited from assigned roles.')}
      </span>
    </div>
  );
}
