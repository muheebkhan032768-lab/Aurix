import React, { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Small dependency-free markdown renderer used by the AURIX chat. It covers the
 * constructs the assistant actually emits: headings, lists, quotes, tables,
 * inline emphasis, links and fenced code with syntax colouring.
 */

const KEYWORDS =
  "const|let|var|function|return|if|else|for|while|do|class|new|import|from|export|default|async|await|try|catch|finally|throw|typeof|instanceof|interface|type|extends|implements|public|private|protected|static|void|int|float|double|string|boolean|bool|def|elif|lambda|None|True|False|and|or|not|in|is|with|yield|match|case|switch|break|continue|package|using|namespace|struct|enum|readonly|override";

const TOKEN_RE = new RegExp(
  [
    "(\\/\\/[^\\n]*|#[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)", // comments
    "(\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'|`(?:\\\\.|[^`\\\\])*`)", // strings
    "(\\b\\d+(?:\\.\\d+)?\\b)", // numbers
    `(\\b(?:${KEYWORDS})\\b)`, // keywords
    "(\\b[A-Za-z_$][\\w$]*)(?=\\s*\\()", // function calls
  ].join("|"),
  "g"
);

function highlight(code: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(code)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(<React.Fragment key={`t${key++}`}>{code.slice(lastIndex, match.index)}</React.Fragment>);
    }
    const cls = match[1]
      ? "tok-com"
      : match[2]
        ? "tok-str"
        : match[3]
          ? "tok-num"
          : match[4]
            ? "tok-key"
            : "tok-fn";
    nodes.push(
      <span key={`k${key++}`} className={cls}>
        {match[0]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < code.length) {
    nodes.push(<React.Fragment key={`t${key++}`}>{code.slice(lastIndex)}</React.Fragment>);
  }
  return nodes;
}

function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    const k = `${keyPrefix}-${key++}`;
    if (token.startsWith("**")) {
      parts.push(<strong key={k}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      parts.push(<code key={k}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("[")) {
      const link = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      if (link) {
        parts.push(
          <a key={k} href={link[2]} target="_blank" rel="noreferrer noopener">
            {link[1]}
          </a>
        );
      } else {
        parts.push(token);
      }
    } else {
      parts.push(<em key={k}>{token.slice(1, -1)}</em>);
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="my-3 overflow-hidden rounded-xl border border-[var(--ws-border)]">
      <div className="flex items-center justify-between border-b border-[var(--ws-border)] bg-[var(--ws-surface-2)] px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ws-muted)]">
          {language || "code"}
        </span>
        <button type="button" onClick={copy} className="ws-btn ws-btn-ghost !px-2 !py-1 !text-[10px]">
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="ws-code m-0 border-0 px-3.5 py-3">
        <code>{highlight(code)}</code>
      </pre>
    </div>
  );
}

function renderTable(rows: string[], key: string): React.ReactNode {
  const cells = rows.map((row) =>
    row
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((cell) => cell.trim())
  );
  const header = cells[0];
  const body = cells.slice(2);
  return (
    <table key={key}>
      <thead>
        <tr>
          {header.map((cell, i) => (
            <th key={i}>{inline(cell, `${key}-h${i}`)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {body.map((row, r) => (
          <tr key={r}>
            {row.map((cell, c) => (
              <td key={c}>{inline(cell, `${key}-${r}-${c}`)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Markdown({ content }: { content: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trimStart().startsWith("```")) {
      const language = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push(<CodeBlock key={`code-${key++}`} code={codeLines.join("\n")} language={language} />);
      continue;
    }

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2];
      const Tag = (`h${Math.min(level + 1, 4)}` as unknown) as "h2";
      blocks.push(<Tag key={`h-${key++}`}>{inline(text, `h${key}`)}</Tag>);
      i += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      blocks.push(<div key={`hr-${key++}`} className="ws-divider my-4" />);
      i += 1;
      continue;
    }

    if (line.trim().startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      blocks.push(<blockquote key={`q-${key++}`}>{inline(quote.join(" "), `q${key}`)}</blockquote>);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
        i += 1;
      }
      blocks.push(
        <ul key={`ul-${key++}`}>
          {items.map((item, index) => (
            <li key={index}>{inline(item, `ul${key}-${index}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ""));
        i += 1;
      }
      blocks.push(
        <ol key={`ol-${key++}`}>
          {items.map((item, index) => (
            <li key={index}>{inline(item, `ol${key}-${index}`)}</li>
          ))}
        </ol>
      );
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|/.test(lines[i + 1])) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(lines[i]);
        i += 1;
      }
      if (rows.length >= 2) {
        blocks.push(renderTable(rows, `tbl-${key++}`));
        continue;
      }
    }

    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trimStart().startsWith("```") &&
      !/^(#{1,4})\s+/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !lines[i].trim().startsWith(">")
    ) {
      paragraph.push(lines[i]);
      i += 1;
    }
    blocks.push(<p key={`p-${key++}`}>{inline(paragraph.join(" "), `p${key}`)}</p>);
  }

  return <div className="ws-md text-[13px] leading-relaxed">{blocks}</div>;
}
