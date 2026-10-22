// A plain text field with mentions as an editor document and back: one paragraph per line,
// mention tokens become `mention` nodes.
import {
  isMentionKind,
  joinMentionSegments,
  parseMentionText,
  type MentionSegment,
} from "./domain";

export interface FieldNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: FieldNode[];
  text?: string;
}

export function textToFieldDoc(text: string): FieldNode {
  const paragraphs = text.split("\n").map((line): FieldNode => {
    const content = parseMentionText(line).map((s): FieldNode =>
      s.type === "text"
        ? { type: "text", text: s.text }
        : { type: "mention", attrs: { id: s.ref.id, kind: s.ref.kind, label: s.ref.label } },
    );
    return content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" };
  });
  return { type: "doc", content: paragraphs };
}

function inlineSegments(node: FieldNode): MentionSegment[] {
  if (node.type === "text") return [{ type: "text", text: node.text ?? "" }];
  if (node.type === "hardBreak") return [{ type: "text", text: "\n" }];
  if (node.type === "mention") {
    const { id, kind, label } = node.attrs ?? {};
    if (typeof id !== "string" || !isMentionKind(kind)) return [];
    return [{ type: "mention", ref: { id, kind, label: typeof label === "string" ? label : "" } }];
  }
  return (node.content ?? []).flatMap(inlineSegments);
}

export function fieldDocToText(doc: FieldNode): string {
  return (doc.content ?? [])
    .map((block) => joinMentionSegments(inlineSegments(block)))
    .join("\n")
    .trimEnd();
}
