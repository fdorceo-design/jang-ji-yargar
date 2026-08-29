(function () {
const {
  createGame,
  canPlace,
  isRestricted,
  placeUnit,
  selectUnit,
  clearSelection,
  moveUnit,
  challengeUnit,
  passSegment,
  ROCK_MAX,
  ROTATION_MAX,
  availableRotationKinds,
  rotationChargeField,
  previewRotation,
  cancelRotationPreview,
  rotateMoveUnit,
  countMarks,
} = window.JangJiYargar;

const NAMES = { jjy: "Jang-Ji-Yargar", zzg: "Zung-Zoo-Gar" };
const TYPE_LABELS = { rock: "グー", scissors: "チョキ", paper: "パー" };
const TYPES = ["rock", "scissors", "paper"];
const ROTATION_LABELS = {
  rock45: "45°回転",
  sp45cw: "45°回転（時計回り）",
  sp45ccw: "45°回転（反時計回り）",
  sp90: "90°回転",
};

const SOUNDS = {
  place: new Audio("assets/sounds/se_place.mp3"),
  rotate: new Audio("assets/sounds/se_rotate.mp3"),
  explosion: new Audio("assets/sounds/se_explosion.mp3"),
};

function playSound(name) {
  const base = SOUNDS[name];
  if (!base) return;
  const node = base.cloneNode();
  node.play().catch(() => {});
}

const game = createGame();
let uiSelectedTrayType = null;

const boardEl = document.getElementById("board-grid");
const trayEl = document.getElementById("tray");
const turnAvatarEl = document.getElementById("turn-avatar");
const turnTextEl = document.getElementById("turn-text");
const turnPhaseEl = document.getElementById("turn-phase");
const rotationPanelEl = document.getElementById("rotation-panel");
const countersEl = {
  jMarks: document.getElementById("cnt-j-marks"),
  jRock45: document.getElementById("cnt-j-rock45"),
  jSp90: document.getElementById("cnt-j-sp90"),
  jSp45: document.getElementById("cnt-j-sp45"),
  turn: document.getElementById("cnt-turn"),
  zSp45: document.getElementById("cnt-z-sp45"),
  zSp90: document.getElementById("cnt-z-sp90"),
  zRock45: document.getElementById("cnt-z-rock45"),
  zMarks: document.getElementById("cnt-z-marks"),
};
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
  if (!canPlace(game, type)) return;
  uiSelectedTrayType = uiSelectedTrayType === type ? null : type;
  render();
}

function handleTrayDragStart(e, type) {
  if (!canPlace(game, type)) {
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
    const res = placeUnit(game, data.type, r, c);
    if (res.ok) playSound("place");
    uiSelectedTrayType = null;
  } else if (data.kind === "move") {
    const res = moveUnit(game, r, c);
    if (res.ok) playSound("place");
  }
  render();
}

function handleCellClick(r, c) {
  if (game.phase === "placement") {
    if (uiSelectedTrayType && game.board[r][c] === null) {
      const res = placeUnit(game, uiSelectedTrayType, r, c);
      if (res.ok) {
        uiSelectedTrayType = null;
        playSound("place");
      }
      render();
    }
    return;
  }

  if (game.phase === "segment") {
    if (game.selected) {
      if (cellHas(game.challengeTargets, r, c)) {
        const res = challengeUnit(game, r, c);
        if (res.ok) playSound("explosion");
        render();
        return;
      }
      if (game.rotationKind && cellHas(game.rotationMoveTargets, r, c)) {
        const res = rotateMoveUnit(game, r, c);
        if (res.ok) playSound("rotate");
        render();
        return;
      }
      if (cellHas(game.moveTargets, r, c)) {
        const res = moveUnit(game, r, c);
        if (res.ok) playSound("place");
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

passBtn.addEventListener("click", () => {
  passSegment(game);
  render();
});

function handleRotationButtonClick(kind, mode) {
  if (game.rotationKind === kind && game.rotationMode === mode) {
    cancelRotationPreview(game);
  } else {
    previewRotation(game, kind, mode);
  }
  render();
}

function renderCountersBar() {
  countersEl.jMarks.textContent = countMarks(game, "jjy");
  countersEl.jRock45.textContent = ROTATION_MAX.rock45 - game.players.jjy.rotUsed.rock45;
  countersEl.jSp90.textContent = ROTATION_MAX.sp90 - game.players.jjy.rotUsed.sp90;
  countersEl.jSp45.textContent = ROTATION_MAX.sp45 - game.players.jjy.rotUsed.sp45;
  countersEl.turn.textContent = game.turnNumber;
  countersEl.zSp45.textContent = ROTATION_MAX.sp45 - game.players.zzg.rotUsed.sp45;
  countersEl.zSp90.textContent = ROTATION_MAX.sp90 - game.players.zzg.rotUsed.sp90;
  countersEl.zRock45.textContent = ROTATION_MAX.rock45 - game.players.zzg.rotUsed.rock45;
  countersEl.zMarks.textContent = countMarks(game, "zzg");
}

const MODE_PREFIX = { moveRotated: "回転移動", challengeRotated: "回転挑戦" };

function renderRotationPanel() {
  rotationPanelEl.innerHTML = "";
  if (game.phase !== "segment" || !game.selected) {
    rotationPanelEl.classList.add("hidden");
    return;
  }
  const [r, c] = game.selected;
  const cell = game.board[r][c];
  const kinds = availableRotationKinds(game, r, c);
  if (!cell || kinds.length === 0) {
    rotationPanelEl.classList.add("hidden");
    return;
  }
  rotationPanelEl.classList.remove("hidden");
  for (const mode of ["moveRotated", "challengeRotated"]) {
    for (const kind of kinds) {
      const field = rotationChargeField(kind);
      const remaining = ROTATION_MAX[field] - game.players[cell.owner].rotUsed[field];
      const btn = document.createElement("button");
      btn.textContent = `${MODE_PREFIX[mode]} ${ROTATION_LABELS[kind]}（残り${remaining}）`;
      btn.classList.toggle("active", game.rotationKind === kind && game.rotationMode === mode);
      btn.addEventListener("click", () => handleRotationButtonClick(kind, mode));
      rotationPanelEl.appendChild(btn);
    }
  }
}

function render() {
  // board cells
  const cells = boardEl.children;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const idx = r * 5 + c;
      const cellEl = cells[idx];
      cellEl.innerHTML = "";
      cellEl.classList.remove("highlight-place", "highlight-move", "highlight-rotate", "highlight-challenge", "selected");

      const boardCell = game.board[r][c];
      if (boardCell && boardCell.kind === "unit") {
        const icon = document.createElement("div");
        icon.className = `unit-icon unit-${boardCell.owner}-${boardCell.type}`;
        const canDrag = game.phase === "segment" && boardCell.owner === game.activePlayer && !isRestricted(game, r, c);
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
        if (uiSelectedTrayType && boardCell === null) {
          cellEl.classList.add("highlight-place");
        }
      } else if (game.phase === "segment") {
        if (game.selected && game.selected[0] === r && game.selected[1] === c) {
          cellEl.classList.add("selected");
        }
        if (cellHas(game.moveTargets, r, c)) cellEl.classList.add("highlight-move");
        if (game.rotationKind && cellHas(game.rotationMoveTargets, r, c)) cellEl.classList.add("highlight-rotate");
        if (cellHas(game.challengeTargets, r, c)) cellEl.classList.add("highlight-challenge");
      }
    }
  }

  renderRotationPanel();
  renderCountersBar();

  // tray
  const trayActive = game.phase === "placement";
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
    const enabled = trayActive && canPlace(game, type);
    slot.classList.toggle("disabled", !enabled);
    slot.classList.toggle("selected", uiSelectedTrayType === type);
  }

  // turn bar
  const owner = game.activePlayer;
  turnAvatarEl.className = `turn-avatar ${owner}`;
  turnAvatarEl.style.backgroundImage = `url('assets/markers/marker_${owner}_win_01.png')`;
  turnTextEl.textContent = `ターン${game.turnNumber} — ${NAMES[owner]}陣営`;
  if (game.phase === "placement") {
    const remainingPlacements = game.placementQuota - game.placementsDone;
    const quotaNote = game.placementQuota > 1 ? `（あと${remainingPlacements}体）` : "";
    turnPhaseEl.textContent = `配置：ユニットを配置してください${quotaNote}`;
  } else if (game.phase === "segment") {
    turnPhaseEl.textContent = "通常セグメント：移動・挑戦、または相手へ渡す";
  } else if (game.phase === "ended") {
    turnPhaseEl.textContent = "対局終了";
  }

  // buttons
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
