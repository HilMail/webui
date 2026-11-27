/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { create } from 'zustand';
import { COMMUNITY_HEALTH_VIEW_NAME } from '@/features/diagnostics/constants';
import { OVERVIEW_VIEW_NAME } from '@/features/overview/constants';
import { isLinkEnterprise, layoutViewFor } from '@/lib/layout';
import { resolveObject, resolveSchema } from '@/lib/schemaResolver';
import type { Field, LayoutItem, LayoutSubItem, Schema } from '@/types/schema';

const CLIENT_PAGE_KEYWORDS: Record<string, string[]> = {
  [OVERVIEW_VIEW_NAME]: ['overview', 'queue', 'dkim', 'certificates', 'reports', 'inventory', 'home'],
  [COMMUNITY_HEALTH_VIEW_NAME]: ['health', 'healthz', 'ready', 'prometheus', 'metrics', 'discover', 'autoconfig', 'imap', 'smtp', 'oidc'],
};

function layoutHasView(schema: Schema, viewName: string): boolean {
  const inSub = (items: LayoutSubItem[]): boolean =>
    items.some((item) => (item.type === 'link' ? item.viewName === viewName : inSub(item.items)));
  return schema.layouts.some((layout) =>
    layout.items.some((item) => ('link' in item ? item.link.viewName === viewName : inSub(item.container.items))),
  );
}

function insertLayoutLink(
  schema: Schema,
  targetLayoutIdx: number,
  link: LayoutItem,
  afterViewName?: string,
): Schema {
  const layout = schema.layouts[targetLayoutIdx];
  if (!layout) return schema;
  const anchorIdx = afterViewName
    ? layout.items.findIndex((item) => 'link' in item && item.link.viewName === afterViewName)
    : -1;
  const insertAt = anchorIdx !== -1 ? anchorIdx + 1 : 0;
  const items = [...layout.items.slice(0, insertAt), link, ...layout.items.slice(insertAt)];
  return {
    ...schema,
    layouts: schema.layouts.map((l, idx) => (idx === targetLayoutIdx ? { ...l, items } : l)),
  };
}

/**
 * Injects client-only pages (Overview and Community System Health) into sidebar layouts
 * because backend schemas do not declare frontend diagnostic views directly.
 */
function withClientNavEntries(rawSchema: Schema): Schema {
  if (rawSchema.layouts.length === 0) return rawSchema;
  let schema = rawSchema;

  if (!layoutHasView(schema, OVERVIEW_VIEW_NAME)) {
    schema = insertLayoutLink(
      schema,
      0,
      { link: { name: 'Overview', icon: 'panels-top-left', viewName: OVERVIEW_VIEW_NAME } },
      'CustomComponent/Dashboard',
    );
  }

  if (!layoutHasView(schema, COMMUNITY_HEALTH_VIEW_NAME)) {
    const troubleshootIdx = schema.layouts.findIndex((l) => /troubleshoot/i.test(l.name));
    const targetIdx = troubleshootIdx !== -1 ? troubleshootIdx : 0;
    const afterView = troubleshootIdx !== -1 ? 'CustomComponent/LiveDelivery' : OVERVIEW_VIEW_NAME;
    schema = insertLayoutLink(
      schema,
      targetIdx,
      { link: { name: 'System Health', icon: 'heart-pulse', viewName: COMMUNITY_HEALTH_VIEW_NAME } },
      afterView,
    );
  }

  return schema;
}

export interface SearchIndexEntry {
  text: string;
  type: 'link' | 'field' | 'form';
  viewName: string;
  section: string;
  breadcrumb: string;
  icon?: string;
  objectType?: 'object' | 'singleton' | 'view';
  keywords?: string[];
  // Marks entries tied to Enterprise-only objects, sections, or fields so Community Edition search can hide them.
  enterprise?: boolean;
}

interface SchemaState {
  schema: Schema | null;
  isLoaded: boolean;
  viewToSection: Record<string, string>;
  searchIndex: SearchIndexEntry[];

  setSchema: (schema: Schema) => void;
}

function walkLayouts(schema: Schema): { viewToSection: Record<string, string>; linkEntries: SearchIndexEntry[] } {
  const viewToSection: Record<string, string> = {};
  const linkEntries: SearchIndexEntry[] = [];

  function visit(items: LayoutSubItem[], sectionName: string, parentPath: string): void {
    for (const sub of items) {
      if (sub.type === 'link') {
        if (!(sub.viewName in viewToSection)) {
          viewToSection[sub.viewName] = sectionName;
        }
        linkEntries.push({
          text: sub.name,
          type: 'link',
          viewName: sub.viewName,
          section: sectionName,
          breadcrumb: `${parentPath} > ${sub.name}`,
          ...(isLinkEnterprise(schema, sub.viewName) ? { enterprise: true } : {}),
        });
      } else if (sub.type === 'container') {
        visit(sub.items, sectionName, `${parentPath} > ${sub.name}`);
      }
    }
  }

  for (const layout of schema.layouts) {
    const sectionName = layout.name;
    for (const item of layout.items) {
      if ('link' in item) {
        if (!(item.link.viewName in viewToSection)) {
          viewToSection[item.link.viewName] = sectionName;
        }
        const keywords = CLIENT_PAGE_KEYWORDS[item.link.viewName];
        linkEntries.push({
          text: item.link.name,
          type: 'link',
          viewName: item.link.viewName,
          section: sectionName,
          breadcrumb: `${sectionName} > ${item.link.name}`,
          icon: item.link.icon,
          ...(keywords ? { keywords } : {}),
          ...(isLinkEnterprise(schema, item.link.viewName) ? { enterprise: true } : {}),
        });
      } else if ('container' in item) {
        visit(item.container.items, sectionName, `${sectionName} > ${item.container.name}`);
      }
    }
  }

  return { viewToSection, linkEntries };
}

// Treat direct enterprise flags and object references to Enterprise objects (such as x:Tenant) uniformly as paid-only.
function isFieldDefEnterprise(schema: Schema, field: Field): boolean {
  if (field.enterprise) return true;
  if (field.type.type === 'objectId') {
    return Boolean(resolveObject(schema, field.type.objectName)?.enterprise);
  }
  if (field.type.type === 'set' && field.type.class.type === 'objectId') {
    return Boolean(resolveObject(schema, field.type.class.objectName)?.enterprise);
  }
  return false;
}

function isFormFieldEnterprise(schema: Schema, formKey: string, viewName: string, fieldName: string): boolean {
  const directField = schema.fields[formKey]?.properties[fieldName];
  if (directField) return isFieldDefEnterprise(schema, directField);

  const objectName = resolveObject(schema, formKey)?.objectName ?? resolveObject(schema, viewName)?.objectName;
  if (!objectName) return false;

  const resolvedSchema = resolveSchema(schema, objectName);
  if (!resolvedSchema) return false;
  if (resolvedSchema.type === 'single') {
    const field = resolvedSchema.fields.properties[fieldName];
    return field ? isFieldDefEnterprise(schema, field) : false;
  }

  const matching: Field[] = [];
  const sharedField = schema.fields[objectName]?.properties[fieldName];
  if (sharedField) matching.push(sharedField);
  for (const variant of resolvedSchema.variants) {
    const variantField = variant.fields?.properties[fieldName];
    if (variantField) matching.push(variantField);
  }
  return matching.length > 0 && matching.every((field) => isFieldDefEnterprise(schema, field));
}

function buildSearchIndex(
  schema: Schema,
  viewToSection: Record<string, string>,
  linkEntries: SearchIndexEntry[],
): SearchIndexEntry[] {
  const entries: SearchIndexEntry[] = [...linkEntries];
  const isViewEnterprise = (viewName: string) =>
    isLinkEnterprise(schema, viewName) || Boolean(resolveObject(schema, viewName)?.enterprise);

  function displayNameFor(viewName: string): string {
    const obj = schema.objects[viewName];
    if (!obj) return viewName.replace(/^x:/, '');
    let resolvedName = viewName;
    let resolvedObj = obj;
    if (obj.type === 'view') {
      const parent = schema.objects[obj.objectName];
      if (parent && parent.type !== 'view') {
        resolvedName = obj.objectName;
        resolvedObj = parent;
      }
    }
    if (resolvedObj.type === 'singleton') {
      const form = schema.forms[viewName] ?? schema.forms[resolvedName];
      if (form?.title) return form.title;
    }
    if (resolvedObj.type === 'object') {
      const list = schema.lists[viewName] ?? schema.lists[resolvedName];
      if (list?.singularName) {
        return list.singularName.charAt(0).toUpperCase() + list.singularName.slice(1);
      }
    }
    return viewName.replace(/^x:/, '');
  }

  for (const [name, obj] of Object.entries(schema.objects)) {
    if (obj.type !== 'view' && obj.description) {
      const viewName = layoutViewFor(schema, viewToSection, name);
      if (!viewName) continue;
      const section = viewToSection[viewName];
      const display = displayNameFor(viewName);
      entries.push({
        text: obj.description,
        type: 'link',
        viewName,
        section,
        breadcrumb: `${section} > ${display}`,
        objectType: obj.type,
        ...(isViewEnterprise(viewName) ? { enterprise: true } : {}),
      });
    }
  }

  for (const [formKey, form] of Object.entries(schema.forms)) {
    const mapped = schema.objects[formKey] ? layoutViewFor(schema, viewToSection, formKey) : formKey;
    if (!mapped) continue;
    const viewName = mapped;
    const section = viewToSection[viewName] ?? '';
    const display = displayNameFor(viewName);
    const viewEnterprise = isViewEnterprise(viewName);

    for (const formSection of form.sections) {
      const fieldFlags = formSection.fields.map(
        (field) => viewEnterprise || isFormFieldEnterprise(schema, formKey, viewName, field.name),
      );
      // Suppress form section headings too when every field inside the section is Enterprise-only.
      const sectionEnterprise = viewEnterprise || (fieldFlags.length > 0 && fieldFlags.every(Boolean));
      if (formSection.title) {
        entries.push({
          text: formSection.title,
          type: 'form',
          viewName,
          section,
          breadcrumb: section ? `${section} > ${display} > ${formSection.title}` : `${display} > ${formSection.title}`,
          ...(sectionEnterprise ? { enterprise: true } : {}),
        });
      }

      formSection.fields.forEach((field, index) => {
        const keywords: string[] = [];
        if (field.name && field.name !== '@type') {
          keywords.push(field.name);
        }
        entries.push({
          text: field.label,
          type: 'field',
          viewName,
          section,
          breadcrumb: section ? `${section} > ${display} > ${field.label}` : `${display} > ${field.label}`,
          keywords,
          ...(fieldFlags[index] ? { enterprise: true } : {}),
        });
      });
    }
  }

  return entries;
}

export const useSchemaStore = create<SchemaState>()((set) => ({
  schema: null,
  isLoaded: false,
  viewToSection: {},
  searchIndex: [],

  setSchema: (rawSchema) => {
    const schema = withClientNavEntries(rawSchema);
    const { viewToSection, linkEntries } = walkLayouts(schema);
    const searchIndex = buildSearchIndex(schema, viewToSection, linkEntries);
    set({
      schema,
      isLoaded: true,
      viewToSection,
      searchIndex,
    });
  },
}));
