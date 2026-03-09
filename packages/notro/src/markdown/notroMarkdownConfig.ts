import type { AstroMarkdownOptions } from '@astrojs/markdown-remark';

export interface NotroMarkdownOptions {
  /** Additional remark plugins */
  remarkPlugins?: AstroMarkdownOptions['remarkPlugins'];
  /** Additional rehype plugins */
  rehypePlugins?: AstroMarkdownOptions['rehypePlugins'];
  /** Syntax highlighting configuration */
  syntaxHighlight?: AstroMarkdownOptions['syntaxHighlight'];
}

/**
 * Returns a base Astro markdown configuration optimized for Notion content.
 * Includes sensible defaults for processing Notion-exported markdown.
 */
export function notroMarkdownConfig(options?: NotroMarkdownOptions): Partial<AstroMarkdownOptions> {
  return {
    syntaxHighlight: options?.syntaxHighlight ?? 'shiki',
    remarkPlugins: [...(options?.remarkPlugins ?? [])],
    rehypePlugins: [...(options?.rehypePlugins ?? [])],
    remarkRehype: {
      allowDangerousHtml: true,
    },
  };
}

/**
 * Returns MDX integration options compatible with @astrojs/mdx.
 * Delegates to notroMarkdownConfig since MDX accepts the same options.
 */
export function notroMdxConfig(options?: NotroMarkdownOptions): Partial<AstroMarkdownOptions> {
  return notroMarkdownConfig(options);
}
