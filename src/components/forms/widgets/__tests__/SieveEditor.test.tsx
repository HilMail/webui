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

  it('supports dry-read lock, unified diff preview, snippet copying, and live syntax check status bar', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    const baseline = 'require ["log"];\nif size :over 5M {\n  keep;\n}';
    const modified = 'require ["log"];\nif size :over 10M {\n  reject "too big";';

    const { rerender } = render(<SieveEditor value={baseline} baselineValue={baseline} />);

    // Clean baseline starts editable, reports Syntax OK, matches saved state, and hides Diff until edited.
    expect(screen.getByText('Syntax OK')).toBeInTheDocument();
    expect(screen.getByText('Matches saved')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Diff/i })).not.toBeInTheDocument();
    expect(document.querySelector('.cm-content')?.getAttribute('contenteditable')).toBe('true');

    // Dry-read lock puts CodeMirror in read-only mode so inspecting rules cannot accidentally edit them.
    const dryReadButton = screen.getByRole('button', { name: 'Dry-read' });
    fireEvent.click(dryReadButton);
    expect(dryReadButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Dry-read lock')).toBeInTheDocument();
    expect(document.querySelector('.cm-content')?.getAttribute('contenteditable')).toBe('false');

    // Snippets menu copies a policy snippet without mutating the active buffer.
    fireEvent.click(screen.getByRole('button', { name: 'Snippets' }));
    fireEvent.click(screen.getByRole('button', { name: /Sender domain guard/i }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('if envelope :domain :is "from" "example.com" {\n  keep;\n}');
    });

    // Updating the draft against baseline reveals Diff (+2/-3) and reports unclosed brace errors in the status bar.
    rerender(<SieveEditor value={modified} baselineValue={baseline} />);
    expect(screen.getByText('Unclosed "{" on line 2 (missing "}")')).toBeInTheDocument();
    expect(screen.getByText('Modified (+2 / -3)')).toBeInTheDocument();

    const diffButton = screen.getByRole('button', { name: /Diff \(\+2\/-3\)/i });
    fireEvent.click(diffButton);
    const diffRegion = screen.getByRole('region', { name: 'Sieve policy diff' });
    expect(diffRegion).toHaveTextContent('if size :over 5M {');
    expect(diffRegion).toHaveTextContent('if size :over 10M {');
    expect(diffRegion).toHaveTextContent('reject "too big";');
  });

  it('wires FormProvider baseline into SieveWidget for pre-save diff tracking', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <FormProvider schema={MINIMAL_SCHEMA} baseline={{ script: 'keep;' }}>
          <SieveWidget
            type={{ type: 'string', format: 'sieve' }}
            field={{ description: '', type: { type: 'string', format: 'sieve' }, update: 'mutable' }}
            formField={{ name: 'script', label: 'Script' }}
            value={'reject "blocked";'}
            onChange={vi.fn()}
            readOnly={false}
            control={{ id: 'sieve-baseline-field' }}
          />
        </FormProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Diff \(\+1\/-1\)/i })).toBeInTheDocument();
    });
  });
});
