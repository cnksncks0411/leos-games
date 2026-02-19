// Socket.IO 연결
const socket = io('/lexio');

// 게임 상태
const gameState = {
    player: {
        id: null,
        name: '',
        hand: [],
        selectedCards: []
    },
    room: null,
    players: [],
    currentPlayerIndex: -1,
    tableCards: [],
    myTurn: false
};

// 무늬 아이콘 매핑
const suitIcons = {
    sun: '☀️',
    moon: '🌙',
    star: '⭐',
    cloud: '☁️'
};

const suitNames = {
    sun: '해',
    moon: '달',
    star: '별',
    cloud: '구름'
};

// ===== 화면 관리 =====
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

// ===== 에러 표시 =====
function showError(message) {
    const toast = document.getElementById('errorToast');
    const messageEl = document.getElementById('errorMessage');
    messageEl.textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ===== 메인 메뉴 =====
document.getElementById('createRoomBtn').addEventListener('click', () => {
    showScreen('createRoomScreen');
});

document.getElementById('joinRoomBtn').addEventListener('click', () => {
    showScreen('joinRoomScreen');
});

document.getElementById('backFromCreate').addEventListener('click', () => {
    showScreen('mainMenu');
});

document.getElementById('backFromJoin').addEventListener('click', () => {
    showScreen('mainMenu');
});

// ===== 플레이어 수 선택 =====
let selectedPlayerCount = 3;

document.querySelectorAll('.player-count-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.player-count-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedPlayerCount = parseInt(btn.dataset.count);
    });
});

// ===== 방 만들기 =====
document.getElementById('confirmCreate').addEventListener('click', () => {
    const playerName = document.getElementById('hostName').value.trim();

    if (!playerName) {
        showError('닉네임을 입력해주세요.');
        return;
    }

    gameState.player.name = playerName;
    socket.emit('createRoom', { playerName, playerCount: selectedPlayerCount });
});

// ===== 방 참가 =====
document.getElementById('confirmJoin').addEventListener('click', () => {
    const playerName = document.getElementById('guestName').value.trim();
    const roomId = document.getElementById('roomCode').value.trim().toUpperCase();

    if (!playerName) {
        showError('닉네임을 입력해주세요.');
        return;
    }

    if (!roomId || roomId.length !== 4) {
        showError('올바른 4자리 방 코드를 입력해주세요.');
        return;
    }

    gameState.player.name = playerName;
    socket.emit('joinRoom', { roomId, playerName });
});

// ===== 방 코드 복사 =====
document.getElementById('copyRoomCode').addEventListener('click', () => {
    const roomCode = document.getElementById('lobbyRoomCode').textContent;
    navigator.clipboard.writeText(roomCode).then(() => {
        const btn = document.getElementById('copyRoomCode');
        const originalText = btn.textContent;
        btn.textContent = '✅';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 1000);
    });
});

// ===== 대기실 나가기 =====
document.getElementById('leaveLobby').addEventListener('click', () => {
    location.reload();
});

// ===== 게임 시작 =====
document.getElementById('startGameBtn').addEventListener('click', () => {
    socket.emit('startGame');
});

// ===== 족보 모달 =====
document.getElementById('showRulesBtn').addEventListener('click', () => {
    document.getElementById('rulesModal').classList.add('active');
});

document.getElementById('closeRulesBtn').addEventListener('click', () => {
    document.getElementById('rulesModal').classList.remove('active');
});

document.getElementById('closeRulesBtn2').addEventListener('click', () => {
    document.getElementById('rulesModal').classList.remove('active');
});

// 모달 배경 클릭 시 닫기
document.getElementById('rulesModal').addEventListener('click', (e) => {
    if (e.target.id === 'rulesModal') {
        document.getElementById('rulesModal').classList.remove('active');
    }
});

// ===== Socket.IO 이벤트 핸들러 =====

// 방 생성 성공
socket.on('roomCreated', ({ roomId, room }) => {
    gameState.player.id = socket.id;
    gameState.room = room;
    updateLobby(room);
    showScreen('lobbyScreen');
});

// 플레이어 참가
socket.on('playerJoined', ({ player, room }) => {
    gameState.room = room;
    updateLobby(room);

    // 참가한 플레이어 본인이라면 대기실로 이동
    if (player.id === socket.id) {
        gameState.player.id = socket.id;
        showScreen('lobbyScreen');
    }
});

// 플레이어 퇴장
socket.on('playerLeft', ({ playerId, room }) => {
    gameState.room = room;
    updateLobby(room);
});

// 대기실 UI 업데이트
function updateLobby(room) {
    document.getElementById('lobbyRoomCode').textContent = room.roomId;

    const playersList = document.getElementById('playersList');
    playersList.innerHTML = '';

    room.players.forEach(player => {
        const playerItem = document.createElement('div');
        playerItem.className = 'player-item';
        if (player.id === room.hostId) {
            playerItem.classList.add('host');
        }

        playerItem.innerHTML = `
            <span class="player-name">${player.name}</span>
            ${player.id === room.hostId ? '<span class="player-badge">방장</span>' : ''}
        `;

        playersList.appendChild(playerItem);
    });

    // 방장만 게임 시작 버튼 표시
    const startBtn = document.getElementById('startGameBtn');
    if (socket.id === room.hostId && room.players.length >= 2) {
        startBtn.style.display = 'block';
    } else {
        startBtn.style.display = 'none';
    }

    // 대기 메시지
    const waitingMsg = document.getElementById('waitingMessage');
    if (room.players.length < room.maxPlayers) {
        waitingMsg.textContent = `${room.maxPlayers - room.players.length}명이 더 필요합니다. (최소 2명)`;
    } else {
        waitingMsg.textContent = '모든 플레이어가 준비되었습니다!';
    }
}

// 게임 시작
socket.on('gameStarted', ({ hand, gameState: state }) => {
    gameState.player.id = socket.id;  // player ID 설정
    gameState.player.hand = hand;
    gameState.players = state.players;
    gameState.currentPlayerIndex = state.currentPlayerIndex;
    gameState.tableCards = state.tableCards;
    gameState.round = state.round || 1; // 라운드 정보 저장

    // myTurn 상태를 먼저 계산
    gameState.myTurn = gameState.currentPlayerIndex === gameState.players.findIndex(p => p.id === socket.id);

    updateGameUI();
    showScreen('gameScreen');

    // 라운드 종료 모달 닫기
    document.getElementById('roundEndModal').classList.remove('active');
});

// 카드 플레이
socket.on('cardPlayed', ({ playerId, cards, gameState: state }) => {
    gameState.players = state.players;
    gameState.currentPlayerIndex = state.currentPlayerIndex;
    gameState.tableCards = state.tableCards;

    // 본인이 낸 카드라면 핸드에서 제거
    if (playerId === socket.id) {
        cards.forEach(card => {
            const index = gameState.player.hand.findIndex(c =>
                c.number === card.number && c.suit === card.suit
            );
            if (index !== -1) {
                gameState.player.hand.splice(index, 1);
            }
        });
        gameState.player.selectedCards = [];
    }

    // myTurn 상태 업데이트
    gameState.myTurn = gameState.currentPlayerIndex === gameState.players.findIndex(p => p.id === socket.id);

    updateGameUI();
});

// 플레이어 패스
socket.on('playerPassed', ({ playerId, gameState: state }) => {
    gameState.players = state.players;
    gameState.currentPlayerIndex = state.currentPlayerIndex;

    // myTurn 상태 업데이트
    gameState.myTurn = gameState.currentPlayerIndex === gameState.players.findIndex(p => p.id === socket.id);

    updateGameUI();
});

// 새로운 리드
socket.on('newLead', ({ playerId, gameState: state }) => {
    gameState.players = state.players;
    gameState.currentPlayerIndex = state.currentPlayerIndex;
    gameState.tableCards = state.tableCards;

    // myTurn 상태 업데이트
    gameState.myTurn = gameState.currentPlayerIndex === gameState.players.findIndex(p => p.id === socket.id);

    updateGameUI();
});

// 라운드 종료
socket.on('roundEnded', ({ winner, scores }) => {
    const modal = document.getElementById('roundEndModal');
    const results = document.getElementById('roundResults');

    results.innerHTML = `
        <div class="result-item winner">
            <div>
                <div class="result-name">🏆 ${winner.name}</div>
                <div class="result-tiles">승리!</div>
            </div>
        </div>
    `;

    scores.forEach(player => {
        if (player.id !== winner.id) {
            const scoreChange = -player.remainingTiles;
            results.innerHTML += `
                <div class="result-item">
                    <div>
                        <div class="result-name">${player.name}</div>
                        <div class="result-tiles">남은 타일: ${player.remainingTiles}개</div>
                    </div>
                    <div class="result-score ${scoreChange >= 0 ? 'positive' : 'negative'}">
                        ${scoreChange >= 0 ? '+' : ''}${scoreChange}점
                    </div>
                </div>
            `;
        }
    });

    results.innerHTML += '<hr style="margin: 1.5rem 0; border-color: var(--border-color);">';
    results.innerHTML += '<h3 style="margin-bottom: 1rem;">현재 점수</h3>';

    scores.sort((a, b) => b.score - a.score).forEach((player, index) => {
        results.innerHTML += `
            <div class="result-item">
                <div class="result-name">${index + 1}. ${player.name}</div>
                <div class="result-score ${player.score >= 0 ? 'positive' : 'negative'}">
                    ${player.score}점
                </div>
            </div>
        `;
    });

    modal.classList.add('active');
});

// (중복 삭제됨)

// 에러
socket.on('error', ({ message }) => {
    showError(message);
});

// ===== 게임 UI 업데이트 =====
function updateGameUI() {
    // 라운드 정보 업데이트
    const roundInfo = document.getElementById('roundInfo');
    roundInfo.textContent = `라운드 ${gameState.round || 1}`;

    // 플레이어 정보 업데이트
    const playersInfo = document.getElementById('playersInfo');
    playersInfo.innerHTML = '';

    gameState.players.forEach((player, index) => {
        const isCurrentPlayer = index === gameState.currentPlayerIndex;
        const playerDiv = document.createElement('div');
        playerDiv.className = 'player-status';

        if (isCurrentPlayer) {
            playerDiv.classList.add('active');
        }

        if (player.remainingTiles === 0) {
            playerDiv.classList.add('winner');
        }

        playerDiv.innerHTML = `
            <div class="player-status-name">${player.name}</div>
            <div class="player-status-cards">${player.remainingTiles}장</div>
            <div class="player-status-score">${player.score} / ${gameState.room ? gameState.room.targetScore : '-'}점</div>
        `;

        playersInfo.appendChild(playerDiv);
    });

    // 테이블 카드 업데이트
    const tableCards = document.getElementById('tableCards');
    tableCards.innerHTML = '';

    gameState.tableCards.forEach(card => {
        tableCards.appendChild(createCardElement(card, false));
    });

    // 내 핸드 업데이트
    updateHand();

    // 차례 표시
    gameState.myTurn = gameState.currentPlayerIndex === gameState.players.findIndex(p => p.id === socket.id);
    const turnIndicator = document.getElementById('turnIndicator');

    if (gameState.myTurn) {
        turnIndicator.textContent = '당신의 차례입니다!';
        turnIndicator.style.display = 'inline-block';
    } else {
        const currentPlayer = gameState.players[gameState.currentPlayerIndex];
        turnIndicator.textContent = `${currentPlayer.name}님의 차례`;
        turnIndicator.style.display = 'inline-block';
    }
}

function updateHand() {
    const handEl = document.getElementById('playerHand');
    const handCount = document.getElementById('handCount');

    handEl.innerHTML = '';
    handCount.textContent = `${gameState.player.hand.length}장`;

    gameState.player.hand.forEach((card, index) => {
        const cardEl = createCardElement(card, true, index);
        handEl.appendChild(cardEl);
    });

    updatePlayButton();
}

function createCardElement(card, selectable, index) {
    const cardEl = document.createElement('div');
    cardEl.className = `card ${card.suit}`;

    if (selectable) {
        if (gameState.player.selectedCards.includes(index)) {
            cardEl.classList.add('selected');
        }

        if (!gameState.myTurn) {
            cardEl.classList.add('disabled');
        }

        // 카드 선택은 내 차례일 때만
        if (gameState.myTurn) {
            cardEl.addEventListener('click', () => toggleCardSelection(index));
        }

        // 드래그 앤 드롭 기능 (PC)
        cardEl.draggable = true;
        cardEl.dataset.index = index;

        cardEl.addEventListener('dragstart', handleDragStart);
        cardEl.addEventListener('dragover', handleDragOver);
        cardEl.addEventListener('drop', handleDrop);
        cardEl.addEventListener('dragend', handleDragEnd);

        // 터치 드래그 앤 드롭 (모바일)
        cardEl.addEventListener('touchstart', handleTouchStart, { passive: false });
        cardEl.addEventListener('touchmove', handleTouchMove, { passive: false });
        cardEl.addEventListener('touchend', handleTouchEnd);
    }

    cardEl.innerHTML = `
        <div class="card-number">${card.number}</div>
        <div class="card-suit">${suitIcons[card.suit]}</div>
    `;

    return cardEl;
}

// 드래그 앤 드롭 핸들러
let draggedCardIndex = null;

function handleDragStart(e) {
    draggedCardIndex = parseInt(e.target.dataset.index);
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.target.innerHTML);
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';

    const targetCard = e.target.closest('.card');
    if (targetCard && targetCard.dataset.index) {
        targetCard.classList.add('drag-over');
    }

    return false;
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }

    const targetCard = e.target.closest('.card');
    if (targetCard && targetCard.dataset.index) {
        const dropIndex = parseInt(targetCard.dataset.index);

        if (draggedCardIndex !== null && draggedCardIndex !== dropIndex) {
            // 카드 위치 교환
            const temp = gameState.player.hand[draggedCardIndex];
            gameState.player.hand[draggedCardIndex] = gameState.player.hand[dropIndex];
            gameState.player.hand[dropIndex] = temp;

            // 선택된 카드 인덱스도 업데이트
            const newSelectedCards = gameState.player.selectedCards.map(idx => {
                if (idx === draggedCardIndex) return dropIndex;
                if (idx === dropIndex) return draggedCardIndex;
                return idx;
            });
            gameState.player.selectedCards = newSelectedCards;

            updateHand();
        }

        targetCard.classList.remove('drag-over');
    }

    return false;
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');

    // 모든 드래그 오버 스타일 제거
    document.querySelectorAll('.card').forEach(card => {
        card.classList.remove('drag-over');
    });

    draggedCardIndex = null;
}

// ===== 모바일 터치 드래그 앤 드롭 =====
let touchStartIndex = null;
let touchCurrentElement = null;
let touchStartTime = null;
let touchMoved = false;
let isDragMode = false;
let longPressTimer = null;

function handleTouchStart(e) {
    const card = e.target.closest('.card');
    if (!card || !card.dataset.index) return;

    touchStartIndex = parseInt(card.dataset.index);
    touchStartTime = Date.now();
    touchMoved = false;
    isDragMode = false;

    // 300ms 후에 드래그 모드 활성화
    longPressTimer = setTimeout(() => {
        isDragMode = true;
        card.classList.add('dragging');
    }, 300);
}

function handleTouchMove(e) {
    if (touchStartIndex === null) return;

    touchMoved = true;

    // 드래그 모드가 아니면 타이머 취소 후 리턴
    if (!isDragMode) {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        return;
    }

    const card = document.querySelector(`.card[data-index="${touchStartIndex}"]`);
    if (card) card.classList.add('dragging');

    const touch = e.touches[0];
    const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
    const targetCard = elementBelow ? elementBelow.closest('.card') : null;

    document.querySelectorAll('.card.drag-over').forEach(c => {
        c.classList.remove('drag-over');
    });

    if (targetCard && targetCard.dataset.index && parseInt(targetCard.dataset.index) !== touchStartIndex) {
        targetCard.classList.add('drag-over');
        touchCurrentElement = targetCard;
    } else {
        touchCurrentElement = null;
    }
    e.preventDefault();
}

function handleTouchEnd(e) {
    if (touchStartIndex === null) return;

    // 타이머 정리
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }

    document.querySelectorAll('.card').forEach(card => {
        card.classList.remove('dragging');
        card.classList.remove('drag-over');
    });

    // 드래그 모드이고 타겟이 있으면 카드 위치 교환
    if (isDragMode && touchCurrentElement && touchCurrentElement.dataset.index) {
        const dropIndex = parseInt(touchCurrentElement.dataset.index);

        if (touchStartIndex !== dropIndex) {
            const temp = gameState.player.hand[touchStartIndex];
            gameState.player.hand[touchStartIndex] = gameState.player.hand[dropIndex];
            gameState.player.hand[dropIndex] = temp;

            const newSelectedCards = gameState.player.selectedCards.map(idx => {
                if (idx === touchStartIndex) return dropIndex;
                if (idx === dropIndex) return touchStartIndex;
                return idx;
            });
            gameState.player.selectedCards = newSelectedCards;
            updateHand();
        }
    }
    // 드래그 모드가 아니면 click 이벤트가 발생하도록 둠 (탭 처리 제거)

    touchStartIndex = null;
    touchCurrentElement = null;
    touchStartTime = null;
    touchMoved = false;
    isDragMode = false;
}

// 다음 라운드
document.getElementById('nextRoundBtn').addEventListener('click', () => {
    socket.emit('nextRound');
    document.getElementById('roundEndModal').classList.remove('active');
});

function toggleCardSelection(index) {
    if (!gameState.myTurn) return;

    const selectedIndex = gameState.player.selectedCards.indexOf(index);

    if (selectedIndex > -1) {
        gameState.player.selectedCards.splice(selectedIndex, 1);
    } else {
        gameState.player.selectedCards.push(index);
    }

    updateHand();
}

function updatePlayButton() {
    const playBtn = document.getElementById('playBtn');
    playBtn.disabled = gameState.player.selectedCards.length === 0 || !gameState.myTurn;
}

// ===== 카드 내기 =====
document.getElementById('playBtn').addEventListener('click', () => {
    if (gameState.player.selectedCards.length === 0) return;

    const cards = gameState.player.selectedCards
        .sort((a, b) => a - b)
        .map(index => gameState.player.hand[index]);

    socket.emit('playCards', { cards });

    // 선택 초기화
    gameState.player.selectedCards = [];
});

// ===== 카드 정렬 =====
function getRank(number) {
    if (number === 2) return 100;
    if (number === 1) return 99;
    return number + 83;
}

function getSuitRank(suit) {
    const ranks = { sun: 4, moon: 3, star: 2, cloud: 1 };
    return ranks[suit] || 0;
}

document.getElementById('sortByNum').addEventListener('click', () => {
    // 선택 초기화 (인덱스가 꼬이므로)
    gameState.player.selectedCards = [];

    gameState.player.hand.sort((a, b) => {
        const rankA = getRank(a.number);
        const rankB = getRank(b.number);
        if (rankA !== rankB) return rankB - rankA; // 내림차순 (센 것부터)
        return getSuitRank(b.suit) - getSuitRank(a.suit); // 무늬도 센 것부터
    });
    updateHand();
});

document.getElementById('sortBySuit').addEventListener('click', () => {
    // 선택 초기화
    gameState.player.selectedCards = [];

    gameState.player.hand.sort((a, b) => {
        const suitRankA = getSuitRank(a.suit);
        const suitRankB = getSuitRank(b.suit);
        if (suitRankA !== suitRankB) return suitRankB - suitRankA; // 내림차순
        return getRank(b.number) - getRank(a.number); // 숫자도 센 것부터
    });
    updateHand();
});

// ===== 패스 =====
document.getElementById('passBtn').addEventListener('click', () => {
    if (!gameState.myTurn) return;

    if (gameState.tableCards.length === 0) {
        showError('첫 차례에는 패스할 수 없습니다.');
        return;
    }

    socket.emit('pass');
    gameState.player.selectedCards = [];
});

// ===== 초기화 =====
console.log('렉시오 게임 클라이언트 로드 완료');
