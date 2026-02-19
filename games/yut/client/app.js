const socket = io('/yut');

// DOM 요소
const screens = {
    mainMenu: document.getElementById('mainMenu'),
    createRoom: document.getElementById('createRoom'),
    joinRoom: document.getElementById('joinRoom'),
    lobby: document.getElementById('lobby'),
    game: document.getElementById('game')
};

const ui = {
    btnGoToCreate: document.getElementById('btnGoToCreate'),
    btnGoToJoin: document.getElementById('btnGoToJoin'),
    createNickname: document.getElementById('createNickname'),
    btnBackFromCreate: document.getElementById('btnBackFromCreate'),
    btnConfirmCreate: document.getElementById('btnConfirmCreate'),
    joinNickname: document.getElementById('joinNickname'),
    joinRoomId: document.getElementById('joinRoomId'),
    btnBackFromJoin: document.getElementById('btnBackFromJoin'),
    btnConfirmJoin: document.getElementById('btnConfirmJoin'),
    roomIdDisplay: document.getElementById('roomIdDisplay'),
    lobbySettings: document.getElementById('lobbySettings'),
    playerList: document.getElementById('playerList'),
    waitingMsg: document.getElementById('waitingMsg'),
    btnLeaveLobby: document.getElementById('btnLeaveLobby'),
    btnStartGame: document.getElementById('btnStartGame'),
    turnIndicator: document.getElementById('turnIndicator'),
    playersStatus: document.getElementById('playersStatus'),
    yutBoard: document.getElementById('yutBoard'),
    yutDisplay: document.getElementById('yutDisplay'),
    yutResultText: document.getElementById('yutResultText'),
    throwBtn: document.getElementById('throwBtn'),
    movesList: document.getElementById('movesList'),
    toast: document.getElementById('toast')
};

let myId = null;
let currentRoom = null;
let gameState = null;
let roomOptions = {
    playerCount: 3,
    tokenCount: 4,
    useBackdo: false,
    useNak: false
};
let selectedMoveIndex = -1;
let pendingPathChoice = null; // { tokenId, yutResultIndex, location }
const BOARD_NODES = {};

function showScreen(screenId) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenId].classList.add('active');
}

function showToast(message) {
    ui.toast.textContent = message;
    ui.toast.classList.add('show');
    setTimeout(() => ui.toast.classList.remove('show'), 3000);
}

ui.btnGoToCreate.onclick = () => showScreen('createRoom');
ui.btnGoToJoin.onclick = () => showScreen('joinRoom');
ui.btnBackFromCreate.onclick = () => showScreen('mainMenu');
ui.btnBackFromJoin.onclick = () => showScreen('mainMenu');

function setupOptionButtons(selector, callback) {
    const buttons = document.querySelectorAll(selector);
    buttons.forEach(btn => {
        btn.onclick = () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            callback(btn.dataset.value);
        };
    });
}

setupOptionButtons('.player-count-btn', val => roomOptions.playerCount = parseInt(val));
setupOptionButtons('.token-count-btn', val => roomOptions.tokenCount = parseInt(val));
setupOptionButtons('.backdo-btn', val => roomOptions.useBackdo = val === 'true');
setupOptionButtons('.nak-btn', val => roomOptions.useNak = val === 'true');

socket.on('connect', () => {
    myId = socket.id;
    console.log('윷놀이 서버 연결됨:', myId);
});

ui.btnConfirmCreate.onclick = () => {
    const name = ui.createNickname.value.trim();
    if (!name) {
        showToast('닉네임을 입력해주세요');
        return;
    }

    socket.emit('createRoom', {
        playerName: name,
        options: roomOptions
    });
};

ui.btnConfirmJoin.onclick = () => {
    const name = ui.joinNickname.value.trim();
    const roomId = ui.joinRoomId.value.trim();

    if (!name) {
        showToast('닉네임을 입력해주세요');
        return;
    }
    if (!roomId || roomId.length !== 4) {
        showToast('4자리 방 코드를 입력해주세요');
        return;
    }

    socket.emit('joinRoom', { roomId, playerName: name });
};

ui.btnLeaveLobby.onclick = () => location.reload();
ui.btnStartGame.onclick = () => socket.emit('startGame');
ui.throwBtn.onclick = () => socket.emit('throwYut');

socket.on('roomCreated', ({ roomId, players, config }) => {
    currentRoom = roomId;
    ui.roomIdDisplay.textContent = roomId;
    updateLobby(players, config);
    showScreen('lobby');
});

socket.on('roomJoined', ({ roomId, players, config }) => {
    currentRoom = roomId;
    ui.roomIdDisplay.textContent = roomId;
    updateLobby(players, config);
    showScreen('lobby');
});

socket.on('updateRoom', ({ players, config }) => {
    updateLobby(players, config);
});

socket.on('gameStarted', ({ gameState: state }) => {
    gameState = state;
    showScreen('game');
    initBoard();
    renderGame();
    showToast('게임이 시작되었습니다!');
});

socket.on('yutThrown', ({ result, gameState: state, isNak }) => {
    gameState = state;

    if (isNak) {
        animateNak();
        setTimeout(() => renderGame(), 1500);
    } else {
        animateYutThrow(result);
        setTimeout(() => renderGame(), 1500);
    }
});

socket.on('gameStateUpdated', ({ gameState: state }) => {
    gameState = state;
    pendingPathChoice = null; // 경로 선택 완료
    selectedMoveIndex = -1; // 이동 완료 후 선택 초기화
    renderGame();
});

socket.on('gameOver', ({ winner }) => {
    showToast(`🎉 ${winner.name}님이 승리했습니다!`);
    setTimeout(() => location.reload(), 5000);
});

socket.on('error', ({ message }) => {
    showToast(message);
});

function updateLobby(players, config) {
    ui.playerList.innerHTML = players.map((p, idx) => `
        <div class="player-item ${idx === 0 ? 'host' : ''}">
            <span class="player-name">${p.name}${p.id === myId ? ' (나)' : ''}</span>
            ${idx === 0 ? '<span class="player-badge">방장</span>' : ''}
        </div>
    `).join('');

    if (config) {
        ui.lobbySettings.textContent = `${config.maxPlayers}명 | 말 ${config.tokensPerPlayer}개${config.useBackdo ? ' | 뒷도' : ''}${config.useNak ? ' | 낙' : ''}`;
    }

    const isHost = players.length > 0 && players[0].id === myId;
    const canStart = players.length >= 2;

    if (isHost && canStart) {
        ui.btnStartGame.style.display = 'block';
        ui.waitingMsg.textContent = '게임을 시작할 수 있습니다';
    } else {
        ui.btnStartGame.style.display = 'none';
        ui.waitingMsg.textContent = `참가자 대기 중... (${players.length}/${config ? config.maxPlayers : '?'}명)`;
    }
}

// 윷판 초기화 (정확한 구조)
// 각 코너 사이에 정확히 4개 노드
// 우하(0,20) -> 우상(5) -> 좌상(10) -> 좌하(15) -> 우하(20)
function initBoard() {
    ui.yutBoard.innerHTML = '';

    const m = 5;   // 마진
    const M = 95;  // 최대

    function createNode(id, x, y, isCorner = false) {
        BOARD_NODES[id] = { x, y };
        const node = document.createElement('div');
        node.className = `node${isCorner ? ' corner' : ''}`;
        node.style.left = `${x}%`;
        node.style.top = `${y}%`;
        node.dataset.id = id;
        ui.yutBoard.appendChild(node);
    }

    // 코너 좌표
    const BR = { x: M, y: M };    // 우하 (0, 20번 위치)
    const TR = { x: M, y: m };    // 우상 (5번)
    const TL = { x: m, y: m };    // 좌상 (10번)
    const BL = { x: m, y: M };    // 좌하 (15번)
    const C = { x: 50, y: 50 };   // 중앙 (23번)

    // 외곽 20칸 (각 변마다 코너 포함 5칸 = 코너 사이 4칸)
    // 우하 -> 우상 (1, 2, 3, 4, 5)
    for (let i = 1; i <= 5; i++) {
        const t = i / 5;
        createNode(i, BR.x, BR.y + (TR.y - BR.y) * t, i === 5);
    }

    // 우상 -> 좌상 (6, 7, 8, 9, 10)
    for (let i = 1; i <= 5; i++) {
        const t = i / 5;
        createNode(i + 5, TR.x + (TL.x - TR.x) * t, TR.y, i === 5);
    }

    // 좌상 -> 좌하 (11, 12, 13, 14, 15)
    for (let i = 1; i <= 5; i++) {
        const t = i / 5;
        createNode(i + 10, TL.x, TL.y + (BL.y - TL.y) * t, i === 5);
    }

    // 좌하 -> 우하 (16, 17, 18, 19, 20)
    for (let i = 1; i <= 5; i++) {
        const t = i / 5;
        createNode(i + 15, BL.x + (BR.x - BL.x) * t, BL.y, i === 5);
    }

    // 중앙 (23)
    createNode(23, C.x, C.y, true);

    // 대각선 1: 우상(5) -> 중앙 (21, 22)
    for (let i = 1; i <= 2; i++) {
        const t = i / 3;
        createNode(20 + i, TR.x + (C.x - TR.x) * t, TR.y + (C.y - TR.y) * t);
    }

    // 대각선 2: 좌상(10) -> 중앙 (24, 25)
    for (let i = 1; i <= 2; i++) {
        const t = i / 3;
        createNode(23 + i, TL.x + (C.x - TL.x) * t, TL.y + (C.y - TL.y) * t);
    }

    // 대각선 3: 중앙 → 우하 (26, 27)
    for (let i = 1; i <= 2; i++) {
        const t = i / 3;
        createNode(25 + i, C.x + (BR.x - C.x) * t, C.y + (BR.y - C.y) * t);
    }

    // 대각선 4: 중앙 → 좌하 (28, 29)
    for (let i = 1; i <= 2; i++) {
        const t = i / 3;
        createNode(27 + i, C.x + (BL.x - C.x) * t, C.y + (BL.y - C.y) * t);
    }
}

function renderGame() {
    if (!gameState) return;

    const currentPlayer = gameState.players[gameState.currentTurnIndex];
    const isMyTurn = currentPlayer.id === myId;

    ui.turnIndicator.textContent = isMyTurn ? '나의 차례입니다!' : `${currentPlayer.name}님의 차례`;

    ui.playersStatus.innerHTML = gameState.players.map(p => `
        <div class="player-status${p.id === currentPlayer.id ? ' active' : ''}">
            <div class="player-status-name">${p.name}</div>
            <div class="player-status-info">완주: ${p.finishedCount}/${p.tokens.length}개</div>
        </div>
    `).join('');

    ui.throwBtn.disabled = !(isMyTurn && gameState.waitingForThrow);

    renderMoves(isMyTurn);
    renderTokens(isMyTurn);
}

function renderMoves(isMyTurn) {
    ui.movesList.innerHTML = gameState.yutResults.map((result, idx) => `
        <div class="move-chip${selectedMoveIndex === idx ? ' selected' : ''}" 
             onclick="selectMove(${idx})" 
             style="${!isMyTurn ? 'pointer-events: none; opacity: 0.5;' : ''}">
            ${result.name}${result.isBackdo ? ' ✕' : ''}
        </div>
    `).join('');
}

function selectMove(idx) {
    selectedMoveIndex = idx;
    renderGame();
}

function renderTokens(isMyTurn) {
    document.querySelectorAll('.token').forEach(el => el.remove());
    document.querySelectorAll('.path-arrow').forEach(el => el.remove());

    // 대기 중인 말들 (아래에 표시)
    const myPlayer = gameState.players.find(p => p.id === myId);
    if (myPlayer && isMyTurn) {
        const waitingTokens = myPlayer.tokens.filter(t => t.location === 0);

        waitingTokens.forEach((token, idx) => {
            const tokenEl = document.createElement('div');
            tokenEl.className = `token ${myPlayer.color} waiting-token`;
            tokenEl.style.position = 'absolute';
            tokenEl.style.left = `${10 + idx * 35}px`;
            tokenEl.style.bottom = '-40px';
            tokenEl.style.transform = 'none';

            if (selectedMoveIndex !== -1 && !pendingPathChoice) {
                tokenEl.style.cursor = 'pointer';
                tokenEl.style.border = '3px dashed white';
                tokenEl.onclick = () => moveToken(token.id);
            }

            ui.yutBoard.appendChild(tokenEl);
        });
    }

    // 판 위의 말들 (업힌 말은 제외)
    // 어떤 토큰의 stackWith에도 포함되지 않은 토큰만 렌더링
    const stackedTokenIds = new Set();
    gameState.tokens.forEach(token => {
        token.stackWith.forEach(id => stackedTokenIds.add(id));
    });

    gameState.tokens.forEach(token => {
        if (token.location === 0 || token.location === 99) return;
        if (stackedTokenIds.has(token.id)) return; // 업힌 토큰은 숨김

        const pos = BOARD_NODES[token.location];
        if (!pos) return;

        const tokenEl = document.createElement('div');
        const owner = gameState.players[token.ownerIndex];
        tokenEl.className = `token ${owner.color}`;
        tokenEl.style.left = `${pos.x}%`;
        tokenEl.style.top = `${pos.y}%`;

        // 스택 표시 (1 + 업힌 말 개수)
        const stackCount = 1 + token.stackWith.length;
        if (stackCount > 1) {
            tokenEl.textContent = stackCount;
            tokenEl.style.fontSize = '14px';
            tokenEl.style.fontWeight = 'bold';
        }

        if (isMyTurn && token.ownerIndex === gameState.currentTurnIndex && selectedMoveIndex !== -1 && !pendingPathChoice) {
            tokenEl.style.cursor = 'pointer';
            tokenEl.style.boxShadow = '0 0 15px white';
            tokenEl.onclick = () => moveToken(token.id);
        }

        ui.yutBoard.appendChild(tokenEl);
    });

    // 경로 선택 화살표 표시
    if (pendingPathChoice) {
        const pos = BOARD_NODES[pendingPathChoice.location];
        if (pos) {
            const location = pendingPathChoice.location;
            let straightDir = '', diagonalDir = '';

            if (location === 5) { // 우상 코너
                straightDir = '←'; // 좌측(외곽)
                diagonalDir = '↙'; // 대각(중앙)
            } else if (location === 10) { // 좌상 코너
                straightDir = '↓'; // 하측(외곽)
                diagonalDir = '↘'; // 대각(중앙)
            } else if (location === 23) { // 중앙
                // 어디서 왔든 동일: 직선=우하, 대각=도착
                straightDir = '↘'; // 우하로
                diagonalDir = '✓'; // 도착
            }

            // 직선 화살표
            const straightArrow = document.createElement('button');
            straightArrow.className = 'path-arrow straight';
            straightArrow.textContent = straightDir;
            straightArrow.style.left = `${pos.x - 6}%`;
            straightArrow.style.top = `${pos.y}%`;
            straightArrow.onclick = () => selectPath(false);
            ui.yutBoard.appendChild(straightArrow);

            // 대각선 화살표 (있을 경우만)
            if (diagonalDir) {
                const diagonalArrow = document.createElement('button');
                diagonalArrow.className = 'path-arrow diagonal';
                diagonalArrow.textContent = diagonalDir;
                diagonalArrow.style.left = `${pos.x + 6}%`;
                diagonalArrow.style.top = `${pos.y}%`;
                diagonalArrow.onclick = () => selectPath(true);
                ui.yutBoard.appendChild(diagonalArrow);
            }
        }
    }
}

function selectPath(useDiagonal) {
    if (!pendingPathChoice) return;

    console.log('선택한 경로:', useDiagonal ? '대각선' : '직선');
    console.log('말 위치:', pendingPathChoice.location);

    socket.emit('moveToken', {
        tokenId: pendingPathChoice.tokenId,
        yutResultIndex: pendingPathChoice.yutResultIndex,
        useDiagonal
    });

    pendingPathChoice = null;
    selectedMoveIndex = -1; // 선택 초기화
}

function moveToken(tokenId) {
    if (selectedMoveIndex === -1) {
        showToast('먼저 윷패를 선택해주세요');
        return;
    }

    const token = gameState.tokens.find(t => t.id === tokenId);
    if (!token) return;

    // 방향 선택이 필요한 위치: 우상(5), 좌상(10)만
    const needsChoice = token.location === 5 || token.location === 10;

    if (needsChoice) {
        // 경로 선택 UI 표시
        pendingPathChoice = {
            tokenId,
            yutResultIndex: selectedMoveIndex,
            location: token.location,
            fromCorner: token.fromCorner
        };
        renderGame();
    } else {
        // 바로 이동
        socket.emit('moveToken', {
            tokenId,
            yutResultIndex: selectedMoveIndex,
            useDiagonal: false
        });

        selectedMoveIndex = -1;
    }
}

function animateYutThrow(result) {
    ui.yutResultText.textContent = `${result.name}!${result.isBackdo ? ' (뒷도)' : ''}`;

    const sticks = ui.yutDisplay.querySelectorAll('.stick');
    const flatCount = result.value === 5 ? 0 : result.value;

    sticks.forEach((stick, idx) => {
        stick.classList.remove('flat', 'round');
        stick.textContent = '';

        setTimeout(() => {
            if (idx < flatCount) {
                stick.classList.add('flat');
                if (result.isBackdo && idx === 0) {
                    stick.textContent = '✕';
                    stick.style.fontSize = '2rem';
                    stick.style.display = 'flex';
                    stick.style.alignItems = 'center';
                    stick.style.justifyContent = 'center';
                }
            } else {
                stick.classList.add('round');
            }
        }, 100);
    });
}

function animateNak() {
    ui.yutResultText.textContent = '낙!';
    ui.yutResultText.style.color = 'var(--danger-color)';

    setTimeout(() => {
        ui.yutResultText.style.color = 'var(--primary-color)';
    }, 1500);
}

window.selectMove = selectMove;
