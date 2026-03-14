/**
 * モックデータ
 *
 * ローカル開発用のサンプルMDXコンテンツ。
 * 実際のプロジェクトでは外部CMSやAPIから取得する。
 */

export const MOCK_POSTS = [
	{
		id: 'hello-world',
		title: 'Hello, World!',
		publishedAt: '2025-01-15T00:00:00.000Z',
		// MDX内のimportは使用不可 (evaluate() はバンドラーなし)
		// 代わりに components propsでコンポーネントを渡す
		body: `
# Hello, World!

これはリモートAPIから取得したMDXコンテンツです。

> このblockquoteはカスタム **CustomCallout** コンポーネントで表示されます。
> \`<Content components={{ blockquote: CustomCallout }}\` で渡しています。

## MDXの機能

通常のMarkdown記法がそのまま使えます:

- **太字**
- *斜体*
- \`インラインコード\`

\`\`\`js
// コードブロックもそのまま使える
const greeting = 'Hello, World!';
console.log(greeting);
\`\`\`

## カスタムコンポーネント

この見出し (h1/h2) は \`CustomHeading\` コンポーネントで表示されています。
ページ側で \`<Content components={{ h1: CustomHeading }}\` と渡しているためです。

MDX内の \`export const components\` でデフォルトを指定することもできます:

\`\`\`mdx
export const components = { h1: MyHeading };
\`\`\`

この場合、ページ側の \`components\` propsが優先されます。
`.trim(),
	},
	{
		id: 'using-jsx-in-mdx',
		title: 'MDX内でのJSX式の使用',
		publishedAt: '2025-02-01T00:00:00.000Z',
		body: `
# MDX内でのJSX式の使用

MDXでは通常のMarkdownに加えて、**JSX式**が使えます。

## 計算式

現在の年: {new Date().getFullYear()}

## 条件分岐

{true && <p>この段落は常に表示されます</p>}

## リスト生成

{['りんご', 'バナナ', 'みかん'].map((fruit) => (
  <li key={fruit}>{fruit}</li>
))}

> JSX式はevaluate()でコンパイルされるため、リクエスト時に評価されます。

## 注意事項

\`import\` 文は使用できません:

\`\`\`mdx
// ❌ これは動かない
import MyComponent from './MyComponent.astro';

// ✅ 代わりにcomponents propsで渡す
// <Content components={{ MyComponent }} />
\`\`\`
`.trim(),
	},
];
