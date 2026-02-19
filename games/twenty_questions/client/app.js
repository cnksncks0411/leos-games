const socket = io('/twenty'); // twenty 네임스페이스 사용

// State
let myId = null;
let myName = '';
let currentRoom = null;
let lastRenderedHistoryLength = 0;

// UI Elements
const screens = {
    login: document.getElementById('login-screen'),
    lobby: document.getElementById('lobby-screen'),
    game: document.getElementById('game-screen')
};

// --- Helper Functions ---
function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenName].classList.add('active');
}

function updateAppStats(room) {
    // 룸 정보 업데이트
    if (room) {
        document.getElementById('room-id-display').textContent = `CODE: ${room.roomId}`;
        const list = document.getElementById('lobby-player-list');
        list.innerHTML = '';
        room.players.forEach(p => {
            const el = document.createElement('div');
            el.className = `player-item ${p.id === myId ? 'me' : ''}`;
            el.innerHTML = `<span>${p.name}</span> <span>${p.id === room.hostId ? '👑' : ''}</span>`;
            list.appendChild(el);
        });

        const startBtn = document.getElementById('start-game-btn');
        const statusMsg = document.getElementById('lobby-status');

        if (room.hostId === myId) {
            startBtn.classList.remove('hidden');
            statusMsg.classList.add('hidden');
            // 2명 이상일 때만 시작 가능하게?
            startBtn.disabled = room.players.length < 2;
        } else {
            startBtn.classList.add('hidden');
            statusMsg.classList.remove('hidden');
            statusMsg.textContent = `${room.players.find(p => p.id === room.hostId)?.name}님의 시작을 기다리는 중...`;
        }
    }
}

// --- Socket Events ---

socket.on('connect', () => {
    console.log('서버 연결됨');
    myId = socket.id;
});

socket.on('roomCreated', ({ roomId, room }) => {
    currentRoom = room;
    showScreen('lobby');
    updateAppStats(room);
});

socket.on('playerJoined', ({ player, room }) => {
    // 내가 참가했는지 확인하여 화면 전환
    if (player.id === myId) {
        showScreen('lobby');
    }
    currentRoom = room;
    updateAppStats(room);
});

socket.on('playerLeft', ({ playerId, room }) => {
    currentRoom = room;
    updateAppStats(room);
});

socket.on('gameStarted', (gameState) => {
    // 게임 시작
    showScreen('game');
    updateGameState(gameState);
});

socket.on('stateUpdate', (gameState) => {
    updateGameState(gameState);
});

socket.on('roundEnded', ({ result, winnerName, secretWord, scores, gameState }) => {
    updateGameState(gameState); // 마지막 상태 반영

    // 결과 모달 표시
    const modal = document.getElementById('result-modal');
    const title = document.getElementById('result-title');
    const msg = document.getElementById('result-message');
    const board = document.getElementById('score-board');
    const nextBtn = document.getElementById('next-round-btn');

    modal.classList.remove('hidden');

    if (result === 'win') {
        title.textContent = '정답입니다! 🎉';
        title.style.color = 'var(--success)';
        msg.textContent = `${winnerName}님이 정답 [${secretWord}]을(를) 맞췄습니다!`;
    } else {
        title.textContent = '실패... 😭';
        title.style.color = 'var(--danger)';
        msg.textContent = `20번의 기회를 모두 사용했습니다. 정답은 [${secretWord}]였습니다.`;
    }

    // 점수판
    board.innerHTML = '';
    scores.sort((a, b) => b.score - a.score).forEach(p => {
        const row = document.createElement('div');
        row.className = 'score-row';
        row.innerHTML = `<span>${p.name}</span> <span>${p.score}점</span>`;
        board.appendChild(row);
    });

    // 호스트만 다음 라운드 버튼
    if (currentRoom.hostId === myId) {
        nextBtn.classList.remove('hidden');
    } else {
        nextBtn.classList.add('hidden');
    }
});

socket.on('error', ({ message }) => {
    alert(message);
});


// --- Game Logic ---

function updateGameState(gs) {
    try {
        if (!gs || !gs.gameState) {
            console.error('게임 상태 정보 누락:', gs);
            return;
        }
        const state = gs.gameState;

        // 1. Header Info
        const roundEl = document.getElementById('current-round');
        if (roundEl) roundEl.innerText = state.round;

        const turnEl = document.getElementById('turn-count');
        if (turnEl) turnEl.innerText = state.turnCount;

        // 2. Chat History
        const chatContainer = document.getElementById('chat-history');
        if (state.history.length > lastRenderedHistoryLength) {
            for (let i = lastRenderedHistoryLength; i < state.history.length; i++) {
                const item = state.history[i];
                addHistoryItem(chatContainer, item);
            }
            lastRenderedHistoryLength = state.history.length;
            chatContainer.scrollTop = chatContainer.scrollHeight;
        } else if (state.history.length === 0 && lastRenderedHistoryLength > 0) {
            chatContainer.innerHTML = '';
            lastRenderedHistoryLength = 0;
        }

        // 3. Status & Controls
        // 안전하게 플레이어 정보 접근
        if (!gs.players || gs.players.length === 0) {
            console.error('플레이어 정보 없음');
            return;
        }

        const questioner = gs.players[state.questionerIndex];
        const guesser = gs.players[state.currentGuesserIndex];

        if (!questioner || !guesser) {
            console.error('출제자/질문자 정보 오류', state.questionerIndex, state.currentGuesserIndex, gs.players);
            return;
        }

        const isQuestioner = (questioner.id === myId);
        const isGuesser = (guesser.id === myId);

        // DEBUG: 헤더에 상태 표시
        const infoEl = document.querySelector('.round-info');
        if (infoEl) {
            const debugText = isQuestioner ? "(출제자)" : isGuesser ? "(내 차례)" : "(대기)";
            infoEl.innerHTML = `ROUND <span id="current-round">${state.round}</span> <small style="font-size:0.8em;color:#aaa">${debugText}</small>`;
        }

        const banner = document.getElementById('game-status-banner');
        const instruction = document.getElementById('game-instruction');

        // Hide all controls first
        ['control-set-word', 'control-guess', 'control-judge', 'control-wait'].forEach(id => {
            document.getElementById(id).classList.add('hidden');
        });

        if (state.state === 'SETTING_WORD') {
            if (isQuestioner) {
                banner.textContent = '당신은 출제자입니다!';
                instruction.textContent = '다른 플레이어들이 맞춰야 할 단어를 입력해주세요.';
                document.getElementById('control-set-word').classList.remove('hidden');
                setTimeout(() => document.getElementById('secret-word-input').focus(), 100);
            } else {
                banner.textContent = `출제자: ${questioner.name}`;
                instruction.textContent = `${questioner.name}님이 단어를 고르고 있습니다...`;
                document.getElementById('control-wait').classList.remove('hidden');
            }
        } else if (state.state === 'GUESSING') {
            if (isQuestioner) {
                banner.textContent = '질문을 기다리는 중...';
                instruction.textContent = `${guesser.name}님이 생각 중입니다.`;
                document.getElementById('control-wait').classList.remove('hidden');
            } else if (isGuesser) {
                banner.textContent = '당신의 차례입니다!';
                if (state.turnCount === 19) {
                    instruction.textContent = '마지막 기회입니다! 무조건 정답을 입력하세요!';
                    instruction.style.color = 'var(--danger)';
                } else {
                    instruction.textContent = '질문하거나 정답을 입력하세요.';
                    instruction.style.color = 'var(--accent)';
                }
                document.getElementById('control-guess').classList.remove('hidden');
                setTimeout(() => document.getElementById('guess-input').focus(), 100);
            } else {
                banner.textContent = `질문자: ${guesser.name}`;
                instruction.textContent = `${guesser.name}님이 질문을 작성 중입니다.`;
                document.getElementById('control-wait').classList.remove('hidden');
            }
        } else if (state.state === 'JUDGING') {
            if (isQuestioner) {
                banner.textContent = '답변을 선택하세요';
                instruction.textContent = `${state.currentQuestion ? state.currentQuestion.playerName : '???'}님의 질문에 답해주세요.`;
                document.getElementById('judging-text').textContent = state.currentQuestion ? state.currentQuestion.text : '...';
                document.getElementById('control-judge').classList.remove('hidden');
            } else {
                banner.textContent = '답변 대기 중';
                instruction.textContent = `${questioner.name}님이 답변을 선택하고 있습니다.`;
                document.getElementById('control-wait').classList.remove('hidden');
            }
        }
    } catch (e) {
        console.error('updateGameState Error:', e);
        // 에러를 UI에 표시 (디버깅용)
        document.getElementById('game-instruction').textContent = "오류 발생: " + e.message;
    }
}

function addHistoryItem(container, item) {
    if (item.type === 'qa') {
        const qEl = document.createElement('div');
        qEl.className = 'chat-bubble question';
        qEl.innerHTML = `<span class="name">${item.turn}. ${item.guesserName}</span>${item.question}`;
        container.appendChild(qEl);

        const aEl = document.createElement('div');
        aEl.className = 'chat-bubble answer';
        let ansText = '';
        if (item.answer === 'yes') ansText = '⭕ 예';
        else if (item.answer === 'no') ansText = '❌ 아니오';
        else ansText = '🎉 정답!';

        aEl.innerHTML = ansText;
        container.appendChild(aEl);
    }
}


// --- Event Listeners ---

// Login Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`${btn.dataset.tab}-tab`).classList.add('active');
    });
});

// Create Room
document.getElementById('create-room-btn').addEventListener('click', () => {
    const name = document.getElementById('nickname-input').value.trim();
    if (!name) return alert('닉네임을 입력하세요');
    myName = name;

    const count = parseInt(document.getElementById('player-count-select').value);
    socket.emit('createRoom', { playerName: name, playerCount: count });
});

// Join Room
document.getElementById('join-room-btn').addEventListener('click', () => {
    const name = document.getElementById('nickname-input').value.trim();
    if (!name) return alert('닉네임을 입력하세요');
    const code = document.getElementById('room-code-input').value.trim();
    if (!code) return alert('방 코드를 입력하세요');
    myName = name;

    socket.emit('joinRoom', { roomId: code, playerName: name });
});

// Start Game
document.getElementById('start-game-btn').addEventListener('click', () => {
    socket.emit('startGame');
});

// Game Controls
document.getElementById('set-word-btn').addEventListener('click', () => {
    const word = document.getElementById('secret-word-input').value.trim();
    if (!word) return alert('단어를 입력하세요');
    socket.emit('setWord', { word });
    document.getElementById('secret-word-input').value = '';
});

document.getElementById('submit-guess-btn').addEventListener('click', () => {
    const text = document.getElementById('guess-input').value.trim();
    if (!text) return;
    socket.emit('submitQuestion', { text });
    document.getElementById('guess-input').value = '';
});

// Enter key support
document.getElementById('guess-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') document.getElementById('submit-guess-btn').click();
});
document.getElementById('secret-word-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') document.getElementById('set-word-btn').click();
});

// Judging
document.querySelectorAll('.judge-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const val = btn.dataset.val;
        socket.emit('judgeQuestion', { result: val });
    });
});

// Next Round
document.getElementById('next-round-btn').addEventListener('click', () => {
    document.getElementById('result-modal').classList.add('hidden');
    socket.emit('nextRound');
});
