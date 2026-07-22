/// <reference types="solid-js" />

interface ImportMetaEnv {
  readonly VERSION: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.svg" {
  const content: string;
  export default content;
}

declare module "*.html?raw" {
  const content: string;
  export default content;
}
