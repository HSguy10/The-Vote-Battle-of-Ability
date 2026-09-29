const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();

app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  credentials: true
}));

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

// ⭐ 핵심 변화: 단일 룸 구조에서 여러 방을 관리하는 구조로 변경
// 구조 예시: { "방코드": { phase, round, selectedTarget, votes, players: {} } }
let rooms = {}; 

app.get('/', (req, res) => {
  res.send('DEATH VOTE 멀티룸 백엔드가 정상 작동 중입니다!');
});

io.on('connection', (socket) => {
  let currentRoomCode = null; // 이 소켓이 머무르고 있는 방 코드 기록

  console.log(`유저 접속: ${socket.id}`);

  // [액션 1] 방 개설 또는 방 입장
  socket.on('join_room', ({ roomCode, playerName }) => {
    const code = String(roomCode).trim().toUpperCase(); // 방 코드는 대문자로 통일
    if (!code) return;

    // 만약 존재하지 않는 방이라면 서버가 새로 방 데이터 생성 (방 개설)
    if (!rooms[code]) {
      rooms[code] = {
        roomCode: code,
        phase: 'VOTING',
        round: 1,
        selectedTarget: null,
        votes: {},
        players: {}
      };
    }

    const room = rooms[code];
    const pLength = Object.keys(room.players).length;

    if (pLength >= 4) {
      socket.emit('system_message', '선택하신 방이 이미 가득 찼습니다.');
      return;
    }

    // 소켓을 해당 방의 네트워크 채널에 묶어줍니다 (Socket.io Room 기능)
    socket.join(code);
    currentRoomCode = code;

    // 플레이어 슬롯 배정
    room.players[socket.id] = {
      id: socket.id,
      name: playerName || `참가자 ${String.fromCharCode(65 + pLength)}`,
      isDead: false,
      hand: [CARD_POOL[Math.floor(Math.random() * 4)], CARD_POOL[Math.floor(Math.random() * 4)]]
    };

    // 📢 해당 방에 속한 인원들에게만 최신 데이터 배달
    io.to(code).emit('update_state', room);
  });

  // [액션 2] 투표 처리
  socket.on('cast_vote', (targetId) => {
    if (!currentRoomCode || !rooms[currentRoomCode]) return;
    const room = rooms[currentRoomCode];
    if (room.phase !== 'VOTING') return;

    const pID = socket.id;
    if (!room.players[pID] || room.players[pID].isDead) return;

    room.votes[pID] = targetId;
    const alivePlayers = Object.values(room.players).filter(p => !p.isDead);

    // 해당 방의 생존자들이 모두 투표했는지 체크
    if (Object.keys(room.votes).length === alivePlayers.length) {
      const voteCounts = {};
      Object.values(room.votes).forEach(t => { voteCounts[t] = (voteCounts[t] || 0) + 1; });

      let maxVotes = 0;
      let winnerId = null;
      let isTie = false;

      Object.entries(voteCounts).forEach(([id, count]) => {
        if (count > maxVotes) { maxVotes = count; winnerId = id; isTie = false; }
        else if (count === maxVotes) { isTie = true; }
      });

      if (winnerId && !isTie) {
        room.selectedTarget = winnerId;
        room.phase = 'SHOWDOWN';
      } else {
        room.votes = {}; 
      }
    }
    io.to(currentRoomCode).emit('update_state', room);
  });

  // [액션 3] 능력 증명
  socket.on('prove_ability', (cardIndex) => {
    if (!currentRoomCode || !rooms[currentRoomCode]) return;
    const room = rooms[currentRoomCode];
    if (room.phase !== 'SHOWDOWN' || room.selectedTarget !== socket.id) return;

    const p = room.players[socket.id];
    if (p && p.hand[cardIndex] && p.hand[cardIndex].type === 'ABILITY') {
      p.hand.splice(cardIndex, 1);
      room.phase = 'VOTING';
      room.selectedTarget = null;
      room.votes = {};
      room.round += 1;
      io.to(currentRoomCode).emit('update_state', room);
    }
  });

  // [액션 4] 즉사 수용
  socket.on('execute_die', () => {
    if (!currentRoomCode || !rooms[currentRoomCode]) return;
    const room = rooms[currentRoomCode];
    if (room.phase !== 'SHOWDOWN' || room.selectedTarget !== socket.id) return;

    if (room.players[socket.id]) {
      room.players[socket.id].isDead = true;
      room.players[socket.id].hand = [];
      room.phase = 'VOTING';
      room.selectedTarget = null;
      room.votes = {};
      room.round += 1;
      io.to(currentRoomCode).emit('update_state', room);
    }
  });

  // 접속 해제 시 처리
  socket.on('disconnect', () => {
    console.log(`유저 퇴장: ${socket.id}`);
    if (currentRoomCode && rooms[currentRoomCode]) {
      const room = rooms[currentRoomCode];
      delete room.players[socket.id];
      delete room.votes[socket.id];

      // 방에 아무도 없으면 메모리 절약을 위해 방 삭제
      if (Object.keys(room.players).length === 0) {
        delete rooms[currentRoomCode];
      } else {
        io.to(currentRoomCode).emit('update_state', room);
      }
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 멀티룸 서버 구동 중 포트: ${PORT}`));