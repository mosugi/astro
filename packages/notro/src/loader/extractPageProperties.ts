import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints.js';

export interface NotroPageData {
  title: string;
  description?: string;
  pubDate: Date;
  updatedDate?: Date;
  tags?: string[];
  slug: string;
  notionId: string;
}

function getTextContent(
  property: PageObjectResponse['properties'][string],
): string {
  if (property.type === 'title') {
    return property.title.map((t) => t.plain_text).join('');
  }
  if (property.type === 'rich_text') {
    return property.rich_text.map((t) => t.plain_text).join('');
  }
  return '';
}

function getDateValue(
  property: PageObjectResponse['properties'][string],
): Date | undefined {
  if (property.type === 'date' && property.date?.start) {
    return new Date(property.date.start);
  }
  if (property.type === 'last_edited_time') {
    return new Date(property.last_edited_time);
  }
  if (property.type === 'created_time') {
    return new Date(property.created_time);
  }
  return undefined;
}

function getMultiSelect(
  property: PageObjectResponse['properties'][string],
): string[] {
  if (property.type === 'multi_select') {
    return property.multi_select.map((s) => s.name);
  }
  return [];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

export function extractPageProperties(page: PageObjectResponse): NotroPageData {
  const props = page.properties;

  const title =
    getTextContent(props['Name'] ?? props['Title'] ?? props['title'] ?? { type: 'title', title: [], id: '' }) ||
    'Untitled';

  const description = props['Description'] || props['Excerpt']
    ? getTextContent(props['Description'] ?? props['Excerpt']!)
    : undefined;

  const pubDate =
    getDateValue(props['Date'] ?? props['Published'] ?? props['Created']) ??
    new Date(page.created_time);

  const updatedDate =
    getDateValue(props['Updated'] ?? props['Last edited']) ??
    new Date(page.last_edited_time);

  const tags = props['Tags'] ? getMultiSelect(props['Tags']) : undefined;

  const slug =
    (props['Slug'] ? getTextContent(props['Slug']) : '') || slugify(title) || page.id;

  return {
    title,
    description: description || undefined,
    pubDate,
    updatedDate,
    tags,
    slug,
    notionId: page.id,
  };
}
