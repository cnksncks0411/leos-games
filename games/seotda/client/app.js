const socket = io('/seotda');

// --- DOM 요소 ---
// 메뉴
const btnCreateRoom = document.getElementById('createRoomBtn');
const btnJoinRoom = document.getElementById('joinRoomBtn');
const btnBackCreate = document.getElementById('backFromCreate');
const btnBackJoin = document.getElementById('backFromJoin');

// 방 만들기
const inputHostName = document.getElementById('hostName');
const inputStartChips = document.getElementById('startChipsInput');
const inputAnte = document.getElementById('anteInput');
const btnConfirmCreate = document.getElementById('confirmCreate');
const btnChips = document.querySelectorAll('.btn-chip:not(.ante-chip)');
const btnAnteChips = document.querySelectorAll('.ante-chip');

// 방 참가
const inputGuestName = document.getElementById('guestName');
const inputRoomCode = document.getElementById('roomCode');
const btnConfirmJoin = document.getElementById('confirmJoin');

// 로비
const lobbyRoomCode = document.getElementById('lobbyRoomCode');
const playersList = document.getElementById('playersList');
const waitingMessage = document.getElementById('waitingMessage');
const btnStartGame = document.getElementById('startGameBtn');
const btnLeaveLobby = document.getElementById('leaveLobby');

// 게임 화면
const myHandDiv = document.getElementById('myHand');
const messageArea = document.getElementById('messageArea');
const opponentsArea = document.getElementById('opponentsArea');
const btnGuide = document.getElementById('btnGuide');
const guideModal = document.getElementById('guideModal');
const myDetailsName = document.getElementById('myDetailsName');
const myDetailsChips = document.getElementById('myDetailsChips');
const jokboListItems = document.querySelectorAll('.jokbo-list-mini li');
const actionButtons = document.getElementById('actionButtons');
const potAmount = document.getElementById('potAmount');
const headerRoomCode = document.getElementById('headerRoomCode');
const roundInfo = document.getElementById('roundInfo');
const nextRoundArea = document.getElementById('nextRoundArea');
const nextRoundBtn = document.getElementById('nextRoundBtn');
const exitGameBtn = document.getElementById('exitGameBtn');
const myRankDisplay = document.getElementById('myRankDisplay');

// 배팅 버튼
const dieBtn = document.getElementById('dieBtn');
const callBtn = document.getElementById('callBtn');
const halfBtn = document.getElementById('halfBtn');
const ddadangBtn = document.getElementById('ddadangBtn');
const allinBtn = document.getElementById('allinBtn');

// --- 상태 ---
let myPlayerId = null;
let currentRoomId = null;
let isHost = false;
let myHand = null;       // 내 패 저장 (게임 상태 업데이트 시 유지)
let myHandRank = null;   // 내 족보

// --- 화면 전환 ---
function showScreen(name) {
    const screens = {
        mainMenu: 'mainMenu',
        createRoom: 'createRoomScreen',
        joinRoom: 'joinRoomScreen',
        lobby: 'lobbyScreen',
        game: 'gameScreen'
    };

    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screens[name]);
    if (target) {
        setTimeout(() => target.classList.add('active'), 10);
    }
}

// --- 이벤트 리스너 ---
btnCreateRoom.addEventListener('click', () => showScreen('createRoom'));
btnJoinRoom.addEventListener('click', () => showScreen('joinRoom'));
btnBackCreate.addEventListener('click', () => showScreen('mainMenu'));
btnBackJoin.addEventListener('click', () => showScreen('mainMenu'));

// 칩 버튼
btnChips.forEach(btn => {
    btn.addEventListener('click', () => {
        const val = parseInt(btn.dataset.value);
        if (val === 0) {
            inputStartChips.value = 0;
        } else {
            inputStartChips.value = parseInt(inputStartChips.value || 0) + val;
        }
    });
});

// 삥(ante) 버튼
btnAnteChips.forEach(btn => {
    btn.addEventListener('click', () => {
        const val = parseInt(btn.dataset.value);
        if (val === 0) {
            inputAnte.value = 0;
        } else {
            inputAnte.value = parseInt(inputAnte.value || 0) + val;
        }
    });
});

// 방 만들기
btnConfirmCreate.addEventListener('click', () => {
    const name = inputHostName.value.trim();
    if (!name) return alert('타짜 이름을 대시오.');

    const chips = parseInt(inputStartChips.value);
    const ante = parseInt(inputAnte.value);

    if (isNaN(chips) || chips < 1000) return alert('밑천은 1000원 이상이어야 하오.');
    if (isNaN(ante) || ante < 100) return alert('삥은 100원 이상이어야 하오.');
    if (ante > chips / 10) return alert('삥이 밑천의 10%를 넘으면 안 되오.');

    socket.emit('createRoom', { playerName: name, startChips: chips, ante: ante });
});

// 방 참가
btnConfirmJoin.addEventListener('click', () => {
    const name = inputGuestName.value.trim();
    const code = inputRoomCode.value.trim();
    if (!name) return alert('타짜 이름을 대시오.');
    if (!code) return alert('비밀 구호를 대시오.');

    socket.emit('joinRoom', { roomId: code, playerName: name });
});

// 게임 시작
btnStartGame.addEventListener('click', () => {
    if (!isHost) return;
    socket.emit('startGame');
});

// 로비 나가기
btnLeaveLobby.addEventListener('click', () => {
    location.reload();
});

// 설명서
btnGuide.addEventListener('click', () => {
    guideModal.style.display = 'flex';
});

// 배팅 버튼
dieBtn.addEventListener('click', () => socket.emit('playerAction', { action: 'die' }));
callBtn.addEventListener('click', () => socket.emit('playerAction', { action: 'call' }));
halfBtn.addEventListener('click', () => socket.emit('playerAction', { action: 'half' }));
ddadangBtn.addEventListener('click', () => socket.emit('playerAction', { action: 'ddadang' }));
allinBtn.addEventListener('click', () => socket.emit('playerAction', { action: 'allin' }));

// 나가기 버튼
exitGameBtn.addEventListener('click', () => {
    location.reload();
});

let countdownInterval = null;


// ===================== 소켓 이벤트 =====================

// 방 생성 완료
socket.on('roomCreated', ({ roomId, room }) => {
    currentRoomId = roomId;
    isHost = true;
    myPlayerId = socket.id;
    updateLobby(room);
    showScreen('lobby');
});

// 방 참가 완료
socket.on('playerJoined', ({ player, room }) => {
    if (player.id === socket.id) {
        currentRoomId = room.roomId;
        isHost = (room.hostId === socket.id);
        myPlayerId = socket.id;
        showScreen('lobby');
    }
    updateLobby(room);

    // 게임 화면에서 다른 플레이어 입장 알림
    if (player.id !== socket.id) {
        showJoinNotification(player.name);
    }
});

// 관전자 입장
socket.on('spectatorJoin', ({ message, gameState }) => {
    showScreen('game');
    messageArea.textContent = message;
    updateGameUI(gameState);
});

// 에러
socket.on('error', ({ message }) => {
    alert(message);
});

// 플레이어 퇴장
socket.on('playerLeft', ({ playerId, room }) => {
    updateLobby(room);
});

// 게임 시작
socket.on('gameStarted', ({ hand, handRank, gameState, roomId, roundNumber }) => {
    showScreen('game');
    myHand = hand;
    myHandRank = handRank;
    currentRoomId = roomId;

    headerRoomCode.textContent = `[${roomId}]`;
    roundInfo.textContent = `제 ${roundNumber}판`;

    nextRoundArea.style.display = 'none';
    actionButtons.style.display = 'none';

    renderMyHand(hand, handRank);
    updateGameUI(gameState);
});

// 관전자에게 라운드 시작 알림
socket.on('roundStartedSpectator', ({ message, gameState }) => {
    messageArea.textContent = message;
    updateGameUI(gameState);
});

// 게임 상태 업데이트 (배팅 진행)
socket.on('gameStateUpdate', (gameState) => {
    updateGameUI(gameState);
});

// 게임 종료
socket.on('gameEnded', ({ winner, reason, pot, roundNumber, players, room, isTie, tieInfo }) => {
    actionButtons.style.display = 'none';
    nextRoundArea.style.display = 'none';

    if (isTie && tieInfo) {
        // 동점
        messageArea.innerHTML = `
            <span style="color:#ff0; font-weight:bold; font-size:1.2rem;">동점!</span><br>
            <span style="font-size:0.9rem;">${tieInfo.names} | ${tieInfo.rankName} | ${pot.toLocaleString()}원 분배 (각 ${tieInfo.share.toLocaleString()}원)</span>
        `;
        messageArea.style.backgroundColor = 'rgba(100, 100, 0, 0.5)';
    } else {
        // 승자
        const reasonText = reason === 'last_man_standing' ? '다들 쫄아서 뒤짐' : '쇼다운';
        messageArea.innerHTML = `
            <span style="color:#ff0; font-weight:bold; font-size:1.3rem;">${winner.name}</span> 승리!<br>
            <span style="font-size:0.9rem;">${winner.handRank ? winner.handRank.name : ''} | ${pot.toLocaleString()}원 획득 | ${reasonText}</span>
        `;
        messageArea.style.backgroundColor = 'rgba(200, 150, 0, 0.4)';
    }

    // 상대방 상태만 업데이트 (패 비공개)
    opponentsArea.innerHTML = '';
    players.forEach(p => {
        if (p.id === myPlayerId) return;
        const div = document.createElement('div');
        div.className = 'opponent-item';
        if (p.status === 'die') div.style.opacity = '0.4';
        const statusText = p.status === 'die' ? '💀' : p.id === winner.id ? '🏆' : '';
        div.innerHTML = `
            <div class="opponent-name">${p.name} ${statusText}</div>
            <div class="opponent-chips">${p.chips.toLocaleString()}원</div>
            <div class="opponent-hand">
                <div class="opponent-card"></div>
                <div class="opponent-card"></div>
            </div>
        `;
        opponentsArea.appendChild(div);
    });

    // 내 칩 업데이트
    const myData = players.find(p => p.id === myPlayerId);
    if (myData) {
        myDetailsChips.textContent = myData.chips.toLocaleString() + '원';
    }

    if (room) {
        isHost = (room.hostId === myPlayerId);
    }
});

// 다음 판 카운트다운
socket.on('nextRoundCountdown', ({ seconds }) => {
    if (countdownInterval) clearInterval(countdownInterval);
    let remaining = seconds;

    // 나가기 버튼 표시
    nextRoundArea.style.display = 'flex';
    nextRoundArea.style.justifyContent = 'center';
    nextRoundArea.style.gap = '10px';
    nextRoundBtn.style.display = 'none'; // 자동이므로 숨김
    exitGameBtn.style.display = 'block';

    const updateCountdown = () => {
        if (remaining <= 0) {
            clearInterval(countdownInterval);
            countdownInterval = null;
            messageArea.innerHTML += '<br><span style="font-size:0.85rem;">패 돌리는 중...</span>';
            return;
        }
        // 기존 메시지 유지하면서 카운트다운 추가
        const countdownEl = document.getElementById('countdownText');
        if (countdownEl) {
            countdownEl.textContent = `다음 판까지 ${remaining}초...`;
        } else {
            messageArea.innerHTML += `<br><span id="countdownText" style="font-size:0.85rem; color:#aaa;">다음 판까지 ${remaining}초...</span>`;
        }
        remaining--;
    };
    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 1000);
});

// 서버 메시지
socket.on('gameMessage', ({ message }) => {
    messageArea.textContent = message;
});

// 파산 퇴장
socket.on('kicked', ({ message }) => {
    alert(message);
    location.reload();
});


// ===================== 헬퍼 함수 =====================

function updateLobby(room) {
    lobbyRoomCode.textContent = room.roomId;
    playersList.innerHTML = '';

    room.players.forEach(player => {
        const div = document.createElement('div');
        div.className = 'player-item';

        const isPlayerHost = player.id === room.hostId;
        const hostBadge = isPlayerHost ? '<span class="host-badge">👑 오야</span>' : '';
        const spectatorBadge = player.isSpectator ? '<span style="color:#888; font-size:0.8rem;">(관전)</span>' : '';

        div.innerHTML = `
            <div class="player-name-wrapper">
                <span class="player-name">${player.name}</span>
                ${hostBadge} ${spectatorBadge}
            </div>
            <span class="player-chips">${player.chips.toLocaleString()}원</span>
        `;
        playersList.appendChild(div);
    });

    // 방장에게만 시작 버튼 표시
    isHost = (room.hostId === myPlayerId);
    if (isHost) {
        btnStartGame.style.display = 'block';
        const activeCount = room.players.filter(p => !p.isSpectator && p.chips > 0).length;
        if (activeCount < 2) {
            btnStartGame.disabled = true;
            waitingMessage.textContent = '최소 2명은 있어야 판을 벌리지..';
        } else {
            btnStartGame.disabled = false;
            waitingMessage.textContent = `준비 됐으면 패를 돌리시오. (${room.players.length}/${MAX_PLAYERS}명)`;
        }
    } else {
        btnStartGame.style.display = 'none';
        waitingMessage.textContent = '오야(방장)가 패 돌리기를 기다리는 중...';
    }
}

const MAX_PLAYERS = 5;

const CARD_WIDTH = 80;
const CARD_HEIGHT = 120;

// 카드 이미지 경로 생성 (예: assets/1_1.png)
function getCardImageUrl(card) {
    let suffix = 1; // 기본 1번 (광/끗)

    if (card.type === 'pi') {
        suffix = 2; // 피/띠는 2번
    } else if (card.month === 8 && card.type === 'yeol') {
        suffix = 2; // 8월은 8광(1), 8끗(2)
    }

    return `assets/img/${card.month}_${suffix}.png`;
}

function renderMyHand(hand, handRank) {
    myHandDiv.innerHTML = '';

    // 인라인 족보 표시 초기화
    myRankDisplay.textContent = '';
    myRankDisplay.classList.remove('visible', 'special');

    hand.forEach(card => {
        const cardDiv = document.createElement('div');
        cardDiv.className = 'card card-back'; // 처음엔 뒷면

        const contentDiv = document.createElement('div');
        contentDiv.className = 'card-content';
        // 개별 이미지 설정
        contentDiv.style.backgroundImage = `url('${getCardImageUrl(card)}')`;

        cardDiv.appendChild(contentDiv);

        cardDiv.addEventListener('click', () => {
            if (cardDiv.classList.contains('card-back')) {
                cardDiv.classList.remove('card-back');
                checkReveal();
            }
        });

        myHandDiv.appendChild(cardDiv);
    });


    messageArea.textContent = '패를 눌러 확인하시오';
    messageArea.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';

    function checkReveal() {
        const remaining = myHandDiv.querySelectorAll('.card-back').length;
        if (remaining === 0 && handRank) {
            messageArea.innerHTML = `패 확인: <span style="color:${handRank.isSpecial ? '#ff0' : '#fff'}; font-weight:bold; font-size:1.2rem;">${handRank.name}</span>`;
            highlightJokbo(handRank);

            // 인라인 족보 표시 (항상 보이게)
            myRankDisplay.textContent = handRank.name;
            myRankDisplay.classList.add('visible');
            if (handRank.isSpecial) {
                myRankDisplay.classList.add('special');
            }
        }
    }
}

function updateGameUI(gameState) {
    // 판돈
    potAmount.textContent = gameState.pot.toLocaleString();

    // 플레이어 정보
    gameState.players.forEach(p => {
        if (p.id === myPlayerId) {
            myDetailsChips.textContent = p.chips.toLocaleString() + '원' + (p.betAmount > 0 ? ` (베팅: ${p.betAmount.toLocaleString()}원)` : '');

            if (p.isCurrentTurn && p.status !== 'die' && p.status !== 'allin') {
                actionButtons.style.display = 'flex';
                messageArea.textContent = '당신 차례요. 판돈을 거시오.';
                messageArea.style.backgroundColor = 'rgba(200, 0, 0, 0.5)';

                // 베팅 미리보기 업데이트
                updateBetPreviews(p, gameState);
            } else if (p.status === 'die') {
                actionButtons.style.display = 'none';
                messageArea.textContent = '당신은 죽었소. 구경이나 하시오.';
                messageArea.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            } else if (p.status === 'allin') {
                actionButtons.style.display = 'none';
                messageArea.textContent = '올인! 하늘에 맡기시오.';
                messageArea.style.backgroundColor = 'rgba(0, 0, 100, 0.5)';
            } else {
                actionButtons.style.display = 'none';
                if (gameState.phase === 'betting') {
                    const currentTurnPlayer = gameState.players.find(pl => pl.isCurrentTurn);
                    const turnName = currentTurnPlayer ? currentTurnPlayer.name : '다른 타짜';
                    messageArea.innerHTML = `<span>${turnName}</span>가 고민 중이오...<br><span style="font-size:0.8rem; color:#aaa;">${currentTurnPlayer ? currentTurnPlayer.betAmount.toLocaleString() + '원 베팅' : ''}</span>`;
                    messageArea.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
                }
            }

            myDetailsName.textContent = p.name;
        }
    });

    // 상대방 렌더링
    renderOpponents(gameState);
}

// 베팅 미리보기 계산
function updateBetPreviews(player, gameState) {
    const toCall = gameState.currentBet - player.betAmount;
    const pot = gameState.pot;
    const chips = player.chips;

    // 콜 금액
    const callAmount = Math.min(toCall, chips);
    const callLabel = callAmount >= chips ? '(올인)' : `${callAmount.toLocaleString()}원`;
    dieBtn.innerHTML = `다이<span class="bet-preview">포기</span>`;
    callBtn.innerHTML = `콜<span class="bet-preview">${callLabel}</span>`;

    // 하프 금액: 콜 + 판돈의 절반
    const halfRaise = Math.floor(pot / 2);
    const halfTotal = toCall + halfRaise;
    const halfLabel = halfTotal >= chips ? `${chips.toLocaleString()}원 (올인)` : `${halfTotal.toLocaleString()}원`;
    halfBtn.innerHTML = `하프<span class="bet-preview">${halfLabel}</span>`;

    // 따당 금액: 콜 + 현재 베팅의 2배
    const ddadangRaise = gameState.currentBet;
    const ddadangTotal = toCall + ddadangRaise;
    const ddadangLabel = ddadangTotal >= chips ? `${chips.toLocaleString()}원 (올인)` : `${ddadangTotal.toLocaleString()}원`;
    ddadangBtn.innerHTML = `따당<span class="bet-preview">${ddadangLabel}</span>`;

    // 올인 금액
    allinBtn.innerHTML = `올인<span class="bet-preview">${chips.toLocaleString()}원</span>`;
}

function renderOpponents(gameState) {
    opponentsArea.innerHTML = '';
    gameState.players.forEach(p => {
        if (p.id === myPlayerId) return;

        const div = document.createElement('div');
        div.className = 'opponent-item';

        if (p.isCurrentTurn) div.style.borderColor = 'yellow';
        if (p.status === 'die') div.style.opacity = '0.4';

        const statusText = p.status === 'die' ? '💀' : p.status === 'allin' ? '🔥' : '';

        div.innerHTML = `
            <div class="opponent-name">${p.name} ${statusText}</div>
            <div class="opponent-chips">${p.chips.toLocaleString()}원</div>
            <div class="opponent-bet">${p.betAmount.toLocaleString()}원 베팅</div>
            <div class="opponent-hand">
                <div class="opponent-card"></div>
                <div class="opponent-card"></div>
            </div>
        `;
        opponentsArea.appendChild(div);
    });
}

function renderOpponentsRevealed(players) {
    opponentsArea.innerHTML = '';
    players.forEach(p => {
        if (p.id === myPlayerId) return;

        const div = document.createElement('div');
        div.className = 'opponent-item';
        if (p.status === 'die') div.style.opacity = '0.5';

        const rankName = p.handRank ? p.handRank.name : '?';
        const card1 = p.hand[0] || { month: '?', name: '?' };
        const card2 = p.hand[1] || { month: '?', name: '?' };

        div.innerHTML = `
            <div class="opponent-name">${p.name}</div>
            <div class="opponent-chips">${(p.chips || 0).toLocaleString()}원</div>
            <div class="opponent-hand">
                <div class="opponent-card-revealed">${card1.month}월<br><small>${card1.name}</small></div>
                <div class="opponent-card-revealed">${card2.month}월<br><small>${card2.name}</small></div>
            </div>
            <div style="font-size:0.7rem; color:var(--gold-color);">${rankName}</div>
        `;
        opponentsArea.appendChild(div);
    });
}

function highlightJokbo(handRank) {
    jokboListItems.forEach(li => li.classList.remove('active'));

    let targetRank = -1;
    const r = handRank.rank;

    if (r === 3800) targetRank = 3800;
    else if (r === 2000) targetRank = 2000;
    else if (r >= 1000) targetRank = 1000;
    else if (r === 900) targetRank = 900;
    else if (r === 800) targetRank = 800;
    else if (r === 700) targetRank = 700;
    else if (r === 600) targetRank = 600;
    else if (r === 500) targetRank = 500;
    else if (r === 400) targetRank = 400;
    else if (r === 9) targetRank = 9;
    else if (r >= 0 && r <= 8) targetRank = 0;

    jokboListItems.forEach(li => {
        const liRank = parseInt(li.dataset.rank);
        if (liRank === targetRank) {
            li.classList.add('active');
            li.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    });
}

// 플레이어 입장 알림 토스트
function showJoinNotification(playerName) {
    const notif = document.createElement('div');
    notif.className = 'join-notification';
    notif.textContent = `${playerName}이(가) 입장했소!`;
    document.body.appendChild(notif);
    setTimeout(() => {
        if (notif.parentNode) notif.parentNode.removeChild(notif);
    }, 3000);
}
