const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(cors({ origin: "*", methods: ["GET", "POST"], credentials: true }));
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ['websocket', 'polling']
});

// 34개 정식 일반 능력 및 데이터 정의 (태그 분기 완벽 지원)
const MASTER_ABILITIES = {
  1: { no: 1, name: "쿠데타", type: "ACTIVE", tag: "특수", desc: "'왕' 처치. 왕 부재 시 대상을 몰락한 왕으로 변경" },
  2: { no: 2, name: "저주", type: "ACTIVE", tag: "공격", desc: "지정 대상에게 2턴 후 사망하는 저주 부여" },
  3: { no: 3, name: "시한폭탄", type: "PASSIVE", tag: "공격", desc: "판정 시 무작위 대상과 함께 동반 사망" },
  4: { no: 4, name: "기생", type: "ACTIVE", tag: "공격", desc: "지정 대상을 숙주 상태로 변경 (목숨 공유)" },
  5: { no: 5, name: "왕", type: "PASSIVE", tag: "특수", desc: "판정 시 생존. 1:1 대치 상황 우승 기믹" },
  6: { no: 6, name: "네크로맨서", type: "ACTIVE", tag: "특수", desc: "사망한 대상의 능력 중 하나를 탈취하여 사용" },
  7: { no: 7, name: "물귀신", type: "ACTIVE", tag: "공격", desc: "카드 능력 공개 시 지정 대상과 함께 사망" },
  8: { no: 8, name: "탐정", type: "ACTIVE", tag: "특수", desc: "지정 대상의 카드 능력 공개" },
  9: { no: 9, name: "범죄자", type: "PASSIVE", tag: "특수", desc: "능력 공개 시 즉시 사망" },
  10: { no: 10, name: "방패", type: "ACTIVE", tag: "수비", desc: "모든 공격 완벽 방어" },
  11: { no: 11, name: "암살", type: "ACTIVE", tag: "공격", desc: "판정 시 지정 대상 처치" },
  12: { no: 12, name: "반사", type: "ACTIVE", tag: "수비", desc: "능력으로 인한 공격만 시전자에게 반사" },
  13: { no: 13, name: "도둑", type: "ACTIVE", tag: "특수", desc: "지정 대상의 능력을 강탈하여 즉시 사용" },
  14: { no: 14, name: "게이머", type: "ACTIVE", tag: "공격", desc: "지정 대상과 가위바위보 대결 후 패자 처치" },
  15: { no: 15, name: "정치인", type: "ACTIVE", tag: "공격", desc: "지정 대상과 1:1 투표 대결 진행 후 패자 처치" },
  16: { no: 16, name: "영웅", type: "PASSIVE", tag: "특수", desc: "남은 인원이 자신 포함 3명일 때 즉시 우승 [영속]" },
  17: { no: 17, name: "티라노", type: "ACTIVE", tag: "공격", desc: "자신의 순번에서 ±1인 대상 중 하나 처치" },
  18: { no: 18, name: "진화", type: "PASSIVE", tag: "특수", desc: "능력 공개 시 현재 턴 수에 지정된 능력 사용 [영속]" },
  19: { no: 19, name: "도박", type: "ACTIVE", tag: "공격", desc: "주사위 수만큼 순번을 가감해 대상 처치" },
  20: { no: 20, name: "바이러스", type: "ACTIVE", tag: "공격", desc: "판정 시 지정 대상의 능력 완전 소멸" },
  21: { no: 21, name: "건달", type: "ACTIVE", tag: "공격", desc: "지정 대상에게 투표권이 영구 소멸하는 협박 부여" },
  22: { no: 22, name: "부활", type: "ACTIVE", tag: "특수", desc: "사망 시점부터 2턴 경과 후 부활" },
  23: { no: 23, name: "역관광", type: "PASSIVE", tag: "공격", desc: "자신을 투표한 대상 중 하나를 처치 (4턴 전까지)" },
  24: { no: 24, name: "팬텀", type: "ACTIVE", tag: "특수", desc: "남은 능력 중 하나를 3턴 동안 허위 거짓 공개" },
  25: { no: 25, name: "미행", type: "PASSIVE", tag: "특수", desc: "아공간 행적 확인 및 아공간 타겟팅 면제 [아공간]" },
  26: { no: 26, name: "현상수배", type: "ACTIVE", tag: "특수", desc: "대상 지정 후, 해당 유저 사망 시 능력 변경 [아공간]" },
  27: { no: 27, name: "예언", type: "ACTIVE", tag: "공격", desc: "3회 내 대상 능력 예측 성공 시 처치 [아공간]" },
  29: { no: 29, name: "검투사", type: "ACTIVE", tag: "공격/수비", desc: "다음 순서 처치 혹은 피격 시 방어 및 투표권 소멸" },
  30: { no: 30, name: "차원이동", type: "ACTIVE", tag: "수비", desc: "2턴 동안 아공간 도주 및 상호작용 면제 [아공간]" },
  31: { no: 31, name: "학살", type: "PASSIVE", tag: "공격", desc: "다음 턴 종료 시 무능력자 1명 확정 처치" },
  32: { no: 32, name: "아드레날린", type: "PASSIVE", tag: "수비", desc: "사망 공격 1회 방어 후 50% 확률 쇼크사 돌입" },
  33: { no: 33, name: "회피", type: "PASSIVE", tag: "수비", desc: "피격 시 횟수별 확률(50%->25%->10%)로 공격 회피" },
  34: { no: 34, name: "시계", type: "PASSIVE", tag: "수비", desc: "공격 1회 방어 및 다음 턴을 이전 턴 수로 회귀 [영속]" },
  35: { no: 35, name: "시침", type: "ACTIVE", tag: "특수", desc: "능력 공개 시 영속 티어 보유자 1명 추적 공개 [영속]" }
};

let rooms = {};
let userToRoom = {};

app.get('/', (req, res) => { res.send('능력투표대전 백엔드 동기화 채널 정상 구동 중'); });
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
    tallyVotes(code);
  } else if (type === 'PREDICTION') {
    advanceRound(code);
  }
}

function tallyVotes(code) {
  const room = rooms[code];
  const alive = Object.values(room.players).filter(p => !p.isDead);
  let voteCounts = {};

  Object.entries(room.votes).forEach(([voterId, targetId]) => {
    const weight = room.players[voterId]?.activeArtifact === 'art_2' ? 2 : 1;
    voteCounts[targetId] = (voteCounts[targetId] || 0) + weight;
    if (room.players[voterId]) room.players[voterId].activeArtifact = null;
  });

  let max = 0, candidates = [];
  Object.entries(voteCounts).forEach(([id, count]) => {
    if (count > max) { max = count; candidates = [id]; }
    else if (count === max) candidates.push(id);
  });

  if (candidates.length > 1 || Object.keys(voteCounts).length === 0) {
    if (room.gameMode === 'CHAOS') {
      room.selectedTargets = alive.map(p => p.id); // 대혼돈 특이점 전원 판정
    } else {
      room.selectedTargets = [alive[Math.floor(Math.random() * alive.length)].id];
    }
  } else {
    room.selectedTargets = candidates;
  }
  room.phase = 'JUDGEMENT';
  io.to(code).emit('update_state', room);
}

function advanceRound(code) {
  const room = rooms[code];
  if (!room) return;
  
  room.round += 1; 
  room.votes = {}; 
  room.phase = 'VOTING';
  
  io.to(code).emit('update_state', room);
  startRoomTimer(code, room.voteTime, 'VOTING');

  // ⭐ [AI 자동 투표 기동] 2초 뒤 살아있는 AI 봇들이 자동으로 투표권을 행사하게 만듦
  setTimeout(() => {
    if (!rooms[code] || rooms[code].phase !== 'VOTING') return;
    const currentRoom = rooms[code];
    const alive = Object.values(currentRoom.players).filter(p => !p.isDead);
    
    Object.values(currentRoom.players).forEach(p => {
      if (p.isAI && !p.isDead && !currentRoom.votes[p.id]) {
        // 자기 자신을 제외한 생존 예언자 중 무작위 1명 저격 (대혼돈 모드면 자신 포함)
        const targets = alive.filter(t => currentRoom.gameMode === 'CHAOS' || t.id !== p.id);
        if (targets.length > 0) {
          currentRoom.votes[p.id] = targets[Math.floor(Math.random() * targets.length)].id;
        }
      }
    });

    // 만약 AI 투표로 인해 전원 투표가 완료되었다면 즉시 정산 처리
    const required = currentRoom.phase === 'LAST_STAND' ? Object.values(currentRoom.players).filter(p => p.isDead).length : alive.length;
    if (Object.keys(currentRoom.votes).length === required) {
      if (currentRoom.timerId) clearInterval(currentRoom.timerId);
      tallyVotesLogic(code);
    } else {
        setTimeout(() => {
  if (!rooms[code] || rooms[code].phase !== 'JUDGEMENT') return;
  const currentRoom = rooms[code];
  
  // 판정대에 올라간 타겟 중 AI가 있다면 자동으로 'PROVE'(증명) 신호를 보냄
  currentRoom.selectedTargets.forEach(targetId => {
    const p = currentRoom.players[targetId];
    if (p && p.isAI) {
      // AI는 무조건 첫 번째 능력을 안전하게 증명하여 생존함
      if (p.abilities[0] && p.abilities[0].type === 'ACTIVE') {
        p.abilities[0] = { id: "none", name: "무능력자", type: "NONE", desc: "능력 소멸." };
      }
      currentRoom.selectedTargets = currentRoom.selectedTargets.filter(id => id !== targetId);
    }
  });

  // 전원 판정 완료 시 다음 페이즈 연동
  if (currentRoom.selectedTargets.length === 0) {
    const alive = Object.values(currentRoom.players).filter(p => !p.isDead);
    if (alive.length <= 1) { currentRoom.status = 'GAME_OVER'; }
    else if (alive.length === 2) { currentRoom.phase = 'LAST_STAND'; currentRoom.votes = {}; startRoomTimer(code, currentRoom.voteTime, 'VOTING'); }
    else { advanceRound(code); }
  }
  io.to(code).emit('update_state', currentRoom);
}, 1500);
      io.to(code).emit('update_state', currentRoom);
    }
  }, 2000);
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
      roomCode: code, maxPlayers: Math.max(5, Math.min(15, parseInt(maxPlayers) || 5)), gameMode: gameMode || 'CLASSIC', voteTime: parseInt(voteTime) || 30,
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
    io.to(code).emit('update_state', room);
    io.emit('room_list', Object.values(rooms).map(r => ({ roomCode: r.roomCode, currentPlayers: Object.keys(r.players).length, maxPlayers: r.maxPlayers, status: r.status })));
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

    const currentPlayersArr = Object.values(room.players);
    const currentCount = currentPlayersArr.length;
    
    // ⭐ [AI 자동 참여 핵심 로직] 설정한 최대 인원(maxPlayers)까지 빈 자리를 AI로 자동 채움
    if (currentCount < room.maxPlayers) {
      const aiNeeded = room.maxPlayers - currentCount;
      const aiNames = ["가브리엘AI", "미카엘AI", "라파엘AI", "루시퍼AI", "우리엘AI", "아자젤AI", "메타트론AI", "벨리알AI", "리리스AI", "바알AI", "아스타로트AI"];
      
      for (let i = 0; i < aiNeeded; i++) {
        const aiId = `ai_${Math.random().toString(36).substr(2, 9)}`;
        const aiName = aiNames[i % aiNames.length] + `(봇_${i+1})`;
        
        room.players[aiId] = {
          id: aiId,
          name: aiName,
          isDead: false,
          isReady: true,
          isAI: true, // 봇 판별 플래그 추가
          abilities: [],
          artifacts: [],
          hp: 15
        };
      }
    }

    // 34개 고유 능력 셔플 및 분배 (AI 포함 전원 분배)
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
    if (Object.keys(room.votes).length === required) { clearInterval(room.timerId); tallyVotes(code); }
    else { io.to(code).emit('update_state', room); }
  });

  socket.on('submit_judgement', ({ actionType, cardIndex }) => {
    const code = userToRoom[socket.id];
    const room = rooms[code];
    if (!room) return;
    const p = room.players[socket.id];
    
    if (actionType === 'PROVE') {
      let currentAbility = p.abilities[cardIndex || 0];
      if (currentAbility.type === 'ACTIVE') {
        p.abilities[cardIndex || 0] = { no: 0, name: "무능력자", type: "NONE", desc: "권능 소멸" };
      }
    } else { p.isDead = true; }

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
server.listen(PORT, () => console.log(`🚀 백엔드 포트 가동: ${PORT}`));