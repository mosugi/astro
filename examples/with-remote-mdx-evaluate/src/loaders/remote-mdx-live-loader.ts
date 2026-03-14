/**
 * リモートMDXコンテンツ用ライブローダー
 *
 * APIエンドポイントからMDXコンテンツをリクエストごとに取得する LiveLoader 実装。
 *
 * ポイント: MDXソースは rendered.html に入れず data.body に生のまま保持する。
 * コンパイルは compileMdxForAstro() をページ側で呼び出す時点まで遅延する。
 */

import type { LiveDataEntry, LiveLoader } from 'astro/loaders';

/** APIから返るエントリの型 (一覧API: body なし) */
interface RemotePostSummary {
	id: string;
	title: string;
	publishedAt: string;
}

/** APIから返るエントリの型 (詳細API: body あり) */
interface RemotePost extends RemotePostSummary {
	/** 生のMDXソース文字列 */
	body: string;
}

/** コレクションのデータスキーマ */
export interface RemotePostData {
	title: string;
	/** 生のMDXソース文字列 — compileMdxForAstro() で Content に変換して使う */
	body: string;
	publishedAt: Date;
}

export type RemoteMdxLiveLoader = LiveLoader<
	RemotePostData,
	// loadEntry のフィルター型: id で1件取得
	{ id: string }
>;

/**
 * リモートMDXコンテンツ用ライブローダー
 *
 * @param apiUrl - エントリの一覧を返すAPIのURL
 *
 * @example
 * ```ts
 * // src/live.config.ts
 * import { defineLiveCollection } from 'astro:content';
 * import { remoteMdxLiveLoader } from './loaders/remote-mdx-live-loader';
 *
 * export const collections = {
 *   blog: defineLiveCollection({
 *     loader: remoteMdxLiveLoader({ apiUrl: 'https://api.example.com/posts' }),
 *   }),
 * };
 * ```
 */
export function remoteMdxLiveLoader({ apiUrl }: { apiUrl: string }): RemoteMdxLiveLoader {
	return {
		name: 'remote-mdx-live-loader',

		/** 1件のエントリをIDで取得 */
		async loadEntry({ filter }) {
			const url = `${apiUrl}/${filter.id}`;
			const response = await fetch(url);

			if (!response.ok) {
				if (response.status === 404) return undefined;
				throw new Error(`Failed to fetch entry: ${response.status} ${response.statusText}`);
			}

			const post: RemotePost = await response.json();

			return toEntry(post);
		},

		/** コレクション全件を取得 */
		async loadCollection({ filter } = {}) {
			const url = new URL(apiUrl);
			// filter があればクエリパラメータとして追加
			if (filter && typeof filter === 'object') {
				for (const [key, value] of Object.entries(filter)) {
					if (value !== undefined) url.searchParams.set(key, String(value));
				}
			}

			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(
					`Failed to fetch collection: ${response.status} ${response.statusText}`,
				);
			}

			// 一覧APIはbodyを返さない場合がある。
			// その場合 body は空文字列にしておき、詳細ページで loadEntry() が呼ばれる。
			const posts: RemotePostSummary[] = await response.json();

			return {
				entries: posts.map((post) =>
					toEntry({ ...post, body: (post as Partial<RemotePost>).body ?? '' }),
				),
				// Cache-Control ヘッダーを cacheHint に反映する例
				cacheHint: buildCacheHint(response),
			};
		},
	};
}

/** APIレスポンスを LiveDataEntry に変換 */
function toEntry(post: RemotePost): LiveDataEntry<RemotePostData> {
	return {
		id: post.id,
		data: {
			title: post.title,
			// 生のMDXを保持。rendered.html には入れない
			// → ページ側で compileMdxForAstro(entry.data.body) を呼び出す
			body: post.body,
			publishedAt: new Date(post.publishedAt),
		},
	};
}

/** Cache-Control ヘッダーから cacheHint を構築するヘルパー */
function buildCacheHint(response: Response) {
	const cacheControl = response.headers.get('Cache-Control');
	if (!cacheControl) return undefined;

	const maxAge = cacheControl.match(/max-age=(\d+)/)?.[1];
	if (maxAge) {
		return { maxAge: parseInt(maxAge, 10) };
	}
	return undefined;
}
