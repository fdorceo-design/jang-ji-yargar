(function () {
const { createGame, canPlace, placeUnit, placementChallenge, skipPlacementChallenge, selectUnit, clearSelection, moveUnit, challengeUnit, passSegment, ROCK_MAX } = window.JangJiYargar;

const NAMES = { jjy: "Jang-Ji-Yargar", zzg: "Zung-Zoo-Gar" };
const TYPE_LABELS = { rock: "グー", scissors: "チョキ", paper: "パー" };
const TYPES = ["rock", "scissors", "paper"];

const game = createGame();
let uiSelectedTrayType = null;

const boardEl = document.getElementById("board-grid");
const trayEl = document.getElementById("tray");
const turnAvatarEl = document.getElementById("turn-avatar");
const turnTextEl = document.getElementById("turn-text");
const turnPhaseEl = document.getElementById("turn-phase");
const skipBtn = document.getElementById("skip-challenge-btn");
const passBtn = document.getElementById("pass-btn");
const logEl = document.getElementById("log");
const winBanner = document.getElementById("win-banner");
const winAvatar = document.getElementById("win-avatar");
const winText = document.getElementById("win-text");

function cellHas(list, r, c) {
  return list.some(([rr, cc]) => rr === r && cc === c);
}

function buildBoard() {
  boardEl.innerHTML = "";
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.r = r;
      cell.dataset.c = c;
      cell.addEventListener("click", () => handleCellClick(r, c));
      cell.addEventListener("dragover", (e) => e.preventDefault());
      cell.addEventListener("drop", (e) => handleDrop(e, r, c));
      boardEl.appendChild(cell);
    }
  }
}

function buildTray() {
  trayEl.innerHTML = "";
  for (const type of TYPES) {
    const slot = document.createElement("div");
    slot.className = "tray-slot";
    slot.dataset.type = type;
    slot.draggable = true;
    const icon = document.createElement("div");
    icon.className = "unit-icon";
    slot.appendChild(icon);
    const count = document.createElement("div");
    count.className = "count";
    slot.appendChild(count);
    slot.addEventListener("click", () => handleTraySlotClick(type));
    slot.addEventListener("dragstart", (e) => handleTrayDragStart(e, type));
    trayEl.appendChild(slot);
  }
}

function handleTraySlotClick(type) {
  if (game.phase !== "placement" || game.activePlayer !== game.turnOwner) return;
  if (!canPlace(game, type)) return;
  uiSelectedTrayType = uiSelectedTrayType === type ? null : type;
  render();
}

function handleTrayDragStart(e, type) {
  if (game.phase !== "placement" || !canPlace(game, type)) {
    e.preventDefault();
    return;
  }
  e.dataTransfer.setData("text/plain", JSON.stringify({ kind: "place", type }));
}

function handleUnitDragStart(e, r, c) {
  const res = selectUnit(game, r, c);
  if (!res.ok) {
    e.preventDefault();
    return;
  }
  e.dataTransfer.setData("text/plain", JSON.stringify({ kind: "move", from: [r, c] }));
  render();
}

function handleDrop(e, r, c) {
  e.preventDefault();
  let data;
  try {
    data = JSON.parse(e.dataTransfer.getData("text/plain"));
  } catch {
    return;
  }
  if (data.kind === "place") {
    placeUnit(game, data.type, r, c);
    uiSelectedTrayType = null;
  } else if (data.kind === "move") {
    moveUnit(game, r, c);
  }
  render();
}

function handleCellClick(r, c) {
  if (game.phase === "placement") {
    if (cellHas(game.pendingChallengeTargets, r, c)) {
      placementChallenge(game, r, c);
      render();
      return;
    }
    if (uiSelectedTrayType && game.board[r][c] === null) {
      const res = placeUnit(game, uiSelectedTrayType, r, c);
      if (res.ok) uiSelectedTrayType = null;
      render();
    }
    return;
  }

  if (game.phase === "segment") {
    if (game.selected) {
      if (cellHas(game.challengeTargets, r, c)) {
        challengeUnit(game, r, c);
        render();
        return;
      }
      if (cellHas(game.moveTargets, r, c)) {
        moveUnit(game, r, c);
        render();
        return;
      }
    }
    const cell = game.board[r][c];
    if (cell && cell.kind === "unit" && cell.owner === game.activePlayer) {
      selectUnit(game, r, c);
    } else {
      clearSelection(game);
    }
    render();
  }
}

skipBtn.addEventListener("click", () => {
  skipPlacementChallenge(game);
  render();
});

passBtn.addEventListener("click", () => {
  passSegment(game);
  render();
});

function render() {
  // board cells
  const cells = boardEl.children;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const idx = r * 5 + c;
      const cellEl = cells[idx];
      cellEl.innerHTML = "";
      cellEl.classList.remove("highlight-place", "highlight-move", "highlight-challenge", "selected");

      const boardCell = game.board[r][c];
      if (boardCell && boardCell.kind === "unit") {
        const icon = document.createElement("div");
        icon.className = `unit-icon unit-${boardCell.owner}-${boardCell.type}`;
        const canDrag = game.phase === "segment" && boardCell.owner === game.activePlayer;
        icon.draggable = canDrag;
        if (canDrag) {
          icon.addEventListener("dragstart", (e) => handleUnitDragStart(e, r, c));
        }
        cellEl.appendChild(icon);
      } else if (boardCell && boardCell.kind === "mark") {
        const mark = document.createElement("div");
        mark.className = `mark ${boardCell.owner}`;
        if (game.winLine && cellHas(game.winLine, r, c)) mark.classList.add("win-line");
        cellEl.appendChild(mark);
      }

      if (game.phase === "placement") {
        if (uiSelectedTrayType && boardCell === null && !game.placedPos) {
          cellEl.classList.add("highlight-place");
        }
        if (cellHas(game.pendingChallengeTargets, r, c)) {
          cellEl.classList.add("highlight-challenge");
        }
      } else if (game.phase === "segment") {
        if (game.selected && game.selected[0] === r && game.selected[1] === c) {
          cellEl.classList.add("selected");
        }
        if (cellHas(game.moveTargets, r, c)) cellEl.classList.add("highlight-move");
        if (cellHas(game.challengeTargets, r, c)) cellEl.classList.add("highlight-challenge");
      }
    }
  }

  // tray
  const trayActive = game.phase === "placement" && game.activePlayer === game.turnOwner;
  for (const slot of trayEl.children) {
    const type = slot.dataset.type;
    const icon = slot.querySelector(".unit-icon");
    icon.className = `unit-icon unit-${game.turnOwner}-${type}`;
    const countEl = slot.querySelector(".count");
    if (type === "rock") {
      const remaining = ROCK_MAX - game.players[game.turnOwner].rockUsed;
      countEl.textContent = `残り${remaining}`;
    } else {
      countEl.textContent = "∞";
    }
    const enabled = trayActive && canPlace(game, type) && !game.placedPos;
    slot.classList.toggle("disabled", !enabled);
    slot.classList.toggle("selected", uiSelectedTrayType === type);
  }

  // turn bar
  const owner = game.phase === "placement" ? game.turnOwner : game.activePlayer;
  turnAvatarEl.className = `turn-avatar ${owner}`;
  turnAvatarEl.style.backgroundImage = `url('assets/markers/marker_${owner}_win_01.png')`;
  turnTextEl.textContent = `ターン${game.turnNumber} — ${NAMES[owner]}陣営`;
  if (game.phase === "placement") {
    turnPhaseEl.textContent = game.placedPos
      ? "第1セグメント：配置後の挑戦を選択"
      : "第1セグメント：ユニットを配置してください";
  } else if (game.phase === "segment") {
    turnPhaseEl.textContent = "通常セグメント：移動・挑戦、または相手へ渡す";
  } else if (game.phase === "ended") {
    turnPhaseEl.textContent = "対局終了";
  }

  // buttons
  skipBtn.classList.toggle("hidden", !(game.phase === "placement" && game.pendingChallengeTargets.length > 0));
  passBtn.classList.toggle("hidden", game.phase !== "segment");

  // log
  logEl.textContent = game.log.join("\n");
  logEl.scrollTop = logEl.scrollHeight;

  // win banner
  if (game.winner) {
    winBanner.classList.remove("hidden");
    if (game.winner === "draw") {
      winAvatar.style.display = "none";
      winText.textContent = "引き分け";
    } else {
      winAvatar.style.display = "block";
      winAvatar.style.backgroundImage = `url('assets/markers/marker_${game.winner}_win_01.png')`;
      winText.textContent = `${NAMES[game.winner]} 陣営の勝利`;
    }
  } else {
    winBanner.classList.add("hidden");
  }
}

buildBoard();
buildTray();
render();
})();
