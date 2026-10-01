/**
 * ライブコレクション設定
 *
 * ライブコレクションは必ず src/live.config.ts に定義する必要がある。
 * (astro/src/content/config.ts で強制されている)
 */

import { defineLiveCollection } from 'astro:content';
import { z } from 'zod';
import { remoteMdxLiveLoader } from './loaders/remote-mdx-live-loader';

export const collections = {
	/**
	 * リモートAPIからMDXコンテンツを取得するライブコレクション。
	 *
	 * ライブローダーはリクエストごとにAPIを呼び出すため、
	 * デプロイなしでコンテンツを更新できる。
	 */
	blog: defineLiveCollection({
		loader: remoteMdxLiveLoader({
			// このサンプルでは同じサーバー上のモックAPIエンドポイントを使用。
			// 実際のプロジェクトでは環境変数から読む:
			// apiUrl: import.meta.env.BLOG_API_URL,
			apiUrl: 'http://localhost:4321/api/posts',
		}),
		schema: z.object({
			title: z.string(),
			body: z.string(),
			publishedAt: z.coerce.date(),
		}),
	}),
};
