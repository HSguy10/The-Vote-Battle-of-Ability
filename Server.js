const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);

// 배포 주소 및 로컬 환경 모두 허용하도록 CORS 설정
const io = new Server(server, {
  cors: {
    origin: "*",                      // 모든 주소에서의 접속 허용
    methods: ["GET", "POST"],
    credentials: true
  },
  allowEIO3: true,                    // 구버전 및 다양한 소켓 라이브러리 버전 호환성 허용 (⭐ 핵심)
  transports: ['websocket', 'polling'] // 통신 안정성 프로토콜 고정
});

// 카드 데이터 풀
const CARD_POOL = [
  { id: 'a1', name: '시공간 간섭', type: 'ABILITY', desc: '능력 증명 완료 후 상대 반격' },
  { id: 'a2', name: '인과율 역전', type: 'ABILITY', desc: '능력 증명 완료 후 투표 무효화' },
  { id: 'i1', name: '일반 단검', type: 'ITEM', desc: '능력 증명 불가 아이템' },
  { id: 'i2', name: '가짜 부적', type: 'ITEM', desc: '능력 증명 불가 아이템' },
];

// 서버 메모리에 저장되는 게임 룸 마스터 데이터 목록
let roomState = {
  phase: 'VOTING',
  round: 1,
  selectedTarget: null,
  votes: {},
  players: {} // { socketId: { id, name, isDead, hand } }
};

io.on('connection', (socket) => {
  console.log(`유저 접속됨: ${socket.id}`);

  // 1. 유저 게임 참여 이벤트
  socket.on('join_game', (playerName) => {
    const pLength = Object.keys(roomState.players).length;
    if (pLength >= 4) {
      socket.emit('system_message', '방이 가득 찼습니다.');
      return;
    }

    // 유저 데이터 생성 및 고유 슬롯 번호 매핑
    roomState.players[socket.id] = {
      id: socket.id,
      name: playerName || `참가자 ${String.fromCharCode(65 + pLength)}`,
      isDead: false,
      hand: [CARD_POOL[Math.floor(Math.random() * 4)], CARD_POOL[Math.floor(Math.random() * 4)]]
    };

    io.emit('update_state', roomState);
  });

  // 2. 투표 이벤트 처리
  socket.on('cast_vote', (targetId) => {
    if (roomState.phase !== 'VOTING') return;

    const pID = socket.id;
    const myData = roomState.players[pID];
    if (!myData || myData.isDead) return; // 죽은 자는 일반 상황에서 투표 불가

    roomState.votes[pID] = targetId;

    const alivePlayers = Object.values(roomState.players).filter(p => !p.isDead);
    
    // 생존자 전원 투표 완료 시 정산 (1:1 예외처리는 생략된 심플 버전)
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
        roomState.votes = {}; // 동률 시 리셋
      }
    }
    io.emit('update_state', roomState);
  });

  // 3. 능력 증명 성공 이벤트
  socket.on('prove_ability', (cardIndex) => {
    if (roomState.phase !== 'SHOWDOWN' || roomState.selectedTarget !== socket.id) return;

    const p = roomState.players[socket.id];
    if (p.hand[cardIndex].type === 'ABILITY') {
      p.hand.splice(cardIndex, 1);
      roomState.phase = 'VOTING';
      roomState.selectedTarget = null;
      roomState.votes = {};
      roomState.round += 1;
      io.emit('update_state', roomState);
    }
  });

  // 4. 즉사 수용 이벤트
  socket.on('execute_die', () => {
    if (roomState.phase !== 'SHOWDOWN' || roomState.selectedTarget !== socket.id) return;

    roomState.players[socket.id].isDead = true;
    roomState.players[socket.id].hand = [];
    roomState.phase = 'VOTING';
    roomState.selectedTarget = null;
    roomState.votes = {};
    roomState.round += 1;
    io.emit('update_state', roomState);
  });

  // 연결 끊김 처리
  socket.on('disconnect', () => {
    delete roomState.players[socket.id];
    delete roomState.votes[socket.id];
    io.emit('update_state', roomState);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 서버 구동 중: http://localhost:${PORT}`));
