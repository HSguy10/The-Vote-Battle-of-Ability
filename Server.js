const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();

// 1. CORS 설정을 express와 socket.io 양쪽에 안전하게 적용
app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  credentials: true
}));

const server = http.createServer(app);

// 2. Render 배포 환경에 최적화된 소켓 서버 초기화 (⭐ 순서 중요)
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  allowEIO3: true,
  transports: ['websocket', 'polling']
});

// 3. 카드 데이터 풀
const CARD_POOL = [
  { id: 'a1', name: '시공간 간섭', type: 'ABILITY', desc: '능력 증명 완료 후 상대 반격' },
  { id: 'a2', name: '인과율 역전', type: 'ABILITY', desc: '능력 증명 완료 후 투표 무효화' },
  { id: 'i1', name: '일반 단검', type: 'ITEM', desc: '능력 증명 불가 아이템' },
  { id: 'i2', name: '가짜 부적', type: 'ITEM', desc: '능력 증명 불가 아이템' },
];

// 4. 게임 상태 객체
let roomState = {
  phase: 'VOTING',
  round: 1,
  selectedTarget: null,
  votes: {},
  players: {}
};

// 5. 기본 라우트 추가 (서버가 정상 구동 중인지 브라우저에서 체크하기 위함)
app.get('/', (req, res) => {
  res.send('DEATH VOTE 백엔드 서버가 정상 작동 중입니다!');
});

// 6. 소켓 실시간 이벤트 처리
io.on('connection', (socket) => {
  console.log(`유저 접속됨: ${socket.id}`);

  socket.on('join_game', (playerName) => {
    const pLength = Object.keys(roomState.players).length;
    if (pLength >= 4) {
      socket.emit('system_message', '방이 가득 찼습니다.');
      return;
    }

    roomState.players[socket.id] = {
      id: socket.id,
      name: playerName || `참가자 ${String.fromCharCode(65 + pLength)}`,
      isDead: false,
      hand: [CARD_POOL[Math.floor(Math.random() * 4)], CARD_POOL[Math.floor(Math.random() * 4)]]
    };

    io.emit('update_state', roomState);
  });

  socket.on('cast_vote', (targetId) => {
    if (roomState.phase !== 'VOTING') return;

    const pID = socket.id;
    const myData = roomState.players[pID];
    if (!myData || myData.isDead) return;

    roomState.votes[pID] = targetId;
    const alivePlayers = Object.values(roomState.players).filter(p => !p.isDead);
    
    if (Object.keys(roomState.votes).length === alivePlayers.length) {
      const voteCounts = {};
      Object.values(roomState.votes).forEach(t => { voteCounts[t] = (voteCounts[t] || 0) + 1; });

      let maxVotes = 0;
      let winnerId = null;
      let isTie = false;

      Object.entries(voteCounts).forEach(([id, count]) => {
        if (count > maxVotes) { maxVotes = count; winnerId = id; isTie = false; }
        else if (count === maxVotes) { isTie = true; }
      });

      if (winnerId && !isTie) {
        roomState.selectedTarget = winnerId;
        roomState.phase = 'SHOWDOWN';
      } else {
        roomState.votes = {}; 
      }
    }
    io.emit('update_state', roomState);
  });

  socket.on('prove_ability', (cardIndex) => {
    if (roomState.phase !== 'SHOWDOWN' || roomState.selectedTarget !== socket.id) return;

    const p = roomState.players[socket.id];
    if (p && p.hand[cardIndex] && p.hand[cardIndex].type === 'ABILITY') {
      p.hand.splice(cardIndex, 1);
      roomState.phase = 'VOTING';
      roomState.selectedTarget = null;
      roomState.votes = {};
      roomState.round += 1;
      io.emit('update_state', roomState);
    }
  });

  socket.on('execute_die', () => {
    if (roomState.phase !== 'SHOWDOWN' || roomState.selectedTarget !== socket.id) return;

    if (roomState.players[socket.id]) {
      roomState.players[socket.id].isDead = true;
      roomState.players[socket.id].hand = [];
      roomState.phase = 'VOTING';
      roomState.selectedTarget = null;
      roomState.votes = {};
      roomState.round += 1;
      io.emit('update_state', roomState);
    }
  });

  socket.on('disconnect', () => {
    console.log(`유저 접속 해제: ${socket.id}`);
    delete roomState.players[socket.id];
    delete roomState.votes[socket.id];
    io.emit('update_state', roomState);
  });
});

// 7. Render 환경의 포트 매핑 규칙 준수
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 서버 구동 중: http://localhost:${PORT}`));