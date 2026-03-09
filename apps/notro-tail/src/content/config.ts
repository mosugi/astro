import { defineCollection, z } from 'astro:content';
import { notroLoader } from 'notro/loader';

const blog = defineCollection({
  loader: notroLoader({
    token: import.meta.env.NOTION_TOKEN,
    databaseId: import.meta.env.NOTION_DATABASE_ID,
  }),
  schema: z.object({
    // Page title from Notion
    title: z.string().optional(),
    // Publication date
    date: z.string().optional(),
    // Tags / categories
    tags: z.array(z.string()).optional(),
    // Draft status
    draft: z.boolean().optional(),
    // Cover image URL
    cover: z.string().optional(),
    // Notion metadata
    notionId: z.string().optional(),
    createdTime: z.string().optional(),
    lastEditedTime: z.string().optional(),
  }),
});

export const collections = { blog };
