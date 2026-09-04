import { useEffect, type CSSProperties } from "react";
import { Board } from "./components/Board.tsx";
import { DebugOverlay } from "./components/DebugOverlay.tsx";
import { useBoard } from "./hooks/useBoard.ts";
import { useBurnInShift } from "./hooks/useBurnInShift.ts";
import { useClock } from "./hooks/useClock.ts";
import { useDailyReload } from "./hooks/useDailyReload.ts";
import { useNightDim } from "./hooks/useNightDim.ts";
import { debugEnabled, modeOverride } from "./lib/params.ts";

export function App() {
  const now = useClock();
  const board = useBoard();
  const { payload } = board;
  const burnIn = useBurnInShift();
  const night = useNightDim(now);

  useDailyReload();

  // Applied to the root element, not the board wrapper. `body` sets the
  // inherited text colour, so redefining the tokens further down the tree
  // leaves everything that merely inherits its colour stuck on the day value.
  useEffect(() => {
    document.documentElement.dataset["night"] = String(night);
  }, [night]);

  // The Worker owns the decision so the board does not depend on the TV's
  // clock being right; ?mode= exists only to review the other layout on demand.
  const mode = modeOverride ?? payload?.meta.mode ?? "ambient";

  return (
    <div
      className="board-shell"
      style={
        {
          "--burn-x": `${burnIn.x}px`,
          "--burn-y": `${burnIn.y}px`,
        } as CSSProperties
      }
    >
      <Board payload={payload} mode={mode} now={now} />
      {debugEnabled && (
        <DebugOverlay
          board={board}
          mode={mode}
          night={night}
          burnIn={burnIn}
          now={now.getTime()}
        />
      )}
    </div>
  );
}
