/**
 * Notion Enhanced Markdown → Astro コンポーネントマッピング
 *
 * このオブジェクトを <Content components={notionComponents} /> に渡すことで、
 * Notion Enhanced Markdown の全ブロック・インライン要素が
 * 対応する Astro コンポーネントでレンダリングされる。
 *
 * 参考: https://developers.notion.com/reference/enhanced-markdown
 *
 * MDX の components マップの仕組み:
 *   - 小文字の要素名 → HTMLネイティブ要素またはこのマップでの上書き
 *   - ハイフン付き要素名 (mention-user 等) → カスタム要素としてマップから検索
 *   - evaluate() でコンパイルされたMDXは _components[name] を参照する
 */

// ── Notion 固有ブロック ────────────────────────────────────────
import Audio from './Audio.astro';
import Callout from './Callout.astro';
import Column from './Column.astro';
import Columns from './Columns.astro';
import DatabaseRef from './DatabaseRef.astro';
import EmptyBlock from './EmptyBlock.astro';
import FileBlock from './FileBlock.astro';
import Mention from './Mention.astro';
import MentionDate from './MentionDate.astro';
import PageRef from './PageRef.astro';
import PdfBlock from './PdfBlock.astro';
import SyncedBlock from './SyncedBlock.astro';
import TableOfContents from './TableOfContents.astro';
import Video from './Video.astro';

// ── HTML 要素の上書き ──────────────────────────────────────────
import H1 from './H1.astro';
import H2 from './H2.astro';
import H3 from './H3.astro';
import H4 from './H4.astro';
import ImageBlock from './ImageBlock.astro';
import Quote from './Quote.astro';
import StyledSpan from './StyledSpan.astro';
import TableBlock from './TableBlock.astro';
import TableCell from './TableCell.astro';
import TableCol from './TableCol.astro';
import TableColgroup from './TableColgroup.astro';
import TableRow from './TableRow.astro';
import Toggle from './Toggle.astro';
import ToggleTitle from './ToggleTitle.astro';

export const notionComponents = {
	// ── Notion 固有ブロック ────────────────────────────────────

	/** カラー背景付きの注意書きブロック */
	callout: Callout,

	/** 折りたたみトグルブロック (details 要素の上書き) */
	details: Toggle,
	/** トグルのタイトル (summary 要素の上書き) */
	summary: ToggleTitle,

	/** マルチカラムレイアウト */
	columns: Columns,
	column: Column,

	/** メディアブロック */
	audio: Audio,
	video: Video,
	file: FileBlock,
	pdf: PdfBlock,

	/** ページ・データベース参照ブロック */
	page: PageRef,
	database: DatabaseRef,

	/** 目次ブロック */
	table_of_contents: TableOfContents,

	/** 同期ブロック */
	synced_block: SyncedBlock,
	synced_block_reference: SyncedBlock,

	/** 明示的な空行 (プレーンな空行はストリップされるため専用タグが必要) */
	'empty-block': EmptyBlock,

	// ── インラインメンション ────────────────────────────────────
	/** @ユーザー / ページ / データベース / データソース / エージェント への言及 */
	'mention-user': Mention,
	'mention-page': Mention,
	'mention-database': Mention,
	'mention-data-source': Mention,
	'mention-agent': Mention,
	/** 日付メンション */
	'mention-date': MentionDate,

	// ── 標準 HTML 要素の上書き ──────────────────────────────────

	/** 見出し (color 属性に対応) */
	h1: H1,
	h2: H2,
	h3: H3,
	h4: H4,

	/** 引用ブロック (> 構文) */
	blockquote: Quote,

	/** インラインスタイル (color / underline 属性に対応) */
	span: StyledSpan,

	/** 画像ブロック (![alt](url) 構文) */
	img: ImageBlock,

	/** テーブル (fit-page-width / header-row / header-column 属性に対応) */
	table: TableBlock,
	colgroup: TableColgroup,
	col: TableCol,
	/** 行・セル (color 属性でセル/行の背景色を指定) */
	tr: TableRow,
	td: TableCell,
} as const;

export type NotionComponents = typeof notionComponents;
