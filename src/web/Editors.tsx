import Editor, { DiffEditor, loader, type BeforeMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor/editor/editor.api";
import "monaco-editor/languages/definitions/markdown/register";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import { Columns2, Eye, FileText, GitCompare, Save, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { command } from "./api";
import { useRemote } from "./hooks";
import type { DocumentRecord, Plan } from "./types";

loader.config({ monaco });
self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

const beforeMount: BeforeMount = (monaco) => {
  monaco.editor.defineTheme("avoozl-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "markup.heading.markdown", foreground: "8AB8FF", fontStyle: "bold" },
      { token: "string", foreground: "D7BD78" },
    ],
    colors: {
      "editor.background": "#101010",
      "editor.foreground": "#eeeeee",
      "editorLineNumber.foreground": "#5f5f5f",
      "editorLineNumber.activeForeground": "#a0a0a0",
      "editor.selectionBackground": "#6ba5ff4f",
      "editor.inactiveSelectionBackground": "#6ba5ff2f",
      "editorWidget.background": "#202020",
      "editorWidget.border": "#343434",
      "diffEditor.insertedTextBackground": "#8edabb22",
      "diffEditor.removedTextBackground": "#eda07622",
    },
  });
};

function MarkdownPreview({ text }: { text: string }) {
  return (
    <article className="markdown-preview prose">
      <ReactMarkdown>{text}</ReactMarkdown>
    </article>
  );
}

function EditorToolbar({
  mode,
  setMode,
  dirty,
  busy,
  onSave,
  extra,
}: {
  mode: "split" | "preview" | "diff";
  setMode: (mode: "split" | "preview" | "diff") => void;
  dirty: boolean;
  busy: boolean;
  onSave: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="editor-toolbar">
      <div className="segmented">
        <button className={mode === "split" ? "selected" : ""} onClick={() => setMode("split")}><Columns2 size={16} /> Edit</button>
        <button className={mode === "preview" ? "selected" : ""} onClick={() => setMode("preview")}><Eye size={16} /> Preview</button>
        <button className={mode === "diff" ? "selected" : ""} onClick={() => setMode("diff")}><GitCompare size={16} /> Diff</button>
      </div>
      <span className="editor-dirty">{dirty ? "Unsaved changes" : "Saved"}</span>
      <span className="composer-spacer" />
      {extra}
      <button className="button primary" disabled={!dirty || busy} onClick={onSave}><Save size={16} /> Save</button>
    </div>
  );
}

export function PlanEditor({ id, onSaved }: { id: string; onSaved: () => void }) {
  const remote = useRemote(() => command<Plan>("plan.get", { id }), [id]);
  const [text, setText] = useState("");
  const [baseline, setBaseline] = useState("");
  const [hash, setHash] = useState("");
  const [mode, setMode] = useState<"split" | "preview" | "diff">("split");
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!remote.data) return;
    setText(remote.data.text);
    setBaseline(remote.data.text);
    setHash(remote.data.hash || "");
    setPreview(null);
    setMessage("");
  }, [remote.data]);

  const dirty = text !== baseline;

  async function persistDraft() {
    const saved = await command<Plan>("plan.save", { id, text, expectedHash: hash });
    setText(saved.text);
    setBaseline(saved.text);
    setHash(saved.hash || "");
    setPreview(null);
    onSaved();
    return saved;
  }

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      await persistDraft();
      setMessage("Draft saved. Approval remains a separate review.");
    } catch (cause) {
      setMessage((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function review() {
    setBusy(true);
    setMessage("");
    try {
      const current = dirty ? await persistDraft() : await command<Plan>("plan.get", { id });
      const result = await command<any>("plan.preview", { id, text: current.text });
      setPreview(result);
      setHash(current.hash || "");
      setText(current.text);
      setBaseline(current.text);
      setMessage(`Reviewing ${result.tasks.length} proposed task${result.tasks.length === 1 ? "" : "s"}.`);
    } catch (cause) {
      setMessage((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!preview) return;
    setBusy(true);
    setMessage("");
    try {
      await command("plan.approve", {
        id,
        expectedHash: preview.reviewedHash,
        expectedRevision: preview.expectedRevision,
      });
      setMessage("Plan approved. Proposed tasks are now in the workspace.");
      setPreview(null);
      await remote.reload();
      onSaved();
    } catch (cause) {
      setMessage((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!remote.data) return <div className="center-state">{remote.error?.message || "Opening plan…"}</div>;
  return (
    <section className="editor-screen">
      <header className="screen-heading compact">
        <div><span className="eyebrow">Plan draft</span><h1>{remote.data.title}</h1></div>
        <span className={`state-pill state-${remote.data.state}`}>{remote.data.state}</span>
      </header>
      <EditorToolbar
        mode={mode}
        setMode={setMode}
        dirty={dirty}
        busy={busy}
        onSave={save}
        extra={<button className="button quiet" disabled={busy} onClick={review}><ShieldCheck size={16} /> Review for approval</button>}
      />
      <div className={`editor-workspace mode-${mode}`}>
        {mode === "diff" ? (
          <DiffEditor
            original={baseline}
            modified={text}
            language="markdown"
            theme="avoozl-dark"
            beforeMount={beforeMount}
            options={{ automaticLayout: true, minimap: { enabled: false }, renderSideBySide: true, wordWrap: "on" }}
          />
        ) : (
          <>
            {mode !== "preview" && (
              <Editor
                value={text}
                onChange={(value) => setText(value || "")}
                language="markdown"
                theme="avoozl-dark"
                beforeMount={beforeMount}
                options={{
                  automaticLayout: true,
                  minimap: { enabled: false },
                  wordWrap: "on",
                  fontSize: 14,
                  lineHeight: 23,
                  padding: { top: 18, bottom: 18 },
                  scrollBeyondLastLine: false,
                }}
              />
            )}
            <MarkdownPreview text={text} />
          </>
        )}
      </div>
      {message && <p className={message.includes("changed") || message.includes("required") ? "error notice" : "notice"}>{message}</p>}
      {preview && (
        <aside className="approval-preview">
          <div>
            <span className="eyebrow">Exact revision review</span>
            <h2>{preview.tasks.length} proposed task{preview.tasks.length === 1 ? "" : "s"}</h2>
          </div>
          <div className="proposal-grid">
            {preview.tasks.map((task: any) => (
              <article key={task.localId}>
                <strong>{task.title}</strong>
                <code>{task.taskId}</code>
                <small>{task.existing ? "Updates existing task" : "Creates task"}</small>
              </article>
            ))}
          </div>
          {!!preview.dependencies.length && <p>{preview.dependencies.length} dependency edge{preview.dependencies.length === 1 ? "" : "s"} will be recorded.</p>}
          <button className="button primary" disabled={busy} onClick={approve}><ShieldCheck size={16} /> Approve this exact revision</button>
        </aside>
      )}
    </section>
  );
}

export function DocumentEditor({ id, onSaved }: { id: string; onSaved: () => void }) {
  const remote = useRemote(() => command<DocumentRecord>("document.get", { id }), [id]);
  const [text, setText] = useState("");
  const [baseline, setBaseline] = useState("");
  const [hash, setHash] = useState("");
  const [mode, setMode] = useState<"split" | "preview" | "diff">("split");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!remote.data) return;
    setText(remote.data.text || "");
    setBaseline(remote.data.text || "");
    setHash(remote.data.hash || "");
  }, [remote.data]);

  const dirty = useMemo(() => text !== baseline, [text, baseline]);
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const saved = await command<DocumentRecord>("document.update", { id, text, expectedHash: hash });
      setText(saved.text || "");
      setBaseline(saved.text || "");
      setHash(saved.hash || "");
      setMessage("Document saved and queued for publication.");
      onSaved();
    } catch (cause) {
      setMessage((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!remote.data) return <div className="center-state">{remote.error?.message || "Opening document…"}</div>;
  return (
    <section className="editor-screen">
      <header className="screen-heading compact">
        <div><span className="eyebrow">Workspace document</span><h1>{remote.data.title}</h1></div>
        <span className="path-label"><FileText size={15} /> {remote.data.path}</span>
      </header>
      <EditorToolbar mode={mode} setMode={setMode} dirty={dirty} busy={busy} onSave={save} />
      <div className={`editor-workspace mode-${mode}`}>
        {mode === "diff" ? (
          <DiffEditor original={baseline} modified={text} language="markdown" theme="avoozl-dark" beforeMount={beforeMount} options={{ automaticLayout: true, minimap: { enabled: false }, wordWrap: "on" }} />
        ) : (
          <>
            {mode !== "preview" && <Editor value={text} onChange={(value) => setText(value || "")} language="markdown" theme="avoozl-dark" beforeMount={beforeMount} options={{ automaticLayout: true, minimap: { enabled: false }, wordWrap: "on", fontSize: 14, lineHeight: 23, padding: { top: 18, bottom: 18 }, scrollBeyondLastLine: false }} />}
            <MarkdownPreview text={text} />
          </>
        )}
      </div>
      {message && <p className="notice">{message}</p>}
    </section>
  );
}
