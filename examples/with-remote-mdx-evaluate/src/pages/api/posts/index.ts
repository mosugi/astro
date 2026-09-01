/**
 * モックAPIエンドポイント: ブログ記事一覧
 *
 * 実際のプロジェクトでは外部APIを使う。
 * このファイルはローカル開発・テスト用のモックサーバー。
 */
import type { APIRoute } from 'astro';
import { MOCK_POSTS } from '../../../data/mock-posts';

export const GET: APIRoute = () => {
	const posts = MOCK_POSTS.map(({ id, title, publishedAt }) => ({
		id,
		title,
		publishedAt,
		// 一覧APIではbodyは返さない (パフォーマンス上の理由)
	}));

	return new Response(JSON.stringify(posts), {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, max-age=60',
		},
	});
};
