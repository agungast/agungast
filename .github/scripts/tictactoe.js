// Tic-tac-toe di README: pemain X, komputer O.
// Dipanggil oleh workflow saat issue berjudul "ttt|baris|kolom" dibuka.
const fs = require("node:fs");
const assert = require("node:assert/strict");

const repo = process.env.REPO || "agungast/agungast";
const token = process.env.GITHUB_TOKEN;
const issue = process.env.ISSUE_NUMBER;
const title = (process.env.ISSUE_TITLE || "").trim();

const START = "<!-- tictactoe start -->";
const END = "<!-- tictactoe end -->";
const ASSET = `https://raw.githubusercontent.com/${repo}/main/assets`;
const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];
const ICON = { "-": "empty", X: "x", O: "o" };

function winner(board) {
  for (const [a, b, c] of LINES) {
    if (board[a] !== "-" && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return board.includes("-") ? null : "draw";
}

function minimax(board, turn) {
  const result = winner(board);
  if (result === "O") return 1;
  if (result === "X") return -1;
  if (result === "draw") return 0;
  const scores = [];
  for (let i = 0; i < 9; i++) {
    if (board[i] !== "-") continue;
    board[i] = turn;
    scores.push(minimax(board, turn === "O" ? "X" : "O"));
    board[i] = "-";
  }
  return turn === "O" ? Math.max(...scores) : Math.min(...scores);
}

function computerMove(board) {
  let best = -2;
  let move = null;
  for (let i = 0; i < 9; i++) {
    if (board[i] !== "-") continue;
    board[i] = "O";
    const score = minimax(board, "X");
    board[i] = "-";
    if (score > best) {
      best = score;
      move = i;
    }
  }
  return move;
}

function render(board, nl = "\n") {
  const result = winner(board);
  const status =
    result === "X" ? "🎉 Kamu menang!" :
    result === "O" ? "💻 Komputer menang." :
    result === "draw" ? "🤝 Seri!" :
    "Giliran kamu (❌).";

  const rows = [];
  for (let r = 0; r < 3; r++) {
    const cells = [];
    for (let c = 0; c < 3; c++) {
      const i = r * 3 + c;
      const img = `<img src="${ASSET}/${ICON[board[i]]}.svg" width="80" height="80" alt="${board[i]}">`;
      const clickable = board[i] === "-" && !result;
      const href = `https://github.com/${repo}/issues/new?title=ttt%7C${r + 1}%7C${c + 1}`;
      cells.push(clickable ? `<a href="${href}">${img}</a>` : img);
    }
    rows.push(cells.join(" "));
  }

  const restart = `<a href="https://github.com/${repo}/issues/new?title=ttt%7Creset">🔄 Mulai ulang</a>`;
  return [
    START,
    `<!-- board: ${board.join("")} -->`,
    '<p align="center">',
    `  <b>${status}</b><br>`,
    `  ${rows.join(`<br>${nl}  `)}`,
    "</p>",
    `<p align="center">${restart}</p>`,
    END,
  ].join(nl);
}

async function api(method, path, body) {
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "tictactoe-action",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  }
}

async function main() {
  const text = fs.readFileSync("README.md", "utf8");
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  if (start < 0 || end < 0) {
    throw new Error("Penanda tictactoe tidak ditemukan di README.md");
  }

  const block = text.slice(start, end + END.length);
  const match = block.match(/<!-- board: ([XO-]{9}) -->/);
  const board = (match ? match[1] : "---------").split("");
  let message;

  if (title === "ttt|reset") {
    board.fill("-");
    message = "Papan direset. Giliran kamu (❌).";
  } else {
    const move = title.match(/^ttt\|([1-3])\|([1-3])$/);
    if (!move) {
      message = "Judul issue tidak dikenal. Klik sel di README untuk bermain.";
    } else {
      const i = (Number(move[1]) - 1) * 3 + Number(move[2]) - 1;
      if (winner(board)) {
        message = "Game sudah selesai. Klik 🔄 Mulai ulang di README.";
      } else if (board[i] !== "-") {
        message = "Sel itu sudah terisi. Pilih sel kosong.";
      } else {
        board[i] = "X";
        if (!winner(board)) board[computerMove(board)] = "O";
        const result = winner(board);
        message =
          result === "X" ? "🎉 Kamu menang!" :
          result === "O" ? "💻 Komputer menang." :
          result === "draw" ? "🤝 Seri!" :
          "Langkah diterima. Giliran kamu (❌).";
      }
    }
  }

  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  fs.writeFileSync("README.md", text.slice(0, start) + render(board, nl) + text.slice(end + END.length));
  await api("POST", `/issues/${issue}/comments`, { body: message });
  await api("PATCH", `/issues/${issue}`, { state: "closed" });
}

if (process.argv.includes("--selftest")) {
  assert.equal(winner("XXX------".split("")), "X");
  assert.equal(winner("---------".split("")), null);
  assert.equal(winner("XOXOXOOXO".split("")), "draw");
  assert.equal(computerMove("OO-X-X---".split("")), 2);
  assert.equal(computerMove("XX-O-----".split("")), 2);
  const out = render("---------".split(""));
  assert.match(out, /<!-- board: --------- -->/);
  assert.equal((out.match(/<img /g) || []).length, 9);
  const readme = fs.readFileSync("README.md", "utf8");
  const start = readme.indexOf(START);
  const end = readme.indexOf(END);
  const block = readme.slice(start, end + END.length);
  const saved = block.match(/<!-- board: ([XO-]{9}) -->/);
  assert.ok(saved, "blok papan tidak ditemukan di README.md");
  const nl = readme.includes("\r\n") ? "\r\n" : "\n";
  assert.equal(render(saved[1].split(""), nl), block);
  console.log("ok");
} else {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
