/**
 * Generates embed code snippet for the Pinggo website form.
 * Reuses the existing webhook token — no separate Integration row needed.
 */
export function generateEmbedCode(token: string, host: string): string {
  return `<script src="${host}/api/v1/embed/form.js" data-token="${token}"></script>`;
}
