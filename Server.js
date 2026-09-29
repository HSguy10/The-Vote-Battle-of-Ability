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

app.get('/', (req, res) => { res.send('DEATH VOTE 타이머 멀티룸 서버 가동 중'); });

// 타이머 가동 스케줄러 헬퍼 함수
function startRoomTimer(code, seconds, type) {
  const room = rooms[code];
  if (!room) return;

  // 기존 진행 중인 타이머가 있다면 초기화
  if (room.timerId) clearInterval(room.timerId);
  
  room.timeLeft = seconds;
  io.to(code).emit('timer_update', { timeLeft: room.timeLeft, timerType: type });

  room.timerId = setInterval(() => {
    if (!rooms[code]) {
      clearInterval(room.timerId);
      return;
    }
    
    room.timeLeft--;
    io.to(code).emit('timer_update', { timeLeft: room.timeLeft, timerType: type });

    if (room.timeLeft <= 0) {
      clearInterval(room.timerId);
      handleTimeout(code, type);
    }
  }, 1000);
}

// 시간 초과(Timeout) 시 예외 처리 마스터 로직
function handleTimeout(code, type) {
  const room = rooms[code];
  if (!room || room.status !== 'PLAYING') return;

  if (type === 'VOTING') {
    // [투표 시간 초과] 투표 안 한 유저들은 무작위로 생존자 중 한 명을 강제 저격 처리
    const alivePlayers = Object.values(room.players).filter(p => !p.isDead);
    
    alivePlayers.forEach(p => {
      if (!room.votes[p.id]) {
        // 나를 제외한 생존 유저 중 무작위 타겟 선정
        const targets = alivePlayers.filter(t => t.id !== p.id);
        const randomTarget = targets.length > 0 ? targets[Math.floor(Math.random() * targets.length)] : alivePlayers[0];
        room.votes[p.id] = randomTarget.id;
      }
    });

    // 강제 투표 처리 후 즉시 개표 진행
    tallyVotesLogic(code);

  } else if (type === 'SHOWDOWN') {
    // [심판 시간 초과] 카드를 내지 않고 버틴 피지목자는 가차 없이 즉사 탈락
    const targetId = room.selectedTarget;
    if (room.players[targetId]) {
      room.players[targetId].isDead = true;
      room.players[targetId].hand = [];
      
      io.to(code).emit('system_message', `${room.players[targetId].name}님이 제한 시간 초과로 심판의 불길 속에 소멸했습니다.`);
      
      advanceRoundLogic(code);
    }
  }
}

// 개표 및 공통 정산 논리 로직
function tallyVotesLogic(code) {
  const room = rooms[code];
  const alivePlayers = Object.values(room.players).filter(p => !p.isDead);
  const voteCounts = {};
  
  Object.values(room.votes).forEach(t => { voteCounts[t] = (voteCounts[t] || 0) + 1; });
  let maxVotes = 0, winnerId = null, isTie = false;
  
  Object.entries(voteCounts).forEach(([id, count]) => {
    if (count > maxVotes) { maxVotes = count; winnerId = id; isTie = false; }
    else if (count === maxVotes) { isTie = true; }
  });

  if (winnerId && !isTie) {
    room.selectedTarget = winnerId;
    room.phase = 'SHOWDOWN';
    io.to(code).emit('update_state', room);
    startRoomTimer(code, 20, 'SHOWDOWN'); // 심판 단계는 20초 카운트다운
  } else {
    room.votes = {};
    io.to(code).emit('update_state', room);
    startRoomTimer(code, 30, 'VOTING'); // 동률 시 투표 단계 30초 재가동
  }
}

// 라운드 종료 및 리셋 로직
function advanceRoundLogic(code) {
  const room = rooms[code];
  room.phase = 'VOTING';
  room.selectedTarget = null;
  room.votes = {};
  room.round += 1;
  io.to(code).emit('update_state', room);
  startRoomTimer(code, 30, 'VOTING'); // 다음 라운드 투표 30초 기동
}

io.on('connection', (socket) => {
  let currentRoomCode = null;

  socket.on('get_room_list', () => {
    const list = Object.values(rooms).map(r => ({
      roomCode: r.roomCode, currentPlayers: Object.keys(r.players).length, maxPlayers: r.maxPlayers, status: r.status
    }));
    socket.emit('room_list', list);
  });

  socket.on('create_room', ({ roomCode, maxPlayers, playerName }) => {
    const code = String(roomCode).trim().toUpperCase();
    if (!code || rooms[code]) return;
    const limit = Math.max(5, Math.min(15, parseInt(maxPlayers) || 5));

    rooms[code] = {
      roomCode: code, maxPlayers: limit, status: 'LOBBY', phase: 'VOTING',
      round: 1, selectedTarget: null, votes: {}, hostId: socket.id, players: {}, timeLeft: 0, timerId: null
    };
    joinRoomLogic(socket, code, playerName);
  });

  socket.on('enter_room', ({ roomCode, playerName }) => {
    const code = String(roomCode).trim().toUpperCase();
    if (!rooms[code] || rooms[code].status === 'PLAYING') return;
    joinRoomLogic(socket, code, playerName);
  });

  function joinRoomLogic(socket, code, playerName) {
    const room = rooms[code];
    socket.join(code);
    currentRoomCode = code;
    room.players[socket.id] = {
      id: socket.id, name: playerName || '무명 예언자', isDead: false, isReady: socket.id === room.hostId,
      hand: [CARD_POOL[Math.floor(Math.random() * 4)], CARD_POOL[Math.floor(Math.random() * 4)]]
    };
    io.to(code).emit('update_state', room);
  }

  socket.on('toggle_ready', () => {
    if (!currentRoomCode || !rooms[currentRoomCode]) return;
    const room = rooms[currentRoomCode];
    if (room.status !== 'LOBBY') return;
    room.players[socket.id].isReady = !room.players[socket.id].isReady;
    io.to(currentRoomCode).emit('update_state', room);
  });

  socket.on('start_game', () => {
    if (!currentRoomCode || !rooms[currentRoomCode]) return;
    const room = rooms[currentRoomCode];
    if (room.hostId !== socket.id) return;

    room.status = 'PLAYING';
    io.to(currentRoomCode).emit('update_state', room);
    startRoomTimer(currentRoomCode, 30, 'VOTING'); // 인게임 진입하자마자 30초 카운트다운 가동!
  });

  socket.on('cast_vote', (targetId) => {
    if (!currentRoomCode || !rooms[currentRoomCode]) return;
    const room = rooms[currentRoomCode];
    if (room.phase !== 'VOTING') return;

    room.votes[socket.id] = targetId;
    const alivePlayers = Object.values(room.players).filter(p => !p.isDead);
    
    if (Object.keys(room.votes).length === alivePlayers.length) {
      if (room.timerId) clearInterval(room.timerId); // 시간 전 전원 투표 완료 시 타이머 끔
      tallyVotesLogic(currentRoomCode);
    } else {
      io.to(currentRoomCode).emit('update_state', room);
    }
  });

  socket.on('prove_ability', (cardIndex) => {
    if (!currentRoomCode || !rooms[currentRoomCode]) return;
    const room = rooms[currentRoomCode];
    if (room.phase !== 'SHOWDOWN' || room.selectedTarget !== socket.id) return;

    const p = room.players[socket.id];
    if (p && p.hand[cardIndex]?.type === 'ABILITY') {
      if (room.timerId) clearInterval(room.timerId); // 시간 전 탈출 시 타이머 끔
      p.hand.splice(cardIndex, 1);
      advanceRoundLogic(currentRoomCode);
    }
  });

  socket.on('execute_die', () => {
    if (!currentRoomCode || !rooms[currentRoomCode]) return;
    const room = rooms[currentRoomCode];
    if (room.phase !== 'SHOWDOWN' || room.selectedTarget !== socket.id) return;

    if (room.timerId) clearInterval(room.timerId);
    room.players[socket.id].isDead = true;
    room.players[socket.id].hand = [];
    advanceRoundLogic(currentRoomCode);
  });

  socket.on('disconnect', () => {
    if (currentRoomCode && rooms[currentRoomCode]) {
      const room = rooms[currentRoomCode];
      delete room.players[socket.id];
      if (Object.keys(room.players).length === 0) {
        if (room.timerId) clearInterval(room.timerId);
        delete rooms[currentRoomCode];
      } else {
        io.to(currentRoomCode).emit('update_state', room);
      }
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 타이머 코어 엔진 탑재 완료: ${PORT}`));