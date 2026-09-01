/**
 * モックAPIエンドポイント: ブログ記事1件
 */
import type { APIRoute } from 'astro';
import { MOCK_POSTS } from '../../../data/mock-posts';

export const GET: APIRoute = ({ params }) => {
	const post = MOCK_POSTS.find((p) => p.id === params.id);

	if (!post) {
		return new Response(JSON.stringify({ error: 'Not found' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	return new Response(JSON.stringify(post), {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, max-age=60',
		},
	});
};
