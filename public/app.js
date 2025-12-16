const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const resetBtn = document.getElementById("resetBtn");

const resultOverlay = document.getElementById("resultOverlay");
const resultTitle = document.getElementById("resultTitle");
const resultText = document.getElementById("resultText");

const promoBlock = document.getElementById("promoBlock");
const promoCodeEl = document.getElementById("promoCode");
const copyBtn = document.getElementById("copyBtn");
const playAgainBtn = document.getElementById("playAgainBtn");

const noPromoBlock = document.getElementById("noPromoBlock");
const playAgainBtn2 = document.getElementById("playAgainBtn2");

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

  // Сделали ИИ “чуть тупее”
  const SKILL = 0.60;

  if (Math.random() > SKILL) {
    board[free[Math.floor(Math.random() * free.length)]] = AI;
    return;
  }

  const winIdx = findBestImmediateMove(AI);
  if (winIdx !== null) {
    board[winIdx] = AI;
    return;
  }

  const blockIdx = findBestImmediateMove(PLAYER);
  if (blockIdx !== null) {
    board[blockIdx] = AI;
    return;
  }

  if (board[4] === null) {
    board[4] = AI;
    return;
  }

  const corners = [0, 2, 6, 8].filter(i => board[i] === null);
  if (corners.length) {
    board[corners[Math.floor(Math.random() * corners.length)]] = AI;
    return;
  }

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

function showOverlayWin(code) {
  resultTitle.textContent = "Победа!";
  resultText.textContent = "Ваш промокод на скидку:";
  promoCodeEl.textContent = String(code);

  promoBlock.hidden = false;
  noPromoBlock.hidden = true;

  resultOverlay.hidden = false;
}

function showOverlayLose() {
  resultTitle.textContent = "Не расстраивайтесь!";
  resultText.textContent = "В следующий раз точно получится. Хотите сыграть ещё раз?";

  promoBlock.hidden = true;
  noPromoBlock.hidden = false;

  resultOverlay.hidden = false;
}

function showOverlayDraw() {
  resultTitle.textContent = "Ничья!";
  resultText.textContent = "Очень близко. Сыграем ещё раз?";

  promoBlock.hidden = true;
  noPromoBlock.hidden = false;

  resultOverlay.hidden = false;
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
      // если промокод не пришел — покажем победу без кода
      showOverlayWin("");
      promoCodeEl.textContent = "";
      resultText.textContent = "Победа! (не удалось получить промокод)";
      return;
    }

    showOverlayWin(data.code);
    return;
  }

  if (result === AI) {
    statusEl.textContent = "Проигрыш";
    await apiPost("/api/lose");
    showOverlayLose();
    return;
  }

  // draw
  statusEl.textContent = "Ничья";
  showOverlayDraw();
}

function reset() {
  board = Array(9).fill(null);
  active = true;
  playerTurn = true;

  promoCodeEl.textContent = "";
  resultOverlay.hidden = true;
  promoBlock.hidden = true;
  noPromoBlock.hidden = true;

  statusEl.textContent = "Ваш ход";
  render();
}

resetBtn.onclick = reset;
playAgainBtn.onclick = reset;
playAgainBtn2.onclick = reset;

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
