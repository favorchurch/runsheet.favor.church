'use client';

import type { Editor } from '@tiptap/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  HiArrowUturnLeft,
  HiArrowUturnRight,
  HiBars3,
  HiBars3BottomLeft,
  HiBars3BottomRight,
  HiListBullet,
  HiQueueList,
} from 'react-icons/hi2';

/** Text colours, mirroring the palette used across the runsheet UI. */
const TEXT_COLORS = [
  { label: 'Default', value: null },
  { label: 'Slate', value: '#475569' },
  { label: 'Red', value: '#dc2626' },
  { label: 'Orange', value: '#ea580c' },
  { label: 'Amber', value: '#b45309' },
  { label: 'Green', value: '#15803d' },
  { label: 'Blue', value: '#1d4ed8' },
  { label: 'Violet', value: '#6d28d9' },
  { label: 'Pink', value: '#be185d' },
];

/** Cell fill colours, kept light so text stays readable on top. */
const FILL_COLORS = [
  { label: 'None', value: null },
  { label: 'Yellow', value: '#fef08a' },
  { label: 'Green', value: '#bbf7d0' },
  { label: 'Blue', value: '#bfdbfe' },
  { label: 'Pink', value: '#fbcfe8' },
  { label: 'Orange', value: '#fed7aa' },
  { label: 'Violet', value: '#e9d5ff' },
  { label: 'Grey', value: '#e2e8f0' },
];

interface ToolbarButtonProps {
  onPress: () => void;
  isActive?: boolean;
  disabled?: boolean;
  label: string;
  children: ReactNode;
  className?: string;
}

function ToolbarButton({ onPress, isActive, disabled, label, children, className }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={isActive}
      disabled={disabled}
      // Keeping focus in the editor means the command applies to the live
      // selection instead of an empty one.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPress}
      className={`flex h-7 min-w-[28px] items-center justify-center rounded px-1.5 text-xs transition-colors ${
        isActive ? 'bg-pink-100 text-pink-900' : 'text-slate-600 hover:bg-slate-200 hover:text-slate-900'
      } disabled:cursor-not-allowed disabled:opacity-40 ${className ?? ''}`}
    >
      {children}
    </button>
  );
}

interface ColorMenuProps {
  label: string;
  swatch: ReactNode;
  colors: { label: string; value: string | null }[];
  disabled?: boolean;
  onSelect: (value: string | null) => void;
}

function ColorMenu({ label, swatch, colors, disabled, onSelect }: ColorMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <ToolbarButton label={label} disabled={disabled} onPress={() => setIsOpen((open) => !open)}>
        {swatch}
      </ToolbarButton>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-40 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          <p className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
          <div className="grid grid-cols-4 gap-1">
            {colors.map((color) => (
              <button
                key={color.label}
                type="button"
                title={color.label}
                aria-label={color.label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(color.value);
                  setIsOpen(false);
                }}
                className="flex h-7 items-center justify-center rounded border border-slate-200 hover:ring-2 hover:ring-pink-300"
                style={color.value ? { backgroundColor: color.value } : undefined}
              >
                {color.value ? null : <span className="text-[9px] font-semibold text-slate-500">n/a</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface ToolbarState {
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  isStrike: boolean;
  isBulletList: boolean;
  isOrderedList: boolean;
  isAlignLeft: boolean;
  isAlignCenter: boolean;
  isAlignRight: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * Tracks the open cell's marks so the buttons can show what is active.
 *
 * Subscribes to the editor's own events rather than using `useEditorState`:
 * moving between cells destroys one editor while creating another, and reading
 * a destroyed editor throws. The `isDestroyed` guard is what makes that safe.
 */
function useToolbarState(editor: Editor | null): ToolbarState | null {
  const [state, setState] = useState<ToolbarState | null>(null);

  useEffect(() => {
    if (!editor) {
      setState(null);
      return;
    }

    const read = () => {
      if (editor.isDestroyed) return;

      setState({
        isBold: editor.isActive('bold'),
        isItalic: editor.isActive('italic'),
        isUnderline: editor.isActive('underline'),
        isStrike: editor.isActive('strike'),
        isBulletList: editor.isActive('bulletList'),
        isOrderedList: editor.isActive('orderedList'),
        isAlignLeft: editor.isActive({ textAlign: 'left' }),
        isAlignCenter: editor.isActive({ textAlign: 'center' }),
        isAlignRight: editor.isActive({ textAlign: 'right' }),
        canUndo: editor.can().undo(),
        canRedo: editor.can().redo(),
      });
    };

    const clear = () => setState(null);

    read();
    editor.on('transaction', read);
    editor.on('selectionUpdate', read);
    editor.on('destroy', clear);

    return () => {
      editor.off('transaction', read);
      editor.off('selectionUpdate', read);
      editor.off('destroy', clear);
    };
  }, [editor]);

  return state;
}

interface RichTextToolbarProps {
  editor: Editor | null;
}

/**
 * One formatting bar for the whole grid, acting on whichever cell is open.
 *
 * A spreadsheet has a single toolbar rather than controls inside every cell,
 * and the same applies here for a practical reason: runsheet columns are far too
 * narrow to hold a dozen buttons. The bar is disabled until a cell is opened.
 */
export function RichTextToolbar({ editor }: RichTextToolbarProps) {
  const state = useToolbarState(editor);
  const isDisabled = !editor;

  return (
    // `data-runsheet-format-bar` is what RichTextCell looks for (see
    // FORMAT_BAR_ATTRIBUTE) to tell a formatting click apart from a click away.
    <div
      data-runsheet-format-bar=""
      role="toolbar"
      aria-label="Cell formatting"
      className="sticky top-0 z-30 flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-50/95 px-2 py-1.5 backdrop-blur"
    >
      <ToolbarButton
        label="Bold (Cmd/Ctrl+B)"
        disabled={isDisabled}
        isActive={state?.isBold}
        onPress={() => editor?.chain().focus().toggleBold().run()}
        className="font-bold"
      >
        B
      </ToolbarButton>
      <ToolbarButton
        label="Italic (Cmd/Ctrl+I)"
        disabled={isDisabled}
        isActive={state?.isItalic}
        onPress={() => editor?.chain().focus().toggleItalic().run()}
        className="font-serif italic"
      >
        I
      </ToolbarButton>
      <ToolbarButton
        label="Underline (Cmd/Ctrl+U)"
        disabled={isDisabled}
        isActive={state?.isUnderline}
        onPress={() => editor?.chain().focus().toggleUnderline().run()}
        className="underline"
      >
        U
      </ToolbarButton>
      <ToolbarButton
        label="Strikethrough"
        disabled={isDisabled}
        isActive={state?.isStrike}
        onPress={() => editor?.chain().focus().toggleStrike().run()}
        className="line-through"
      >
        S
      </ToolbarButton>

      <span className="mx-1 h-5 w-px bg-slate-300" aria-hidden />

      <ColorMenu
        label="Text colour"
        disabled={isDisabled}
        colors={TEXT_COLORS}
        swatch={
          <span className="flex flex-col items-center leading-none">
            <span className="text-[11px] font-bold">A</span>
            <span className="mt-0.5 h-1 w-3.5 rounded-sm bg-gradient-to-r from-red-500 to-blue-600" />
          </span>
        }
        onSelect={(value) => {
          const chain = editor?.chain().focus();
          if (!chain) return;
          if (value) chain.setColor(value).run();
          else chain.unsetColor().run();
        }}
      />
      <ColorMenu
        label="Fill colour"
        disabled={isDisabled}
        colors={FILL_COLORS}
        swatch={
          <span className="flex flex-col items-center leading-none">
            <span className="text-[11px] font-bold">A</span>
            <span className="mt-0.5 h-1 w-3.5 rounded-sm bg-yellow-300" />
          </span>
        }
        onSelect={(value) => {
          const chain = editor?.chain().focus();
          if (!chain) return;
          if (value) chain.setBackgroundColor(value).run();
          else chain.unsetBackgroundColor().run();
        }}
      />

      <span className="mx-1 h-5 w-px bg-slate-300" aria-hidden />

      <ToolbarButton
        label="Align left"
        disabled={isDisabled}
        isActive={state?.isAlignLeft}
        onPress={() => editor?.chain().focus().setTextAlign('left').run()}
      >
        <HiBars3BottomLeft className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Align centre"
        disabled={isDisabled}
        isActive={state?.isAlignCenter}
        onPress={() => editor?.chain().focus().setTextAlign('center').run()}
      >
        <HiBars3 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Align right"
        disabled={isDisabled}
        isActive={state?.isAlignRight}
        onPress={() => editor?.chain().focus().setTextAlign('right').run()}
      >
        <HiBars3BottomRight className="h-4 w-4" />
      </ToolbarButton>

      <span className="mx-1 h-5 w-px bg-slate-300" aria-hidden />

      <ToolbarButton
        label="Bulleted list"
        disabled={isDisabled}
        isActive={state?.isBulletList}
        onPress={() => editor?.chain().focus().toggleBulletList().run()}
      >
        <HiListBullet className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        disabled={isDisabled}
        isActive={state?.isOrderedList}
        onPress={() => editor?.chain().focus().toggleOrderedList().run()}
      >
        <HiQueueList className="h-4 w-4" />
      </ToolbarButton>

      <span className="mx-1 h-5 w-px bg-slate-300" aria-hidden />

      <ToolbarButton
        label="Undo (Cmd/Ctrl+Z)"
        disabled={isDisabled || !state?.canUndo}
        onPress={() => editor?.chain().focus().undo().run()}
      >
        <HiArrowUturnLeft className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Redo (Cmd/Ctrl+Shift+Z)"
        disabled={isDisabled || !state?.canRedo}
        onPress={() => editor?.chain().focus().redo().run()}
      >
        <HiArrowUturnRight className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        label="Clear formatting"
        disabled={isDisabled}
        onPress={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}
        className="px-2 text-[11px] font-semibold"
      >
        Clear
      </ToolbarButton>

      <span className="ml-auto pl-2 text-[10px] font-medium text-slate-400">
        {isDisabled ? 'Click a cell to format' : 'Enter saves · Shift+Enter new line'}
      </span>
    </div>
  );
}
