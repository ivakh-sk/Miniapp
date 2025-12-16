const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const resetBtn = document.getElementById("resetBtn");
const playAgainBtn = document.getElementById("playAgainBtn");
const ctaRow = document.getElementById("ctaRow");

const winOverlay = document.getElementById("winOverlay");
const promoCodeEl = document.getElementById("promoCode");
const closeWinBtn = document.getElementById("closeWinBtn");
const copyBtn = document.getElementById("copyBtn");

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const PLAYER = "X";
const AI = "O";

let board = Array(9).fill(null);
let active = true;
let playerTurn = true;

const wins = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6]
];

function render() {
  boardEl.innerHTML = "";
  board.forEach((v, i) => {
    const cell = document.createElement("button");
    cell.className = "cell";
    cell.type = "button";
    if (v) {
      cell.textContent = v;
      cell.classList.add(v === PLAYER ? "x" : "o");
    }
    cell.onclick = () => clickCell(i);
    boardEl.appendChild(cell);
  });
}

function checkWinner() {
  for (const [a,b,c] of wins) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return board.every(Boolean) ? "draw" : null;
}

function clickCell(i) {
  if (!active || !playerTurn || board[i]) return;
  board[i] = PLAYER;
  nextTurn();
}

function aiMove() {
  const free = board.map((v, i) => (v ? null : i)).filter(v => v !== null);
  if (!free.length) return;

  // 0.55–0.7 — “комфортно обыгрываемый”
  const SKILL = 0.60;

  // Иногда ИИ ошибается — случайный ход
  if (Math.random() > SKILL) {
    board[free[Math.floor(Math.random() * free.length)]] = AI;
    return;
  }

  // Выиграть одним ходом
  const winIdx = findBestImmediateMove(AI);
  if (winIdx !== null) {
    board[winIdx] = AI;
    return;
 t  }

  // Блокировать игрока
  const blockIdx = findBestImmediateMove(PLAYER);
  if (blockIdx !== null) {
    board[blockIdx] = AI;
    return;
  }

  // Центр
  if (board[4] === null) {
    board[4] = AI;
    return;
  }

  // Углы
  const corners = [0, 2, 6, 8].filter(i => board[i] === null);
  if (corners.length) {
    board[corners[Math.floor(Math.random() * corners.length)]] = AI;
    return;
  }

  // Остальное
  board[free[Math.floor(Math.random() * free.length)]] = AI;
}

function findBestImmediateMove(symbol) {
  for (const [a, b, c] of wins) {
    const line = [a, b, c];
    const vals = line.map(i => board[i]);

    const countSymbol = vals.filter(v => v === symbol).length;
    const countEmpty = vals.filter(v => v === null).length;

    if (countSymbol === 2 && countEmpty === 1) {
      const emptyIndex = line.find(i => board[i] === null);
      return emptyIndex ?? null;
    }
  }
  return null;
}

async function apiPost(url) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-Tg-Init-Data": tg?.initData || ""
    }
  });
  const data = await res.json().catch(() => ({}));
  return { okHttp: res.ok, data };
}

async function nextTurn() {
  render();
  const r = checkWinner();
  if (r) return endGame(r);

  playerTurn = false;
  statusEl.textContent = "Ход компьютера…";

  setTimeout(() => {
    aiMove();
    render();

    const r2 = checkWinner();
    if (r2) return endGame(r2);

    playerTurn = true;
    statusEl.textContent = "Ваш ход";
  }, 350);
}

async function endGame(result) {
  active = false;

  if (result === PLAYER) {
    statusEl.textContent = "Победа!";

    const { okHttp, data } = await apiPost("/api/win");
    if (!okHttp || !data?.ok || !data?.code) {
      promoCodeEl.textContent = "";
      ctaRow.hidden = false;
      statusEl.textContent = "Победа! (не удалось получить промокод)";
      return;
    }

    promoCodeEl.textContent = String(data.code); // цифры
    winOverlay.hidden = false;

  } else if (result === AI) {
    statusEl.textContent = "Проигрыш. Хотите сыграть ещё раз?";
    await apiPost("/api/lose");
    ctaRow.hidden = false;

  } else {
    statusEl.textContent = "Ничья. Сыграем ещё раз?";
    ctaRow.hidden = false;
  }
}

function reset() {
  board = Array(9).fill(null);
  active = true;
  playerTurn = true;

  promoCodeEl.textContent = "";
  winOverlay.hidden = true;
  ctaRow.hidden = true;

  statusEl.textContent = "Ваш ход";
  render();
}

resetBtn.onclick = reset;
playAgainBtn.onclick = reset;
closeWinBtn.onclick = reset;

copyBtn.onclick = async () => {
  const code = promoCodeEl.textContent.trim();
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
  } catch {
    // если clipboard запрещен — можно выделить вручную
  }
};

reset();
