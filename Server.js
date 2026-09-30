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

// 💡 34개 고유 능력 + 히든 기믹 매커니즘이 포함된 완전무결 데이터베이스
const MASTER_ABILITIES = {
  1: { no: 1, name: "쿠데타", type: "ACTIVE", tag: "특수", desc: "'왕' 처치. 왕 부재 시 대상을 몰락한 왕으로 변경" },
  2: { no: 2, name: "저주", type: "ACTIVE", tag: "공격", desc: "지정 대상에게 2턴 후 사망하는 저주 부여" },
  3: { no: 3, name: "시한폭탄", type: "PASSIVE", tag: "공격", desc: "판정 시 무작위 대상과 함께 동반 자폭 사멸" },
  4: { no: 4, name: "기생", type: "ACTIVE", tag: "공격", desc: "지정 대상을 숙주 상태로 변경하여 운명 결속" },
  5: { no: 5, name: "왕", type: "PASSIVE", tag: "특수", desc: "판정 시 무조건 생존. 1:1 대치 상황 시 자동 우승" },
  6: { no: 6, name: "네크로맨서", type: "ACTIVE", tag: "특수", desc: "사망한 대상의 능력 중 하나를 탈취하여 의식 카피 사용" },
  7: { no: 7, name: "물귀신", type: "ACTIVE", tag: "공격", desc: "카드 능력 공개 시 지정 대상과 함께 동반 즉사" },
  8: { no: 8, name: "탐정", type: "ACTIVE", tag: "특수", desc: "지정 대상의 카드 능력을 강제 공개 판별" },
  9: { no: 9, name: "범죄자", type: "PASSIVE", tag: "특수", desc: "능력 공개 시 가차없이 즉시 사망" },
  10: { no: 10, name: "방패", type: "ACTIVE", tag: "수비", desc: "이번 턴에 들어오는 모든 공격 판정을 완벽 방어" },
  11: { no: 11, name: "암살", type: "ACTIVE", tag: "공격", desc: "판정 시 지정 대상을 즉시 처치 소멸" },
  12: { no: 12, name: "반사", type: "ACTIVE", tag: "수비", desc: "능력으로 가해진 공격 판정을 시전자에게 반사" },
  13: { no: 13, name: "도둑", type: "ACTIVE", tag: "특수", desc: "지정 대상의 능력을 강탈하여 즉시 사용하고 대상 소멸" },
  14: { no: 14, name: "게이머", type: "ACTIVE", tag: "공격", desc: "지정 대상과 가위바위보 대결 후 패배자 처치" },
  15: { no: 15, name: "정치인", type: "ACTIVE", tag: "공격", desc: "지정 대상과 1:1 투표 대결 진행 후 패자 처치" },
  16: { no: 16, name: "영웅", type: "PASSIVE", tag: "특수", desc: "남은 인원이 자신 포함 3명일 때 즉시 우승 [영속]" },
  17: { no: 17, name: "티라노", type: "ACTIVE", tag: "공격", desc: "자신의 대진 순번 기준 앞뒤(±1) 대상 중 하나 처치" },
  18: { no: 18, name: "진화", type: "PASSIVE", tag: "특수", desc: "현재 턴 수(1~11턴)에 선언된 지정 권능으로 변형 [영속]" },
  19: { no: 19, name: "도박", type: "ACTIVE", tag: "공격", desc: "주사위를 굴려 나온 수만큼 순번을 가감해 대상 처치" },
  20: { no: 20, name: "바이러스", type: "ACTIVE", tag: "공격", desc: "판정 시 지정 대상의 고유 능력을 영구 소멸시킴" },
  21: { no: 21, name: "건달", type: "ACTIVE", tag: "공격", desc: "지정 대상에게 투표권이 영구 소멸하는 협박 디버프 부여" },
  22: { no: 22, name: "부활", type: "ACTIVE", tag: "특수", desc: "사망한 시점 기준 2턴이 경과하면 전장으로 부활 재진입" },
  23: { no: 23, name: "역관광", type: "PASSIVE", tag: "공격", desc: "판정 시 자신을 투표 저격한 대상 중 1명 처치 (4턴 전까지만)" },
  24: { no: 24, name: "팬텀", type: "ACTIVE", tag: "특수", desc: "3턴 동안 남은 무작위 능력을 허위 가짜 공개" },
  25: { no: 25, name: "미행", type: "PASSIVE", tag: "특수", desc: "아공간 행적 확인 및 아공간 타겟팅 면제 [아공간]" },
  26: { no: 26, name: "현상수배", type: "ACTIVE", tag: "특수", desc: "대상 지정 후, 해당 유저 사망 시 무작위 변경 [아공간]" },
  27: { no: 27, name: "예언", type: "ACTIVE", tag: "공격", desc: "3회 내 대상 능력 예지 예측 성공 시 처치 [아공간]" },
  29: { no: 29, name: "검투사", type: "ACTIVE", tag: "공격/수비", desc: "다음 순서 처치 혹은 피격 시 방어 및 한 턴 투표권 소멸" },
  30: { no: 30, name: "차원이동", type: "ACTIVE", tag: "수비", desc: "2턴 동안 아공간 도주 및 상호작용 면제 [아공간]" },
  31: { no: 31, name: "학살", type: "PASSIVE", tag: "공격", desc: "다음 턴 종료 시점부터 무능력자 1명을 무조건 처치" },
  32: { no: 32, name: "아드레날린", type: "PASSIVE", tag: "수비", desc: "사망 공격 1회 방어 후 50% 확률 쇼크사 디버프 돌입" },
  33: { no: 33, name: "회피", type: "PASSIVE", tag: "수비", desc: "피격 시 확률(50%->25%->10%)에 따라 공격 회피 버프 획득" },
  34: { no: 34, name: "시계", type: "PASSIVE", tag: "수비", desc: "공격 1회 방어 및 다음 턴을 이전 턴 수로 회귀 [영속]" },
  35: { no: 35, name: "시침", type: "ACTIVE", tag: "특수", desc: "능력 공개 시 전장의 영속 티어 유저 1명을 추적 고지 [영속]" }
};

let rooms = {};
let userToRoom = {};

const EVOLUTION_TABLE = {
  1: "범죄자", 2: "예언", 3: "건달", 4: "바이러스", 5: "네크로맨서",
  6: "물귀신", 7: "저주", 8: "부활", 9: "도둑", 10: "왕", 11: "암살"
};

app.get('/', (req, res) => { res.send('능력투표대전 34대 코어 AI 시스템 정상 구동 중'); });
function startRoomTimer(code, seconds, type) {
  const room = rooms[code];
  if (!room) return;
  
  if (room.timerId) {
    clearInterval(room.timerId);
  }
  
  room.timeLeft = seconds;
  
  // 🚀 매 초마다 시간을 깎고 프론트엔드에 강제 동기화 빔을 쏩니다.
  room.timerId = setInterval(() => {
    const currentRoom = rooms[code];
    if (!currentRoom) {
      clearInterval(room.timerId);
      return;
    }
    
    currentRoom.timeLeft--;
    
    // 전방위 동기화 패킷 브로드캐스팅
    io.to(code).emit('timer_update', { timeLeft: currentRoom.timeLeft, timerType: type });
    io.to(code).emit('update_state', currentRoom);
    
    if (currentRoom.timeLeft <= 0) {
      clearInterval(room.timerId);
      handleTimeout(code, type);
    }
  }, 1000);
}

function handleTimeout(code, type) {
  const room = rooms[code]; if (!room || room.status !== 'PLAYING') return;
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
  } else if (type === 'PREDICTION') { advanceRound(code); }
}

function tallyVotesLogic(code) {
  const room = rooms[code]; const alive = Object.values(room.players).filter(p => !p.isDead);
  const voteCounts = {}; Object.values(room.votes).forEach(t => { voteCounts[t] = (voteCounts[t] || 0) + 1; });
  let max = 0, candidates = [];
  Object.entries(voteCounts).forEach(([id, count]) => {
    if (count > max) { max = count; candidates = [id]; }
    else if (count === max) { candidates.push(id); }
  });
  if (candidates.length > 1 || Object.keys(voteCounts).length === 0) {
    if (room.gameMode === 'CHAOS') { room.selectedTargets = alive.map(p => p.id); } 
    else { room.selectedTargets = [alive[Math.floor(Math.random() * alive.length)].id]; }
  } else { room.selectedTargets = candidates; }

  let bombFound = room.selectedTargets.some(id => room.players[id]?.abilities.some(a => a.no === 3));
  if (bombFound) {
    Object.values(room.players).forEach(p => { if (!p.isDead) p.hp -= 10; });
    io.to(code).emit('system_message', "💣 시한폭탄 자폭 발동! 광역 대미지가 전장을 덮칩니다.");
  }
  room.phase = 'JUDGEMENT'; io.to(code).emit('update_state', room);

  setTimeout(() => {
    if (!rooms[code] || rooms[code].phase !== 'JUDGEMENT') return;
    const currentRoom = rooms[code];
    currentRoom.selectedTargets.forEach(targetId => {
      const p = currentRoom.players[targetId];
      if (p && p.isAI) {
        p.abilities.forEach((ab, idx) => {
          if (ab.type === 'ACTIVE') p.abilities[idx] = { no: 0, name: "무능력자", type: "NONE", desc: "권능 소멸." };
        });
        currentRoom.selectedTargets = currentRoom.selectedTargets.filter(id => id !== targetId);
      }
    });
    if (currentRoom.selectedTargets.length === 0) resolvePhaseEnd(code);
  }, 1500);
}

function resolvePhaseEnd(code) {
  const room = rooms[code]; const alive = Object.values(room.players).filter(p => !p.isDead);
  if (alive.length <= 1) { room.status = 'GAME_OVER'; io.to(code).emit('update_state', room); return; }
  alive.forEach(p => {
    if (p.debuffs.damnation) { p.debuffs.damnation--; if (p.debuffs.damnation === 0) p.isDead = true; }
  });
  if (alive.length === 2) { room.phase = 'LAST_STAND'; room.votes = {}; startRoomTimer(code, room.voteTime, 'VOTING'); }
  else if (alive.length <= 5 || room.gameMode === 'DELUXE') { advanceRound(code); }
  else { room.phase = 'PREDICTION'; room.predictions = {}; startRoomTimer(code, 20, 'PREDICTION'); }
  io.to(code).emit('update_state', room);
}

function advanceRound(code) {
  const room = rooms[code];
  if (!room) return;

  room.round += 1;
  room.votes = {};
  room.phase = 'VOTING';

  // No.18 진화 등 라운드 턴 트래킹 권능 갱신
  Object.values(room.players).forEach(p => {
    if (p.abilities && Array.isArray(p.abilities)) {
      p.abilities.forEach(ab => {
        if (ab.no === 18) {
          let textName = EVOLUTION_TABLE[room.round];
          if (textName) ab.name = `진화 - [${textName}]`;
          else if (room.round >= 13) ab.name = "진화 - 과잉성장(사용 불가)";
        }
      });
    }
  });

  // 🤖 [AI 봇 자동 조준 엔진 인젝션] 새 라운드 선언 직후 봇들이 투표를 즉시 완료합니다.
  const alive = Object.values(room.players).filter(p => !p.isDead);
  Object.values(room.players).forEach(p => {
    if (p.isAI && !p.isDead) {
      // 대혼돈 모드가 아니라면 자기 자신을 제외한 생존자 중 한 명 무작위 저격
      const targets = alive.filter(t => room.gameMode === 'CHAOS' || t.id !== p.id);
      if (targets.length > 0) {
        room.votes[p.id] = targets[Math.floor(Math.random() * targets.length)].id;
      }
    }
  });

  // 타이머 작동 및 전원 상태 업데이트
  io.to(code).emit('update_state', room);
  startRoomTimer(code, room.voteTime, 'VOTING');

  // 만약 방에 봇들이 많아서 플레이어 혼자 투표하면 바로 끝나야 하는 상황 제어
  const required = room.phase === 'LAST_STAND' ? Object.values(room.players).filter(p => p.isDead).length : alive.length;
  if (Object.keys(room.votes).length === required) {
    if (room.timerId) clearInterval(room.timerId);
    tallyVotesLogic(code);
  }
}

io.on('connection', (socket) => {
  socket.on('get_room_list', () => {
    socket.emit('room_list', Object.values(rooms).map(r => ({ roomCode: r.roomCode, currentPlayers: Object.keys(r.players).length, maxPlayers: r.maxPlayers, status: r.status })));
  });

  socket.on('create_room', ({ roomCode, maxPlayers, playerName, gameMode, voteTime }) => {
    const code = String(roomCode).trim().toUpperCase(); if (!code || rooms[code]) return;
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
    const room = rooms[code]; socket.join(code); userToRoom[socket.id] = code;
    room.players[socket.id] = { id: socket.id, name: playerName, isDead: false, isReady: socket.id === room.hostId, abilities: [], artifacts: [], hp: 15, debuffs: {}, isAI: false };
    io.to(code).emit('update_state', room);
    io.emit('room_list', Object.values(rooms).map(r => ({ roomCode: r.roomCode, currentPlayers: Object.keys(r.players).length, maxPlayers: r.maxPlayers, status: r.status })));
  }

  socket.on('toggle_ready', () => {
    const code = userToRoom[socket.id];
    if (code && rooms[code]) { rooms[code].players[socket.id].isReady = !rooms[code].players[socket.id].isReady; io.to(code).emit('update_state', rooms[code]); }
  });

  socket.on('start_game', () => {
    const code = userToRoom[socket.id]; const room = rooms[code]; if (!room || room.hostId !== socket.id) return;
    const currentCount = Object.keys(room.players).length;
    if (currentCount < room.maxPlayers) {
      const aiNeeded = room.maxPlayers - currentCount;
      const aiNames = ["가브리엘AI", "미카엘AI", "라파엘AI", "루시퍼AI", "우리엘AI", "아자젤AI", "메타트론AI"];
      for (let i = 0; i < aiNeeded; i++) {
        const aiId = `ai_${Math.random().toString(36).substr(2, 9)}`;
        room.players[aiId] = { id: aiId, name: aiNames[i % aiNames.length] + `(봇_${i+1})`, isDead: false, isReady: true, isAI: true, abilities: [], artifacts: [], hp: 15, debuffs: {} };
      }
    }
    let deck = Object.values(MASTER_ABILITIES).sort(() => Math.random() - 0.5); let selectedNos = [];
    Object.values(room.players).forEach((p, idx) => {
      p.abilities = room.gameMode === 'DELUXE' ? [deck[idx * 2], deck[idx * 2 + 1]] : [deck[idx]];
      p.abilities.forEach(a => selectedNos.push(a.no));
      if (room.gameMode === 'CHAOS') p.anonName = `익명 예언자 ${idx + 1}`;
    });
    if (selectedNos.includes(34) && selectedNos.includes(35)) {
      Object.values(room.players).forEach(p => {
        p.abilities.forEach(ab => {
          if (ab.no === 34 || ab.no === 35) {
            ab.name = "영속의 존재 - 아이온 [영속]";
            ab.desc = "시계와 시침이 결합했습니다. 소멸 전까지 턴 수가 영구 고정됩니다.";
          }
        });
      });
    }
    room.status = 'PLAYING'; advanceRound(code);
  });

  socket.on('submit_judgement', ({ actionType, cardIndex }) => {
    const code = userToRoom[socket.id]; const room = rooms[code]; if (!room) return;
    const p = room.players[socket.id];
    if (actionType === 'PROVE') {
      let ab = p.abilities[cardIndex || 0];
      if (ab.no === 1) {
        let king = Object.values(room.players).find(pl => pl.abilities.some(a => a.no === 5) && !pl.isDead);
        if (king) king.isDead = true;
        else {
          let t = Object.values(room.players).find(pl => pl.id !== socket.id && !pl.isDead);
          if (t) t.abilities = [{ no: 99, name: "몰락한 왕 - 타이런트", type: "PASSIVE", desc: "판정 이외 공격 무시" }];
        }
      }
      if (ab.no === 2) {
        let t = Object.values(room.players).find(pl => pl.id !== socket.id && !pl.isDead);
        if (t) t.debuffs.damnation = 2;
      }
      if (ab.type === 'ACTIVE') p.abilities[cardIndex || 0] = { no: 0, name: "무능력자", type: "NONE", desc: "권능 소멸." };
    } else { p.isDead = true; }
    room.selectedTargets = room.selectedTargets.filter(id => id !== socket.id);
    if (room.selectedTargets.length === 0) resolvePhaseEnd(code);
    else io.to(code).emit('update_state', room);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 백엔드 가동 완료`));