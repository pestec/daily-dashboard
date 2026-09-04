import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  /** Shown in the fallback so a dead tile still says what it was. */
  label: string;
  className?: string;
  children: ReactNode;
}

interface State {
  message: string | null;
}

/**
 * One of these wraps every tile. A render crash inside a tile greys that tile
 * and leaves the rest of the board running -- the alternative on an unattended
 * screen is a white page nobody is there to reload.
 */
export class TileErrorBoundary extends Component<Props, State> {
  override state: State = { message: null };

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : "Render failed" };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Kept for the ?debug overlay and Fully Kiosk's remote console.
    console.error(`[tile:${this.props.label}]`, error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.message !== null) {
      return (
        <section
          className={`flex flex-col justify-between rounded-2xl border border-border/40 bg-surface p-8 opacity-50 ${this.props.className ?? ""}`}
        >
          <h2 className="text-title font-medium tracking-[0.08em] text-fg-muted uppercase">
            {this.props.label}
          </h2>
          <p className="text-body text-fg-muted">Tile failed to render</p>
          <p className="text-caption text-fg-muted/70">{this.state.message}</p>
        </section>
      );
    }
    return this.props.children;
  }
}
