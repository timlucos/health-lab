import { Fragment, type ReactNode } from "react";

// Мини-Markdown для ответов ИИ: заголовки, списки, жирный. Без HTML из ответа.
function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : <Fragment key={i}>{p}</Fragment>));
}

export function Md({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let list: string[] = [];
  let ordered = false;
  const flush = () => {
    if (!list.length) return;
    const items = list.map((l, i) => <li key={i}>{inline(l)}</li>);
    out.push(ordered ? <ol key={out.length} className="steps">{items}</ol> : <ul key={out.length} className="steps">{items}</ul>);
    list = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const h = line.match(/^#{1,4}\s+(.*)/);
    const li = line.match(/^[-*•]\s+(.*)/);
    const ol = line.match(/^\d+[.)]\s+(.*)/);
    if (li || ol) {
      if (list.length && ordered !== !!ol) flush();
      ordered = !!ol;
      list.push((li ?? ol)![1]);
      continue;
    }
    flush();
    if (!line) continue;
    if (h) out.push(<div key={out.length} className="md-h">{inline(h[1].replace(/\*\*/g, ""))}</div>);
    else out.push(<p key={out.length} className="md-p">{inline(line)}</p>);
  }
  flush();
  return <div className="md">{out}</div>;
}
