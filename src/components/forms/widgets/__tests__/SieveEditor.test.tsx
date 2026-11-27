/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FormProvider } from '@/components/forms/FormProvider';
import { BlobWidget } from '@/components/forms/widgets/BlobWidget';
import { SieveEditor } from '@/components/forms/widgets/SieveEditor';
import { SieveValue, SieveWidget } from '@/components/forms/widgets/StringWidgets';
import type { Schema } from '@/types/schema';

vi.mock('@/data/objects', () => ({
  useBlobText: (blobId: string | null) => ({
    data: blobId === 'blob-1' ? '# hilmail-data-guard\nif size :over 10M { reject; }' : undefined,
    isPending: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

const MINIMAL_SCHEMA: Schema = {
  objects: {},
  schemas: {},
  fields: {},
  forms: {},
  lists: {},
  enums: {},
  dashboards: [],
  layouts: [],
};

describe('SieveEditor and Sieve field widgets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mounts CodeMirror with line count, copy action, word wrap toggle, and read-only indicator', () => {
    const script = '# hilmail-reputation-sender-guard\nrequire ["log"];\nkeep;';
    render(<SieveEditor value={script} readOnly id="sieve-input" />);

    expect(screen.getByText('SIEVE')).toBeInTheDocument();
    expect(screen.getByText('3 lines')).toBeInTheDocument();
    expect(screen.getByText('Read-only')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sieve script/i })).toBeInTheDocument();

    const editor = document.querySelector('.cm-content');
    expect(editor).toBeTruthy();
    expect(editor?.textContent).toContain('# hilmail-reputation-sender-guard');
    expect(editor?.getAttribute('contenteditable')).toBe('false');

    const wrapButton = screen.getByRole('button', { name: 'Wrap' });
    expect(wrapButton).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(wrapButton);
    expect(wrapButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders editable CodeMirror Sieve editor in SieveWidget, SieveValue, and sieve-formatted BlobWidget', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onChange = vi.fn();

    render(
      <QueryClientProvider client={client}>
        <FormProvider schema={MINIMAL_SCHEMA} recordLabel="hilmail-data-guard">
          <SieveWidget
            type={{ type: 'string', format: 'sieve' }}
            field={{ description: '', type: { type: 'string', format: 'sieve' }, update: 'mutable' }}
            formField={{ name: 'script', label: 'Script' }}
            value={'require ["variables"];\nkeep;'}
            onChange={onChange}
            readOnly={false}
            control={{ id: 'script-field' }}
          />
          <SieveValue value="stop;" />
          <BlobWidget
            type={{ type: 'blobId', format: 'sieve' }}
            field={{ description: '', type: { type: 'blobId', format: 'sieve' }, update: 'mutable' }}
            formField={{ name: 'content', label: 'Content' }}
            value="blob-1"
            onChange={onChange}
            readOnly={false}
            control={{ id: 'blob-field' }}
          />
        </FormProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      const editors = Array.from(document.querySelectorAll('.cm-content')).map((el) => el.textContent ?? '');
      expect(editors.some((text) => text.includes('require ["variables"];'))).toBe(true);
      expect(editors.some((text) => text.includes('stop;'))).toBe(true);
      expect(editors.some((text) => text.includes('# hilmail-data-guard'))).toBe(true);
    });
  });
});
