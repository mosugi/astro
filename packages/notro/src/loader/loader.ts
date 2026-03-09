import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@notionhq/client';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints.js';
import { NotionToMarkdown } from 'notion-to-md';
import type { Loader, LoaderContext } from 'astro/loaders';
import { extractPageProperties } from './extractPageProperties.js';

export interface NotroLoaderOptions {
  /** Notion integration token */
  token: string;
  /** Notion database ID to load pages from */
  databaseId: string;
  /** Additional filter to apply when querying the database */
  filter?: Parameters<Client['databases']['query']>[0]['filter'];
}

function preprocessMarkdown(markdown: string): string {
  // Normalize line endings and trim trailing whitespace
  return markdown.replace(/\r\n/g, '\n').trimEnd();
}

export function notroLoader(options: NotroLoaderOptions): Loader {
  return {
    name: 'notro-loader',
    async load(context: LoaderContext) {
      const { store, logger, config } = context;

      const notion = new Client({ auth: options.token });
      const n2m = new NotionToMarkdown({ notionClient: notion });

      logger.info(`Loading Notion database: ${options.databaseId}`);

      const cacheDir = join(
        fileURLToPath(new URL('.astro/cache/notro-mdx', config.root)),
      );
      mkdirSync(cacheDir, { recursive: true });

      let hasMore = true;
      let startCursor: string | undefined;

      while (hasMore) {
        const response = await notion.databases.query({
          database_id: options.databaseId,
          filter: options.filter,
          start_cursor: startCursor,
        });

        for (const page of response.results) {
          if (page.object !== 'page') continue;
          const fullPage = page as PageObjectResponse;

          // Skip if digest (last_edited_time) unchanged — reuse existing file
          const existing = store.get(fullPage.id);
          if (existing?.digest === fullPage.last_edited_time) continue;

          const mdBlocks = await n2m.pageToMarkdown(fullPage.id);
          const rawMarkdown = n2m.toMarkdownString(mdBlocks).parent;
          const processedMarkdown = preprocessMarkdown(rawMarkdown);

          const mdxPath = join(cacheDir, `${fullPage.id}.mdx`);
          writeFileSync(mdxPath, processedMarkdown, 'utf-8');

          store.set({
            id: fullPage.id,
            data: extractPageProperties(fullPage),
            body: processedMarkdown,
            filePath: mdxPath,
            deferredRender: true,
            digest: fullPage.last_edited_time,
          });
        }

        hasMore = response.has_more;
        startCursor = response.next_cursor ?? undefined;
      }

      logger.info('Notion pages loaded successfully.');
    },
  };
}
