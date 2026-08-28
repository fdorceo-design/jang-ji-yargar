// ジャンジャガ ルールエンジン（DOM非依存）
// ルール文書: ジャンジャガ_ルール_v0.1.md 準拠

(function () {
const SIZE = 5;
const PLAYERS = ["jjy", "zzg"];

const UNIT_DIRS = {
  rock: [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ],
  scissors: [
    [0, -1],
    [0, 1],
  ],
  paper: [
    [-1, 0],
    [1, 0],
  ],
};

// beats[a] === b は「aはbに勝つ」
const BEATS = { rock: "scissors", scissors: "paper", paper: "rock" };

const ROCK_MAX = 5;

function otherPlayer(p) {
  return p === "jjy" ? "zzg" : "jjy";
}

function inBounds(r, c) {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

function createGame() {
  const state = {
    board: Array.from({ length: SIZE }, () => Array(SIZE).fill(null)),
    players: {
      jjy: { rockUsed: 0 },
      zzg: { rockUsed: 0 },
    },
    turnOwner: "jjy",
    turnNumber: 1,
    // phase: 'placement' (第1セグメント) | 'segment' (通常セグメント) | 'ended'
    phase: "placement",
    activePlayer: "jjy",
    placedPos: null,
    pendingChallengeTargets: [],
    selected: null,
    moveTargets: [],
    challengeTargets: [],
    segmentActionCount: 0,
    prevSegmentEndedEmpty: false,
    winner: null,
    winLine: null,
    log: [],
  };
  startTurn(state);
  return state;
}

function pushLog(state, msg) {
  state.log.push(msg);
}

function boardIsFull(state) {
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) if (state.board[r][c] === null) return false;
  return true;
}

function startTurn(state) {
  if (boardIsFull(state)) {
    finishByBoardFull(state);
    return;
  }
  state.phase = "placement";
  state.activePlayer = state.turnOwner;
  state.placementQuota = state.turnNumber === 1 ? 2 : 1;
  state.placementsDone = 0;
  state.placedPos = null;
  state.pendingChallengeTargets = [];
  state.selected = null;
  state.moveTargets = [];
  state.challengeTargets = [];
  state.segmentActionCount = 0;
  state.prevSegmentEndedEmpty = false;
  pushLog(state, `--- ターン${state.turnNumber}: ${state.turnOwner} の配置番 ---`);
}

function canPlace(state, type) {
  if (state.phase !== "placement") return false;
  if (state.placedPos !== null) return false;
  if (type === "rock" && state.players[state.activePlayer].rockUsed >= ROCK_MAX) return false;
  return true;
}

function emptyCells(state) {
  const cells = [];
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) if (state.board[r][c] === null) cells.push([r, c]);
  return cells;
}

// pos の unit(owner,type) が挑戦可能な敵ユニット座標一覧
function challengeTargetsFrom(state, r, c, owner, type) {
  const targets = [];
  for (const [dr, dc] of UNIT_DIRS[type]) {
    const nr = r + dr,
      nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    const cell = state.board[nr][nc];
    if (cell && cell.kind === "unit" && cell.owner !== owner && cell.type !== type) {
      targets.push([nr, nc]);
    }
  }
  return targets;
}

// pos の unit が移動可能な座標一覧（移動後に挑戦可能になる場合のみ）
function moveTargetsFrom(state, r, c, owner, type) {
  const moves = [];
  for (const [dr, dc] of UNIT_DIRS[type]) {
    const nr = r + dr,
      nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    if (state.board[nr][nc] !== null) continue; // 空きマスのみ
    const afterTargets = challengeTargetsFrom(state, nr, nc, owner, type);
    if (afterTargets.length > 0) moves.push([nr, nc]);
  }
  return moves;
}

function placeUnit(state, type, r, c) {
  if (!canPlace(state, type)) return { ok: false, reason: "配置できません" };
  if (state.board[r][c] !== null) return { ok: false, reason: "空きマスではありません" };
  const owner = state.activePlayer;
  state.board[r][c] = { kind: "unit", owner, type };
  if (type === "rock") state.players[owner].rockUsed += 1;
  state.placedPos = [r, c];
  state.placementsDone += 1;
  pushLog(state, `${owner} が ${type} を (${r},${c}) へ配置`);

  const targets = challengeTargetsFrom(state, r, c, owner, type);
  state.pendingChallengeTargets = targets;
  if (targets.length === 0) {
    advanceOrEndPlacement(state);
  }
  return { ok: true };
}

function placementChallenge(state, tr, tc) {
  if (state.phase !== "placement" || !state.placedPos) return { ok: false, reason: "対象外です" };
  const found = state.pendingChallengeTargets.some(([r, c]) => r === tr && c === tc);
  if (!found) return { ok: false, reason: "挑戦できません" };
  const [r, c] = state.placedPos;
  resolveChallenge(state, r, c, tr, tc);
  if (state.winner) return { ok: true };
  advanceOrEndPlacement(state);
  return { ok: true };
}

function skipPlacementChallenge(state) {
  if (state.phase !== "placement") return { ok: false, reason: "対象外です" };
  advanceOrEndPlacement(state);
  return { ok: true };
}

// 配置番の残り数に応じて、続けて配置させるかセグメントを終えるかを決める
function advanceOrEndPlacement(state) {
  if (state.placementsDone < state.placementQuota) {
    state.placedPos = null;
    state.pendingChallengeTargets = [];
    return;
  }
  endPlacementPhase(state);
}

function endPlacementPhase(state) {
  state.phase = "segment";
  state.activePlayer = otherPlayer(state.turnOwner);
  state.placedPos = null;
  state.pendingChallengeTargets = [];
  state.selected = null;
  state.moveTargets = [];
  state.challengeTargets = [];
  state.segmentActionCount = 0;
  state.prevSegmentEndedEmpty = false;
  checkAutoEndTurn(state);
}

function selectUnit(state, r, c) {
  if (state.phase !== "segment") return { ok: false };
  const cell = state.board[r][c];
  if (!cell || cell.kind !== "unit" || cell.owner !== state.activePlayer) {
    state.selected = null;
    state.moveTargets = [];
    state.challengeTargets = [];
    return { ok: false };
  }
  state.selected = [r, c];
  state.moveTargets = moveTargetsFrom(state, r, c, cell.owner, cell.type);
  state.challengeTargets = challengeTargetsFrom(state, r, c, cell.owner, cell.type);
  return { ok: true };
}

function clearSelection(state) {
  state.selected = null;
  state.moveTargets = [];
  state.challengeTargets = [];
}

function moveUnit(state, tr, tc) {
  if (state.phase !== "segment" || !state.selected) return { ok: false, reason: "対象外です" };
  const [r, c] = state.selected;
  const legal = state.moveTargets.some(([mr, mc]) => mr === tr && mc === tc);
  if (!legal) return { ok: false, reason: "その移動は不正です" };
  const cell = state.board[r][c];
  state.board[r][c] = null;
  state.board[tr][tc] = cell;
  pushLog(state, `${cell.owner} の ${cell.type} が (${r},${c})→(${tr},${tc}) へ移動`);
  state.segmentActionCount += 1;
  state.selected = [tr, tc];
  state.moveTargets = [];
  state.challengeTargets = challengeTargetsFrom(state, tr, tc, cell.owner, cell.type);
  return { ok: true };
}

function challengeUnit(state, tr, tc) {
  if (state.phase !== "segment" || !state.selected) return { ok: false, reason: "対象外です" };
  const [r, c] = state.selected;
  const legal = state.challengeTargets.some(([cr, cc]) => cr === tr && cc === tc);
  if (!legal) return { ok: false, reason: "挑戦できません" };
  resolveChallenge(state, r, c, tr, tc);
  state.segmentActionCount += 1;
  clearSelection(state);
  if (!state.winner) checkAutoEndTurn(state);
  return { ok: true };
}

function resolveChallenge(state, ar, ac, br, bc) {
  const attacker = state.board[ar][ac];
  const defender = state.board[br][bc];
  const attackerWins = BEATS[attacker.type] === defender.type;
  const winnerOwner = attackerWins ? attacker.owner : defender.owner;
  const loserPos = attackerWins ? [br, bc] : [ar, ac];
  pushLog(
    state,
    `${attacker.owner}:${attacker.type} が ${defender.owner}:${defender.type} に挑戦 → ${attackerWins ? "攻撃側" : "防御側"}の勝ち`
  );
  state.board[loserPos[0]][loserPos[1]] = { kind: "mark", owner: winnerOwner };
  checkWin(state, winnerOwner);
}

const LINE_DIRS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

function checkWin(state, owner) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      for (const [dr, dc] of LINE_DIRS) {
        const cells = [
          [r, c],
          [r + dr, c + dc],
          [r + 2 * dr, c + 2 * dc],
        ];
        if (cells.every(([rr, cc]) => inBounds(rr, cc))) {
          const owns = cells.every(([rr, cc]) => {
            const cell = state.board[rr][cc];
            return cell && cell.kind === "mark" && cell.owner === owner;
          });
          if (owns) {
            state.winner = owner;
            state.winLine = cells;
            state.phase = "ended";
            pushLog(state, `${owner} の3連が成立。勝利。`);
            return true;
          }
        }
      }
    }
  }
  return false;
}

function hasAnyAction(state, owner) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = state.board[r][c];
      if (!cell || cell.kind !== "unit" || cell.owner !== owner) continue;
      if (challengeTargetsFrom(state, r, c, owner, cell.type).length > 0) return true;
      if (moveTargetsFrom(state, r, c, owner, cell.type).length > 0) return true;
    }
  }
  return false;
}

function checkAutoEndTurn(state) {
  if (state.phase !== "segment") return;
  if (!hasAnyAction(state, "jjy") && !hasAnyAction(state, "zzg")) {
    pushLog(state, "両者とも行動不能のため、ターン自動終了。");
    endTurn(state);
  }
}

function passSegment(state) {
  if (state.phase !== "segment") return { ok: false };
  const endedEmpty = state.segmentActionCount === 0;
  if (endedEmpty && state.prevSegmentEndedEmpty) {
    pushLog(state, "両者が連続して終了を宣言。ターン終了。");
    endTurn(state);
    return { ok: true };
  }
  pushLog(state, `${state.activePlayer} がセグメント終了を宣言。`);
  state.prevSegmentEndedEmpty = endedEmpty;
  state.activePlayer = otherPlayer(state.activePlayer);
  state.segmentActionCount = 0;
  clearSelection(state);
  checkAutoEndTurn(state);
  return { ok: true };
}

function endTurn(state) {
  if (state.winner) return;
  state.turnOwner = otherPlayer(state.turnOwner);
  state.turnNumber += 1;
  startTurn(state);
}

function countMarks(state, owner) {
  let n = 0;
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      const cell = state.board[r][c];
      if (cell && cell.kind === "mark" && cell.owner === owner) n++;
    }
  return n;
}

function countUnits(state, owner) {
  let n = 0;
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      const cell = state.board[r][c];
      if (cell && cell.kind === "unit" && cell.owner === owner) n++;
    }
  return n;
}

function finishByBoardFull(state) {
  state.phase = "ended";
  const marksJjy = countMarks(state, "jjy");
  const marksZzg = countMarks(state, "zzg");
  if (marksJjy !== marksZzg) {
    state.winner = marksJjy > marksZzg ? "jjy" : "zzg";
  } else {
    const unitsJjy = countUnits(state, "jjy");
    const unitsZzg = countUnits(state, "zzg");
    if (unitsJjy !== unitsZzg) {
      state.winner = unitsJjy > unitsZzg ? "jjy" : "zzg";
    } else {
      state.winner = "draw";
    }
  }
  pushLog(state, `盤面が埋まりました。判定結果: ${state.winner}`);
}

window.JangJiYargar = {
  SIZE,
  PLAYERS,
  UNIT_DIRS,
  BEATS,
  ROCK_MAX,
  createGame,
  canPlace,
  emptyCells,
  placeUnit,
  placementChallenge,
  skipPlacementChallenge,
  selectUnit,
  clearSelection,
  moveUnit,
  challengeUnit,
  passSegment,
  otherPlayer,
};
})();
