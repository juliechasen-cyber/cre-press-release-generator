import { NextResponse } from "next/server";
import { renderDocx, renderPdf, type ImageInput } from "@/lib/render";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "unsupported_media", message: "Send multipart/form-data." },
      { status: 415 },
    );
  }

  const form = await request.formData();
  const draftText = String(form.get("draft_text") || "");
  const format = String(form.get("format") || "docx"); // "docx" | "pdf"
  const slug = String(form.get("slug") || "cre-press-release").slice(0, 60);
  const orientation = (String(form.get("image_orientation") || "landscape") as
    | "landscape"
    | "portrait");
  const credit = String(form.get("image_credit") || "") || undefined;
  const imageFile = form.get("image");

  if (!draftText) {
    return NextResponse.json(
      { error: "missing_draft", message: "draft_text is required." },
      { status: 400 },
    );
  }
  if (!["docx", "pdf"].includes(format)) {
    return NextResponse.json(
      { error: "bad_format", message: 'format must be "docx" or "pdf".' },
      { status: 400 },
    );
  }

  let image: ImageInput = null;
  if (imageFile && imageFile instanceof File && imageFile.size > 0) {
    if (imageFile.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "image_too_large", message: "Image exceeds 10 MB." },
        { status: 413 },
      );
    }
    const mime = imageFile.type;
    if (mime !== "image/jpeg" && mime !== "image/png") {
      return NextResponse.json(
        { error: "bad_image_type", message: "Only JPEG or PNG." },
        { status: 415 },
      );
    }
    const bytes = Buffer.from(await imageFile.arrayBuffer());
    image = { bytes, mime, orientation, credit };
  }

  const buf =
    format === "docx" ? await renderDocx(draftText, image) : await renderPdf(draftText, image);

  const filename = `${slug}.${format}`;
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "content-type":
        format === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "application/pdf",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
