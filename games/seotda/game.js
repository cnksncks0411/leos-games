const { Server } = require('socket.io');

// 게임 상태 관리
const rooms = new Map();
const players = new Map();

const MAX_PLAYERS = 5;

// ===================== 게임 룸 클래스 =====================
class GameRoom {
    constructor(roomId, hostId, startChips, ante) {
        this.roomId = roomId;
        this.hostId = hostId;
        this.maxPlayers = MAX_PLAYERS;
        this.players = [];      // { id, name, chips, isSpectator }
        this.gameState = null;
        this.lastWinnerId = null; // 이전 판 승자 (다음 판 선)
        this.started = false;    // 현재 판이 진행 중인지
        this.roundNumber = 0;    // 총 라운드 수

        this.defaultChips = Number(startChips) || 100000;
        this.ante = Number(ante) || 1000; // 삥 (기본 판돈)
    }

    addPlayer(playerId, playerName) {
        if (this.players.length >= this.maxPlayers) return false;

        const isSpectator = this.started; // 게임 중이면 관전자

        this.players.push({
            id: playerId,
            name: playerName,
            chips: this.defaultChips,
            isSpectator: isSpectator
        });
        return true;
    }

    removePlayer(playerId) {
        this.players = this.players.filter(p => p.id !== playerId);

        // 호스트가 나가면 다음 사람이 호스트
        if (playerId === this.hostId && this.players.length > 0) {
            this.hostId = this.players[0].id;
        }

        // 게임 진행 중이면 해당 플레이어를 다이 처리
        if (this.gameState) {
            const gsPlayer = this.gameState.players.find(p => p.id === playerId);
            if (gsPlayer) {
                gsPlayer.status = 'die';
                gsPlayer.disconnected = true;
            }
        }
    }

    getActivePlayers() {
        return this.players.filter(p => !p.isSpectator);
    }

    startNewRound() {
        // 관전자 -> 정식 참여자로 전환
        this.players.forEach(p => { p.isSpectator = false; });

        // 칩 0인 사람 제거
        const activePlayers = this.players.filter(p => p.chips > 0);
        if (activePlayers.length < 2) return false;

        // 이전 판 승자가 선 (첫 번째)이 되도록 순서 정렬
        if (this.lastWinnerId) {
            const winnerIdx = activePlayers.findIndex(p => p.id === this.lastWinnerId);
            if (winnerIdx > 0) {
                // 승자를 맨 앞으로, 나머지는 기존 순서 유지
                const reordered = [
                    ...activePlayers.splice(winnerIdx, 1),
                    ...activePlayers
                ];
                activePlayers.length = 0;
                activePlayers.push(...reordered);
            }
        }

        this.roundNumber++;
        this.gameState = new GameState(activePlayers, this.ante, this.roundNumber);
        this.started = true;
        return true;
    }

    endRound() {
        this.started = false;
        // gameState는 결과 조회용으로 유지, 다음 startNewRound에서 교체됨
    }
}

// ===================== 게임 상태 클래스 =====================
class GameState {
    constructor(players, ante, round) {
        this.players = players.map(p => ({
            id: p.id,
            name: p.name,
            chips: p.chips,
            hand: [],
            status: 'active',   // active, die, allin
            betAmount: 0,       // 이번 판 총 베팅액
            disconnected: false,
            actedThisRound: false // 이번 베팅 라운드에서 액션했는지
        }));
        this.playerCount = this.players.length;
        this.currentPlayerIndex = 0; // 선 (첫 번째 플레이어)
        this.pot = 0;
        this.currentBet = 0;    // 현재 라운드의 최고 베팅액 (각 플레이어 기준)
        this.round = round;
        this.phase = 'dealing'; // dealing -> betting -> showdown -> ended
        this.lastRaiserIndex = -1;
        this.turnCount = 0;     // 총 턴 수 (무한루프 방지)
        this.ante = ante;

        this.deck = [];
        this.buildDeck();
        this.shuffleDeck();
        this.dealCards();
        this.collectAnte();
    }

    buildDeck() {
        const deck = [];
        // 1월
        deck.push({ month: 1, type: 'kwang', name: '1광' });
        deck.push({ month: 1, type: 'pi', name: '1끗' });
        // 2월
        deck.push({ month: 2, type: 'yeol', name: '2끗' });
        deck.push({ month: 2, type: 'pi', name: '2껍' });
        // 3월
        deck.push({ month: 3, type: 'kwang', name: '3광' });
        deck.push({ month: 3, type: 'pi', name: '3껍' });
        // 4월
        deck.push({ month: 4, type: 'yeol', name: '4끗' });
        deck.push({ month: 4, type: 'pi', name: '4껍' });
        // 5월
        deck.push({ month: 5, type: 'yeol', name: '5끗' });
        deck.push({ month: 5, type: 'pi', name: '5껍' });
        // 6월
        deck.push({ month: 6, type: 'yeol', name: '6끗' });
        deck.push({ month: 6, type: 'pi', name: '6껍' });
        // 7월
        deck.push({ month: 7, type: 'yeol', name: '7끗' });
        deck.push({ month: 7, type: 'pi', name: '7껍' });
        // 8월
        deck.push({ month: 8, type: 'kwang', name: '8광' });
        deck.push({ month: 8, type: 'yeol', name: '8끗' });
        // 9월
        deck.push({ month: 9, type: 'yeol', name: '9끗' });
        deck.push({ month: 9, type: 'pi', name: '9껍' });
        // 10월
        deck.push({ month: 10, type: 'yeol', name: '10끗' });
        deck.push({ month: 10, type: 'pi', name: '10껍' });
        this.deck = deck;
    }

    shuffleDeck() {
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }

    dealCards() {
        this.players.forEach(p => {
            p.hand = [this.deck.pop(), this.deck.pop()];
        });
    }

    collectAnte() {
        // 삥 징수
        this.players.forEach(p => {
            const amount = Math.min(this.ante, p.chips);
            p.chips -= amount;
            p.betAmount = amount;
            this.pot += amount;
        });
        this.currentBet = this.ante;
        this.phase = 'betting';
        // actedThisRound 초기화 (모두 미액션)
        this.players.forEach(p => { p.actedThisRound = false; });
    }

    // ---- 배팅 액션 처리 ----
    processAction(playerId, action, amount) {
        const player = this.players[this.currentPlayerIndex];
        if (!player || player.id !== playerId) {
            return { success: false, message: '니 차례가 아니오.' };
        }
        if (player.status === 'die') {
            return { success: false, message: '이미 죽은 목숨이오.' };
        }
        if (this.phase !== 'betting') {
            return { success: false, message: '배팅 시간이 아니오.' };
        }

        const toCall = this.currentBet - player.betAmount;
        const prevBet = this.currentBet; // 레이즈 판단용

        switch (action) {
            case 'die': {
                player.status = 'die';
                break;
            }

            case 'call': {
                // 현재 베팅액에 맞춤
                if (toCall > 0 && player.chips <= toCall) {
                    // 칩이 부족하면 올인
                    this.pot += player.chips;
                    player.betAmount += player.chips;
                    player.chips = 0;
                    player.status = 'allin';
                } else {
                    player.chips -= toCall;
                    player.betAmount += toCall;
                    this.pot += toCall;
                }
                break;
            }

            case 'half': {
                // 하프: 콜 + 판돈의 절반 레이즈
                const halfRaise = Math.floor(this.pot / 2);
                const totalNeeded = toCall + halfRaise;

                if (player.chips <= totalNeeded) {
                    // 칩 부족 -> 올인
                    this.pot += player.chips;
                    player.betAmount += player.chips;
                    player.chips = 0;
                    player.status = 'allin';
                } else {
                    player.chips -= totalNeeded;
                    player.betAmount += totalNeeded;
                    this.pot += totalNeeded;
                    this.currentBet = player.betAmount; // 최고 베팅액 갱신
                    this.lastRaiserIndex = this.currentPlayerIndex;
                }
                break;
            }

            case 'ddadang': {
                // 따당: 콜 + 현재 베팅의 2배 레이즈
                const ddadangRaise = this.currentBet;
                const totalDdadang = toCall + ddadangRaise;

                if (player.chips <= totalDdadang) {
                    this.pot += player.chips;
                    player.betAmount += player.chips;
                    player.chips = 0;
                    player.status = 'allin';
                } else {
                    player.chips -= totalDdadang;
                    player.betAmount += totalDdadang;
                    this.pot += totalDdadang;
                    this.currentBet = player.betAmount;
                    this.lastRaiserIndex = this.currentPlayerIndex;
                }
                break;
            }

            case 'allin': {
                // 올인: 남은 칩 전부
                this.pot += player.chips;
                player.betAmount += player.chips;
                if (player.betAmount > this.currentBet) {
                    this.currentBet = player.betAmount;
                    this.lastRaiserIndex = this.currentPlayerIndex;
                }
                player.chips = 0;
                player.status = 'allin';
                break;
            }

            default:
                return { success: false, message: '무슨 소리를 하는 거요.' };
        }

        // 레이즈 시 다른 플레이어 actedThisRound 초기화 (다시 선택기회 제공)
        const isRaise = (action === 'half' || action === 'ddadang' ||
            (action === 'allin' && player.betAmount > prevBet));
        if (isRaise) {
            this.players.forEach(p => { p.actedThisRound = false; });
        }
        player.actedThisRound = true;

        console.log(`[섯다] ${player.name} → ${action} | isRaise:${isRaise} | betAmount:${player.betAmount} | prevBet:${prevBet} | currentBet:${this.currentBet}`);
        this.players.forEach((p, i) => {
            console.log(`  [${i}] ${p.name}: status=${p.status}, acted=${p.actedThisRound}, chips=${p.chips}, bet=${p.betAmount}`);
        });

        this.turnCount++;
        return this.advanceTurn();
    }

    advanceTurn() {
        // 생존자 수 확인
        const survivors = this.players.filter(p => p.status !== 'die' && !p.disconnected);

        // 1명 이하 남으면 즉시 종료
        if (survivors.length <= 1) {
            this.phase = 'ended';
            return {
                gameEnded: true,
                winner: survivors[0] || null,
                reason: 'last_man_standing'
            };
        }

        // 베팅 가능한 사람 (살아있고, 올인 아니고, 연결된 사람)
        const bettable = this.players.filter(p =>
            p.status !== 'die' && p.status !== 'allin' && !p.disconnected
        );

        // 베팅 가능한 사람이 아무도 없으면 (모두 올인 or 다이) → 쇼다운
        if (bettable.length === 0) {
            this.phase = 'showdown';
            console.log('[섯다] 쇼다운: 베팅 가능한 사람 없음 (모두 올인/다이)');
            return { gameEnded: true, reason: 'showdown' };
        }

        // 아직 액션하지 않은 베팅 가능한 사람이 있는지 확인
        const unacted = bettable.filter(p => !p.actedThisRound);

        // 모든 베팅 가능한 사람이 이미 액션했으면 → 쇼다운
        if (unacted.length === 0) {
            this.phase = 'showdown';
            console.log('[섯다] 쇼다운: 모든 베팅 가능 플레이어 액션 완료');
            return { gameEnded: true, reason: 'showdown' };
        }

        // 다음 액션할 플레이어 찾기 (아직 액션 안 한 사람 중)
        let nextIndex = (this.currentPlayerIndex + 1) % this.playerCount;
        let attempts = 0;

        while (attempts < this.playerCount) {
            const next = this.players[nextIndex];
            if (next.status !== 'die' && next.status !== 'allin' && !next.disconnected && !next.actedThisRound) {
                break;
            }
            nextIndex = (nextIndex + 1) % this.playerCount;
            attempts++;
        }

        if (attempts >= this.playerCount) {
            this.phase = 'showdown';
            console.log('[섯다] 쇼다운: 다음 플레이어 찾기 실패');
            return { gameEnded: true, reason: 'showdown' };
        }

        console.log(`[섯다] 다음 차례: ${this.players[nextIndex].name} (index:${nextIndex}, acted:${this.players[nextIndex].actedThisRound})`);

        this.currentPlayerIndex = nextIndex;
        return { gameEnded: false };
    }

    determineWinner() {
        const survivors = this.players.filter(p => p.status !== 'die' && !p.disconnected);
        if (survivors.length === 0) return { winners: [], isTie: false };
        if (survivors.length === 1) return { winners: [survivors[0]], isTie: false };

        // 족보 계산
        survivors.forEach(p => {
            p.handRank = this.calculateRank(p.hand);
        });

        // 특수 족보 처리 후 최고 rank 찾기
        let best = survivors[0];

        for (let i = 1; i < survivors.length; i++) {
            const challenger = survivors[i];
            const matchResult = this.specialMatch(best, challenger);
            if (matchResult) {
                best = matchResult;
            } else if (challenger.handRank.rank > best.handRank.rank) {
                best = challenger;
            }
        }

        // 동점자 찾기 (best와 같은 rank)
        const winners = survivors.filter(p => p.handRank.rank === best.handRank.rank);

        return {
            winners: winners,
            isTie: winners.length > 1
        };
    }

    specialMatch(a, b) {
        const aRank = a.handRank;
        const bRank = b.handRank;

        // 암행어사 vs 13광땡/18광땡
        if (aRank.specialType === 'amhaeng' && (bRank.rank === 2000)) return a;
        if (bRank.specialType === 'amhaeng' && (aRank.rank === 2000)) return b;

        // 땡잡이 vs 땡 (장땡 제외)
        if (aRank.specialType === 'ddangjab' && bRank.rank >= 1010 && bRank.rank < 1100) return a;
        if (bRank.specialType === 'ddangjab' && aRank.rank >= 1010 && aRank.rank < 1100) return b;

        // 멍텅구리 구사 vs 장땡 이하 재경기 -> 여기선 구사 승으로 간단 처리
        if (aRank.specialType === 'mung_94' && bRank.rank <= 1100) return a;
        if (bRank.specialType === 'mung_94' && aRank.rank <= 1100) return b;

        return null; // 특수 매치 없음, 일반 비교
    }

    // ---- 족보 계산 ----
    calculateRank(hand) {
        if (!hand || hand.length !== 2) return { rank: 0, name: '망통', isSpecial: false };

        const c1 = hand[0], c2 = hand[1];
        const m1 = c1.month, m2 = c2.month;

        // 1. 광땡
        const is1K = hand.some(c => c.month === 1 && c.type === 'kwang');
        const is3K = hand.some(c => c.month === 3 && c.type === 'kwang');
        const is8K = hand.some(c => c.month === 8 && c.type === 'kwang');

        if (is3K && is8K) return { rank: 3800, name: '38광땡', isSpecial: false };
        if (is1K && is3K) return { rank: 2000, name: '13광땡', isSpecial: false };
        if (is1K && is8K) return { rank: 2000, name: '18광땡', isSpecial: false };

        // 2. 땡
        if (m1 === m2) {
            const names = ['', '삥땡', '이땡', '삼땡', '사땡', '오땡', '육땡', '칠땡', '팔땡', '구땡', '장땡'];
            return { rank: 1000 + (m1 * 10), name: names[m1], isSpecial: false };
        }

        // 3. 특수 족보
        const is4Y = hand.some(c => c.month === 4 && c.type === 'yeol');
        const is7Y = hand.some(c => c.month === 7 && c.type === 'yeol');

        // 암행어사 (4열+7열)
        if (is4Y && is7Y) return { rank: 1, name: '암행어사', isSpecial: true, specialType: 'amhaeng' };
        // 땡잡이 (3광+7열)
        if (is3K && is7Y) return { rank: 0, name: '땡잡이', isSpecial: true, specialType: 'ddangjab' };
        // 구사 (4+9)
        if ((m1 === 4 && m2 === 9) || (m1 === 9 && m2 === 4)) {
            const both_yeol = hand.some(c => c.month === 4 && c.type === 'yeol') &&
                hand.some(c => c.month === 9 && c.type === 'yeol');
            if (both_yeol) return { rank: 2, name: '멍텅구리 구사', isSpecial: true, specialType: 'mung_94' };
            return { rank: 2, name: '구사', isSpecial: true, specialType: '94' };
        }

        // 4. 중간 족보
        const pair = [m1, m2].sort((a, b) => a - b);
        const key = pair[0] * 10 + pair[1];
        const middleRanks = {
            12: { rank: 900, name: '알리' },
            14: { rank: 800, name: '독사' },
            19: { rank: 700, name: '구삥' },
            110: { rank: 600, name: '장삥' },
            410: { rank: 500, name: '장사' },
            46: { rank: 400, name: '세륙' }
        };
        // key 보정 (1+10 = 110, 4+10 = 410)
        const correctedKey = pair[0] * (pair[1] >= 10 ? 100 : 10) + pair[1];
        // 다시 심플하게
        if ((m1 === 1 && m2 === 2) || (m1 === 2 && m2 === 1)) return { rank: 900, name: '알리', isSpecial: false };
        if ((m1 === 1 && m2 === 4) || (m1 === 4 && m2 === 1)) return { rank: 800, name: '독사', isSpecial: false };
        if ((m1 === 1 && m2 === 9) || (m1 === 9 && m2 === 1)) return { rank: 700, name: '구삥', isSpecial: false };
        if ((m1 === 1 && m2 === 10) || (m1 === 10 && m2 === 1)) return { rank: 600, name: '장삥', isSpecial: false };
        if ((m1 === 4 && m2 === 10) || (m1 === 10 && m2 === 4)) return { rank: 500, name: '장사', isSpecial: false };
        if ((m1 === 4 && m2 === 6) || (m1 === 6 && m2 === 4)) return { rank: 400, name: '세륙', isSpecial: false };

        // 5. 끗
        const sum = (m1 + m2) % 10;
        const kkut = ['망통', '1끗', '2끗', '3끗', '4끗', '5끗', '6끗', '7끗', '8끗', '갑오'];
        return { rank: sum, name: kkut[sum], isSpecial: false };
    }
}


// ===================== 소켓 서버 =====================
module.exports = function initGame(io) {
    const nsp = io.of('/seotda');

    nsp.on('connection', (socket) => {
        console.log(`[섯다] 입장: ${socket.id}`);

        // ---- 방 만들기 ----
        socket.on('createRoom', ({ playerName, startChips, ante }) => {
            let roomId;
            do {
                roomId = Math.floor(1000 + Math.random() * 9000).toString();
            } while (rooms.has(roomId));

            const room = new GameRoom(roomId, socket.id, startChips, ante);
            room.addPlayer(socket.id, playerName);

            rooms.set(roomId, room);
            players.set(socket.id, { roomId, playerName });

            socket.join(roomId);
            socket.emit('roomCreated', { roomId, room: getRoomData(room) });

            console.log(`[섯다] 방 생성: ${roomId} (${playerName}, 칩:${room.defaultChips}, 삥:${room.ante})`);
        });

        // ---- 방 참가 ----
        socket.on('joinRoom', ({ roomId, playerName }) => {
            const room = rooms.get(roomId);

            if (!room) return socket.emit('error', { message: '그런 판은 없소.' });
            if (room.players.length >= room.maxPlayers) return socket.emit('error', { message: '자리가 꽉 찼소.' });
            if (room.players.find(p => p.id === socket.id)) return socket.emit('error', { message: '이미 안에 있소.' });

            room.addPlayer(socket.id, playerName);
            players.set(socket.id, { roomId, playerName });

            socket.join(roomId);

            // 게임 중이면 관전자로 입장한다는 안내
            const isSpectator = room.started;

            nsp.to(roomId).emit('playerJoined', {
                player: { id: socket.id, name: playerName, isSpectator },
                room: getRoomData(room)
            });

            // 관전자에게 현재 게임 상태 전송
            if (isSpectator && room.gameState) {
                socket.emit('spectatorJoin', {
                    message: '현재 판이 진행 중이오. 다음 판부터 참여하시오.',
                    gameState: getPublicGameState(room.gameState)
                });
            }

            // 게임이 진행 중이 아니고, 이전 판이 있었고, 인원이 충족되면 자동 다음 판 카운트다운
            if (!room.started && room.roundNumber > 0) {
                const eligible = room.players.filter(p => p.chips > 0 && !p.isSpectator);
                if (eligible.length >= 2 && !room._nextRoundTimer) {
                    const autoStartDelay = 5000;
                    nsp.to(room.roomId).emit('gameMessage', { message: `${playerName}이(가) 도착했소! 곧 다음 판을 시작하겠소.` });
                    nsp.to(room.roomId).emit('nextRoundCountdown', { seconds: Math.floor(autoStartDelay / 1000) });

                    room._nextRoundTimer = setTimeout(() => {
                        room._nextRoundTimer = null;

                        const eligible2 = room.players.filter(p => p.chips > 0);
                        if (eligible2.length < 2) {
                            nsp.to(room.roomId).emit('gameMessage', { message: '판을 벌릴 인원이 부족하오. 호구를 기다리시오.' });
                            return;
                        }

                        if (!room.startNewRound()) {
                            nsp.to(room.roomId).emit('gameMessage', { message: '판을 벌릴 수 없소.' });
                            return;
                        }

                        room.gameState.players.forEach(gsPlayer => {
                            const playerSocket = nsp.sockets.get(gsPlayer.id);
                            if (playerSocket) {
                                const handRank = room.gameState.calculateRank(gsPlayer.hand);
                                playerSocket.emit('gameStarted', {
                                    hand: gsPlayer.hand,
                                    handRank: handRank,
                                    gameState: getPublicGameState(room.gameState),
                                    roomId: room.roomId,
                                    roundNumber: room.roundNumber
                                });
                            }
                        });

                        room.players.filter(p => p.isSpectator).forEach(spec => {
                            const specSocket = nsp.sockets.get(spec.id);
                            if (specSocket) {
                                specSocket.emit('roundStartedSpectator', {
                                    message: `제 ${room.roundNumber}판 시작! 다음 판부터 참여합니다.`,
                                    gameState: getPublicGameState(room.gameState)
                                });
                            }
                        });

                        console.log(`[섯다] 제 ${room.roundNumber}판 자동 시작 - 재입장 (방:${room.roomId})`);
                    }, autoStartDelay);
                }
            }

            console.log(`[섯다] ${playerName} 입장 (방:${roomId}, 관전:${isSpectator})`);
        });

        // ---- 게임 시작 (새 라운드) ----
        socket.on('startGame', () => {
            const playerData = players.get(socket.id);
            if (!playerData) return;

            const room = rooms.get(playerData.roomId);
            if (!room) return;
            if (room.hostId !== socket.id) return socket.emit('error', { message: '오야만 패를 돌릴 수 있소.' });
            if (room.started) return socket.emit('error', { message: '이미 판이 진행 중이오.' });

            const activePlayers = room.players.filter(p => p.chips > 0);
            if (activePlayers.length < 2) return socket.emit('error', { message: '최소 2명은 있어야 판을 벌리지.' });

            if (!room.startNewRound()) {
                return socket.emit('error', { message: '판을 벌릴 수 없소.' });
            }

            // 각 플레이어에게 패 전송
            room.gameState.players.forEach((gsPlayer, idx) => {
                const playerSocket = nsp.sockets.get(gsPlayer.id);
                if (playerSocket) {
                    const handRank = room.gameState.calculateRank(gsPlayer.hand);
                    playerSocket.emit('gameStarted', {
                        hand: gsPlayer.hand,
                        handRank: handRank,
                        gameState: getPublicGameState(room.gameState),
                        roomId: room.roomId,
                        roundNumber: room.roundNumber
                    });
                }
            });

            // 관전자에게도 게임 시작 알림
            room.players.filter(p => p.isSpectator).forEach(spec => {
                const specSocket = nsp.sockets.get(spec.id);
                if (specSocket) {
                    specSocket.emit('roundStartedSpectator', {
                        message: `제 ${room.roundNumber}판 시작! 다음 판부터 참여합니다.`,
                        gameState: getPublicGameState(room.gameState)
                    });
                }
            });

            console.log(`[섯다] 제 ${room.roundNumber}판 시작 (방:${room.roomId})`);
        });

        // ---- 배팅 액션 ----
        socket.on('playerAction', ({ action }) => {
            const playerData = players.get(socket.id);
            if (!playerData) return;

            const room = rooms.get(playerData.roomId);
            if (!room || !room.started || !room.gameState) return;

            const result = room.gameState.processAction(socket.id, action);

            if (result.success === false) {
                return socket.emit('error', { message: result.message });
            }

            // 게임 상태 브로드캐스트
            nsp.to(room.roomId).emit('gameStateUpdate', getPublicGameState(room.gameState));

            // 게임 종료 처리
            if (result.gameEnded) {
                handleGameEnd(nsp, room, result);
            }
        });

        // ---- 연결 해제 ----
        socket.on('disconnect', () => {
            const playerData = players.get(socket.id);
            if (playerData) {
                const room = rooms.get(playerData.roomId);
                if (room) {
                    room.removePlayer(socket.id);

                    if (room.players.length === 0) {
                        rooms.delete(playerData.roomId);
                        console.log(`[섯다] 방 삭제: ${playerData.roomId} (아무도 없음)`);
                    } else {
                        nsp.to(playerData.roomId).emit('playerLeft', {
                            playerId: socket.id,
                            room: getRoomData(room)
                        });

                        // 게임 중이면 턴 체크
                        if (room.gameState && room.started) {
                            const currentPlayer = room.gameState.players[room.gameState.currentPlayerIndex];
                            if (currentPlayer && currentPlayer.id === socket.id) {
                                // 현재 턴인 사람이 나갔으면 자동 다이 후 다음 턴
                                const result = room.gameState.advanceTurn();
                                nsp.to(room.roomId).emit('gameStateUpdate', getPublicGameState(room.gameState));
                                if (result.gameEnded) {
                                    handleGameEnd(nsp, room, result);
                                }
                            }
                        }
                    }
                }
                players.delete(socket.id);
            }
            console.log(`[섯다] 퇴장: ${socket.id}`);
        });
    });

    // ---- 게임 종료 처리 함수 ----
    function handleGameEnd(nsp, room, result) {
        let winner;
        const reason = result.reason;

        if (reason === 'last_man_standing' && result.winner) {
            winner = result.winner;
            winner.handRank = room.gameState.calculateRank(winner.hand);
        } else {
            const result2 = room.gameState.determineWinner();

            // 동점 처리
            if (result2.isTie) {
                // 동점 — 팛 분배
                const tiedPlayers = result2.winners;
                const potShare = Math.floor(room.gameState.pot / tiedPlayers.length);
                const remainder = room.gameState.pot - (potShare * tiedPlayers.length);

                // 먼저 모든 칩 동기화
                room.gameState.players.forEach(gsP => {
                    const rp = room.players.find(p => p.id === gsP.id);
                    if (rp) rp.chips = gsP.chips;
                });

                // 동점자들에게 팛 분배
                tiedPlayers.forEach((tp, idx) => {
                    const rp = room.players.find(p => p.id === tp.id);
                    const gsP = room.gameState.players.find(p => p.id === tp.id);
                    const share = potShare + (idx === 0 ? remainder : 0);
                    if (rp) rp.chips += share;
                    if (gsP) gsP.chips += share;
                });

                const tieNames = tiedPlayers.map(p => p.name).join(', ');
                const rankName = tiedPlayers[0].handRank ? tiedPlayers[0].handRank.name : '';

                nsp.to(room.roomId).emit('gameEnded', {
                    winner: null,
                    isTie: true,
                    tieInfo: { names: tieNames, rankName: rankName, share: potShare },
                    reason: 'tie',
                    pot: room.gameState.pot,
                    roundNumber: room.roundNumber,
                    players: room.gameState.players.map(p => ({
                        id: p.id, name: p.name, chips: p.chips, status: p.status
                    })),
                    room: getRoomData(room)
                });

                room.lastWinnerId = tiedPlayers[0].id; // 첫 번째 동점자가 선
                room.endRound();
                console.log(`[섯다] 동점! ${tieNames} (${rankName}) | 퍻 ${room.gameState.pot} 분배`);

                afterRoundCleanup(nsp, room);
                return;
            }

            if (result2.winners.length === 0) {
                room.endRound();
                return;
            }
            winner = result2.winners[0];
        }

        if (!winner) {
            room.endRound();
            return;
        }

        // 칩 정산: gameState 칩이 진짜 (게임 중 변경된 값)
        // room.players 칩은 게임 시작 전 값이므로 전부 덮어씌움
        const pot = room.gameState.pot;

        console.log(`[섯다] 정산 시작 | pot: ${pot} | winner: ${winner.name}(${winner.id})`);

        room.gameState.players.forEach(gsP => {
            const rp = room.players.find(p => p.id === gsP.id);
            if (!rp) return;

            if (gsP.id === winner.id) {
                // 승자: gameState 칩 + 팟
                const finalChips = gsP.chips + pot;
                rp.chips = finalChips;
                gsP.chips = finalChips;
                console.log(`  승자 ${gsP.name}: ${gsP.chips - pot} + ${pot} = ${finalChips}`);
            } else {
                // 패자: gameState 칩 그대로
                rp.chips = gsP.chips;
                console.log(`  패자 ${gsP.name}: ${gsP.chips}`);
            }
        });

        // 승자를 기록 (다음 판 선)
        room.lastWinnerId = winner.id;

        // 결과 브로드캐스트
        nsp.to(room.roomId).emit('gameEnded', {
            winner: { id: winner.id, name: winner.name, handRank: winner.handRank },
            reason: reason,
            pot: room.gameState.pot,
            roundNumber: room.roundNumber,
            players: room.gameState.players.map(p => ({
                id: p.id,
                name: p.name,
                chips: p.chips,
                status: p.status
            })),
            room: getRoomData(room)
        });

        room.endRound();
        console.log(`[섯다] 제 ${room.roundNumber}판 종료. 승자: ${winner.name} (+${room.gameState.pot}원)`);

        afterRoundCleanup(nsp, room);
    }

    // ---- 라운드 종료 후 정리 (파산 퇴장, 자동 다음 판) ----
    function afterRoundCleanup(nsp, room) {
        // 칩 0인 플레이어 퇴장 처리
        const bustedPlayers = room.players.filter(p => p.chips <= 0);
        bustedPlayers.forEach(bp => {
            const bpSocket = nsp.sockets.get(bp.id);
            if (bpSocket) {
                bpSocket.emit('kicked', { message: '돈이 다 떨어졌소. 나가시오.' });
                bpSocket.leave(room.roomId);
            }
            players.delete(bp.id);
            console.log(`[섯다] ${bp.name} 퇴장 (파산)`);
        });
        room.players = room.players.filter(p => p.chips > 0);

        // 방에 아무도 없으면 삭제
        if (room.players.length === 0) {
            rooms.delete(room.roomId);
            console.log(`[섯다] 방 삭제: ${room.roomId} (전원 파산)`);
            return;
        }

        // 호스트가 쫓겨났으면 다음 사람이 호스트
        if (!room.players.find(p => p.id === room.hostId)) {
            room.hostId = room.players[0].id;
        }

        // 업데이트된 룸 정보 전송
        nsp.to(room.roomId).emit('playerLeft', { playerId: null, room: getRoomData(room) });

        // 자동 다음 판 (5초 후)
        const autoStartDelay = 5000;
        nsp.to(room.roomId).emit('nextRoundCountdown', { seconds: Math.floor(autoStartDelay / 1000) });

        if (room._nextRoundTimer) clearTimeout(room._nextRoundTimer);
        room._nextRoundTimer = setTimeout(() => {
            room._nextRoundTimer = null;

            const eligible = room.players.filter(p => p.chips > 0);
            if (eligible.length < 2) {
                nsp.to(room.roomId).emit('gameMessage', { message: '판을 벌릴 인원이 부족하오. 호구를 기다리시오.' });
                return;
            }

            if (!room.startNewRound()) {
                nsp.to(room.roomId).emit('gameMessage', { message: '판을 벌릴 수 없소.' });
                return;
            }

            room.gameState.players.forEach(gsPlayer => {
                const playerSocket = nsp.sockets.get(gsPlayer.id);
                if (playerSocket) {
                    const handRank = room.gameState.calculateRank(gsPlayer.hand);
                    playerSocket.emit('gameStarted', {
                        hand: gsPlayer.hand,
                        handRank: handRank,
                        gameState: getPublicGameState(room.gameState),
                        roomId: room.roomId,
                        roundNumber: room.roundNumber
                    });
                }
            });

            room.players.filter(p => p.isSpectator).forEach(spec => {
                const specSocket = nsp.sockets.get(spec.id);
                if (specSocket) {
                    specSocket.emit('roundStartedSpectator', {
                        message: `제 ${room.roundNumber}판 시작! 다음 판부터 참여합니다.`,
                        gameState: getPublicGameState(room.gameState)
                    });
                }
            });

            console.log(`[섯다] 제 ${room.roundNumber}판 자동 시작 (방:${room.roomId})`);
        }, autoStartDelay);
    }
};

// ---- 유틸리티 ----
function getRoomData(room) {
    return {
        roomId: room.roomId,
        hostId: room.hostId,
        maxPlayers: room.maxPlayers,
        players: room.players.map(p => ({
            id: p.id,
            name: p.name,
            chips: p.chips,
            isSpectator: p.isSpectator
        })),
        started: room.started,
        roundNumber: room.roundNumber,
        ante: room.ante
    };
}

function getPublicGameState(gameState) {
    return {
        players: gameState.players.map(p => ({
            id: p.id,
            name: p.name,
            chips: p.chips,
            betAmount: p.betAmount,
            status: p.status,
            hand: [],
            isCurrentTurn: gameState.players[gameState.currentPlayerIndex]?.id === p.id
        })),
        pot: gameState.pot,
        currentBet: gameState.currentBet,
        currentPlayerIndex: gameState.currentPlayerIndex,
        round: gameState.round,
        phase: gameState.phase
    };
}
