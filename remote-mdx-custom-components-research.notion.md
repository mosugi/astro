# リモートMDXコンテンツへのカスタムコンポーネント適用 {color="blue"}

<callout icon="🎯" color="blue_bg">
	**絶対的な制約**: `<Content components={{...components, h1: Heading }} />` という形式で使えること。<br>`Content` が**コンパイル済みのMDX JSXコンポーネント関数**である必要がある。
</callout>

## 問題の核心

### なぜリモートMDXでは動かないのか

`renderMarkdown()` や事前レンダリングでHTMLを生成してストアに保存した場合:

```ts
// runtime.ts:569 - 事前レンダリングされたHTMLからのContent生成
const Content = createComponent(() => serverRender`${unescapeHTML(html)}`);
```

<callout icon="❌" color="red_bg">
	この `Content` は静的HTMLを出力するだけで、**`components` propsを受け付けない**。
</callout>

### ローカルMDXで動く理由

`glob()` ローダーでローカル `.mdx` ファイルを使う場合:

1. エントリを `deferredRender: true` + `filePath` でストアに保存
2. ビルド時にViteがそのファイルをMDXプラグインでコンパイル
3. `render(entry)` が実行時に `astro:content-module-imports` 経由でコンパイル済みモジュールをロード
4. 返ってくる `Content` はJSX関数なので `components` propsが機能する

<details color="gray_bg">
<summary>glob.ts:218-225 — deferredRender: true がセットされる箇所</summary>

```ts
} else if ('contentModuleTypes' in entryType) {
    store.set({
        id, data, body,
        filePath: relativePath,
        digest,
        deferredRender: true,  // ← これがポイント
    });
}
```

</details>

---

## 実現方法の調査 {color="blue"}

### 方法1: ファイルに書き出す ✅ {color="green"}

**ビルドタイムローダー / 標準機能のみ**

仕組み: フェッチしたMDXコンテンツをディスクに書き出し、`deferredRender: true` でViteにコンパイルさせる。

<details color="gray_bg">
<summary>src/loaders/remote-mdx-loader.ts</summary>

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Loader } from 'astro/loaders';

export function remoteMdxLoader({ apiUrl }: { apiUrl: string }): Loader {
  return {
    name: 'remote-mdx-loader',
    async load({ store, config, parseData, generateDigest, logger }) {
      const response = await fetch(apiUrl);
      const posts: Array<{ id: string; title: string; body: string }> = await response.json();

      const outputDir = new URL('src/_remote-content/', config.root);
      mkdirSync(fileURLToPath(outputDir), { recursive: true });

      for (const post of posts) {
        const digest = generateDigest(post.body);
        const mdxFilename = `${post.id}.mdx`;
        const absolutePath = fileURLToPath(new URL(mdxFilename, outputDir));
        const relativePath = `src/_remote-content/${mdxFilename}`;

        const existing = store.get(post.id);
        if (existing?.digest === digest) {
          store.addModuleImport(relativePath);
          continue;
        }

        writeFileSync(absolutePath, post.body, 'utf-8');

        const data = await parseData({ id: post.id, data: { title: post.title } });
        store.set({
          id: post.id,
          data,
          filePath: relativePath,   // Viteがコンパイルするファイルのパス
          digest,
          deferredRender: true,     // ViteのMDXプラグインでコンパイル (JSXになる)
        });
        logger.info(`Fetched and wrote: ${post.id}`);
      }
    },
  };
}
```

</details>

<details color="gray_bg">
<summary>src/pages/blog/[id].astro — 使用例</summary>

```astro
---
import { getCollection, render } from 'astro:content';
import Heading from '../../components/Heading.astro';

export async function getStaticPaths() {
  const posts = await getCollection('blog');
  return posts.map((post) => ({ params: { id: post.id }, props: { post } }));
}

const { post } = Astro.props;
const { Content, components } = await render(post);
---

<!-- ✅ components propsが機能する: ContentはViteがコンパイルしたJSX関数 -->
<Content components={{...components, h1: Heading }} />
```

</details>

<callout icon="✅" color="green_bg">
	- 標準のAstro/Viteの仕組みのみで実現可能<br>- `components` propsが完全に機能する<br>- MDX内の `import` も機能する (ファイルが実在するため)
</callout>

<callout icon="⚠️" color="yellow_bg">
	- ファイルをディスクに書き出す必要がある (`src/_remote-content/` を `.gitignore` 推奨)<br>- **ビルドタイムローダーのみ** (ライブローダーには使えない)<br>- `src/_remote-content/` が大量のMDXファイルで溢れる可能性
</callout>

---

### 方法2: Viteプラグイン + バーチャルモジュール ❌ {color="red"}

**カスタムインテグレーション / 現時点では困難**

Astroの `deferredRender` メカニズムは実ファイルパスを要求する:

```ts
// vite-plugin-content-virtual-mod.ts:102-113
if (isDeferredModule(id)) {
  const params = new URLSearchParams(query);
  const fileName = params.get('fileName');
  // URL.canParse でファイルパスとして解析できる必要がある
  if (fileName && URL.canParse(fileName, settings.config.root.toString())) {
    importPath = fileURLToPath(new URL(fileName, settings.config.root));
  }
  if (importPath) {
    return await this.resolve(`${importPath}?${CONTENT_RENDER_FLAG}`);
  }
}
```

<callout icon="❌" color="red_bg">
	`virtual:` スキームのURLはここで `fileURLToPath` が失敗するため、**Astroコアの変更なしには `deferredRender` と仮想モジュールを組み合わせることができない**。<br>回避策はViteプラグインでリモートコンテンツを一時ファイルに書き出す方法に帰着する (方法1と同様)。
</callout>

---

### 方法3: @mdx-js/mdx + 動的評価 ❌ {color="red"}

**非推奨**

```ts
import { compile } from '@mdx-js/mdx';

const compiled = await compile(mdxContent, { /* オプション */ });
const module = await import(`data:text/javascript,${encodeURIComponent(String(compiled))}`);
const Content = module.default;
```

<callout icon="❌" color="red_bg">
	- `data:` URLによる動的importはビルド時に静的解析できない<br>- セキュリティリスク (リモートコンテンツの実行)<br>- Astroのスタイル/スクリプト収集が動かない<br>- 本番ビルドで動作しない
</callout>

---

### 方法4: evaluate() を使う ✅ {color="green"}

**ライブローダー対応 / ビルドタイムローダーでも使用可**

`@mdx-js/mdx` の `evaluate()` でコンパイルと実行を1ステップで行い、Astroの `jsx-runtime` と組み合わせることで動作する。

<callout icon="💡" color="blue_bg">
	**なぜ動くか**: `astro/jsx-runtime` が `evaluate()` に必要な `jsx`, `jsxs`, `Fragment` をエクスポートしており (`jsx-runtime/index.ts:94`)、`createVNode` がAstro VNodeを生成するため。
</callout>

<details color="gray_bg">
<summary>src/utils/compile-mdx.ts — 核心実装</summary>

```ts
import { evaluate } from '@mdx-js/mdx';
import { jsx, jsxs, Fragment } from 'astro/jsx-runtime';
import { __astro_tag_component__ } from 'astro/runtime/server/index.js';
import remarkGfm from 'remark-gfm';

export async function compileMdxForAstro(mdxSource: string) {
  const mod = await evaluate(mdxSource, {
    jsx, jsxs, Fragment,
    remarkPlugins: [remarkGfm],
  });

  const MDXContent = mod.default;
  const mdxComponents = (mod as any).components ?? {};

  // vite-plugin-mdx-postprocess.ts の transformContentExport() と同等:
  // components propsのマージ優先度: 呼び出し側 > MDX内export > Fragment
  const Content = (props: Record<string, any> = {}) =>
    MDXContent({
      ...props,
      components: {
        Fragment,
        ...mdxComponents,
        ...props.components,
      },
    });

  // vite-plugin-mdx-postprocess.ts の annotateContentExport() と同等
  Content[Symbol.for('mdx-component')] = true;
  Content[Symbol.for('astro.needsHeadRendering')] = true;
  __astro_tag_component__(Content, 'astro:jsx');

  return Content;
}
```

</details>

<details color="gray_bg">
<summary>コンパイル結果のキャッシュ (compileMdxCached)</summary>

```ts
import { createHash } from 'node:crypto';

const compilationCache = new Map<string, ReturnType<typeof compileMdxForAstro>>();

export async function compileMdxCached(mdxSource: string) {
  const key = createHash('sha256').update(mdxSource).digest('hex');
  if (!compilationCache.has(key)) {
    // Promiseをキャッシュすることで並列リクエスト時の重複コンパイルも防ぐ
    compilationCache.set(key, compileMdxForAstro(mdxSource));
  }
  return compilationCache.get(key)!;
}
```

</details>

<details color="gray_bg">
<summary>src/pages/blog/[id].astro — ライブローダーでの使用例</summary>

```astro
---
import { getLiveEntry } from 'astro:content';
import { compileMdxCached } from '../../utils/compile-mdx';
import Heading from '../../components/Heading.astro';

const { entry, error } = await getLiveEntry('blog', { id: Astro.params.id });
if (error || !entry) return Astro.redirect('/404');

const Content = await compileMdxCached(entry.data.body);
---

<!-- ✅ components propsが機能する -->
<Content components={{ h1: Heading }} />
```

</details>

<callout icon="✅" color="green_bg">
	- ライブローダーで `components` propsが機能する<br>- `@mdx-js/mdx` の追加インストールが不要 (MDXインテグレーションの依存に含まれる)<br>- remark/rehypeプラグインをカスタマイズ可能
</callout>

<callout icon="⚠️" color="yellow_bg">
	- **MDX内の `import` 文は解決できない** (バンドラーがないため)<br>　→ `import Foo from './Foo.astro'` は動かない。`components` propsで渡す設計にする<br>- リクエストごとにコンパイルが走る → `compileMdxCached()` でキャッシュ推奨<br>- スタイル/スクリプト伝播 (`collectedStyles` 等) が動かない
</callout>

#### createProcessor + run() による最適化

`evaluate()` は毎回プロセッサーを生成する。プロセッサーを再利用してパフォーマンスを改善したい場合は `createProcessor` + `run()` を使う:

```ts
import { createProcessor, run } from '@mdx-js/mdx';
import * as runtime from 'astro/jsx-runtime';
import { VFile } from 'vfile';

// プロセッサーは一度だけ作成 (重い)
const processor = createProcessor({
  outputFormat: 'function-body', // ← run() で実行可能な形式
  remarkPlugins: [remarkGfm],
});

// コンパイル結果をキャッシュ (コンパイルは重い)
const compiled = await processor.process(new VFile(mdxSource));

// 実行 (軽い)
const { default: MDXContent } = await run(String(compiled.value), runtime);
```

`evaluate()` = `compile(outputFormat: 'function-body')` + `run()` のショートカット。

---

## まとめ: 方法の比較 {color="blue"}

<table fit-page-width="true" header-row="true" header-column="true">
	<tr>
		<td>方法</td>
		<td>ビルドタイム</td>
		<td>ライブ</td>
		<td>components props</td>
		<td>MDX import</td>
		<td>スタイル伝播</td>
	</tr>
	<tr>
		<td>`renderMarkdown()` + `rendered.html`</td>
		<td color="green_bg">✅</td>
		<td color="green_bg">✅</td>
		<td color="red_bg">❌</td>
		<td color="red_bg">❌</td>
		<td color="red_bg">❌</td>
	</tr>
	<tr>
		<td>ファイル書き出し + `deferredRender: true`</td>
		<td color="green_bg">✅</td>
		<td color="red_bg">❌</td>
		<td color="green_bg">✅</td>
		<td color="green_bg">✅</td>
		<td color="green_bg">✅</td>
	</tr>
	<tr>
		<td>`evaluate()` from @mdx-js/mdx</td>
		<td color="green_bg">✅</td>
		<td color="green_bg">✅</td>
		<td color="green_bg">✅</td>
		<td color="red_bg">❌</td>
		<td color="red_bg">❌</td>
	</tr>
	<tr>
		<td>Vite仮想モジュール + `deferredRender`</td>
		<td color="yellow_bg">△ 要Astro改造</td>
		<td color="red_bg">❌</td>
		<td color="green_bg">✅</td>
		<td color="green_bg">✅</td>
		<td color="green_bg">✅</td>
	</tr>
</table>

<callout icon="⭐" color="purple_bg">
	**推奨**<br>- ビルドタイムローダー → **方法1: ファイル書き出し + `deferredRender: true`** (MDX import も含め完全サポート)<br>- ライブローダー → **方法4: `evaluate()` をページコンポーネントで呼び出し** (`components` propsは動く)
</callout>

---

## 参考: deferredRender の動作フロー {color="gray"}

<details color="gray_bg">
<summary>ビルドタイムローダー → render() → Content (JSX関数) の流れ</summary>

```
カスタムローダー (ビルド時)
  └─ store.set({ filePath: 'src/_remote/foo.mdx', deferredRender: true })
       └─ store.addModuleImport('src/_remote/foo.mdx')
            └─ content-modules.mjs に登録
                 └─ 'src/_remote/foo.mdx'
                      → 'astro:content-layer-deferred-module?fileName=src/_remote/foo.mdx'

ページレンダリング時 (リクエスト時)
  └─ render(entry) → renderEntry(entry)
       └─ deferredRender === true なので
            └─ contentModules.get(entry.filePath)
                 └─ import('astro:content-layer-deferred-module?fileName=...')
                      └─ Viteが解決: filePath → 実ファイル?astroRenderContent
                           └─ MDXプラグインがコンパイル
                                └─ Content (JSX関数) が返る
                                     └─ <Content components={{h1: Heading}} /> ✅
```

</details>
