declare module 'fontkit' {
  export interface Font {
    characterSet: number[];
    [key: string]: any;
  }
  export function openSync(path: string): Font;
  export function open(path: string, callback: (err: Error | null, font: Font) => void): void;
}
