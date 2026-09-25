const http = require("http");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("BLOXIRA ONLINE OK");
    return;
  }

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("BLOXIRA multiplayer server");
});

const wss = new WebSocketServer({ server });

let waitingPlayer = null;
const rooms = new Map();

function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function send(ws, data) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(data));
  }
}

function createRoom(playerA, playerB) {
  const roomId = makeId();

  rooms.set(roomId, {
    players: [playerA, playerB]
  });

  playerA.roomId = roomId;
  playerB.roomId = roomId;

  send(playerA.ws, {
    type: "match_found",
    room_id: roomId,
    player_id: playerA.id
  });

  send(playerB.ws, {
    type: "match_found",
    room_id: roomId,
    player_id: playerB.id
  });
}

function getOpponent(player) {
  const room = rooms.get(player.roomId);

  if (!room) {
    return null;
  }

  for (const other of room.players) {
    if (other !== player) {
      return other;
    }
  }

  return null;
}

function leavePlayer(player) {
  if (waitingPlayer === player) {
    waitingPlayer = null;
  }

  if (!player.roomId) {
    return;
  }

  const room = rooms.get(player.roomId);

  if (!room) {
    player.roomId = null;
    return;
  }

  const opponent = getOpponent(player);

  if (opponent) {
    send(opponent.ws, {
      type: "opponent_left"
    });

    opponent.roomId = null;
  }

  rooms.delete(player.roomId);
  player.roomId = null;
}

wss.on("connection", (ws) => {
  const player = {
    id: makeId(),
    ws: ws,
    roomId: null
  };

  ws.player = player;

  send(ws, {
    type: "connected",
    player_id: player.id
  });

  ws.on("message", (raw) => {
    let message;

    try {
      message = JSON.parse(raw.toString());
    } catch (error) {
      return;
    }

    if (message.action === "find_match") {
      if (
        waitingPlayer &&
        waitingPlayer.ws.readyState === 1 &&
        waitingPlayer !== player
      ) {
        const opponent = waitingPlayer;
        waitingPlayer = null;

        createRoom(opponent, player);
      } else {
        waitingPlayer = player;

        send(ws, {
          type: "waiting",
          message: "Searching for opponent..."
        });
      }

      return;
    }

    if (message.action === "score") {
      const opponent = getOpponent(player);

      if (opponent) {
        send(opponent.ws, {
          type: "opponent_score",
          score: Number(message.score) || 0
        });
      }

      return;
    }

    if (message.action === "game_over") {
      const opponent = getOpponent(player);

      if (opponent) {
        send(opponent.ws, {
          type: "opponent_game_over"
        });
      }

      return;
    }

    if (message.action === "leave_match") {
      leavePlayer(player);
    }
  });

  ws.on("close", () => {
    leavePlayer(player);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`BLOXIRA server running on port ${PORT}`);
});
