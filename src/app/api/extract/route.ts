import { NextRequest, NextResponse } from "next/server";
import { generate, Models } from "@/lib/gemini";
import { EXTRACT_SCHEMA, EXTRACT_SYSTEM, extractPrompt } from "@/lib/prompts/extract";
import { parseResumePdf, cleanResumeText } from "@/lib/parse-resume";
import type { ExtractedContext } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let jd = "";
    let resume = "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      jd = String(form.get("jd") ?? "");
      const resumeText = form.get("resumeText");
      const resumeFile = form.get("resumeFile");

      if (typeof resumeText === "string" && resumeText.trim()) {
        resume = resumeText;
      } else if (resumeFile instanceof File) {
        const buf = await resumeFile.arrayBuffer();
        if (resumeFile.type === "application/pdf" || resumeFile.name.endsWith(".pdf")) {
          resume = await parseResumePdf(buf);
        } else {
          resume = new TextDecoder().decode(buf);
        }
      }
    } else {
      const body = await req.json();
      jd = body.jd ?? "";
      resume = body.resume ?? "";
    }

    jd = jd.trim();
    resume = cleanResumeText(resume);

    if (!jd || !resume) {
      return NextResponse.json(
        { error: "Both 'jd' and 'resume' (text or PDF) are required." },
        { status: 400 },
      );
    }
    if (jd.length < 80) {
      return NextResponse.json(
        { error: "Job description is too short. Paste the full JD." },
        { status: 400 },
      );
    }
    if (resume.length < 120) {
      return NextResponse.json(
        { error: "Resume content is too short or could not be extracted." },
        { status: 400 },
      );
    }

    const result = await generate<ExtractedContext>({
      model: Models.flash,
      systemInstruction: EXTRACT_SYSTEM,
      prompt: extractPrompt({ jd, resume }),
      json: true,
      responseSchema: EXTRACT_SCHEMA as unknown as Record<string, unknown>,
      temperature: 0.2,
      maxOutputTokens: 4096,
    });

    if (!result.json) {
      return NextResponse.json(
        { error: "Model returned non-JSON output", raw: result.text.slice(0, 500) },
        { status: 502 },
      );
    }

    // Sort skills by weight then mentioned
    const ctx = result.json;
    ctx.skills = (ctx.skills ?? [])
      .slice(0, 14)
      .sort((a, b) => {
        if (b.jd_weight !== a.jd_weight) return b.jd_weight - a.jd_weight;
        return Number(b.mentioned_in_resume) - Number(a.mentioned_in_resume);
      });

    return NextResponse.json(ctx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/extract]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
