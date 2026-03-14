// @ts-check
import mdx from '@astrojs/mdx';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	output: 'server', // SSR required for live collections (per-request fetching)
	integrations: [mdx()],
});
