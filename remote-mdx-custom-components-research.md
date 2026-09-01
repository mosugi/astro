# リモートMDXコンテンツへのカスタムコンポーネント適用 - 調査レポート

## 問題の核心

`<Content components={{...components, h1: Heading }} />` という制約を満たすには、
`Content` が**コンパイル済みのMDX JSXコンポーネント関数**である必要がある。

### なぜリモートMDXでは動かないのか

`renderMarkdown()` や事前レンダリングでHTMLを生成してストアに保存した場合:

```ts
// runtime.ts:569 - 事前レンダリングされたHTMLからのContent生成
const Content = createComponent(() => serverRender`${unescapeHTML(html)}`);
```

この `Content` は静的HTMLを出力するだけで、**`components` propsを受け付けない**。

### ローカルMDXで動く理由

`glob()` ローダーでローカル `.mdx` ファイルを使う場合:

1. エントリを `deferredRender: true` + `filePath` でストアに保存
2. ビルド時にViteがそのファイルをMDXプラグインでコンパイル
3. `render(entry)` が実行時に `astro:content-module-imports` 経由でコンパイル済みモジュールをロード
4. 返ってくる `Content` はJSX関数なので `components` propsが機能する

```
glob.ts:218-225:
} else if ('contentModuleTypes' in entryType) {
    store.set({
        id, data, body,
        filePath: relativePath,
        digest,
        deferredRender: true,  // ← これがポイント
    });
}
```

---

## 実現方法の調査

### 方法1: ファイルに書き出す (標準機能のみ / ビルドタイムローダー)

**仕組み**: フェッチしたMDXコンテンツをディスクに書き出し、`deferredRender: true` でViteにコンパイルさせる。

```ts
// src/loaders/remote-mdx-loader.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Loader } from 'astro/loaders';

export function remoteMdxLoader({ apiUrl }: { apiUrl: string }): Loader {
  return {
    name: 'remote-mdx-loader',
    async load({ store, config, parseData, generateDigest, logger }) {
      const response = await fetch(apiUrl);
      const posts: Array<{ id: string; title: string; body: string }> = await response.json();

      // フェッチしたMDXを書き出すディレクトリ
      const outputDir = new URL('src/_remote-content/', config.root);
      mkdirSync(fileURLToPath(outputDir), { recursive: true });

      for (const post of posts) {
        const digest = generateDigest(post.body);
        const mdxFilename = `${post.id}.mdx`;
        const absolutePath = fileURLToPath(new URL(mdxFilename, outputDir));
        const relativePath = `src/_remote-content/${mdxFilename}`;

        // 変更がなければスキップ
        const existing = store.get(post.id);
        if (existing?.digest === digest) {
          // deferredRender エントリは再登録が必要
          store.addModuleImport(relativePath);
          continue;
        }

        // MDXファイルをディスクに書き出す
        writeFileSync(absolutePath, post.body, 'utf-8');

        const data = await parseData({
          id: post.id,
          data: { title: post.title },
        });

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

```ts
// src/content.config.ts
import { defineCollection, z } from 'astro:content';
import { remoteMdxLoader } from './loaders/remote-mdx-loader';

const blog = defineCollection({
  loader: remoteMdxLoader({ apiUrl: 'https://api.example.com/posts' }),
  schema: z.object({ title: z.string() }),
});

export const collections = { blog };
```

```astro
---
// src/pages/blog/[id].astro
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

**評価**:
- ✅ 標準のAstro/Viteの仕組みのみで実現可能
- ✅ `components` propsが完全に機能する
- ✅ MDX内のimportも機能する (ファイルが実在するため)
- ⚠️ ファイルをディスクに書き出す必要がある (gitignoreに追加推奨)
- ⚠️ ビルドタイムローダーのみ (ライブローダーには使えない)
- ⚠️ `src/_remote-content/` が大量のMDXファイルで溢れる可能性

---

### 方法2: Viteプラグイン + バーチャルモジュール (カスタムインテグレーション)

**仕組み**: Astroインテグレーションを作成し、リモートMDXを仮想モジュールとして提供、`deferredRender` と組み合わせる。

**現状の制約**: Astroの `deferredRender` メカニズムは実ファイルパスを要求する:

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

`virtual:` スキームのURLはここで `fileURLToPath` が失敗するため、**現時点ではAstroコアの変更なしには`deferredRender`と仮想モジュールを組み合わせることができない**。

**回避策**: Viteプラグインでリモートコンテンツを一時ファイルに書き出し、その絶対パスを使用する方法に帰着する (方法1と同様)。

---

### 方法3: @mdx-js/mdx による独自コンパイル + 動的評価 (非推奨)

```ts
import { compile } from '@mdx-js/mdx';

// MDXをJSにコンパイル
const compiled = await compile(mdxContent, { /* オプション */ });
const code = String(compiled);

// eval で実行 (セキュリティリスクがある)
const module = await import(`data:text/javascript,${encodeURIComponent(code)}`);
const Content = module.default;
```

**評価**:
- ❌ `data:` URLによる動的importはビルド時に静的解析できない
- ❌ セキュリティリスク (リモートコンテンツの実行)
- ❌ Astroのスタイル/スクリプト収集が動かない
- ❌ 本番ビルドで動作しない

---

### 方法4: `renderMarkdown` + HTMLパース + コンポーネント置換

**仕組み**: HTMLをパースしてコンポーネントで要素を置換する。

```astro
---
import { getCollection, render } from 'astro:content';
import Heading from '../../components/Heading.astro';

// renderMarkdown で生成した場合 (Markdownのみ、MDXのimport/exportは動かない)
const { Content } = await render(entry);
---

<!-- ❌ この場合 components propsは無視される (静的HTML) -->
<Content components={{ h1: Heading }} />
```

- ❌ `renderMarkdown()` はHTMLを返すため `components` propsは効かない
- ❌ MDXの機能 (import/export) が使えない

---

## 結論と推奨

### 標準機能のみで実現する方法

**方法1 (ファイル書き出し)** のみが実現可能。

制約:
- ビルドタイムローダーに限定
- ファイルをディスクに書き出す必要がある

### プラグイン実装による方法

現時点では、Astroコアを変更せずに仮想モジュールと `deferredRender` を組み合わせることは困難。

最も現実的なプラグインアプローチも、内部的には**方法1と同じ「ファイルに書き出し」**パターンになる。

ただし、インテグレーションとしてパッケージ化することで利用者側の実装を隠蔽できる:

```ts
// astro-remote-mdx-integration (概念実装)
export function remoteMarkdownIntegration(): AstroIntegration {
  return {
    name: 'astro-remote-mdx',
    hooks: {
      'astro:config:setup': ({ addContentEntryType, addWatchFile }) => {
        // カスタムコンテンツエントリータイプを登録
        // ローダーで deferredRender: true を使えるように
      },
    },
  };
}
```

### `components` propsの要件を満たすための絶対条件

`<Content components={{...components, h1: Heading}} />` が機能するには:

1. `Content` が `props.components` を受け取るJSX関数であること
2. そのためにはViteのMDXプラグインがソースをコンパイルしている必要がある
3. コンパイルには**実在するファイルパス** (またはViteが解決できるモジュールID) が必要
4. よって何らかの形でMDXソースをViteが参照できる場所に置く必要がある

現状のAstro (v5.x) では、**ファイルへの書き出し**が最も信頼性の高い実現方法。

---

---

## ライブローダーへの対応

### ライブローダーの根本的な制約

`LiveDataEntry` が持てるのは `rendered?: { html: string }` だけ:

```ts
// types/public/content.ts:165
export interface LiveDataEntry<TData> {
  id: string;
  data: TData;
  rendered?: { html: string };  // ← 静的HTMLのみ。deferredRender も filePath も持てない
  cacheHint?: CacheHint;
}
```

`render()` from `astro:content` はビルドタイムの `DataEntry` 専用 (`DataEntryMap` のみ型に含まれる)。
ライブコレクションには `getLiveEntry()` / `getLiveCollection()` を使い、`render()` は呼べない。

よって **「Viteのトランスフォームパイプライン」を使ったコンパイルはリクエスト時に不可能**。

---

### 解決策: `@mdx-js/mdx` の `evaluate()` を直接使う

`@mdx-js/mdx` は `evaluate()` 関数を提供している。これはコンパイルと実行を1ステップで行い、
MDXソース文字列から **実行可能なJSXコンポーネント関数** を直接返す。

Astroの `jsx-runtime` は `evaluate()` が必要とする `jsx`, `jsxs`, `Fragment` をすべてエクスポートしている:

```ts
// astro/src/jsx-runtime/index.ts:94
export { AstroJSX, Fragment, createVNode as jsx, createVNode as jsxDEV, createVNode as jsxs };
```

`createVNode` はAstro VNodeを作成し、Astroのレンダリングパイプラインが処理できる。

#### 実装: `compileMdxForAstro()` ヘルパー

```ts
// src/utils/compile-mdx.ts
import { evaluate } from '@mdx-js/mdx';
import { jsx, jsxs, Fragment } from 'astro/jsx-runtime';
import { __astro_tag_component__ } from 'astro/runtime/server/index.js';
import remarkGfm from 'remark-gfm';

export async function compileMdxForAstro(mdxSource: string) {
  // @mdx-js/mdx の evaluate() でコンパイル + 実行
  // Astroの jsx-runtime を渡すことでAstro VNodeが生成される
  const mod = await evaluate(mdxSource, {
    jsx,
    jsxs,
    Fragment,
    remarkPlugins: [remarkGfm],
    // rehypePlugins: [...],
  });

  const MDXContent = mod.default;
  // MDX内の `export const components` があれば取得
  const mdxComponents = (mod as any).components ?? {};

  // vite-plugin-mdx-postprocess.ts の transformContentExport() と同等の処理を手動で行う:
  // components propsのマージを行うラッパー
  const Content = (props: Record<string, any> = {}) =>
    MDXContent({
      ...props,
      components: {
        Fragment,
        ...mdxComponents,     // MDX内のexport components
        ...props.components,  // 呼び出し側が渡すcomponents (h1: Heading など)
      },
    });

  // vite-plugin-mdx-postprocess.ts の annotateContentExport() と同等
  Content[Symbol.for('mdx-component')] = true;
  Content[Symbol.for('astro.needsHeadRendering')] = true;
  // Astroのレンダリングパイプラインに 'astro:jsx' レンダラーとして登録
  __astro_tag_component__(Content, 'astro:jsx');

  return Content;
}
```

#### ライブローダー実装

```ts
// src/loaders/remote-live-mdx-loader.ts
import type { LiveLoader, LiveDataEntry } from 'astro/loaders';

export function remoteLiveMdxLoader({ apiUrl }: { apiUrl: string }): LiveLoader<{ title: string; body: string }> {
  return {
    name: 'remote-live-mdx-loader',

    async loadEntry({ filter }) {
      const response = await fetch(`${apiUrl}/${filter.id}`);
      if (!response.ok) return undefined;
      const post = await response.json();

      return {
        id: post.id,
        data: {
          title: post.title,
          body: post.mdxContent, // ← 生のMDXを data に保持。rendered.html には入れない
        },
      } satisfies LiveDataEntry<{ title: string; body: string }>;
    },

    async loadCollection() {
      const response = await fetch(apiUrl);
      const posts = await response.json();
      return {
        entries: posts.map((post: any) => ({
          id: post.id,
          data: { title: post.title, body: post.mdxContent },
        })),
      };
    },
  };
}
```

#### ページコンポーネントでの使用

```astro
---
// src/pages/blog/[id].astro
import { getLiveEntry } from 'astro:content';
import { compileMdxForAstro } from '../../utils/compile-mdx';
import Heading from '../../components/Heading.astro';

const { entry, error } = await getLiveEntry('blog', { id: Astro.params.id });
if (error || !entry) return Astro.redirect('/404');

// リクエスト時にMDXをコンパイルしてJSXコンポーネントに変換
const Content = await compileMdxForAstro(entry.data.body);
---

<!-- ✅ components propsが機能する: ContentはAstro JSXコンポーネント関数 -->
<Content components={{ h1: Heading }} />
```

**評価**:
- ✅ ライブローダーで `components` propsが機能する
- ✅ `@mdx-js/mdx` の追加インストールが不要 (MDXインテグレーションの依存に含まれる)
- ✅ remark/rehypeプラグインをカスタマイズ可能
- ⚠️ **MDX内の `import` 文は解決できない** (バンドラーがないため)
  - `import Foo from './components/Foo.astro'` は動かない
  - 代わりに `components` propsで渡す設計が必要
- ⚠️ リクエストごとにコンパイルが走る → パフォーマンスへの考慮が必要
  - コンパイル結果を LRUキャッシュ等でキャッシュすることを推奨
- ⚠️ スタイル/スクリプト伝播 (`collectedStyles` 等) が動かない

#### パフォーマンス改善: コンパイル結果のキャッシュ

```ts
// src/utils/compile-mdx.ts (キャッシュ付き)
import { createHash } from 'node:crypto';

const cache = new Map<string, ReturnType<typeof compileMdxForAstro>>();

export async function compileMdxCached(mdxSource: string) {
  const hash = createHash('sha256').update(mdxSource).digest('hex');
  if (cache.has(hash)) return cache.get(hash)!;

  const promise = compileMdxForAstro(mdxSource);
  cache.set(hash, promise);
  return promise;
}
```

---

### MDXプラグイン (`createMdxProcessor`) を直接使う場合

`@astrojs/mdx` の内部実装 (`plugins.ts`) で使われている `createMdxProcessor` を使うことも可能。
これは `@mdx-js/mdx` の `createProcessor` のラッパーで、Astroのremarksプラグインやrehypeプラグインがプリセットされている。

```ts
// プロセッサーを再利用する場合 (evaluate() は毎回プロセッサーを作る)
import { createMdxProcessor } from '@astrojs/mdx/internal'; // ← 公開APIではない
import { VFile } from 'vfile';

// ※ このAPIは公開されていない。以下と同等のことを @mdx-js/mdx で直接行う:
import { createProcessor } from '@mdx-js/mdx';

const processor = createProcessor({
  jsx: true,
  jsxImportSource: 'astro',
  format: 'mdx',
  remarkPlugins: [remarkGfm],
});
```

`createProcessor` → `processor.process(vfile)` でコンパイルしてもJavaScriptの **文字列** が得られるだけ。
それを実行するには `run()` が必要:

```ts
import { createProcessor, run } from '@mdx-js/mdx';
import * as runtime from 'astro/jsx-runtime';
import { VFile } from 'vfile';

const processor = createProcessor({
  outputFormat: 'function-body', // ← run() で実行可能な形式
  remarkPlugins: [remarkGfm],
});

// コンパイル (重いので一度だけ行い結果をキャッシュ)
const compiled = await processor.process(new VFile(mdxSource));
const code = String(compiled.value);

// 実行 (軽い)
const { default: MDXContent } = await run(code, runtime);
```

`evaluate()` = `compile()` with `outputFormat: 'function-body'` + `run()` の組み合わせ。
プロセッサーを再利用したい場合 (パフォーマンス) は `createProcessor` + `run()` が有利。

---

## まとめ: 方法の比較

| 方法 | ビルドタイムローダー | ライブローダー | components props | MDX import | スタイル伝播 |
|------|:-:|:-:|:-:|:-:|:-:|
| `renderMarkdown()` + `rendered.html` | ✅ | ✅ | ❌ | ❌ | ❌ |
| ファイル書き出し + `deferredRender: true` | ✅ | ❌ | ✅ | ✅ | ✅ |
| `evaluate()` from @mdx-js/mdx (ページで呼び出し) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Vite仮想モジュール + `deferredRender` | △要Astro改造 | ❌ | ✅ | ✅ | ✅ |

**推奨**:
- ビルドタイムローダー → **ファイル書き出し + `deferredRender: true`** (MDX import も含め完全サポート)
- ライブローダー → **`evaluate()` をページコンポーネントで呼び出し** (`components` propsは動く)

---

## 参考: deferredRender の動作フロー

```
カスタムローダー
  └─ store.set({ filePath: 'src/_remote/foo.mdx', deferredRender: true })
       └─ store.addModuleImport('src/_remote/foo.mdx')
            └─ content-modules.mjs に登録
                 └─ 'src/_remote/foo.mdx' → 'astro:content-layer-deferred-module?fileName=src/_remote/foo.mdx&astroContentModuleFlag=true'

ページレンダリング時
  └─ render(entry) → renderEntry(entry)
       └─ deferredRender === true なので
            └─ contentModules.get(entry.filePath)
                 └─ import('astro:content-layer-deferred-module?fileName=...')
                      └─ Viteが解決: filePath → 実ファイル?astroRenderContent
                           └─ MDXプラグインがコンパイル
                                └─ Content (JSX関数) が返る
                                     └─ <Content components={{h1: Heading}} /> ✅
```
