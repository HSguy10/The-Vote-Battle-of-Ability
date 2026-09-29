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

const CARD_POOL = [
  { id: 'a1', name: '시공간 간섭', type: 'ABILITY', desc: '능력 증명 완료 후 상대 반격' },
  { id: 'a2', name: '인과율 역전', type: 'ABILITY', desc: '능력 증명 완료 후 투표 무효화' },
  { id: 'i1', name: '일반 단검', type: 'ITEM', desc: '능력 증명 불가 아이템' },
  { id: 'i2', name: '가짜 부적', type: 'ITEM', desc: '능력 증명 불가 아이템' },
];

let rooms = {}; 

app.get('/', (req, res) => { res.send('DEATH VOTE 갓필드식 룸 엔진 가동 중'); });

io.on('connection', (socket) => {
  let currentRoomCode = null;
  console.log(`유저 연결: ${socket.id}`);

  // [로비 액션] 활성화된 방 목록 요청
  socket.on('get_room_list', () => {
    const list = Object.values(rooms).map(r => ({
      roomCode: r.roomCode,
      currentPlayers: Object.keys(r.players).length,
      maxPlayers: r.maxPlayers,
      status: r.status // 'LOBBY' 또는 'PLAYING'
    }));
    socket.emit('room_list', list);
  });

  // [방 액션 1] 방 개설 (인원 제한 적용)
  socket.on('create_room', ({ roomCode, maxPlayers, playerName }) => {
    const code = String(roomCode).trim().toUpperCase();
    if (!code) return;
    if (rooms[code]) {
      socket.emit('system_message', '이미 존재하는 방 코드입니다.');
      return;
    }

    // 5명~15명 제한 바인딩
    const limit = Math.max(5, Math.min(15, parseInt(maxPlayers) || 5));

    rooms[code] = {
      roomCode: code,
      maxPlayers: limit,
      status: 'LOBBY', // LOBBY(대기실), PLAYING(게임중)
      phase: 'VOTING',
      round: 1,
      selectedTarget: null,
      votes: {},
      hostId: socket.id, // 최초 개설자가 방장
      players: {}
    };

    joinRoomLogic(socket, code, playerName);
  });

  // [방 액션 2] 기존 방 입장
  socket.on('enter_room', ({ roomCode, playerName }) => {
    const code = String(roomCode).trim().toUpperCase();
    if (!rooms[code]) {
      socket.emit('system_message', '존재하지 않는 방입니다.');
      return;
    }
    if (rooms[code].status === 'PLAYING') {
      socket.emit('system_message', '이미 게임이 시작된 방입니다.');
      return;
    }
    if (Object.keys(rooms[code].players).length >= rooms[code].maxPlayers) {
      socket.emit('system_message', '방의 인원 제한을 초과했습니다.');
      return;
    }

    joinRoomLogic(socket, code, playerName);
  });

  function joinRoomLogic(socket, code, playerName) {
    const room = rooms[code];
    socket.join(code);
    currentRoomCode = code;

    room.players[socket.id] = {
      id: socket.id,
      name: playerName || '무명 예언자',
      isDead: false,
      isReady: socket.id === room.hostId, // 방장은 자동 레디 상태로 취급
      hand: [CARD_POOL[Math.floor(Math.random() * 4)], CARD_POOL[Math.floor(Math.random() * 4)]]
    };

    io.to(code).emit('update_state', room);
    broadcastRoomList();
  }

  // [대기실 액션 3] 참가자 준비 완료 토글
  socket.on('toggle_ready', () => {
    if (!currentRoomCode || !rooms[currentRoomCode]) return;
    const room = rooms[currentRoomCode];
    if (room.status !== 'LOBBY') return;
    if (socket.id === room.hostId) return; // 방장은 레디 토글 불가

    room.players[socket.id].isReady = !room.players[socket.id].isReady;
    io.to(currentRoomCode).emit('update_state', room);
  });

  // [대기실 액션 4] 방장의 게임 시작 요청
  socket.on('start_game', () => {
    if (!currentRoomCode || !rooms[currentRoomCode]) return;
    const room = rooms[currentRoomCode];
    if (room.hostId !== socket.id) return; // 방장만 가능

    const playersArr = Object.values(room.players);
    if (playersArr.length < 2) { // 테스트 용이성을 위해 최소 2명으로 임시 허용 (원래는 5명)
      socket.emit('system_message', '최소 2명 이상 모여야 시작할 수 있습니다.');
      return;
    }

    const allReady = playersArr.every(p => p.isReady);
    if (!allReady) {
      socket.emit('system_message', '아직 준비하지 않은 참가자가 있습니다.');
      return;
    }

    room.status = 'PLAYING';
    io.to(currentRoomCode).emit('update_state', room);
    broadcastRoomList();
  });

  // --- 기존 인게임 코어 로직 연동 ---
  socket.on('cast_vote', (targetId) => {
    if (!currentRoomCode || !rooms[currentRoomCode]) return;
    const room = rooms[currentRoomCode];
    if (room.phase !== 'VOTING' || room.status !== 'PLAYING') return;

    if (!room.players[socket.id] || room.players[socket.id].isDead) return;
    room.votes[socket.id] = targetId;

    const alivePlayers = Object.values(room.players).filter(p => !p.isDead);
    if (Object.keys(room.votes).length === alivePlayers.length) {
      const voteCounts = {};
      Object.values(room.votes).forEach(t => { voteCounts[t] = (voteCounts[t] || 0) + 1; });
      let maxVotes = 0, winnerId = null, isTie = false;
      Object.entries(voteCounts).forEach(([id, count]) => {
        if (count > maxVotes) { maxVotes = count; winnerId = id; isTie = false; }
        else if (count === maxVotes) { isTie = true; }
      });
      if (winnerId && !isTie) { room.selectedTarget = winnerId; room.phase = 'SHOWDOWN'; }
      else { room.votes = {}; }
    }
    io.to(currentRoomCode).emit('update_state', room);
  });

  socket.on('prove_ability', (cardIndex) => {
    if (!currentRoomCode || !rooms[currentRoomCode]) return;
    const room = rooms[currentRoomCode];
    if (room.phase !== 'SHOWDOWN' || room.selectedTarget !== socket.id) return;
    const p = room.players[socket.id];
    if (p && p.hand[cardIndex]?.type === 'ABILITY') {
      p.hand.splice(cardIndex, 1);
      room.phase = 'VOTING'; room.selectedTarget = null; room.votes = {}; room.round += 1;
      io.to(currentRoomCode).emit('update_state', room);
    }
  });

  socket.on('execute_die', () => {
    if (!currentRoomCode || !rooms[currentRoomCode]) return;
    const room = rooms[currentRoomCode];
    if (room.phase !== 'SHOWDOWN' || room.selectedTarget !== socket.id) return;
    if (room.players[socket.id]) {
      room.players[socket.id].isDead = true; room.players[socket.id].hand = [];
      room.phase = 'VOTING'; room.selectedTarget = null; room.votes = {}; room.round += 1;
      io.to(currentRoomCode).emit('update_state', room);
    }
  });

  socket.on('disconnect', () => {
    if (currentRoomCode && rooms[currentRoomCode]) {
      const room = rooms[currentRoomCode];
      delete room.players[socket.id];
      delete room.votes[socket.id];
      if (Object.keys(room.players).length === 0) { delete rooms[currentRoomCode]; }
      else {
        if (room.hostId === socket.id) {
          room.hostId = Object.keys(room.players)[0]; // 방장 위임
          room.players[room.hostId].isReady = true;
        }
        io.to(currentRoomCode).emit('update_state', room);
      }
      broadcastRoomList();
    }
  });
});

function broadcastRoomList() {
  const list = Object.values(rooms).map(r => ({
    roomCode: r.roomCode, currentPlayers: Object.keys(r.players).length, maxPlayers: r.maxPlayers, status: r.status
  }));
  io.emit('room_list', list);
}

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 갓필드식 룸 서버 연동 완료: ${PORT}`));