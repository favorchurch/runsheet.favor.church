/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { RichTextContent } from '@/components/runsheet/RichTextContent';

describe('RichTextContent', () => {
  it('renders plain rich text when no cell URL is present', () => {
    const { container } = render(<RichTextContent value="<p>Pre-Service Prayer</p>" />);
    expect(container).toHaveTextContent('Pre-Service Prayer');
    expect(container.querySelector('a')).toBeNull();
  });

  it('renders a clickable footer chip when a cell URL is embedded', () => {
    const value =
      '<p>Order of Service</p><a href="https://docs.google.com/document/d/123" data-cell-url="https://docs.google.com/document/d/123" target="_blank" rel="noopener noreferrer" class="runsheet-cell-link">https://docs.google.com/document/d/123</a>';

    render(<RichTextContent value={value} />);

    expect(screen.getByText('Order of Service')).toBeInTheDocument();
    const linkElement = screen.getByRole('link', { name: /Open reference: https:\/\/docs\.google\.com\/document\/d\/123/i });
    expect(linkElement).toBeInTheDocument();
    expect(linkElement).toHaveAttribute('href', 'https://docs.google.com/document/d/123');
    expect(linkElement).toHaveAttribute('target', '_blank');
    expect(linkElement).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('stops event propagation on click and mousedown of the footer chip', () => {
    const value =
      '<p>Order of Service</p><a href="https://favor.church" data-cell-url="https://favor.church" target="_blank" rel="noopener noreferrer" class="runsheet-cell-link">https://favor.church</a>';

    const parentClickHandler = jest.fn();
    const parentMouseDownHandler = jest.fn();

    render(
      <div onClick={parentClickHandler} onMouseDown={parentMouseDownHandler}>
        <RichTextContent value={value} />
      </div>
    );

    const linkElement = screen.getByRole('link', { name: /Open reference: https:\/\/favor\.church/i });

    fireEvent.click(linkElement);
    expect(parentClickHandler).not.toHaveBeenCalled();

    fireEvent.mouseDown(linkElement);
    expect(parentMouseDownHandler).not.toHaveBeenCalled();
  });

  it('renders chip only when contentHtml is empty but URL exists', () => {
    const value =
      '<a href="https://favor.church/sheet.pdf" data-cell-url="https://favor.church/sheet.pdf" target="_blank" rel="noopener noreferrer" class="runsheet-cell-link">https://favor.church/sheet.pdf</a>';

    render(<RichTextContent value={value} />);

    const linkElement = screen.getByRole('link', { name: /Open reference: https:\/\/favor\.church\/sheet\.pdf/i });
    expect(linkElement).toBeInTheDocument();
  });
});
