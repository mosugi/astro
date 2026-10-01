/**
 * モックAPIデータ — Notion Enhanced Markdown 形式
 *
 * 実際のプロジェクトでは Notion API 等から取得する。
 * このファイルは開発・デモ用のサンプルコンテンツ。
 */

export const MOCK_POSTS = [
	{
		id: 'notion-blocks-demo',
		title: 'Notion ブロックデモ',
		publishedAt: '2025-01-15T00:00:00.000Z',
		body: `
<callout icon="🎯" color="blue_bg">
	このページは **Notion Enhanced Markdown** 形式で書かれています。
	\`evaluate()\` でコンパイルされた MDX が各ブロックを対応する Astro コンポーネントでレンダリングします。
</callout>

## テキストと書式

通常の段落テキスト。**太字**、*斜体*、~~取り消し線~~、\`インラインコード\` が使えます。

<span underline="true">下線テキスト</span> と <span color="blue">青いテキスト</span> と <span color="red_bg">赤背景テキスト</span> もサポートしています。

## 見出し

# 見出し1 (h1 → H1.astro)
## 見出し2 (h2 → H2.astro)
### 見出し3 (h3 → H3.astro)
#### 見出し4 (h4 → H4.astro)

## カラーカラム

<columns>
<column>
**左カラム**

- リスト項目 A
- リスト項目 B
- リスト項目 C
</column>
<column>
**中央カラム**

1. 番号付きリスト 1
2. 番号付きリスト 2
3. 番号付きリスト 3
</column>
<column>
**右カラム**

- [ ] 未完了タスク
- [x] 完了タスク
- [ ] 別のタスク
</column>
</columns>

## カラーカローアウト

<callout icon="✅" color="green_bg">
	**成功** — 処理が正常に完了しました。
</callout>

<callout icon="⚠️" color="yellow_bg">
	**警告** — この操作は元に戻せません。
</callout>

<callout icon="❌" color="red_bg">
	**エラー** — 予期しないエラーが発生しました。
</callout>

<callout icon="💡" color="purple_bg">
	**ヒント** — \`notionComponents\` を \`<Content components={notionComponents} />\` に渡すだけで全ブロックが対応コンポーネントでレンダリングされます。
</callout>

## トグル (折りたたみ)

<details color="gray_bg">
<summary>クリックして詳細を表示</summary>

トグルの内容がここに表示されます。

- 折りたたんで表示できるコンテンツ
- **マークダウン**も使えます
- ネストしたコンテンツも OK

\`\`\`ts
// コードブロックもトグル内に配置できる
const toggle = document.querySelector('details');
toggle?.addEventListener('toggle', console.log);
\`\`\`

</details>

<details>
<summary>デフォルトで開いているトグル</summary>

\`open\` 属性を追加するとデフォルトで開いた状態になります。

</details>

## 引用

> これは Notion の引用ブロックです。<br>複数行の引用は \`<br>\` タグで区切ります。

> <span color="blue">**青いテキスト**</span>も引用ブロックに含められます。

## コードブロック

\`\`\`typescript
// TypeScript のコードブロック
import { evaluate } from '@mdx-js/mdx';
import { jsx, jsxs, Fragment } from 'astro/jsx-runtime';

const { default: MDXContent } = await evaluate(mdxSource, {
	jsx, jsxs, Fragment,
});
\`\`\`

\`\`\`bash
# シェルコマンド
pnpm install @astrojs/mdx
pnpm dev
\`\`\`

## テーブル

<table header-row="true" fit-page-width="true">
	<colgroup>
		<col />
		<col color="blue_bg" />
		<col />
	</colgroup>
	<tr>
		<td>ブロック種別</td>
		<td>MDX 要素</td>
		<td>対応コンポーネント</td>
	</tr>
	<tr>
		<td>カロアウト</td>
		<td color="gray_bg">\`&lt;callout&gt;\`</td>
		<td>Callout.astro</td>
	</tr>
	<tr>
		<td>トグル</td>
		<td color="gray_bg">\`&lt;details&gt;\`</td>
		<td>Toggle.astro</td>
	</tr>
	<tr>
		<td>カラム</td>
		<td color="gray_bg">\`&lt;columns&gt;\`</td>
		<td>Columns.astro</td>
	</tr>
	<tr color="green_bg">
		<td>見出し</td>
		<td color="gray_bg">\`h1\` 〜 \`h4\`</td>
		<td>H1.astro 〜 H4.astro</td>
	</tr>
</table>

## 空のブロック

上↑と下↓に空白があります。

<empty-block/>

この行の上に空白ブロックがあります。

## 水平線

---

## 画像

![Astro ロゴ](https://astro.build/assets/press/astro-icon-light-gradient.svg)

## メンション

ユーザー: <mention-user url="https://example.com/user/123">山田 太郎</mention-user>

ページ: <mention-page url="https://notion.so/abc123">プロジェクト計画書</mention-page>

日付: <mention-date start="2025-01-15" end="2025-01-31"/>

時刻付き日付: <mention-date start="2025-01-15" startTime="10:00" timeZone="Asia/Tokyo"/>

## まとめ

<callout icon="🎉" color="green_bg">
	全ての Notion ブロックタイプが \`notionComponents\` を通じて正しくレンダリングされています！
</callout>
`.trim(),
	},
	{
		id: 'evaluate-deep-dive',
		title: 'evaluate() の仕組みと制約',
		publishedAt: '2025-02-01T00:00:00.000Z',
		body: `
<callout icon="🔬" color="purple_bg">
	\`@mdx-js/mdx\` の \`evaluate()\` がどのように動作するかの技術的な解説です。
</callout>

## evaluate() の動作原理

<columns>
<column>
**コンパイル**

\`evaluate()\` は内部で:

1. MDX ソースを AST に変換
2. remark プラグインを適用
3. rehype プラグインを適用
4. JSX コードを生成
5. 渡された JSX ランタイムで実行
</column>
<column>
**Astro との統合**

\`astro/jsx-runtime\` の \`jsx\`, \`jsxs\`, \`Fragment\` を渡すと:

- Astro VNode が生成される
- Astro のレンダリングパイプラインが処理
- \`__astro_tag_component__\` でタグ付け
- \`<Content components={...}/>\` が機能
</column>
</columns>

## 制約

<callout icon="⚠️" color="yellow_bg">
	**MDX 内の \`import\` 文は使用不可**
	バンドラー (Vite) がないため、実行時に他のモジュールを解決できません。
	コンポーネントは \`components\` props で渡してください。
</callout>

<details color="gray_bg">
<summary>❌ 動かない例</summary>

\`\`\`mdx
import MyComponent from './MyComponent.astro'; // ← NG

# Hello

<MyComponent />
\`\`\`

</details>

<details color="green_bg">
<summary>✅ 正しい方法</summary>

\`\`\`astro
---
// ページ側でインポートして components として渡す
import MyComponent from '../components/MyComponent.astro';
import { compileMdxCached } from '../utils/compile-mdx';

const Content = await compileMdxCached(entry.data.body);
---

<Content components={{ MyComponent }} />
\`\`\`

\`\`\`mdx
{/* MDX 側では props.components.MyComponent として参照できる */}
# Hello

<MyComponent />
\`\`\`

</details>

## パフォーマンス最適化

<table header-row="true" header-column="true">
	<tr>
		<td>手法</td>
		<td>コンパイルコスト</td>
		<td>実行コスト</td>
		<td>適用場面</td>
	</tr>
	<tr>
		<td>\`compileMdxCached()\`</td>
		<td color="yellow_bg">1回のみ</td>
		<td color="green_bg">低</td>
		<td>コンテンツが頻繁に変わらない場合</td>
	</tr>
	<tr>
		<td>\`compileMdxForAstro()\`</td>
		<td color="red_bg">毎リクエスト</td>
		<td color="green_bg">低</td>
		<td>コンテンツがリクエストごとに変わる場合</td>
	</tr>
	<tr>
		<td>\`createProcessor + run()\`</td>
		<td color="yellow_bg">1回のみ</td>
		<td color="green_bg">低</td>
		<td>プロセッサーを再利用したい場合</td>
	</tr>
</table>

---

<callout icon="📚" color="blue_bg">
	詳細は [MDX ドキュメント](https://mdxjs.com/) および [@astrojs/mdx](https://docs.astro.build/en/guides/integrations-guide/mdx/) を参照してください。
</callout>
`.trim(),
	},
];
