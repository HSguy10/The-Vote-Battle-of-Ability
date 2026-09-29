const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(cors({ origin: "*", methods: ["GET", "POST"], credentials: true }));
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"], credentials: true },
  allowEIO3: true,
  transports: ['websocket', 'polling']
});

// 💡 [에러 해결 파트] 34개 능력 중 액티브(ACTIVE) 유형에 해당하는 번호 목록을 명확히 명시했습니다.
const activeIds = [1, 2, 4, 6, 7, 8, 11, 13, 14, 15, 17, 19, 20, 21, 22, 24, 26, 27, 29, 30, 35];

const BASE_ABILITIES = Array.from({ length: 34 }, (_, i) => {
  const idNum = i + 1;
  return {
    id: `ab_${idNum}`,
    no: idNum,
    name: `능력 No.${idNum}`,
    type: activeIds.includes(idNum) ? 'ACTIVE' : 'PASSIVE',
    desc: `No.${idNum} 능력 판정 메커니즘 가동.`
  };
});

let rooms = {};
let userToRoom = {};

app.get('/', (req, res) => { res.send('능력투표대전 멀티룸 서버 정상 구동 중'); });

function startRoomTimer(code, seconds, type) {
  const room = rooms[code];
  if (!room) return;
  if (room.timerId) clearInterval(room.timerId);
  room.timeLeft = seconds;
  room.timerId = setInterval(() => {
    if (!rooms[code]) { clearInterval(room.timerId); return; }
    room.timeLeft--;
    io.to(code).emit('timer_update', { timeLeft: room.timeLeft, timerType: type });
    if (room.timeLeft <= 0) { clearInterval(room.timerId); handleTimeout(code, type); }
  }, 1000);
}

function handleTimeout(code, type) {
  const room = rooms[code];
  if (!room || room.status !== 'PLAYING') return;
  if (type === 'VOTING') {
    const alive = Object.values(room.players).filter(p => !p.isDead);
    const voters = room.phase === 'LAST_STAND' ? Object.values(room.players).filter(p => p.isDead) : alive;
    voters.forEach(p => {
      if (!room.votes[p.id]) {
        const targets = alive.filter(t => room.gameMode === 'CHAOS' || t.id !== p.id);
        if (targets.length > 0) room.votes[p.id] = targets[Math.floor(Math.random() * targets.length)].id;
      }
    });
    tallyVotesLogic(code);
  } else if (type === 'PREDICTION') {
    advanceRound(code);
  }
}

function tallyVotesLogic(code) {
  const room = rooms[code];
  const alive = Object.values(room.players).filter(p => !p.isDead);
  const voteCounts = {};
  Object.values(room.votes).forEach(t => { voteCounts[t] = (voteCounts[t] || 0) + 1; });

  let max = 0, candidates = [];
  Object.entries(voteCounts).forEach(([id, count]) => {
    if (count > max) { max = count; candidates = [id]; }
    else if (count === max) { candidates.push(id); }
  });

  if (candidates.length > 1 || Object.keys(voteCounts).length === 0) {
    if (room.gameMode === 'CHAOS') { room.selectedTargets = alive.map(p => p.id); } 
    else { room.selectedTargets = [alive[Math.floor(Math.random() * alive.length)].id]; }
  } else {
    room.selectedTargets = candidates;
  }
  room.phase = 'JUDGEMENT';
  io.to(code).emit('update_state', room);
}

function advanceRound(code) {
  const room = rooms[code];
  room.round += 1; room.votes = {}; room.phase = 'VOTING';
  io.to(code).emit('update_state', room);
  startRoomTimer(code, room.voteTime, 'VOTING');
}

io.on('connection', (socket) => {
  socket.on('get_room_list', () => {
    const list = Object.values(rooms).map(r => ({
      roomCode: r.roomCode, currentPlayers: Object.keys(r.players).length, maxPlayers: r.maxPlayers, status: r.status
    }));
    socket.emit('room_list', list);
  });

  socket.on('create_room', ({ roomCode, maxPlayers, playerName, gameMode, voteTime }) => {
    const code = String(roomCode).trim().toUpperCase();
    if (!code || rooms[code]) return;
    rooms[code] = {
      roomCode: code, maxPlayers: parseInt(maxPlayers) || 5, gameMode: gameMode || 'CLASSIC', voteTime: parseInt(voteTime) || 30,
      status: 'LOBBY', phase: 'VOTING', round: 1, selectedTargets: [], votes: {}, predictions: {}, hostId: socket.id, players: {}
    };
    joinLogic(socket, code, playerName);
  });

  socket.on('enter_room', ({ roomCode, playerName }) => {
    const code = String(roomCode).trim().toUpperCase();
    if (rooms[code] && rooms[code].status === 'LOBBY') joinLogic(socket, code, playerName);
  });

  function joinLogic(socket, code, playerName) {
    const room = rooms[code];
    socket.join(code);
    userToRoom[socket.id] = code; 
    room.players[socket.id] = { id: socket.id, name: playerName, isDead: false, isReady: socket.id === room.hostId, abilities: [], artifacts: [], hp: 15 };
    
    // 방 목록 전체 동기화 전송
    const list = Object.values(rooms).map(r => ({
      roomCode: r.roomCode, currentPlayers: Object.keys(r.players).length, maxPlayers: r.maxPlayers, status: r.status
    }));
    io.emit('room_list', list);
    io.to(code).emit('update_state', room);
  }

  socket.on('toggle_ready', () => {
    const code = userToRoom[socket.id];
    if (code && rooms[code]) {
      rooms[code].players[socket.id].isReady = !rooms[code].players[socket.id].isReady;
      io.to(code).emit('update_state', rooms[code]);
    }
  });

  socket.on('start_game', () => {
    const code = userToRoom[socket.id];
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;

    let deck = [...BASE_ABILITIES].sort(() => Math.random() - 0.5);
    Object.values(room.players).forEach((p, idx) => {
      p.abilities = room.gameMode === 'DELUXE' ? [deck[idx * 2], deck[idx * 2 + 1]] : [deck[idx]];
      if (room.gameMode === 'CHAOS') p.anonName = `익명 예언자 ${idx + 1}`;
    });
    room.status = 'PLAYING';
    advanceRound(code);
  });

  socket.on('cast_vote', (targetId) => {
    const code = userToRoom[socket.id];
    const room = rooms[code];
    if (!room) return;
    room.votes[socket.id] = targetId;
    const alive = Object.values(room.players).filter(p => !p.isDead);
    const required = room.phase === 'LAST_STAND' ? Object.values(room.players).filter(p => p.isDead).length : alive.length;
    if (Object.keys(room.votes).length === required) { clearInterval(room.timerId); tallyVotesLogic(code); }
    else { io.to(code).emit('update_state', room); }
  });

  socket.on('submit_judgement', ({ actionType, cardIndex }) => {
    const code = userToRoom[socket.id];
    const room = rooms[code];
    if (!room) return;
    const p = room.players[socket.id];
    if (actionType === 'PROVE') {
      if (p.abilities[cardIndex || 0].type === 'ACTIVE') {
        p.abilities[cardIndex || 0] = { id: "none", name: "무능력자", type: "NONE", desc: "능력 소멸." };
      }
    } else { p.isDead = true; p.abilities = []; }

    room.selectedTargets = room.selectedTargets.filter(id => id !== socket.id);
    if (room.selectedTargets.length === 0) {
      const alive = Object.values(room.players).filter(p => !p.isDead);
      if (alive.length <= 1) { room.status = 'GAME_OVER'; }
      else if (alive.length === 2) { room.phase = 'LAST_STAND'; room.votes = {}; startRoomTimer(code, room.voteTime, 'VOTING'); }
      else if (alive.length <= 5 || room.gameMode === 'DELUXE') { advanceRound(code); }
      else { room.phase = 'PREDICTION'; room.predictions = {}; startRoomTimer(code, 20, 'PREDICTION'); }
    }
    io.to(code).emit('update_state', room);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 서버 정상 구동 중: ${PORT}`));