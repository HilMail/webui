/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { lazy, Suspense } from 'react';
import type { SieveEditorProps } from '@/components/forms/widgets/SieveEditor';
import type { WidgetProps } from '@/components/forms/widgets/types';
import type { FieldTypeObject } from '@/types/schema';

const OtpAuthField = lazy(() =>
  import('@/components/forms/widgets/OtpAuthField').then((m) => ({ default: m.OtpAuthField })),
);

const PasskeyRegistrationField = lazy(() =>
  import('@/components/forms/widgets/PasskeyRegistrationField').then((m) => ({
    default: m.PasskeyRegistrationField,
  })),
);

// Split CodeMirror 6 into its own async chunk so non-Sieve forms do not download it eagerly.
const SieveEditorLazy = lazy(() =>
  import('@/components/forms/widgets/SieveEditor').then((m) => ({ default: m.SieveEditor })),
);

export function LazySieveEditor(props: SieveEditorProps) {
  return (
    <Suspense
      fallback={
        <pre className="min-h-[16rem] rounded-xl border border-border bg-muted p-3 font-mono text-xs text-foreground">
          {props.value}
        </pre>
      }
    >
      <SieveEditorLazy {...props} />
    </Suspense>
  );
}

export function OtpAuthWidget(props: WidgetProps<FieldTypeObject>) {
  return (
    <Suspense fallback={null}>
      <OtpAuthField {...props} />
    </Suspense>
  );
}

export function PasskeyRegistrationWidget(props: WidgetProps<FieldTypeObject>) {
  return (
    <Suspense fallback={null}>
      <PasskeyRegistrationField {...props} />
    </Suspense>
  );
}
