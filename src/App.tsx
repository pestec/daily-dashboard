import { Board } from "./components/Board.tsx";
import { useBoard } from "./hooks/useBoard.ts";
import { useClock } from "./hooks/useClock.ts";
import { modeOverride } from "./lib/params.ts";

export function App() {
  const now = useClock();
  const { payload } = useBoard();

  // The Worker owns the decision so the board does not depend on the TV's
  // clock being right; ?mode= exists only to review the other layout on demand.
  const mode = modeOverride ?? payload?.meta.mode ?? "ambient";

  return <Board payload={payload} mode={mode} now={now} />;
}
