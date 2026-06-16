/// <reference types="vite/client" />

// Vite ?url imports (e.g. @shopify/polaris/build/esm/styles.css?url)
declare module "*.css?url" {
  const url: string;
  export default url;
}
