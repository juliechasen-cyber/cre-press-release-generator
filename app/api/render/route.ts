import { NextResponse } from "next/server";
import { renderDocx } from "@/lib/render";

export const runtime = "nodejs";
export const maxDuration = 30;

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
  const format = String(form.get("format") || "docx"); // "docx" — the only format
  const slug = String(form.get("slug") || "cre-press-release").slice(0, 60);
  if (!draftText) {
    return NextResponse.json(
      { error: "missing_draft", message: "draft_text is required." },
      { status: 400 },
    );
  }
  if (format !== "docx") {
    return NextResponse.json(
      { error: "bad_format", message: 'format must be "docx".' },
      { status: 400 },
    );
  }

  const buf = await renderDocx(draftText, null);

  const filename = `${slug}.docx`;
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
