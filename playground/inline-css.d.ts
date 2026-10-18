/** Vite's `?inline`: a stylesheet's text, as a string (playground/resets.ts). */
declare module '*.css?inline' {
  const css: string;
  export default css;
}
