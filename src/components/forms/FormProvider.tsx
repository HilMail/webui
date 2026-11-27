/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { useId, type ReactNode } from 'react';
import { useIsCommunity } from '@/hooks/usePermissions';
import {
  FieldScopeContext,
  FormContext,
  useFieldScope,
  type FieldScope,
  type FormContextValue,
  type FormMode,
} from '@/components/forms/formContext';
import type { Schema } from '@/types/schema';

interface FormProviderProps {
  schema: Schema;
  viewName?: string;
  mode?: FormMode;
  readOnly?: boolean;
  hideEnterprise?: boolean;
  recordLabel?: string;
  baseline?: unknown;
  tenantId?: string | null;
  // This is supplied only for externally provisioned accounts so child field rows can apply selective locks.
  isExternalAccount?: boolean;
  // Signals that an external directory is configured so field rows can surface HilMail sync guardrails.
  hasExternalDirectory?: boolean;
  children: ReactNode;
}

export function FormProvider({
  schema,
  viewName = '',
  mode = 'edit',
  readOnly = false,
  hideEnterprise = false,
  recordLabel = '',
  baseline = null,
  tenantId = null,
  isExternalAccount = false,
  hasExternalDirectory = false,
  children,
}: FormProviderProps) {
  const isCommunity = useIsCommunity();
  const idPrefix = `f${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const value: FormContextValue = {
    schema,
    viewName,
    mode,
    readOnly,
    hideEnterprise,
    isCommunity,
    idPrefix,
    recordLabel,
    baseline,
    tenantId,
    isExternalAccount,
    hasExternalDirectory,
  };
  const scope: FieldScope = { path: [], readOnly };
  return (
    <FormContext.Provider value={value}>
      <FieldScopeContext.Provider value={scope}>{children}</FieldScopeContext.Provider>
    </FormContext.Provider>
  );
}

export function FieldScopeProvider({
  name,
  readOnly,
  children,
}: {
  name: string;
  readOnly: boolean;
  children: ReactNode;
}) {
  const outer = useFieldScope();
  const scope: FieldScope = { path: [...outer.path, name], readOnly };
  return <FieldScopeContext.Provider value={scope}>{children}</FieldScopeContext.Provider>;
}
