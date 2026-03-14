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
