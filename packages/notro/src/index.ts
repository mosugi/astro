export { notroLoader } from './loader/loader.js';
export type { NotroLoaderOptions } from './loader/loader.js';
export { extractPageProperties } from './loader/extractPageProperties.js';
export type { NotroPageData } from './loader/extractPageProperties.js';

// Legacy component — kept for migration period. Use astro:content render() instead.
export { default as NotionMarkdownRenderer } from './components/NotionMarkdownRenderer.astro';
