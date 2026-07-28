declare module 'remarkable' {
  export interface RemarkableOptions {
    html?: boolean;
    breaks?: boolean;
    typographer?: boolean;
  }

  export class Remarkable {
    constructor(options?: RemarkableOptions);
    render(markdown: string): string;
  }
}
