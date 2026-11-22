import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-${match.index}`;
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={key} className="font-semibold">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("`")) {
      nodes.push(
        <code
          key={key}
          className="rounded-md border border-black/5 bg-black/[0.05] px-1.5 py-0.5 font-mono text-[0.85em] dark:border-white/10 dark:bg-white/10"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("[")) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      nodes.push(
        <a
          key={key}
          href={linkMatch?.[2] || "#"}
          target="_blank"
          rel="noreferrer noopener"
          className="font-medium text-[#7C5CFF] underline decoration-[#7C5CFF]/30 underline-offset-2 hover:decoration-[#7C5CFF]"
        >
          {linkMatch?.[1] || token}
        </a>
      );
    } else {
      nodes.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-black/10 bg-[#0F0F16] dark:border-white/10">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            } catch {
              // Clipboard unavailable
            }
          }}
          className="inline-flex cursor-pointer items-center gap-1 text-[10px] font-medium text-slate-400 transition-colors hover:text-white"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-3.5 py-3 text-[12.5px] leading-relaxed text-slate-100">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function MarkdownLite({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let codeLines: string[] = [];
  let inCode = false;
  let codeLang = "";

  const flushList = (key: string) => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={key} className="my-2 list-disc space-y-1 pl-5">
        {list.map((item, i) => (
          <li key={`${key}-${i}`}>{renderInline(item, `${key}-${i}`)}</li>
        ))}
      </ul>
    );
    list = [];
  };

  lines.forEach((line, index) => {
    const fence = /^```(\w*)/.exec(line.trim());
    if (fence && !inCode) {
      flushList(`list-${index}`);
      inCode = true;
      codeLang = fence[1] || "";
      codeLines = [];
      return;
    }
    if (inCode) {
      if (line.trim().startsWith("```")) {
        blocks.push(<CodeBlock key={`code-${index}`} code={codeLines.join("\n")} language={codeLang} />);
        inCode = false;
        codeLines = [];
      } else {
        codeLines.push(line);
      }
      return;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      list.push(line.replace(/^\s*[-*]\s+/, ""));
      return;
    }
    flushList(`list-${index}`);
    if (/^\s*#{1,3}\s+/.test(line)) {
      blocks.push(
        <h4 key={`h-${index}`} className="mt-3 mb-1 font-display text-[15px] font-semibold">
          {line.replace(/^\s*#{1,3}\s+/, "")}
        </h4>
      );
      return;
    }
    if (/^\s*>\s+/.test(line)) {
      blocks.push(
        <blockquote
          key={`q-${index}`}
          className="my-2 border-l-2 border-[#7C5CFF]/40 pl-3 text-[0.95em] italic opacity-80"
        >
          {renderInline(line.replace(/^\s*>\s+/, ""), `q-${index}`)}
        </blockquote>
      );
      return;
    }
    if (line.trim() === "") {
      blocks.push(<div key={`sp-${index}`} className="h-2" />);
      return;
    }
    blocks.push(
      <p key={`p-${index}`} className="leading-relaxed">
        {renderInline(line, `p-${index}`)}
      </p>
    );
  });

  if (inCode && codeLines.length) {
    blocks.push(<CodeBlock key="code-open" code={codeLines.join("\n")} language={codeLang} />);
  }
  flushList("list-end");

  return <div className="space-y-0.5 text-[14px]">{blocks}</div>;
}
