declare module 'pdf-parse' {
  function pdfParse(data: Buffer, options?: unknown): Promise<{ text: string; numpages: number }>;
  export default pdfParse;
}
