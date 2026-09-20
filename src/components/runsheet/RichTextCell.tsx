'use client';

import TextAlign from '@tiptap/extension-text-align';
import { BackgroundColor, Color, TextStyle } from '@tiptap/extension-text-style';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useRef, useState } from 'react';
import { embedCellUrl, extractCellUrl, legacyValueToHtml, normalizeRichTextValue } from '@/lib/richText';
import { HiLink, HiXMark } from 'react-icons/hi2';

/** Marks the shared formatting bar so clicks on it do not close the open cell. */
export const FORMAT_BAR_ATTRIBUTE = 'data-runsheet-format-bar';

/** Marks a closed cell, so pressing one hands editing over instead of closing. */
export const CELL_ATTRIBUTE = 'data-runsheet-cell';

/**
 * Cell-scoped Tiptap configuration.
 *
 * Block-level features that make no sense inside a table cell are switched off
 * (headings, code blocks, blockquotes, rules) as is `link`, whose `<a>` tag is
 * deliberately absent from the sanitiser allowlist. What remains is the
 * formatting a spreadsheet offers: character marks, colour, alignment, lists.
 */
const CELL_EXTENSIONS = [
  StarterKit.configure({
    heading: false,
    codeBlock: false,
    blockquote: false,
    horizontalRule: false,
    code: false,
    link: false,
  }),
  TextStyle,
  Color,
  BackgroundColor,
  TextAlign.configure({ types: ['paragraph'] }),
];

interface RichTextCellProps {
  value: string;
  onChange: (html: string) => void;
  /** Leaves edit mode. Whatever `onChange` last reported is what gets saved. */
  onCommit: () => void;
  /** Publishes the live editor so the shared formatting bar can drive it. */
  onEditorChange: (editor: Editor | null) => void;
}

/**
 * WYSIWYG editor for a single runsheet cell.
 *
 * Mounted only for the cell currently being edited. Keyboard handling:
 * Enter (including Shift/Cmd/Ctrl+Enter) inserts a hard break newline.
 * Escape closes/commits the cell. Pointer clicks outside close/commit.
 */
export function RichTextCell({ value, onChange, onCommit, onEditorChange }: RichTextCellProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);

  const initialParsed = useRef(extractCellUrl(value));
  const [cellUrl, setCellUrl] = useState(initialParsed.current.url ?? '');
  const cellUrlRef = useRef(cellUrl);
  cellUrlRef.current = cellUrl;

  // The editor's options are captured once, so callbacks are read through refs
  // to avoid firing a stale `onChange` from an earlier render.
  const onChangeRef = useRef(onChange);
  const onCommitRef = useRef(onCommit);
  const onEditorChangeRef = useRef(onEditorChange);
  onChangeRef.current = onChange;
  onCommitRef.current = onCommit;
  onEditorChangeRef.current = onEditorChange;

  const editor = useEditor({
    extensions: CELL_EXTENSIONS,
    content: legacyValueToHtml(initialParsed.current.contentHtml),
    autofocus: false,
    // The grid is client-rendered, but Next.js still prerenders client
    // components; deferring the first render keeps Tiptap out of SSR.
    immediatelyRender: false,
    editorProps: {
      handleScrollToSelection: () => true,
      attributes: {
        class:
          'runsheet-rich-text w-full min-h-[28px] px-2.5 py-1 text-[11px] font-medium leading-normal text-slate-900 focus:outline-none',
      },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onCommitRef.current();
          return true;
        }

        if (event.key === 'Enter') {
          event.preventDefault();
          editorRef.current?.chain().focus().setHardBreak().run();
          return true;
        }

        return false;
      },
    },
    onUpdate: ({ editor: instance }) => {
      const currentHtml = normalizeRichTextValue(instance.getHTML());
      onChangeRef.current(embedCellUrl(currentHtml, cellUrlRef.current));
    },
  });

  editorRef.current = editor;

  const handleUrlChange = (newUrl: string) => {
    setCellUrl(newUrl);
    cellUrlRef.current = newUrl;
    const currentHtml = editor ? normalizeRichTextValue(editor.getHTML()) : initialParsed.current.contentHtml;
    onChangeRef.current(embedCellUrl(currentHtml, newUrl));
  };

  // Focus the editor on mount without auto-scrolling the browser window
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const domEl = editor.view?.dom as HTMLElement | undefined;
    if (domEl && typeof domEl.focus === 'function') {
      domEl.focus({ preventScroll: true });
    }
    editor.commands.focus('end', { scrollIntoView: false });
  }, [editor]);

  // Hand the live editor to the shared formatting bar, and take it back on unmount.
  useEffect(() => {
    onEditorChangeRef.current(editor);
    return () => onEditorChangeRef.current(null);
  }, [editor]);

  // Close when the pointer goes somewhere else. Uses a document listener rather
  // than onBlur so pressing a formatting button does not close the cell.
  //
  // Two targets are deliberately ignored: the formatting bar, and any other
  // cell. Another cell opens itself on the same mousedown, and closing here
  // would race that. Nothing is lost by skipping it — `onChange` has already
  // pushed every keystroke into the grid's state; committing only closes.
  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (containerRef.current?.contains(target)) return;
      if (target.closest(`[${FORMAT_BAR_ATTRIBUTE}]`)) return;
      if (target.closest(`[${CELL_ATTRIBUTE}]`)) return;

      onCommitRef.current();
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  return (
    <div
      ref={containerRef}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="w-full h-full min-h-[24px] rounded-none ring-2 ring-blue-600 border border-blue-600 bg-white shadow-xs focus-within:outline-none flex flex-col justify-center"
    >
      <EditorContent editor={editor} />
      <div className="flex items-center gap-1 border-t border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px]">
        <HiLink className="h-3 w-3 text-slate-400 shrink-0" aria-hidden="true" />
        <input
          type="url"
          value={cellUrl}
          onChange={(e) => handleUrlChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              onCommitRef.current();
            }
          }}
          placeholder="Attach URL or file reference (https://...)"
          aria-label="Cell URL or file reference"
          className="w-full bg-transparent text-[10px] text-slate-700 placeholder:text-slate-400 focus:outline-none"
        />
        {cellUrl && (
          <button
            type="button"
            onClick={() => handleUrlChange('')}
            className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer shrink-0"
            title="Remove URL"
            aria-label="Remove URL"
          >
            <HiXMark className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
