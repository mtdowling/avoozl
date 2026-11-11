import Editor, {
  DiffEditor,
  loader,
  type BeforeMount,
} from "@monaco-editor/react";
import * as monaco from "monaco-editor/editor/editor.api";
import "monaco-editor/languages/definitions/markdown/register";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Columns2,
  Eye,
  FileText,
  GitCompare,
  Info,
  ListChecks,
  MessageSquareText,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  WrapText,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { command } from "./api";
import { useRemote } from "./hooks";
import MarkdownContent from "./MarkdownContent";
import type {
  DocumentRecord,
  DriverOpenResult,
  Plan,
  PlanDiagnostic,
  PlanQuality,
  Workspace,
} from "./types";

loader.config({ monaco });
self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

const beforeMount: BeforeMount = (monaco) => {
  if (
    !monaco.languages
      .getLanguages()
      .some((language: { id: string }) => language.id === "json")
  ) {
    monaco.languages.register({ id: "json" });
    monaco.languages.setMonarchTokensProvider("json", {
      tokenizer: {
        root: [
          [/[{}[\]]/, "@brackets"],
          [/[,:]/, "delimiter"],
          [/"(?:[^"\\]|\\.)*"(?=\s*:)/, "string.key"],
          [/"(?:[^"\\]|\\.)*"/, "string.value"],
          [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, "number"],
          [/\b(?:true|false|null)\b/, "keyword"],
          [/\s+/, "white"],
        ],
      },
    });
  }
  monaco.editor.defineTheme("avoozl-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      {
        token: "markup.heading.markdown",
        foreground: "8AB8FF",
        fontStyle: "bold",
      },
      { token: "string", foreground: "D7BD78" },
      { token: "string.key.json", foreground: "8BE9FD" },
      { token: "string.value.json", foreground: "D7BD78" },
      { token: "number.json", foreground: "BD93F9" },
      { token: "keyword.json", foreground: "FF79C6" },
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

type EditorMode = "split" | "preview" | "diff" | "checks";

type PlanReviewStep = {
  provider: string;
  model: string;
};

type PlanReviewPreferences = {
  maxRounds: number;
  sequence: PlanReviewStep[];
};

const PLAN_REVIEW_PREFERENCES_KEY = "avoozl-plan-review-pipeline";

function providerId(provider: Workspace["providers"][number]) {
  return provider.id || provider.name || "";
}

function defaultPlanReviewPreferences(
  providers: Workspace["providers"],
): PlanReviewPreferences {
  return {
    maxRounds: 3,
    sequence: providers
      .map((provider) => providerId(provider))
      .filter(Boolean)
      .slice(0, 2)
      .map((provider) => ({ provider, model: "" })),
  };
}

function readPlanReviewPreferences(
  providers: Workspace["providers"],
): PlanReviewPreferences {
  const fallback = defaultPlanReviewPreferences(providers);
  try {
    const saved = JSON.parse(
      localStorage.getItem(PLAN_REVIEW_PREFERENCES_KEY) || "null",
    );
    if (
      !saved ||
      !Number.isInteger(saved.maxRounds) ||
      saved.maxRounds < 1 ||
      saved.maxRounds > 10 ||
      !Array.isArray(saved.sequence)
    )
      return fallback;
    const sequence = saved.sequence
      .filter(
        (step: unknown): step is PlanReviewStep =>
          Boolean(step) &&
          typeof (step as PlanReviewStep).provider === "string" &&
          typeof (step as PlanReviewStep).model === "string",
      )
      .map((step: PlanReviewStep) => ({
        provider: step.provider.trim(),
        model: step.model.trim(),
      }))
      .filter((step: PlanReviewStep) => step.provider);
    return sequence.length
      ? { maxRounds: saved.maxRounds, sequence }
      : fallback;
  } catch {
    return fallback;
  }
}

export function MarkdownPreview({
  text,
  containerRef,
  onScroll,
}: {
  text: string;
  containerRef?: React.Ref<HTMLDivElement>;
  onScroll?: React.UIEventHandler<HTMLElement>;
}) {
  return (
    <article
      className="markdown-preview prose"
      ref={containerRef}
      onScroll={onScroll}
    >
      <MarkdownContent text={text} />
    </article>
  );
}

export function JsonEditor({
  text,
  filename,
  ariaLabel,
  onChange,
}: {
  text: string;
  filename: string;
  ariaLabel: string;
  onChange: (text: string) => void;
}) {
  return (
    <Editor
      height="100%"
      path={filename}
      language="json"
      theme="avoozl-dark"
      beforeMount={beforeMount}
      value={text}
      onChange={(value) => onChange(value ?? "")}
      options={{
        ariaLabel,
        automaticLayout: true,
        bracketPairColorization: { enabled: true },
        folding: true,
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 11,
        formatOnPaste: true,
        lineHeight: 17,
        minimap: { enabled: false },
        padding: { top: 10, bottom: 10 },
        scrollBeyondLastLine: false,
        tabSize: 2,
        wordWrap: "on",
      }}
    />
  );
}

export function MarkdownSourceViewer({
  text,
  filename,
  ariaLabel,
}: {
  text: string;
  filename: string;
  ariaLabel: string;
}) {
  return (
    <Editor
      height="100%"
      path={filename}
      language="markdown"
      theme="avoozl-dark"
      beforeMount={beforeMount}
      value={text}
      options={{
        ariaLabel,
        automaticLayout: true,
        contextmenu: true,
        folding: true,
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 11,
        lineHeight: 18,
        minimap: { enabled: false },
        padding: { top: 12, bottom: 12 },
        readOnly: true,
        renderWhitespace: "selection",
        scrollBeyondLastLine: false,
        wordWrap: "on",
      }}
    />
  );
}

export function JsonSourceViewer({
  text,
  filename,
  ariaLabel,
}: {
  text: string;
  filename: string;
  ariaLabel: string;
}) {
  return (
    <Editor
      height="100%"
      path={filename}
      language="json"
      theme="avoozl-dark"
      beforeMount={beforeMount}
      value={text}
      options={{
        ariaLabel,
        automaticLayout: true,
        bracketPairColorization: { enabled: true },
        contextmenu: true,
        folding: true,
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 11,
        lineHeight: 18,
        minimap: { enabled: false },
        padding: { top: 12, bottom: 12 },
        readOnly: true,
        renderWhitespace: "selection",
        scrollBeyondLastLine: false,
        tabSize: 2,
        wordWrap: "on",
      }}
    />
  );
}

function EditorToolbar({
  mode,
  setMode,
  dirty,
  busy,
  onSave,
  checks,
  lineNumbers,
  wordWrap,
  setLineNumbers,
  setWordWrap,
  extra,
}: {
  mode: EditorMode;
  setMode: (mode: EditorMode) => void;
  dirty: boolean;
  busy: boolean;
  onSave: () => void;
  checks?: boolean;
  lineNumbers: boolean;
  wordWrap: boolean;
  setLineNumbers: (value: boolean) => void;
  setWordWrap: (value: boolean) => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="editor-toolbar">
      <div className="segmented">
        <button
          className={mode === "split" ? "selected" : ""}
          onClick={() => setMode("split")}
        >
          <Columns2 size={16} /> Edit
        </button>
        <button
          className={mode === "preview" ? "selected" : ""}
          onClick={() => setMode("preview")}
        >
          <Eye size={16} /> Preview
        </button>
        <button
          className={mode === "diff" ? "selected" : ""}
          onClick={() => setMode("diff")}
        >
          <GitCompare size={16} /> Diff
        </button>
        {checks && (
          <button
            className={mode === "checks" ? "selected" : ""}
            onClick={() => setMode("checks")}
          >
            <ListChecks size={16} /> Checks
          </button>
        )}
      </div>
      <button
        className={`editor-display-toggle ${lineNumbers ? "selected" : ""}`}
        onClick={() => setLineNumbers(!lineNumbers)}
        aria-pressed={lineNumbers}
        title="Show or hide the line-number gutter"
      >
        <FileText size={15} /> Gutter
      </button>
      <button
        className={`editor-display-toggle ${wordWrap ? "selected" : ""}`}
        onClick={() => setWordWrap(!wordWrap)}
        aria-pressed={wordWrap}
        title="Wrap long Markdown lines"
      >
        <WrapText size={15} /> Wrap
      </button>
      <span className="editor-dirty">
        {dirty ? "Unsaved changes" : "Saved"}
      </span>
      <span className="composer-spacer" />
      {extra}
      <button
        className="button primary"
        disabled={!dirty || busy}
        onClick={onSave}
      >
        <Save size={16} /> Save
      </button>
    </div>
  );
}

function MarkdownWorkspace({
  mode,
  text,
  baseline,
  setText,
  diffSideBySide = false,
  diagnostics,
  focusLine,
  lineNumbers,
  wordWrap,
  checksPane,
}: {
  mode: EditorMode;
  text: string;
  baseline: string;
  setText: (text: string) => void;
  diffSideBySide?: boolean;
  diagnostics?: PlanDiagnostic[];
  focusLine?: number | null;
  lineNumbers: boolean;
  wordWrap: boolean;
  checksPane?: React.ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const preview = useRef<HTMLDivElement | null>(null);
  const scrollSource = useRef<"editor" | "preview" | null>(null);
  const [width, setWidth] = useState(0);
  const [sourceWidth, setSourceWidth] = useState(0);
  useEffect(() => {
    if (!root.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = entry.contentRect.width;
      setWidth(next);
      setSourceWidth((current) => current || Math.round(next * 0.56));
    });
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const model = editor.current?.getModel();
    if (!model) return;
    const severity = {
      error: monaco.MarkerSeverity.Error,
      warning: monaco.MarkerSeverity.Warning,
      info: monaco.MarkerSeverity.Info,
    };
    monaco.editor.setModelMarkers(
      model,
      "avoozl-plan-quality",
      (diagnostics || []).map((item) => {
        const startLineNumber = Math.min(item.lineStart, model.getLineCount());
        const endLineNumber = Math.min(
          Math.max(item.lineEnd, startLineNumber),
          model.getLineCount(),
        );
        return {
          startLineNumber,
          startColumn: 1,
          endLineNumber,
          endColumn: model.getLineMaxColumn(endLineNumber),
          severity: severity[item.severity],
          message: item.message,
          code: item.code,
        };
      }),
    );
  }, [diagnostics, mode, text]);
  useEffect(() => {
    if (!focusLine || (mode !== "split" && mode !== "checks")) return;
    editor.current?.revealLineInCenter(focusLine);
    editor.current?.setPosition({ lineNumber: focusLine, column: 1 });
    editor.current?.focus();
  }, [focusLine, mode]);
  const showAutomaticPreview = mode === "split" && width >= 1200;
  const showChecks = mode === "checks" && Boolean(checksPane);
  const clampedSourceWidth = Math.max(
    440,
    Math.min(Math.max(440, width - 440), sourceWidth || width * 0.56),
  );
  function finishScrollSync() {
    requestAnimationFrame(() => {
      scrollSource.current = null;
    });
  }
  function syncPreviewFromEditor() {
    if (
      scrollSource.current === "preview" ||
      !preview.current ||
      !editor.current
    )
      return;
    const source = editor.current;
    const sourceMax = Math.max(
      1,
      source.getScrollHeight() - source.getLayoutInfo().height,
    );
    const targetMax = Math.max(
      0,
      preview.current.scrollHeight - preview.current.clientHeight,
    );
    scrollSource.current = "editor";
    preview.current.scrollTop = (source.getScrollTop() / sourceMax) * targetMax;
    finishScrollSync();
  }
  function syncEditorFromPreview() {
    if (
      scrollSource.current === "editor" ||
      !preview.current ||
      !editor.current
    )
      return;
    const target = editor.current;
    const sourceMax = Math.max(
      1,
      preview.current.scrollHeight - preview.current.clientHeight,
    );
    const targetMax = Math.max(
      0,
      target.getScrollHeight() - target.getLayoutInfo().height,
    );
    scrollSource.current = "preview";
    target.setScrollTop((preview.current.scrollTop / sourceMax) * targetMax);
    finishScrollSync();
  }
  function mountEditor(mounted: monaco.editor.IStandaloneCodeEditor) {
    editor.current = mounted;
    mounted.onDidScrollChange((event) => {
      if (event.scrollTopChanged && showAutomaticPreview)
        syncPreviewFromEditor();
    });
  }
  function beginResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = clampedSourceWidth;
    const move = (next: PointerEvent) =>
      setSourceWidth(
        Math.max(
          440,
          Math.min(width - 440, startWidth + next.clientX - startX),
        ),
      );
    const stop = () => {
      document.body.classList.remove("resizing-panels");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    document.body.classList.add("resizing-panels");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }
  return (
    <div
      ref={root}
      className={`editor-workspace mode-${mode} ${showAutomaticPreview || showChecks ? "has-preview" : ""}`}
      style={
        showAutomaticPreview || showChecks
          ? ({
              "--editor-source-width": `${clampedSourceWidth}px`,
            } as React.CSSProperties)
          : undefined
      }
    >
      {mode === "diff" ? (
        <DiffEditor
          original={baseline}
          modified={text}
          language="markdown"
          theme="avoozl-dark"
          beforeMount={beforeMount}
          options={{
            automaticLayout: true,
            minimap: { enabled: false },
            renderSideBySide: diffSideBySide,
            wordWrap: wordWrap ? "on" : "off",
            lineNumbers: lineNumbers ? "on" : "off",
          }}
        />
      ) : mode === "preview" ? (
        <MarkdownPreview text={text} />
      ) : (
        <>
          <Editor
            value={text}
            onChange={(value) => setText(value || "")}
            onMount={mountEditor}
            language="markdown"
            theme="avoozl-dark"
            beforeMount={beforeMount}
            options={{
              automaticLayout: true,
              minimap: { enabled: false },
              lineNumbers: lineNumbers ? "on" : "off",
              wordWrap: wordWrap ? "on" : "off",
              fontSize: 14,
              lineHeight: 23,
              padding: { top: 18, bottom: 18 },
              scrollBeyondLastLine: false,
            }}
          />
          {(showAutomaticPreview || showChecks) && (
            <>
              <div
                className="editor-resize-handle"
                role="separator"
                aria-label={`Resize Markdown ${showChecks ? "checks" : "preview"}`}
                aria-orientation="vertical"
                tabIndex={0}
                onPointerDown={beginResize}
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft")
                    setSourceWidth(clampedSourceWidth - 16);
                  if (event.key === "ArrowRight")
                    setSourceWidth(clampedSourceWidth + 16);
                }}
              />
              {showChecks ? (
                checksPane
              ) : (
                <MarkdownPreview
                  text={text}
                  containerRef={preview}
                  onScroll={syncEditorFromPreview}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function storedEditorBoolean(key: string, fallback: boolean) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value !== "false";
  } catch {
    return fallback;
  }
}

function useEditorDisplay() {
  const [lineNumbers, setLineNumbersState] = useState(() =>
    storedEditorBoolean("avoozl-editor-gutter", true),
  );
  const [wordWrap, setWordWrapState] = useState(() =>
    storedEditorBoolean("avoozl-editor-wrap", true),
  );
  function setLineNumbers(value: boolean) {
    setLineNumbersState(value);
    try {
      localStorage.setItem("avoozl-editor-gutter", String(value));
    } catch {}
  }
  function setWordWrap(value: boolean) {
    setWordWrapState(value);
    try {
      localStorage.setItem("avoozl-editor-wrap", String(value));
    } catch {}
  }
  return { lineNumbers, wordWrap, setLineNumbers, setWordWrap };
}

function PlanChecks({
  quality,
  focus,
}: {
  quality: PlanQuality | null;
  focus: (line: number) => void;
}) {
  return (
    <aside
      className={`plan-diagnostics editor-checks ${quality?.canApprove ? "passing" : "blocking"}`}
    >
      <header>
        <div>
          <span className="eyebrow">Deterministic plan checks</span>
          <h2>
            {!quality
              ? "Checking the current draft…"
              : quality.canApprove
                ? "Schema and dependency checks pass"
                : `${quality.counts.error} blocking diagnostic${quality.counts.error === 1 ? "" : "s"}`}
          </h2>
        </div>
        {quality && (
          <span className="quality-counts">
            {quality.counts.error > 0 && (
              <>
                <AlertTriangle size={13} /> {quality.counts.error}
              </>
            )}
            {quality.counts.warning > 0 && (
              <>
                <AlertTriangle size={13} /> {quality.counts.warning}
              </>
            )}
            {quality.counts.info > 0 && (
              <>
                <Info size={13} /> {quality.counts.info}
              </>
            )}
            {!quality.diagnostics.length && (
              <>
                <CheckCircle2 size={13} /> Clear
              </>
            )}
          </span>
        )}
      </header>
      {!!quality?.diagnostics.length && (
        <div className="diagnostic-list">
          {quality.diagnostics.map((item) => (
            <button
              key={item.id}
              className={`diagnostic-row severity-${item.severity}`}
              onClick={() => focus(item.lineStart)}
            >
              {item.severity === "info" ? (
                <Info size={13} />
              ) : (
                <AlertTriangle size={13} />
              )}
              <span>
                <strong>{item.code}</strong>
                {item.message}
              </span>
              <code>L{item.lineStart}</code>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}

export function PlanEditor({
  id,
  onSaved,
}: {
  id: string;
  onSaved: () => void;
}) {
  const remote = useRemote(() => command<Plan>("plan.get", { id }), [id]);
  const workspace = useRemote(() => command<Workspace>("workspace"), []);
  const [text, setText] = useState("");
  const [baseline, setBaseline] = useState("");
  const [hash, setHash] = useState("");
  const [mode, setMode] = useState<EditorMode>("split");
  const [preview, setPreview] = useState<any>(null);
  const [quality, setQuality] = useState<PlanQuality | null>(null);
  const [diagnosticLine, setDiagnosticLine] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [reviewSettingsOpen, setReviewSettingsOpen] = useState(false);
  const [reviewMaxRounds, setReviewMaxRounds] = useState(3);
  const [reviewSequence, setReviewSequence] = useState<PlanReviewStep[]>([]);
  const reviewLaunchLock = useRef(false);
  const reviewPreferencesLoaded = useRef(false);
  const display = useEditorDisplay();

  useEffect(() => {
    if (!remote.data) return;
    setText(remote.data.text);
    setBaseline(remote.data.text);
    setHash(remote.data.hash || "");
    setQuality(remote.data.quality || null);
    setPreview(null);
    setMessage("");
  }, [remote.data]);

  useEffect(() => {
    if (reviewPreferencesLoaded.current || !workspace.data?.providers?.length)
      return;
    const preferences = readPlanReviewPreferences(workspace.data.providers);
    setReviewMaxRounds(preferences.maxRounds);
    setReviewSequence(preferences.sequence);
    reviewPreferencesLoaded.current = true;
  }, [workspace.data?.providers]);

  useEffect(() => {
    if (!reviewPreferencesLoaded.current || !reviewSequence.length) return;
    try {
      localStorage.setItem(
        PLAN_REVIEW_PREFERENCES_KEY,
        JSON.stringify({
          maxRounds: reviewMaxRounds,
          sequence: reviewSequence,
        }),
      );
    } catch {
      // Browser storage is a convenience for non-secret editor preferences.
      // A blocked store must not prevent a review from running.
    }
  }, [reviewMaxRounds, reviewSequence]);

  const dirty = text !== baseline;
  useEffect(() => {
    if (!remote.data) return;
    let current = true;
    const timer = window.setTimeout(async () => {
      try {
        const result = await command<PlanQuality>("plan.lint", { id, text });
        if (current) setQuality(result);
      } catch {
        // Saving and approval still validate on the server. Keep the last
        // complete result while a transient live-check request fails.
      }
    }, 350);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [id, remote.data, text]);

  async function persistDraft() {
    const saved = await command<Plan>("plan.save", {
      id,
      text,
      expectedHash: hash,
    });
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
      const current = dirty
        ? await persistDraft()
        : await command<Plan>("plan.get", { id });
      const result = await command<any>("plan.preview", {
        id,
        text: current.text,
      });
      setPreview(result);
      setQuality(result.quality);
      setHash(current.hash || "");
      setText(current.text);
      setBaseline(current.text);
      setMessage(
        `Reviewing ${result.tasks.length} proposed task${result.tasks.length === 1 ? "" : "s"}.`,
      );
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

  async function aiReview() {
    if (reviewLaunchLock.current) return;
    reviewLaunchLock.current = true;
    setBusy(true);
    setMessage("");
    try {
      const current = dirty
        ? await persistDraft()
        : await command<Plan>("plan.get", { id });
      const projectId = workspace.data?.projects[0]?.id;
      const sequence = reviewSequence
        .map((step) => ({
          provider: step.provider.trim(),
          ...(step.model.trim() ? { model: step.model.trim() } : {}),
        }))
        .filter((step) => step.provider);
      if (!sequence.length || !projectId)
        throw Error(
          "Configure an agent and execution project before automated review.",
        );
      if (
        !Number.isInteger(reviewMaxRounds) ||
        reviewMaxRounds < 1 ||
        reviewMaxRounds > 10
      )
        throw Error("Choose 1–10 review rounds.");
      const driver = await command<DriverOpenResult>("driver.open", {
        projectId,
        provider: "openhands",
        context: {
          view: "plans",
          planId: id,
          projectId,
          conversationPurpose: "project-chat",
          scoped: true,
        },
      });
      const pipeline = await command<any>("plan.review.pipeline", {
        planId: id,
        projectId,
        parentRunId: driver.run.id,
        maxRounds: reviewMaxRounds,
        sequence,
      });
      setMessage(
        `Started up to ${pipeline.maxRounds} substantive review rounds. Feedback appears here as reviewers finish.`,
      );
      setReviewSettingsOpen(false);
      await remote.reload();
    } catch (cause) {
      setMessage((cause as Error).message);
    } finally {
      reviewLaunchLock.current = false;
      setBusy(false);
    }
  }

  function updateReviewStep(index: number, value: Partial<PlanReviewStep>) {
    setReviewSequence((current) =>
      current.map((step, stepIndex) =>
        stepIndex === index ? { ...step, ...value } : step,
      ),
    );
  }

  function moveReviewStep(index: number, offset: number) {
    setReviewSequence((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function addReviewStep() {
    const firstProvider = providerId(workspace.data?.providers?.[0] || {});
    setReviewSequence((current) => [
      ...current,
      { provider: firstProvider, model: "" },
    ]);
  }

  async function applySuggestion(reviewId: string) {
    setBusy(true);
    try {
      await command("plan.review.apply", { id: reviewId, expectedHash: hash });
      await remote.reload();
      onSaved();
      setMessage("Applied the suggested change as a new draft revision.");
    } catch (cause) {
      setMessage((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function reply(reviewId: string) {
    const value = replies[reviewId]?.trim();
    if (!value) return;
    setBusy(true);
    try {
      await command("plan.review.reply", { id: reviewId, text: value });
      setReplies((current) => ({ ...current, [reviewId]: "" }));
      await remote.reload();
    } catch (cause) {
      setMessage((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function dispose(reviewId: string, disposition: string) {
    setBusy(true);
    try {
      await command("plan.review.dispose", { id: reviewId, disposition });
      await remote.reload();
    } catch (cause) {
      setMessage((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function publishForReview() {
    setBusy(true);
    setMessage("");
    try {
      const receipt = await command<any>("planning.publish", { planId: id });
      setMessage(
        `Planning pull request #${receipt.number} is ${receipt.state}. Task issues will project only after merge.`,
      );
    } catch (cause) {
      setMessage((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!remote.data)
    return (
      <div className="center-state">
        {remote.error?.message || "Opening plan…"}
      </div>
    );
  return (
    <section className="editor-screen">
      <header className="screen-heading compact">
        <div>
          <span className="eyebrow">Plan draft</span>
          <h1>{remote.data.title}</h1>
        </div>
        <span className={`state-pill state-${remote.data.state}`}>
          {remote.data.state}
        </span>
      </header>
      <EditorToolbar
        mode={mode}
        setMode={setMode}
        dirty={dirty}
        busy={busy}
        onSave={save}
        checks
        {...display}
        extra={
          <>
            <button
              className={`button quiet ${reviewSettingsOpen ? "selected" : ""}`}
              disabled={busy}
              aria-expanded={reviewSettingsOpen}
              onClick={() => setReviewSettingsOpen((open) => !open)}
            >
              <Sparkles size={16} /> AI design review
            </button>
            {remote.data.state === "approved" && (
              <button
                className="button quiet"
                disabled={busy}
                onClick={publishForReview}
              >
                <GitCompare size={16} /> Publish for team review
              </button>
            )}
            <button className="button quiet" disabled={busy} onClick={review}>
              <ShieldCheck size={16} /> Review for approval
            </button>
          </>
        }
      />
      {reviewSettingsOpen && (
        <aside className="plan-review-config">
          <header>
            <div>
              <span className="eyebrow">Automated design review</span>
              <h2>Review pipeline</h2>
            </div>
            <label>
              Maximum rounds
              <input
                type="number"
                min={1}
                max={10}
                value={reviewMaxRounds}
                onChange={(event) =>
                  setReviewMaxRounds(Number(event.target.value))
                }
              />
            </label>
          </header>
          <p>
            Reviewers run in this order and repeat until the round limit or
            until a reviewer finds no new material issue. They are instructed to
            find substantive gaps, not wording or style nitpicks.
          </p>
          <div className="plan-review-sequence">
            {reviewSequence.map((step, index) => {
              const provider = workspace.data?.providers.find(
                (candidate) => providerId(candidate) === step.provider,
              );
              const models = (provider?.models || []).map((model) =>
                typeof model === "string" ? model : model.id,
              );
              const modelListId = `plan-review-models-${index}`;
              return (
                <div
                  className="plan-review-step"
                  key={`${index}-${step.provider}`}
                >
                  <span className="plan-review-order">{index + 1}</span>
                  <label>
                    Provider
                    <select
                      value={step.provider}
                      onChange={(event) =>
                        updateReviewStep(index, {
                          provider: event.target.value,
                          model: "",
                        })
                      }
                    >
                      {(workspace.data?.providers || []).map((candidate) => {
                        const value = providerId(candidate);
                        return (
                          <option value={value} key={value}>
                            {candidate.label || candidate.name || value}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  <label>
                    Model <span>optional</span>
                    <input
                      value={step.model}
                      list={models.length ? modelListId : undefined}
                      placeholder="Provider default"
                      onChange={(event) =>
                        updateReviewStep(index, { model: event.target.value })
                      }
                    />
                    {!!models.length && (
                      <datalist id={modelListId}>
                        {models.map((model) => (
                          <option value={model} key={model} />
                        ))}
                      </datalist>
                    )}
                  </label>
                  <div className="plan-review-step-actions">
                    <button
                      className="icon-button"
                      disabled={index === 0}
                      aria-label={`Move reviewer ${index + 1} earlier`}
                      onClick={() => moveReviewStep(index, -1)}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      className="icon-button"
                      disabled={index === reviewSequence.length - 1}
                      aria-label={`Move reviewer ${index + 1} later`}
                      onClick={() => moveReviewStep(index, 1)}
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      className="icon-button danger"
                      disabled={reviewSequence.length === 1}
                      aria-label={`Remove reviewer ${index + 1}`}
                      onClick={() =>
                        setReviewSequence((current) =>
                          current.filter((_, stepIndex) => stepIndex !== index),
                        )
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <footer>
            <button className="button quiet" onClick={addReviewStep}>
              <Plus size={15} /> Add reviewer
            </button>
            <button
              className="button primary"
              disabled={
                busy ||
                !reviewSequence.some((step) => step.provider.trim()) ||
                !Number.isInteger(reviewMaxRounds) ||
                reviewMaxRounds < 1 ||
                reviewMaxRounds > 10
              }
              onClick={aiReview}
            >
              <Sparkles size={15} /> Start review
            </button>
          </footer>
        </aside>
      )}
      <MarkdownWorkspace
        mode={mode}
        text={text}
        baseline={baseline}
        setText={setText}
        diffSideBySide
        diagnostics={quality?.diagnostics}
        focusLine={diagnosticLine}
        lineNumbers={display.lineNumbers}
        wordWrap={display.wordWrap}
        checksPane={
          <PlanChecks
            quality={quality}
            focus={(line) => {
              setDiagnosticLine(line);
            }}
          />
        }
      />
      {message && (
        <p
          className={
            message.includes("changed") || message.includes("required")
              ? "error notice"
              : "notice"
          }
        >
          {message}
        </p>
      )}
      {preview && (
        <aside className="approval-preview">
          <div>
            <span className="eyebrow">Exact revision review</span>
            <h2>
              {preview.tasks.length} proposed task
              {preview.tasks.length === 1 ? "" : "s"}
            </h2>
          </div>
          <div className="proposal-grid">
            {preview.tasks.map((task: any) => (
              <article key={task.localId}>
                <strong>{task.title}</strong>
                <code>{task.taskId}</code>
                <small>
                  {task.existing ? "Updates existing task" : "Creates task"}
                </small>
              </article>
            ))}
          </div>
          {!!preview.dependencies.length && (
            <p>
              {preview.dependencies.length} dependency edge
              {preview.dependencies.length === 1 ? "" : "s"} will be recorded.
            </p>
          )}
          <button
            className="button primary"
            disabled={busy || !preview.quality?.canApprove}
            onClick={approve}
          >
            <ShieldCheck size={16} /> Approve this exact revision
          </button>
        </aside>
      )}
      {!!remote.data.reviews?.length && (
        <aside className="design-reviews">
          <header>
            <div>
              <span className="eyebrow">Design feedback</span>
              <h2>
                {
                  remote.data.reviews.filter((item) => item.state === "open")
                    .length
                }{" "}
                open review comments
              </h2>
            </div>
            <button
              className="button quiet"
              disabled={busy}
              onClick={() => void remote.reload()}
            >
              Refresh
            </button>
          </header>
          <div className="review-thread-list">
            {remote.data.reviews.map((item) => (
              <article
                key={item.id}
                className={`review-thread severity-${item.severity} ${item.state}`}
              >
                <div className="review-meta">
                  <strong>{item.severity}</strong>
                  <span>
                    {item.author || item.provider || "Reviewer"}
                    {item.model ? ` · ${item.model}` : ""}
                  </span>
                  {item.stale && <span>older revision</span>}
                </div>
                <blockquote>{item.quote}</blockquote>
                <p>{item.comment}</p>
                {item.suggestion !== undefined && <pre>{item.suggestion}</pre>}
                {!!item.replies?.length && (
                  <div className="review-replies">
                    {item.replies.map((entry) => (
                      <p key={entry.id}>
                        <strong>{entry.author}</strong> {entry.text}
                      </p>
                    ))}
                  </div>
                )}
                {item.state === "open" && (
                  <div className="review-actions">
                    {item.suggestion !== undefined && !item.stale && (
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() => void applySuggestion(item.id)}
                      >
                        Apply suggestion
                      </button>
                    )}
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() => void dispose(item.id, "resolved")}
                    >
                      Resolve
                    </button>
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() => void dispose(item.id, "rejected")}
                    >
                      Reject
                    </button>
                    <label>
                      <MessageSquareText size={13} />
                      <input
                        value={replies[item.id] || ""}
                        onChange={(event) =>
                          setReplies((current) => ({
                            ...current,
                            [item.id]: event.target.value,
                          }))
                        }
                        placeholder="Reply…"
                      />
                      <button
                        className="button"
                        disabled={busy || !replies[item.id]?.trim()}
                        onClick={() => void reply(item.id)}
                      >
                        Send
                      </button>
                    </label>
                  </div>
                )}
                {item.disposition && <small>Closed: {item.disposition}</small>}
              </article>
            ))}
          </div>
        </aside>
      )}
    </section>
  );
}

export function DocumentEditor({
  id,
  onSaved,
}: {
  id: string;
  onSaved: () => void;
}) {
  const remote = useRemote(
    () => command<DocumentRecord>("document.get", { id }),
    [id],
  );
  const [text, setText] = useState("");
  const [baseline, setBaseline] = useState("");
  const [hash, setHash] = useState("");
  const [mode, setMode] = useState<EditorMode>("split");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const display = useEditorDisplay();

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
      const saved = await command<DocumentRecord>("document.update", {
        id,
        text,
        expectedHash: hash,
      });
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

  if (!remote.data)
    return (
      <div className="center-state">
        {remote.error?.message || "Opening document…"}
      </div>
    );
  return (
    <section className="editor-screen">
      <header className="screen-heading compact">
        <div>
          <span className="eyebrow">Workspace document</span>
          <h1>{remote.data.title}</h1>
        </div>
        <span className="path-label">
          <FileText size={15} /> {remote.data.path}
        </span>
      </header>
      <EditorToolbar
        mode={mode}
        setMode={setMode}
        dirty={dirty}
        busy={busy}
        onSave={save}
        {...display}
      />
      <MarkdownWorkspace
        mode={mode}
        text={text}
        baseline={baseline}
        setText={setText}
        lineNumbers={display.lineNumbers}
        wordWrap={display.wordWrap}
      />
      {message && <p className="notice">{message}</p>}
    </section>
  );
}
