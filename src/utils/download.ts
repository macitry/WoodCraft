/**
 * Trigger a file download in the browser.
 *
 * `content` takes bytes as well as text because the BOM exports are not all
 * text: the `.xlsx` is a ZIP of XML parts, and a `Uint8Array` run through
 * `String()` on the way into the Blob would be a file that opens as nothing.
 * Everything else about the trip — object URL, anchor, revoke — is the same for
 * both, which is why there is one function rather than two.
 */
export function downloadFile(
  filename: string,
  content: string | Uint8Array,
  mimeType: string,
): void {
  const blob = new Blob([content as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
