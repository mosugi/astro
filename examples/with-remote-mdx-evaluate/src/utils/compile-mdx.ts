/**
 * Remote MDX → Astro コンポーネント変換ユーティリティ
 *
 * @mdx-js/mdx の evaluate() を使い、MDXソース文字列から
 * Astroの <Content components={{...}} /> に渡せるJSXコンポーネントを生成する。
 *
 * 参照実装:
 *   - packages/integrations/mdx/src/vite-plugin-mdx-postprocess.ts (transformContentExport / annotateContentExport)
 *   - packages/integrations/mdx/src/plugins.ts (createMdxProcessor)
 *   - packages/astro/src/jsx-runtime/index.ts (createVNode = jsx/jsxs)
 */

import { evaluate, type EvaluateOptions } from '@mdx-js/mdx';
import { createHash } from 'node:crypto';
import remarkGfm from 'remark-gfm';

// Astroのjsx-runtimeから evaluate() に必要なものをインポート。
// createVNode が Astro VNode を生成し、Astroのレンダリングパイプラインが処理できる。
// (astro/src/jsx-runtime/index.ts:94)
import { Fragment, jsx, jsxs } from 'astro/jsx-runtime';

// vite-plugin-mdx-postprocess.ts の annotateContentExport() に対応:
// Content を 'astro:jsx' レンダラーとして登録するために必要
import { __astro_tag_component__ } from 'astro/runtime/server/index.js';

/** evaluate() に渡す共通オプション */
const EVALUATE_OPTIONS: EvaluateOptions = {
	// Astroの jsx-runtime を使う (local MDXと同じ)
	jsx,
	jsxs,
	Fragment,
	// Astroの標準 MDX インテグレーションと同じプラグイン構成
	remarkPlugins: [remarkGfm],
	// 必要に応じて rehypePlugins を追加できる
	// rehypePlugins: [rehypeSlug],
};

/**
 * MDXソース文字列をAstroで使えるコンポーネント関数にコンパイルする。
 *
 * @param mdxSource - MDXソース文字列 (import文は使用不可)
 * @returns <Content components={{h1: Heading}} /> で使えるAstroコンポーネント
 *
 * @example
 * ```astro
 * ---
 * const Content = await compileMdxForAstro(entry.data.body);
 * ---
 * <Content components={{ h1: Heading }} />
 * ```
 */
export async function compileMdxForAstro(mdxSource: string) {
	// @mdx-js/mdx の evaluate() でMDXをコンパイル + 実行。
	// Astroの jsx-runtime を使うため、結果は Astro VNode を返す関数になる。
	const mod = await evaluate(mdxSource, EVALUATE_OPTIONS);

	const MDXContent = mod.default;

	// MDX内の `export const components = { ... }` がある場合はそれも取得
	// (例: MDX側でデフォルトのコンポーネントを指定している場合)
	const mdxInternalComponents = (mod as Record<string, unknown>).components ?? {};

	// vite-plugin-mdx-postprocess.ts の transformContentExport() と同等:
	// props.components を受け取り、優先度順でマージするラッパーを作る。
	//
	// マージの優先度 (高 → 低):
	//   1. 呼び出し側が <Content components={{h1: Heading}} /> で渡したもの
	//   2. MDX内の `export const components` で定義されたもの
	//   3. Fragment (必須)
	const Content = (props: Record<string, unknown> = {}) =>
		MDXContent({
			...props,
			components: {
				Fragment,
				...(mdxInternalComponents as Record<string, unknown>),
				...(props.components as Record<string, unknown> | undefined),
			},
		});

	// vite-plugin-mdx-postprocess.ts の annotateContentExport() と同等:
	// Astroのレンダリングパイプラインが正しくこのコンポーネントを扱えるようにタグ付けする。
	Content[Symbol.for('mdx-component')] = true;
	Content[Symbol.for('astro.needsHeadRendering')] = true;
	__astro_tag_component__(Content, 'astro:jsx');

	return Content;
}

/**
 * コンパイル結果をインメモリキャッシュするバージョン。
 *
 * SSRではリクエストごとに compileMdxForAstro() が呼ばれるため、
 * 同じ内容のMDXは1回だけコンパイルするようキャッシュする。
 *
 * Note: このキャッシュはサーバープロセスの生存期間中保持される。
 * コンテンツが変わる場合はコンテンツのハッシュをキーにしているため自動的に更新される。
 */
const compilationCache = new Map<string, ReturnType<typeof compileMdxForAstro>>();

export async function compileMdxCached(mdxSource: string) {
	// コンテンツのSHA-256ハッシュをキャッシュキーとして使用
	const key = createHash('sha256').update(mdxSource).digest('hex');

	if (!compilationCache.has(key)) {
		// Promiseをキャッシュすることで並列リクエスト時の重複コンパイルも防ぐ
		compilationCache.set(key, compileMdxForAstro(mdxSource));
	}

	return compilationCache.get(key)!;
}
