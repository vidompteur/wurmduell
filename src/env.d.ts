/** Erlaubt `import "./styles.css"` (Vite bündelt die Datei). */
declare module "*.css";
declare module "*.properties?raw" {
  const content: string;
  export default content;
}
