export {};

declare global {
  interface ImportMetaEnv {
    readonly VITE_API_BASE_URL?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  interface Window {
    api: {
      [key: string]: (...args: any[]) => Promise<any> | void;
      onFocusSearch: (callback: () => void) => void;
    };
  }
}
