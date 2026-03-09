import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Loader, LoaderContext } from 'astro/loaders';

export interface NotroLoaderOptions {
  /** Notion API token */
  token: string;
  /** Notion database ID to load pages from */
  databaseId: string;
  /** Optional filter for the Notion database query */
  filter?: Record<string, unknown>;
  /** Optional sort for the Notion database query */
  sorts?: Array<Record<string, unknown>>;
}

/**
 * Extracts properties from a Notion page object into a flat record.
 */
function extractPageProperties(page: Record<string, any>): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const props = page.properties ?? {};

  for (const [key, value] of Object.entries(props)) {
    const prop = value as Record<string, any>;
    switch (prop.type) {
      case 'title':
        properties[key] = prop.title?.map((t: any) => t.plain_text).join('') ?? '';
        break;
      case 'rich_text':
        properties[key] = prop.rich_text?.map((t: any) => t.plain_text).join('') ?? '';
        break;
      case 'date':
        properties[key] = prop.date?.start ?? null;
        break;
      case 'select':
        properties[key] = prop.select?.name ?? null;
        break;
      case 'multi_select':
        properties[key] = prop.multi_select?.map((s: any) => s.name) ?? [];
        break;
      case 'checkbox':
        properties[key] = prop.checkbox ?? false;
        break;
      case 'url':
        properties[key] = prop.url ?? null;
        break;
      case 'number':
        properties[key] = prop.number ?? null;
        break;
      case 'status':
        properties[key] = prop.status?.name ?? null;
        break;
      default:
        // skip unsupported types
        break;
    }
  }

  // Include common page metadata
  properties.notionId = page.id;
  properties.createdTime = page.created_time;
  properties.lastEditedTime = page.last_edited_time;
  if (page.cover) {
    properties.cover =
      page.cover.type === 'external' ? page.cover.external?.url : page.cover.file?.url;
  }

  return properties;
}

/**
 * Converts Notion block children to Markdown recursively.
 * This is a simplified converter; for production use, consider using notion-to-md.
 */
async function blockToMarkdown(
  block: Record<string, any>,
  notionClient: any,
  depth = 0,
): Promise<string> {
  const indent = '  '.repeat(depth);
  const type = block.type;
  const content = block[type] ?? {};

  function richTextToMd(texts: any[]): string {
    return (texts ?? [])
      .map((t: any) => {
        let text = t.plain_text ?? '';
        if (t.annotations?.code) text = `\`${text}\``;
        if (t.annotations?.bold) text = `**${text}**`;
        if (t.annotations?.italic) text = `*${text}*`;
        if (t.annotations?.strikethrough) text = `~~${text}~~`;
        if (t.href) text = `[${text}](${t.href})`;
        return text;
      })
      .join('');
  }

  let md = '';

  switch (type) {
    case 'paragraph':
      md = `${richTextToMd(content.rich_text)}\n\n`;
      break;
    case 'heading_1':
      md = `# ${richTextToMd(content.rich_text)}\n\n`;
      break;
    case 'heading_2':
      md = `## ${richTextToMd(content.rich_text)}\n\n`;
      break;
    case 'heading_3':
      md = `### ${richTextToMd(content.rich_text)}\n\n`;
      break;
    case 'bulleted_list_item':
      md = `${indent}- ${richTextToMd(content.rich_text)}\n`;
      break;
    case 'numbered_list_item':
      md = `${indent}1. ${richTextToMd(content.rich_text)}\n`;
      break;
    case 'code':
      md = `\`\`\`${content.language ?? ''}\n${richTextToMd(content.rich_text)}\n\`\`\`\n\n`;
      break;
    case 'quote':
      md = `> ${richTextToMd(content.rich_text)}\n\n`;
      break;
    case 'divider':
      md = `---\n\n`;
      break;
    case 'callout':
      md = `:::note\n${richTextToMd(content.rich_text)}\n:::\n\n`;
      break;
    case 'image': {
      const url =
        content.type === 'external' ? content.external?.url : content.file?.url;
      const caption = richTextToMd(content.caption ?? []);
      md = `![${caption}](${url})\n\n`;
      break;
    }
    case 'toggle':
      md = `<details>\n<summary>${richTextToMd(content.rich_text)}</summary>\n\n`;
      break;
    default:
      // Unsupported block type – output nothing
      break;
  }

  // Recursively process children for blocks that support them
  if (
    block.has_children &&
    ['toggle', 'bulleted_list_item', 'numbered_list_item', 'quote'].includes(type)
  ) {
    try {
      const { results: children } = await notionClient.blocks.children.list({
        block_id: block.id,
      });
      for (const child of children) {
        md += await blockToMarkdown(child, notionClient, depth + 1);
      }
    } catch {
      // ignore errors for child blocks
    }
  }

  if (type === 'toggle') {
    md += `</details>\n\n`;
  }

  return md;
}

/**
 * Converts a Notion page to a Markdown string by fetching its blocks.
 */
async function pageToMarkdown(pageId: string, notionClient: any): Promise<string> {
  let markdown = '';
  let cursor: string | undefined;

  do {
    const response = await notionClient.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const block of response.results) {
      markdown += await blockToMarkdown(block, notionClient, 0);
    }

    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  return markdown;
}

/**
 * Creates an Astro content loader that fetches pages from a Notion database.
 *
 * Writes MDX files to `.astro/cache/notro-mdx/` for deferred rendering,
 * enabling Vercel build caching when content hasn't changed.
 *
 * @example
 * ```ts
 * // src/content/config.ts
 * import { defineCollection } from 'astro:content';
 * import { notroLoader } from 'notro/loader';
 *
 * export const collections = {
 *   blog: defineCollection({
 *     loader: notroLoader({
 *       token: import.meta.env.NOTION_TOKEN,
 *       databaseId: import.meta.env.NOTION_DATABASE_ID,
 *     }),
 *   }),
 * };
 * ```
 */
export function notroLoader(options: NotroLoaderOptions): Loader {
  return {
    name: 'notro-loader',

    load: async (context: LoaderContext) => {
      const { store, logger, config } = context;

      // Dynamically import the Notion client to avoid bundling it at build time
      // when it may not be available.
      let Client: any;
      try {
        const mod = await import('@notionhq/client');
        Client = mod.Client;
      } catch {
        logger.error(
          'Could not import @notionhq/client. Please add it as a dependency: npm install @notionhq/client',
        );
        return;
      }

      const notion = new Client({ auth: options.token });

      // Resolve the cache directory for MDX files
      const rootDir = fileURLToPath(config.root);
      const cacheDir = join(rootDir, '.astro', 'cache', 'notro-mdx');
      mkdirSync(cacheDir, { recursive: true });

      logger.info('Fetching pages from Notion database…');

      // Query all pages from the database
      const pages: any[] = [];
      let cursor: string | undefined;

      do {
        const response = await notion.databases.query({
          database_id: options.databaseId,
          filter: options.filter as any,
          sorts: options.sorts as any,
          start_cursor: cursor,
          page_size: 100,
        });
        pages.push(...response.results);
        cursor = response.has_more ? response.next_cursor : undefined;
      } while (cursor);

      logger.info(`Found ${pages.length} pages. Processing…`);

      for (const page of pages) {
        const id: string = page.id;

        // Skip pages that haven't changed since the last build
        const existing = store.get(id);
        if (existing?.digest === page.last_edited_time) {
          continue;
        }

        let preprocessedMarkdown: string;
        try {
          preprocessedMarkdown = await pageToMarkdown(id, notion);
        } catch (err: any) {
          logger.error(`Failed to convert page ${id} to markdown: ${err.message}`);
          continue;
        }

        // Write the MDX file to the cache directory
        const mdxPath = join(cacheDir, `${id}.mdx`);
        writeFileSync(mdxPath, preprocessedMarkdown, 'utf-8');

        // Store a relative path from the project root (required by Astro's DataStore)
        const relativeMdxPath = relative(rootDir, mdxPath);

        store.set({
          id,
          data: extractPageProperties(page),
          body: preprocessedMarkdown,
          filePath: relativeMdxPath,
          deferredRender: true,
          digest: page.last_edited_time,
        });

        logger.debug(`Processed page: ${id}`);
      }

      logger.info('Notion content loaded successfully.');
    },
  };
}
