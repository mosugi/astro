import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { notroLoader } from 'notro';

const blog = defineCollection({
  loader: notroLoader({
    token: import.meta.env.NOTION_TOKEN,
    databaseId: import.meta.env.NOTION_DATABASE_ID,
  }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).optional(),
    slug: z.string(),
    notionId: z.string(),
  }),
});

export const collections = { blog };
