// @ts-check
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import { notroMarkdownConfig, notroMdxConfig } from 'notro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://example.com',
  markdown: notroMarkdownConfig(),
  integrations: [
    mdx(notroMdxConfig()),
    sitemap(),
  ],
  image: {
    // Configure image service as needed
  },
});
