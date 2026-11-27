/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
// Initialize i18next singleton once before tests render localized components.
import '@/i18n';

// Provide a minimal matchMedia shim in jsdom for responsive hooks such as DynamicForm's wide-layout listener.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// Provide minimal Range layout shims in jsdom so CodeMirror 6 can mount and measure text lines cleanly.
if (typeof Range !== 'undefined') {
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () =>
      ({
        length: 0,
        item: () => null,
        [Symbol.iterator]: function* () {},
      }) as DOMRectList;
  }
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0);
  }
}

// Provide minimal pointer/scroll shims in jsdom for Radix Select popovers during tests.
if (typeof Element !== 'undefined') {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}

// Ensure each test starts with an unmounted DOM tree when explicit globals are disabled.
afterEach(() => {
  cleanup();
});
