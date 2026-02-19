const { Server } = require('socket.io');

// 게임 상태 관리
const rooms = new Map();
const players = new Map();

// 게임 룸 클래스
class GameRoom {
    constructor(roomId, hostId, playerCount) {
        this.roomId = roomId;
        this.hostId = hostId;
        this.maxPlayers = playerCount;
        this.players = [];
        this.gameState = null;
        this.started = false;
        this.currentRound = 1;

        // 인원수별 목표 점수 설정
        const targetScores = { 2: 40, 3: 50, 4: 70, 5: 80 };
        this.targetScore = targetScores[playerCount] || 100;
    }

    addPlayer(playerId, playerName) {
        if (this.players.length >= this.maxPlayers) return false;
        this.players.push({ id: playerId, name: playerName, score: 0 });
        return true;
    }

    removePlayer(playerId) {
        this.players = this.players.filter(p => p.id !== playerId);
    }

    startGame() {
        const numberRange = this.getNumberRange();
        this.gameState = new GameState(this.players, numberRange, this.maxPlayers, this.currentRound);
        this.started = true;
    }

    getNumberRange() {
        // 인원수별 숫자 범위 설정
        if (this.maxPlayers === 2) return 9;  // 1~9
        if (this.maxPlayers === 3) return 9;  // 1~9
        if (this.maxPlayers === 4) return 13; // 1~13
        return 15; // 5인: 1~15
    }
}

// 게임 상태 클래스
class GameState {
    constructor(players, numberRange, playerCount, round) {
        this.players = players.map(p => ({
            ...p,
            hand: [],
            remainingTiles: 0
        }));
        this.numberRange = numberRange;
        this.playerCount = playerCount;
        this.currentPlayerIndex = 0;
        this.currentLead = null;
        this.tableCards = [];
        this.lastPlayerId = null; // 나중에 findInitialLead에서 설정
        this.passCount = 0;
        this.roundEnded = false;
        this.round = round;

        this.dealCards();
        this.findInitialLead();

        // 초기 리드 플레이어를 lastPlayerId로 설정
        this.lastPlayerId = this.players[this.currentPlayerIndex].id;
    }

    dealCards() {
        // 타일 생성
        const suits = ['sun', 'moon', 'star', 'cloud'];
        const deck = [];

        for (let num = 1; num <= this.numberRange; num++) {
            for (let suit of suits) {
                deck.push({ number: num, suit });
            }
        }

        // 셔플
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }

        // 분배
        const cardsPerPlayer = this.playerCount === 2 ? 13 : 12;

        this.players.forEach((player, index) => {
            player.hand = deck.slice(index * cardsPerPlayer, (index + 1) * cardsPerPlayer);
            player.remainingTiles = player.hand.length;
        });
    }

    findInitialLead() {
        // 구름3 찾기
        for (let i = 0; i < this.players.length; i++) {
            const hasCloud3 = this.players[i].hand.some(card =>
                card.number === 3 && card.suit === 'cloud'
            );
            if (hasCloud3) {
                this.currentPlayerIndex = i;
                return;
            }
        }

        // 구름3이 없으면 별3 → 달3 → 해3 순서로 찾기
        const fallbackSuits = ['star', 'moon', 'sun'];
        for (let suit of fallbackSuits) {
            for (let i = 0; i < this.players.length; i++) {
                const hasCard = this.players[i].hand.some(card =>
                    card.number === 3 && card.suit === suit
                );
                if (hasCard) {
                    this.currentPlayerIndex = i;
                    return;
                }
            }
        }
    }
}

// *** 핵심 변경: 함수 형태로 내보내기 ***
module.exports = function initGame(io) {
    const nsp = io.of('/lexio');

    nsp.on('connection', (socket) => {
        console.log(`[Lexio] 플레이어 연결: ${socket.id}`);

        // 룸 생성
        socket.on('createRoom', ({ playerName, playerCount }) => {
            let roomId;
            do {
                roomId = Math.floor(1000 + Math.random() * 9000).toString();
            } while (rooms.has(roomId));

            const room = new GameRoom(roomId, socket.id, playerCount);
            room.addPlayer(socket.id, playerName);

            rooms.set(roomId, room);
            players.set(socket.id, { roomId, playerName });

            socket.join(roomId);
            socket.emit('roomCreated', { roomId, room: getRoomData(room) });

            console.log(`[Lexio] 방 생성: ${roomId}, 호스트: ${playerName}`);
        });

        // 룸 참가
        socket.on('joinRoom', ({ roomId, playerName }) => {
            const room = rooms.get(roomId);

            if (!room) {
                socket.emit('error', { message: '방을 찾을 수 없습니다.' });
                return;
            }

            if (room.started) {
                socket.emit('error', { message: '이미 시작된 게임입니다.' });
                return;
            }

            if (!room.addPlayer(socket.id, playerName)) {
                socket.emit('error', { message: '방이 가득 찼습니다.' });
                return;
            }

            players.set(socket.id, { roomId, playerName });
            socket.join(roomId);

            nsp.to(roomId).emit('playerJoined', {
                player: { id: socket.id, name: playerName },
                room: getRoomData(room)
            });

            console.log(`[Lexio] ${playerName}님이 방 ${roomId}에 참가했습니다.`);
        });

        // 게임 시작
        socket.on('startGame', () => {
            const playerData = players.get(socket.id);
            if (!playerData) return;

            const room = rooms.get(playerData.roomId);
            if (!room || room.hostId !== socket.id) return;

            room.startGame();

            // 각 플레이어에게 자신의 핸드 전송
            room.players.forEach((player, index) => {
                const playerSocket = nsp.sockets.get(player.id);
                if (playerSocket) {
                    playerSocket.emit('gameStarted', {
                        hand: room.gameState.players[index].hand,
                        gameState: getPublicGameState(room.gameState)
                    });
                }
            });

            console.log(`[Lexio] 게임 시작: 방 ${playerData.roomId}`);
        });

        // 카드 플레이
        socket.on('playCards', ({ cards }) => {
            const playerData = players.get(socket.id);
            if (!playerData) return;

            const room = rooms.get(playerData.roomId);
            if (!room || !room.started) return;

            const gameState = room.gameState;
            const playerIndex = gameState.players.findIndex(p => p.id === socket.id);

            if (playerIndex !== gameState.currentPlayerIndex) {
                socket.emit('error', { message: '당신의 차례가 아닙니다.' });
                return;
            }

            const validation = validatePlay(cards, gameState.tableCards);
            if (!validation.valid) {
                socket.emit('error', { message: validation.message });
                return;
            }

            const player = gameState.players[playerIndex];
            cards.forEach(card => {
                const index = player.hand.findIndex(c =>
                    c.number === card.number && c.suit === card.suit
                );
                if (index !== -1) {
                    player.hand.splice(index, 1);
                }
            });

            player.remainingTiles = player.hand.length;
            gameState.tableCards = cards;
            gameState.lastPlayerId = socket.id;
            gameState.passCount = 0;

            if (player.hand.length === 0) {
                endRound(room, nsp);
                return;
            }

            gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;

            nsp.to(playerData.roomId).emit('cardPlayed', {
                playerId: socket.id,
                cards,
                gameState: getPublicGameState(gameState)
            });
        });

        // 패스
        socket.on('pass', () => {
            const playerData = players.get(socket.id);
            if (!playerData) return;

            const room = rooms.get(playerData.roomId);
            if (!room || !room.started) return;

            const gameState = room.gameState;
            const playerIndex = gameState.players.findIndex(p => p.id === socket.id);

            if (playerIndex !== gameState.currentPlayerIndex) return;

            gameState.passCount++;

            if (gameState.passCount >= gameState.players.length - 1) {
                const lastPlayerIndex = gameState.players.findIndex(p => p.id === gameState.lastPlayerId);
                gameState.currentPlayerIndex = lastPlayerIndex;
                gameState.tableCards = [];
                gameState.passCount = 0;

                nsp.to(playerData.roomId).emit('newLead', {
                    playerId: gameState.lastPlayerId,
                    gameState: getPublicGameState(gameState)
                });
            } else {
                gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;

                nsp.to(playerData.roomId).emit('playerPassed', {
                    playerId: socket.id,
                    gameState: getPublicGameState(gameState)
                });
            }
        });

        // 다음 라운드 요청
        socket.on('nextRound', () => {
            const playerData = players.get(socket.id);
            if (!playerData) return;

            const room = rooms.get(playerData.roomId);
            if (!room) return;

            if (room.gameState && room.gameState.roundEnded) {
                room.gameState = null;
                room.currentRound++;
                room.startGame();

                room.players.forEach((player, index) => {
                    const playerSocket = nsp.sockets.get(player.id);
                    if (playerSocket) {
                        playerSocket.emit('gameStarted', {
                            hand: room.gameState.players[index].hand,
                            gameState: getPublicGameState(room.gameState)
                        });
                    }
                });

                console.log(`[Lexio] 다음 라운드 시작: 방 ${room.roomId}`);
            }
        });

        // 연결 해제
        socket.on('disconnect', () => {
            const playerData = players.get(socket.id);
            if (playerData) {
                const room = rooms.get(playerData.roomId);
                if (room) {
                    room.removePlayer(socket.id);

                    if (room.players.length === 0) {
                        rooms.delete(playerData.roomId);
                    } else {
                        nsp.to(playerData.roomId).emit('playerLeft', {
                            playerId: socket.id,
                            room: getRoomData(room)
                        });
                    }
                }
                players.delete(socket.id);
            }
            console.log(`[Lexio] 플레이어 연결 해제: ${socket.id}`);
        });
    });
};

function getRoomData(room) {
    return {
        roomId: room.roomId,
        hostId: room.hostId,
        maxPlayers: room.maxPlayers,
        targetScore: room.targetScore,
        players: room.players.map(p => ({ id: p.id, name: p.name, score: p.score })),
        started: room.started
    };
}

function getPublicGameState(gameState) {
    return {
        players: gameState.players.map(p => ({
            id: p.id,
            name: p.name,
            remainingTiles: p.remainingTiles,
            score: p.score
        })),
        currentPlayerIndex: gameState.currentPlayerIndex,
        tableCards: gameState.tableCards,
        roundEnded: gameState.roundEnded,
        round: gameState.round,
        targetScore: gameState.room ? gameState.room.targetScore : null
    };
}

// endRound 함수에서 nsp를 인자로 받도록 수정하거나, players에 저장된 roomId로 조회
function endRound(room, nsp) {
    const gameState = room.gameState;
    const winner = gameState.players.find(p => p.hand.length === 0);

    gameState.players.forEach(player => {
        let points = 0;
        if (player.id === winner.id) {
            points = gameState.players
                .filter(p => p.id !== winner.id)
                .reduce((sum, p) => sum + p.remainingTiles, 0);
        } else {
            points = -player.remainingTiles;
        }

        player.score += points;

        const roomPlayer = room.players.find(p => p.id === player.id);
        if (roomPlayer) {
            roomPlayer.score = player.score;
        }
    });

    gameState.roundEnded = true;

    nsp.to(room.roomId).emit('roundEnded', {
        winner: { id: winner.id, name: winner.name },
        scores: gameState.players.map(p => ({
            id: p.id,
            name: p.name,
            score: p.score,
            remainingTiles: p.remainingTiles
        }))
    });
}

function validatePlay(cards, tableCards) {
    const count = cards.length;
    if (![1, 2, 3, 5].includes(count)) {
        return { valid: false, message: '1, 2, 3, 5개만 낼 수 있습니다.' };
    }
    if (tableCards.length > 0 && cards.length !== tableCards.length) {
        return { valid: false, message: `${tableCards.length}개의 카드를 내야 합니다.` };
    }
    const combo = analyzeCombo(cards);
    if (!combo.valid) {
        return { valid: false, message: combo.message };
    }
    if (tableCards.length > 0) {
        const tableCombo = analyzeCombo(tableCards);
        if (!isStronger(combo, tableCombo)) {
            return { valid: false, message: '더 강한 조합을 내야 합니다.' };
        }
    }
    return { valid: true };
}

function analyzeCombo(cards) {
    const count = cards.length;
    if (count === 1) return { valid: true, type: 'single', cards };
    if (count === 2) {
        if (cards[0].number === cards[1].number) return { valid: true, type: 'pair', cards };
        return { valid: false, message: '같은 숫자 2개를 내야 합니다.' };
    }
    if (count === 3) {
        if (cards[0].number === cards[1].number && cards[1].number === cards[2].number) return { valid: true, type: 'triple', cards };
        return { valid: false, message: '같은 숫자 3개를 내야 합니다.' };
    }
    if (count === 5) return analyzeMade(cards);
    return { valid: false, message: '유효하지 않은 조합입니다.' };
}

function analyzeMade(cards) {
    if (isStraightFlush(cards)) return { valid: true, type: 'straightFlush', rank: 5, cards };
    const fourCard = isFourCard(cards);
    if (fourCard) return { valid: true, type: 'fourCard', rank: 4, cards, number: fourCard };
    const fullHouse = isFullHouse(cards);
    if (fullHouse) return { valid: true, type: 'fullHouse', rank: 3, cards, tripleNumber: fullHouse };
    if (isFlush(cards)) return { valid: true, type: 'flush', rank: 2, cards };
    if (isStraight(cards)) return { valid: true, type: 'straight', rank: 1, cards };
    return { valid: false, message: '유효한 5장 조합이 아닙니다.' };
}

function isStraightFlush(cards) {
    return isFlush(cards) && isStraight(cards);
}

function isFlush(cards) {
    const suit = cards[0].suit;
    return cards.every(c => c.suit === suit);
}

function isStraight(cards) {
    const numbers = cards.map(c => c.number).sort((a, b) => a - b);
    let isNormalStraight = true;
    for (let i = 1; i < numbers.length; i++) {
        if (numbers[i] !== numbers[i - 1] + 1) {
            isNormalStraight = false;
            break;
        }
    }
    if (isNormalStraight) return true;
    if (numbers[0] === 1) {
        const withoutOne = numbers.slice(1);
        let isSpecialStraight = true;
        for (let i = 1; i < withoutOne.length; i++) {
            if (withoutOne[i] !== withoutOne[i - 1] + 1) {
                isSpecialStraight = false;
                break;
            }
        }
        if (isSpecialStraight && withoutOne[0] !== 2) return true;
    }
    return false;
}

function isFourCard(cards) {
    const counts = {};
    cards.forEach(c => { counts[c.number] = (counts[c.number] || 0) + 1; });
    for (let num in counts) { if (counts[num] === 4) return parseInt(num); }
    return null;
}

function isFullHouse(cards) {
    const counts = {};
    cards.forEach(c => { counts[c.number] = (counts[c.number] || 0) + 1; });
    let tripleNum = null, pairNum = null;
    for (let num in counts) {
        if (counts[num] === 3) tripleNum = parseInt(num);
        if (counts[num] === 2) pairNum = parseInt(num);
    }
    return (tripleNum && pairNum) ? tripleNum : null;
}

function getRank(number) {
    if (number === 2) return 100;
    if (number === 1) return 99;
    return number + 83;
}

function getSuitRank(suit) {
    const ranks = { sun: 4, moon: 3, star: 2, cloud: 1 };
    return ranks[suit] || 0;
}

function isStronger(combo1, combo2) {
    if (combo1.cards.length !== combo2.cards.length) return false;
    const count = combo1.cards.length;
    if (count === 1) {
        const rank1 = getRank(combo1.cards[0].number);
        const rank2 = getRank(combo2.cards[0].number);
        if (rank1 !== rank2) return rank1 > rank2;
        return getSuitRank(combo1.cards[0].suit) > getSuitRank(combo2.cards[0].suit);
    }
    if (count === 2) {
        const rank1 = getRank(combo1.cards[0].number);
        const rank2 = getRank(combo2.cards[0].number);
        if (rank1 !== rank2) return rank1 > rank2;
        const hasSun1 = combo1.cards.some(c => c.suit === 'sun');
        const hasSun2 = combo2.cards.some(c => c.suit === 'sun');
        return hasSun1 && !hasSun2;
    }
    if (count === 3) {
        const rank1 = getRank(combo1.cards[0].number);
        const rank2 = getRank(combo2.cards[0].number);
        return rank1 > rank2;
    }
    if (count === 5) {
        if (combo1.rank !== combo2.rank) return combo1.rank > combo2.rank;
        if (combo1.type === 'fourCard') return getRank(combo1.number) > getRank(combo2.number);
        if (combo1.type === 'fullHouse') return getRank(combo1.tripleNumber) > getRank(combo2.tripleNumber);
        const max1 = Math.max(...combo1.cards.map(c => getRank(c.number)));
        const max2 = Math.max(...combo2.cards.map(c => getRank(c.number)));
        if (max1 !== max2) return max1 > max2;
        const maxCard1 = combo1.cards.reduce((a, b) => getRank(a.number) > getRank(b.number) ? a : b);
        const maxCard2 = combo2.cards.reduce((a, b) => getRank(a.number) > getRank(b.number) ? a : b);
        return getSuitRank(maxCard1.suit) > getSuitRank(maxCard2.suit);
    }
    return false;
}
