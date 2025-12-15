const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const resetBtn = document.getElementById("resetBtn");
const ctaRow = document.getElementById("ctaRow");
const playAgainBtn = document.getElementById("playAgainBtn");
const toastEl = document.getElementById("toast");

const winOverlay = document.getElementById("winOverlay");
const promoCodeEl = document.getElementById("promoCode");
const closeWinBtn = document.getElementById("closeWinBtn");
const copyBtn = document.getElementById("copyBtn");

const PLAYER = "X";
const AI = "O";

const WIN_LINES = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6]
];

let board = Array(9).fill(null);
let gameActive = true;
let playerTurn = true;
let winRequestDone = false;
let loseRequestDone = false;

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  setTimeout(() => { toastEl.hidden = true; }, 2600);
}

function render() {
  boardEl.innerHTML = "";
  board.forEach((v, i) => {
    const cell = document.createElement("button");
    cell.className = "cell";
    cell.type = "button";
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-label", `Клетка ${i + 1}`);
    cell.setAttribute("data-index", String(i));
    cell.setAttribute("aria-disabled", (!gameActive || v) ? "true" : "false");

    if (v === PLAYER) {
      cell.textContent = "X";
      cell.classList.add("mark-x");
    } else if (v === AI) {
      cell.textContent = "O";
      cell.classList.add("mark-o");
    } else {
      cell.textContent = "";
    }

    cell.addEventListener("click", () => onCellClick(i));
    boardEl.appendChild(cell);
  });
}

function checkWinner(b) {
  for (const [a, c, d] of WIN_LINES) {
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  }
  if (b.every(Boolean)) return "DRAW";
  return null;
}

function minimax(b, depth, isMaximizing) {
  const result = checkWinner(b);
  if (result === AI) return 10 - depth;
  if (result === PLAYER) return depth - 10;
  if (result === "DRAW") return 0;

  if (isMaximizing) {
    let best = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (!b[i]) {
        b[i] = AI;
        best = Math.max(best, minimax(b, depth + 1, false));
        b[i] = null;
      }
    }
    return best;
  } else {
    let best = Infinity;
    for (let i = 0; i < 9; i++) {
      if (!b[i]) {
        b[i] = PLAYER;
        best = Math.min(best, minimax(b, depth + 1, true));
        b[i] = null;
      }
    }
    return best;
  }
}

function bestMove(b) {
  let bestScore = -Infinity;
  let move = -1;
  for (let i = 0; i < 9; i++) {
    if (!b[i]) {
      b[i] = AI;
      const score = minimax(b, 0, false);
      b[i] = null;
      if (score > bestScore) {
        bestScore = score;
        move = i;
      }
    }
  }
  return move;
}

async function apiPost(url) {
  const initData = tg?.initData || "";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tg-Init-Data": initData
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data?.error || `Ошибка запроса: ${res.status}`);
  }
  return data;
}

async function handleWin() {
  statusEl.textContent = "Победа! Получаем промокод…";
  if (winRequestDone) return;
  winRequestDone = true;

  try {
    const data = await apiPost("/api/win");
    promoCodeEl.textContent = data.code;
    winOverlay.hidden = false;
  } catch (e) {
    showToast(`Не удалось выдать промокод: ${e.message}`);
    statusEl.textContent = "Победа! (ошибка выдачи промокода)";
    ctaRow.hidden = false;
  }
}

async function handleLose() {
  statusEl.textContent = "Проигрыш. Хотите сыграть ещё раз?";
  ctaRow.hidden = false;

  if (loseRequestDone) return;
  loseRequestDone = true;

  try {
    await apiPost("/api/lose");
  } catch (e) {
    showToast(`Не удалось отправить сообщение: ${e.message}`);
  }
}

function handleDraw() {
  statusEl.textContent = "Ничья. Сыграем ещё раз?";
  ctaRow.hidden = false;
}

function endGame(result) {
  gameActive = false;
  playerTurn = false;

  if (result === PLAYER) handleWin();
  else if (result === AI) handleLose();
  else handleDraw();

  render();
}

function onCellClick(i) {
  if (!gameActive) return;
  if (!playerTurn) return;
  if (board[i]) return;

  board[i] = PLAYER;
  render();

  const resultAfterPlayer = checkWinner(board);
  if (resultAfterPlayer) return endGame(resultAfterPlayer);

  playerTurn = false;
  statusEl.textContent = "Ход компьютера…";

  setTimeout(() => {
    const move = bestMove(board);
    if (move >= 0 && gameActive) {
      board[move] = AI;
      render();
    }

    const resultAfterAI = checkWinner(board);
    if (resultAfterAI) return endGame(resultAfterAI);

    playerTurn = true;
    statusEl.textContent = "Ваш ход";
  }, 380);
}

function resetGame() {
  board = Array(9).fill(null);
  gameActive = true;
  playerTurn = true;
  winRequestDone = false;
  loseRequestDone = false;

  ctaRow.hidden = true;
  winOverlay.hidden = true;

  statusEl.textContent = "Ваш ход";
  render();
}

resetBtn.addEventListener("click", resetGame);
playAgainBtn.addEventListener("click", resetGame);
closeWinBtn.addEventListener("click", resetGame);

copyBtn.addEventListener("click", async () => {
  const code = promoCodeEl.textContent.trim();
  try {
    await navigator.clipboard.writeText(code);
    showToast("Промокод скопирован");
  } catch {
    showToast("Не удалось скопировать — выделите и скопируйте вручную");
  }
});

render();
