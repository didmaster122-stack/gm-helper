import { Component, useState, type ErrorInfo, type ReactNode } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Check, Copy, RotateCcw, TriangleAlert } from "lucide-react";
import { ru } from "../i18n/ru";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** The whole window: the only way back is to reload it. */
  fullScreen?: boolean;
  /** When this changes (another section is opened), the boundary tries again. */
  resetKey?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
  componentStack: string;
  resetKey: string | undefined;
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

async function details(error: Error, componentStack: string): Promise<string> {
  const version = await getVersion().catch(() => "?");
  return [
    `GM Helper ${version}`,
    new Date().toISOString(),
    error.stack ?? `${error.name}: ${error.message}`,
    componentStack.trim(),
  ].join("\n\n");
}

function Fallback({
  error,
  componentStack,
  fullScreen,
  onReset,
}: {
  error: Error;
  componentStack: string;
  fullScreen: boolean;
  onReset: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(await details(error, componentStack));
    setCopied(true);
  }

  return (
    <div className={fullScreen ? "center" : undefined}>
      <EmptyState
        icon={TriangleAlert}
        tone="error"
        title={ru.crash.title}
        text={fullScreen ? ru.crash.textApp : ru.crash.textSection}
        action={
          <>
            <Button variant="primary" icon={RotateCcw} onClick={onReset}>
              {fullScreen ? ru.crash.reload : ru.crash.back}
            </Button>
            <Button icon={copied ? Check : Copy} onClick={() => void copy()}>
              {copied ? ru.crash.copied : ru.crash.copy}
            </Button>
          </>
        }
      />
    </div>
  );
}

/**
 * Shows a calm message instead of a white window when rendering fails. React itself reports
 * the error through console.error, which the error log records.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, componentStack: "", resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { error: toError(error) };
  }

  static getDerivedStateFromProps(
    props: ErrorBoundaryProps,
    state: ErrorBoundaryState,
  ): Partial<ErrorBoundaryState> | null {
    if (props.resetKey === state.resetKey) return null;
    return { error: null, componentStack: "", resetKey: props.resetKey };
  }

  componentDidCatch(_error: unknown, info: ErrorInfo): void {
    this.setState({ componentStack: info.componentStack ?? "" });
  }

  private reset = () => {
    if (this.props.fullScreen) window.location.reload();
    else this.setState({ error: null, componentStack: "" });
  };

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;
    return (
      <Fallback
        error={error}
        componentStack={componentStack}
        fullScreen={this.props.fullScreen ?? false}
        onReset={this.reset}
      />
    );
  }
}
