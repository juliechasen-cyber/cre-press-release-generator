import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  PageOrientation,
  Paragraph,
  TextRun,
} from "docx";

export type ImageInput = {
  bytes: Buffer;
  mime: "image/jpeg" | "image/png";
  orientation: "landscape" | "portrait";
  credit?: string;
} | null;

// US Letter, 1" margins, in points (72 pt = 1")
const PAGE_W = 612;
const MARGIN = 72;
const CONTENT_W = PAGE_W - MARGIN * 2;

function landscapeWidthFraction(orientation: "landscape" | "portrait"): number {
  return orientation === "landscape" ? 0.6 : 0.45;
}

// Reads true pixel dimensions from a JPEG or PNG buffer so renders keep the
// photo's real aspect ratio. Returns null if the header can't be parsed.
function imageDims(
  bytes: Buffer,
  mime: "image/jpeg" | "image/png",
): { w: number; h: number } | null {
  try {
    if (mime === "image/png") {
      if (bytes.length < 24) return null;
      return { w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20) };
    }
    let i = 2;
    while (i < bytes.length - 9) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = bytes[i + 1];
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      ) {
        return { h: bytes.readUInt16BE(i + 5), w: bytes.readUInt16BE(i + 7) };
      }
      const len = bytes.readUInt16BE(i + 2);
      if (len < 2) return null;
      i += 2 + len;
    }
    return null;
  } catch {
    return null;
  }
}

// Parses the LLM's draft_text into structured blocks the renderer can lay out.
// The LLM follows the wire format in the system prompt, so this parser is
// permissive rather than strict — anything not recognized falls through as a
// plain paragraph.
type Block =
  | { kind: "for-release" }
  | { kind: "headline"; text: string }
  | { kind: "deck"; text: string }
  | { kind: "boilerplate-header"; text: string }
  | { kind: "end-marker" }
  | { kind: "footer" }
  | { kind: "paragraph"; text: string };

export function parseDraft(draftText: string): Block[] {
  const lines = draftText.split(/\r?\n/).map((l) => l.trimEnd());
  const blocks: Block[] = [];

  // Group consecutive non-empty lines into paragraphs, but treat known one-line
  // markers as their own blocks.
  let buf: string[] = [];
  const flush = () => {
    if (!buf.length) return;
    const text = buf.join(" ").trim();
    buf = [];
    if (!text) return;
    blocks.push({ kind: "paragraph", text });
  };

  let sawHeadline = false;
  let sawDeck = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    if (/^FOR IMMEDIATE RELEASE$/i.test(trimmed)) {
      flush();
      blocks.push({ kind: "for-release" });
      continue;
    }
    if (trimmed === "##") {
      flush();
      blocks.push({ kind: "end-marker" });
      continue;
    }
    if (/^Powered by (CRE Northstar|juliechasen\.com)\.?$/i.test(trimmed)) {
      flush();
      blocks.push({ kind: "footer" });
      continue;
    }
    if (/^About\s+.+/i.test(trimmed) && sawHeadline && sawDeck) {
      flush();
      blocks.push({ kind: "boilerplate-header", text: trimmed });
      continue;
    }
    if (!sawHeadline) {
      flush();
      blocks.push({ kind: "headline", text: trimmed });
      sawHeadline = true;
      continue;
    }
    if (!sawDeck) {
      flush();
      blocks.push({ kind: "deck", text: trimmed });
      sawDeck = true;
      continue;
    }
    buf.push(trimmed);
  }
  flush();
  return blocks;
}

export async function renderDocx(
  draftText: string,
  image: ImageInput,
): Promise<Buffer> {
  const blocks = parseDraft(draftText);
  const children: Paragraph[] = [];

  // Image (or placeholder) paragraphs, inserted after the deck — or after the
  // headline when the draft has no deck — per standard wire layout.
  const imageChildren: Paragraph[] = [];
  if (image) {
    // docx wants EMU or pixel widths; use points × 9525 EMU/pt approximated via
    // the library's `transformation` (which takes pixel dimensions at 96 DPI).
    // Convert content width (points) → pixels at 96 DPI: pt * 96 / 72
    const contentPx = (CONTENT_W * 96) / 72;
    const targetPx = Math.round(contentPx * landscapeWidthFraction(image.orientation));
    const dims = imageDims(image.bytes, image.mime);
    const aspect = dims
      ? dims.w / dims.h
      : image.orientation === "landscape"
        ? 3 / 2
        : 2 / 3;
    const heightPx = Math.round(targetPx / aspect);
    imageChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 120, after: 120 },
        children: [
          new ImageRun({
            data: image.bytes,
            transformation: { width: targetPx, height: heightPx },
            type: image.mime === "image/png" ? "png" : "jpg",
          } as ConstructorParameters<typeof ImageRun>[0]),
        ],
      }),
    );
    if (image.credit) {
      imageChildren.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: `Photo: ${image.credit}`, italics: true, size: 18 }),
          ],
        }),
      );
    }
  } else {
    imageChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 120, after: 120 },
        children: [
          new TextRun({
            text: "[ INSERT PROPERTY PHOTO HERE ]",
            italics: true,
            color: "888888",
          }),
        ],
      }),
    );
  }

  const hasDeck = blocks.some((b) => b.kind === "deck");
  const hasHeadline = blocks.some((b) => b.kind === "headline");
  const imageAnchor: Block["kind"] | null = hasDeck
    ? "deck"
    : hasHeadline
      ? "headline"
      : null;
  if (!imageAnchor) children.push(...imageChildren);

  for (const block of blocks) {
    switch (block.kind) {
      case "for-release":
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "FOR IMMEDIATE RELEASE", bold: true, size: 20 }),
            ],
          }),
        );
        break;
      case "headline":
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: block.text, bold: true })],
          }),
        );
        break;
      case "deck":
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: block.text, italics: true })],
          }),
        );
        break;
      case "boilerplate-header":
        children.push(
          new Paragraph({
            children: [new TextRun({ text: block.text, bold: true })],
            spacing: { before: 200 },
          }),
        );
        break;
      case "end-marker":
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "##" })],
            spacing: { before: 200, after: 200 },
          }),
        );
        break;
      case "footer":
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "Powered by ", italics: true, color: "666666" }),
              new TextRun({ text: "juliechasen.com", italics: true, color: "666666" }),
            ],
          }),
        );
        break;
      case "paragraph":
        children.push(
          new Paragraph({
            children: [new TextRun({ text: block.text })],
            spacing: { after: 120 },
          }),
        );
        break;
    }
    if (block.kind === imageAnchor) children.push(...imageChildren);
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.PORTRAIT, width: 12240, height: 15840 },
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
