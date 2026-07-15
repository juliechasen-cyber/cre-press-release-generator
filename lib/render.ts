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
import PDFDocument from "pdfkit";

export type ImageInput = {
  bytes: Buffer;
  mime: "image/jpeg" | "image/png";
  orientation: "landscape" | "portrait";
  credit?: string;
} | null;

// US Letter, 1" margins, in points (72 pt = 1")
const PAGE_W = 612;
const PAGE_H = 792;
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
    if (/^Powered by CRE Northstar$/i.test(trimmed)) {
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
            text: "[insert property image here]",
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
              new TextRun({ text: "CRE Northstar", italics: true, color: "666666" }),
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

export async function renderPdf(
  draftText: string,
  image: ImageInput,
): Promise<Buffer> {
  const blocks = parseDraft(draftText);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: MARGIN });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Draws the image (or placeholder). Called after the deck — or after the
    // headline when the draft has no deck — per standard wire layout.
    const drawImage = () => {
      doc.moveDown(0.4);
      if (image) {
        const width = CONTENT_W * landscapeWidthFraction(image.orientation);
        const x = MARGIN + (CONTENT_W - width) / 2;
        const dims = imageDims(image.bytes, image.mime);
        const aspect = dims
          ? dims.w / dims.h
          : image.orientation === "landscape"
            ? 3 / 2
            : 2 / 3;
        const drawnH = width / aspect;
        if (doc.y + drawnH > PAGE_H - MARGIN) doc.addPage();
        const startY = doc.y;
        doc.image(image.bytes, x, startY, { width });
        // pdfkit does not advance the cursor after an explicitly positioned
        // image — move it past the drawn height ourselves.
        doc.y = startY + drawnH;
        doc.moveDown(0.5);
        if (image.credit) {
          doc.fontSize(9).font("Helvetica-Oblique").fillColor("#666666").text(
            `Photo: ${image.credit}`,
            MARGIN,
            doc.y,
            { width: CONTENT_W, align: "center" },
          );
          doc.fillColor("#000000");
        }
        doc.moveDown(0.8);
      } else {
        const placeholderH = 160;
        const placeholderW = CONTENT_W * 0.6;
        const x = MARGIN + (CONTENT_W - placeholderW) / 2;
        const y = doc.y;
        doc
          .rect(x, y, placeholderW, placeholderH)
          .fillAndStroke("#f4f4f2", "#d6d6d0");
        doc
          .fillColor("#888888")
          .font("Helvetica-Oblique")
          .fontSize(10)
          .text("[insert property image here]", x, y + placeholderH / 2 - 6, {
            width: placeholderW,
            align: "center",
          });
        doc.fillColor("#000000").font("Helvetica");
        doc.y = y + placeholderH + 16;
      }
      doc.x = MARGIN;
    };

    const hasDeck = blocks.some((b) => b.kind === "deck");
    const hasHeadline = blocks.some((b) => b.kind === "headline");
    const imageAnchor: Block["kind"] | null = hasDeck
      ? "deck"
      : hasHeadline
        ? "headline"
        : null;
    if (!imageAnchor) drawImage();

    for (const block of blocks) {
      switch (block.kind) {
        case "for-release":
          doc.font("Helvetica-Bold").fontSize(10).text("FOR IMMEDIATE RELEASE", {
            align: "center",
          });
          doc.moveDown(0.5);
          break;
        case "headline":
          doc.font("Helvetica-Bold").fontSize(16).text(block.text, { align: "center" });
          doc.moveDown(0.3);
          break;
        case "deck":
          doc
            .font("Helvetica-Oblique")
            .fontSize(11)
            .text(block.text, { align: "center" });
          doc.moveDown(0.8);
          break;
        case "boilerplate-header":
          doc.moveDown(0.5);
          doc.font("Helvetica-Bold").fontSize(11).text(block.text);
          doc.moveDown(0.3);
          break;
        case "end-marker":
          doc.moveDown(0.5);
          doc.font("Helvetica").fontSize(11).text("##", { align: "center" });
          doc.moveDown(0.5);
          break;
        case "footer":
          doc
            .font("Helvetica-Oblique")
            .fontSize(9)
            .fillColor("#666666")
            .text("Powered by CRE Northstar", { align: "center" });
          doc.fillColor("#000000");
          break;
        case "paragraph":
          doc.font("Helvetica").fontSize(11).text(block.text, {
            align: "left",
            paragraphGap: 6,
          });
          break;
      }
      if (block.kind === imageAnchor) drawImage();
    }
    doc.end();
  });
}
