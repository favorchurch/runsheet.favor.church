/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { RichTextCell } from '@/components/runsheet/RichTextCell';
import { extractCellUrl } from '@/lib/richText';

describe('RichTextCell', () => {
  it('renders editor content and url attachment input', () => {
    const onChange = jest.fn();
    const onCommit = jest.fn();
    const onEditorChange = jest.fn();

    render(
      <RichTextCell
        value="<p>Song 1</p>"
        onChange={onChange}
        onCommit={onCommit}
        onEditorChange={onEditorChange}
      />
    );

    expect(screen.getByRole('textbox', { name: /Cell URL or file reference/i })).toBeInTheDocument();
  });

  it('populates existing cell URL into the attachment input', () => {
    const value =
      '<p>Song 1</p><a href="https://charts.favor.church/song1.pdf" data-cell-url="https://charts.favor.church/song1.pdf" target="_blank" rel="noopener noreferrer" class="runsheet-cell-link">https://charts.favor.church/song1.pdf</a>';

    render(
      <RichTextCell
        value={value}
        onChange={jest.fn()}
        onCommit={jest.fn()}
        onEditorChange={jest.fn()}
      />
    );

    const urlInput = screen.getByRole('textbox', { name: /Cell URL or file reference/i }) as HTMLInputElement;
    expect(urlInput.value).toBe('https://charts.favor.church/song1.pdf');
    expect(screen.getByRole('button', { name: /Remove URL/i })).toBeInTheDocument();
  });

  it('updates value with embedded URL when URL input changes', () => {
    const onChange = jest.fn();

    render(
      <RichTextCell
        value="<p>Song 1</p>"
        onChange={onChange}
        onCommit={jest.fn()}
        onEditorChange={jest.fn()}
      />
    );

    const urlInput = screen.getByRole('textbox', { name: /Cell URL or file reference/i });
    fireEvent.change(urlInput, { target: { value: 'https://favor.church/plan.pdf' } });

    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    const parsed = extractCellUrl(lastCall);
    expect(parsed.url).toBe('https://favor.church/plan.pdf');
  });

  it('clears URL when clear button is clicked', () => {
    const onChange = jest.fn();
    const value =
      '<p>Song 1</p><a href="https://charts.favor.church/song1.pdf" data-cell-url="https://charts.favor.church/song1.pdf" target="_blank" rel="noopener noreferrer" class="runsheet-cell-link">https://charts.favor.church/song1.pdf</a>';

    render(
      <RichTextCell
        value={value}
        onChange={onChange}
        onCommit={jest.fn()}
        onEditorChange={jest.fn()}
      />
    );

    const clearButton = screen.getByRole('button', { name: /Remove URL/i });
    fireEvent.click(clearButton);

    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    const parsed = extractCellUrl(lastCall);
    expect(parsed.url).toBeNull();
  });

  it('handles Escape key by calling onCommit', () => {
    const onCommit = jest.fn();

    const { container } = render(
      <RichTextCell
        value="<p>Song 1</p>"
        onChange={jest.fn()}
        onCommit={onCommit}
        onEditorChange={jest.fn()}
      />
    );

    const editorEl = container.querySelector('.ProseMirror') || container.querySelector('[contenteditable="true"]');
    if (editorEl) {
      fireEvent.keyDown(editorEl, { key: 'Escape' });
      expect(onCommit).toHaveBeenCalled();
    }
  });

  it('does NOT call onCommit when Enter, Shift+Enter, or Cmd+Enter is pressed in the editor', () => {
    const onCommit = jest.fn();

    const { container } = render(
      <RichTextCell
        value="<p>Song 1</p>"
        onChange={jest.fn()}
        onCommit={onCommit}
        onEditorChange={jest.fn()}
      />
    );

    const editorEl = container.querySelector('.ProseMirror') || container.querySelector('[contenteditable="true"]');
    if (editorEl) {
      // Plain Enter
      fireEvent.keyDown(editorEl, { key: 'Enter' });
      expect(onCommit).not.toHaveBeenCalled();

      // Shift + Enter
      fireEvent.keyDown(editorEl, { key: 'Enter', shiftKey: true });
      expect(onCommit).not.toHaveBeenCalled();

      // Cmd + Enter
      fireEvent.keyDown(editorEl, { key: 'Enter', metaKey: true });
      expect(onCommit).not.toHaveBeenCalled();

      // Ctrl + Enter
      fireEvent.keyDown(editorEl, { key: 'Enter', ctrlKey: true });
      expect(onCommit).not.toHaveBeenCalled();
    }
  });
});
