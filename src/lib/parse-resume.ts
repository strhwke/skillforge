import { extractText, getDocumentProxy } from "unpdf";

/**
 * Server-side PDF -> plain text. Works in Vercel/edge-compatible runtime.
 */
export async function parseResumePdf(buffer: ArrayBuffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

export function cleanResumeText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
