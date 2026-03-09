import type { AstroMarkdownOptions } from '@astrojs/markdown-remark';

export interface NotroMarkdownOptions {
  remarkPlugins?: AstroMarkdownOptions['remarkPlugins'];
  rehypePlugins?: AstroMarkdownOptions['rehypePlugins'];
  gfm?: boolean;
  smartypants?: boolean;
}

/**
 * Returns Astro markdown configuration suitable for Notion-sourced content.
 * Pass as `markdown` option in astro.config.mjs.
 */
export function notroMarkdownConfig(options?: NotroMarkdownOptions): AstroMarkdownOptions {
  return {
    gfm: options?.gfm ?? true,
    smartypants: options?.smartypants ?? false,
    remarkPlugins: options?.remarkPlugins ?? [],
    rehypePlugins: options?.rehypePlugins ?? [],
  };
}

/**
 * Returns MDX integration options based on the notro markdown config.
 * Pass as the argument to `mdx()` in astro.config.mjs integrations.
 */
export function notroMdxConfig(options?: NotroMarkdownOptions): AstroMarkdownOptions {
  return notroMarkdownConfig(options);
}
