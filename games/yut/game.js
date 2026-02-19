const { Server } = require('socket.io');

const rooms = new Map();
const COLORS = ['red', 'blue', 'green', 'yellow'];

function throwYut(useNak = false, useBackdo = false) {
    // 낙 확률 5%
    if (useNak && Math.random() < 0.05) {
        return { name: '낙', value: 0, isNak: true, isBackdo: false };
    }

    // 가중 확률로 윷 결과 결정
    // 도 20%, 개 31%, 걸 34%, 윷 12%, 모 3%
    const rand = Math.random() * 100;
    let result;

    if (rand < 20) {
        result = { name: '도', value: 1 }; // 0-20: 20%
    } else if (rand < 51) {
        result = { name: '개', value: 2 }; // 20-51: 31%
    } else if (rand < 85) {
        result = { name: '걸', value: 3 }; // 51-85: 34%
    } else if (rand < 97) {
        result = { name: '윷', value: 4 }; // 85-97: 12%
    } else {
        result = { name: '모', value: 5 }; // 97-100: 3%
    }

    // 뒷도: 도가 나왔을 때 25% 확률
    let isBackdo = false;
    if (useBackdo && result.value === 1 && Math.random() < 0.25) {
        isBackdo = true;
    }

    return { ...result, isNak: false, isBackdo };
}

const BOARD_GRAPH = {
    0: { main: 1 },
    1: { main: 2 }, 2: { main: 3 }, 3: { main: 4 }, 4: { main: 5 },
    5: { main: 6, diagonal: 21 }, // 우상 코너
    6: { main: 7 }, 7: { main: 8 }, 8: { main: 9 }, 9: { main: 10 },
    10: { main: 11, diagonal: 24 }, // 좌상 코너
    11: { main: 12 }, 12: { main: 13 }, 13: { main: 14 }, 14: { main: 15 },
    15: { main: 16 }, // 좌하 코너 (방향 선택 없음)
    16: { main: 17 }, 17: { main: 18 }, 18: { main: 19 }, 19: { main: 20 },
    20: { main: 99 }, // 우하 코너 (도착 직전)
    // 대각선 경로 (각 코너 ↔ 중앙 사이에 노드 2개)
    21: { main: 22 }, // 우상 → 중앙 중간1
    22: { main: 23 }, // 우상 → 중앙 중간2
    24: { main: 25 }, // 좌상 → 중앙 중간1
    25: { main: 23 }, // 좌상 → 중앙 중간2
    26: { main: 27 }, // 중앙 → 우하 중간1
    27: { main: 20 }, // 중앙 → 우하 중간2
    28: { main: 29 }, // 중앙 → 좌하 중간1
    29: { main: 15 }, // 중앙 → 좌하 중간2
    // 중앙
    23: { main: 26 }, // 기본은 우하(26 → 27 → 20)
    99: {} // 완주
};

class YutRoom {
    constructor(roomId, hostId, options = {}) {
        this.roomId = roomId;
        this.hostId = hostId;
        this.config = {
            maxPlayers: options.playerCount || 2,
            tokensPerPlayer: options.tokenCount || 4,
            useBackdo: options.useBackdo !== undefined ? options.useBackdo : false,
            useNak: options.useNak !== undefined ? options.useNak : false
        };

        this.players = [];
        this.gameState = {
            phase: 'waiting',
            currentTurnIndex: 0,
            yutResults: [],
            tokens: [],
            waitingForThrow: true,
            winner: null,
            pendingMove: null
        };
    }

    addPlayer(id, name) {
        if (this.players.length >= this.config.maxPlayers) {
            return false;
        }

        const playerIndex = this.players.length;
        const player = {
            id,
            name,
            color: COLORS[playerIndex],
            tokens: [],
            finishedCount: 0
        };

        for (let i = 0; i < this.config.tokensPerPlayer; i++) {
            const token = {
                id: `p${playerIndex}_t${i}`,
                ownerIndex: playerIndex,
                location: 0,
                stackWith: [],
                fromCorner: null
            };
            player.tokens.push(token);
            this.gameState.tokens.push(token);
        }

        this.players.push(player);
        return true;
    }

    removePlayer(id) {
        const idx = this.players.findIndex(p => p.id === id);
        if (idx !== -1) {
            this.gameState.tokens = this.gameState.tokens.filter(t => t.ownerIndex !== idx);
            this.players.splice(idx, 1);
            this.players.forEach((p, i) => {
                p.tokens.forEach(t => t.ownerIndex = i);
            });
        }
    }

    startGame() {
        if (this.players.length < 2) {
            return { success: false, message: '최소 2명의 플레이어가 필요합니다' };
        }

        this.gameState.phase = 'playing';
        this.gameState.currentTurnIndex = 0;
        this.gameState.waitingForThrow = true;
        this.gameState.yutResults = [];

        return { success: true };
    }

    throwYut() {
        if (!this.gameState.waitingForThrow) {
            return { success: false, message: '윷을 던질 수 없습니다' };
        }

        const result = throwYut(this.config.useNak, this.config.useBackdo);

        if (result.isNak) {
            if (this.gameState.yutResults.length === 0) {
                this.nextTurn();
            } else {
                this.gameState.waitingForThrow = false;
            }
            return { success: true, result, isNak: true };
        }

        this.gameState.yutResults.push(result);

        if (result.value === 4 || result.value === 5) {
            this.gameState.waitingForThrow = true;
        } else {
            this.gameState.waitingForThrow = false;
        }

        return { success: true, result };
    }

    calculatePath(from, steps, useDiagonal = false, fromCorner = null) {
        let current = from;
        let path = [current];
        let remainingSteps = steps;

        // 일반 경로
        for (let i = 0; i < remainingSteps; i++) {
            const node = BOARD_GRAPH[current];
            if (!node) {
                console.log(`[서버] 노드 ${current}를 찾을 수 없음`);
                return { valid: false, message: '이동할 수 없습니다' };
            }

            let next = null;

            // 대각선은 첫 번째 스텝에서 선택 (코너에서 출발할 때)
            if (i === 0 && node.diagonal && useDiagonal) {
                next = node.diagonal;
                console.log(`[서버] 대각선 선택: ${current} -> ${next}`);
            } else if (node.main !== undefined) {
                next = node.main;
                console.log(`[서버] 직선 이동: ${current} -> ${next}`);
            }

            if (next === null || next === undefined) {
                console.log(`[서버] ${current}에서 다음 노드 없음. node:`, node, `useDiagonal: ${useDiagonal}, i: ${i}`);
                return { valid: false, message: '더 이상 이동할 수 없습니다' };
            }

            current = next;
            path.push(current);

            // 완주(99)에만 멈춤
            if (current === 99) {
                console.log(`[서버] 완주 도착, 멈춤`);
                break;
            }
        }

        return { valid: true, destination: current, path };
    }

    calculateBackdoPath(from) {
        for (const [prevNode, edges] of Object.entries(BOARD_GRAPH)) {
            const prev = parseInt(prevNode);
            if (edges.main === from || edges.diagonal === from) {
                return { valid: true, destination: prev, path: [from, prev] };
            }
        }
        return { valid: false, message: '뒤로 갈 수 없습니다' };
    }

    moveToken(tokenId, yutResultIndex, useDiagonal = false) {
        console.log(`[서버] moveToken 호출 - useDiagonal: ${useDiagonal}, tokenId: ${tokenId}`);

        const yutResult = this.gameState.yutResults[yutResultIndex];
        if (!yutResult) {
            return { success: false, message: '잘못된 윷패입니다' };
        }

        const token = this.gameState.tokens.find(t => t.id === tokenId);
        if (!token) {
            return { success: false, message: '말을 찾을 수 없습니다' };
        }

        console.log(`[서버] 현재 위치: ${token.location}, fromCorner: ${token.fromCorner}`);

        const currentPlayer = this.players[this.gameState.currentTurnIndex];
        if (token.ownerIndex !== this.gameState.currentTurnIndex) {
            return { success: false, message: '자신의 말만 움직일 수 있습니다' };
        }

        if (yutResult.isBackdo) {
            if (token.location === 0) {
                this.gameState.yutResults.splice(yutResultIndex, 1);
                if (this.gameState.yutResults.length === 0 && !this.gameState.waitingForThrow) {
                    this.nextTurn();
                }
                return { success: false, message: '말이 나와있지 않아 뒷도는 낙 처리됩니다' };
            }

            const backdoResult = this.calculateBackdoPath(token.location);
            if (!backdoResult.valid) {
                return backdoResult;
            }

            token.location = backdoResult.destination;
            this.gameState.yutResults.splice(yutResultIndex, 1);

            if (this.gameState.yutResults.length === 0 && !this.gameState.waitingForThrow) {
                this.nextTurn();
            }

            return { success: true };
        }

        const pathResult = this.calculatePath(token.location, yutResult.value, useDiagonal, token.fromCorner);
        console.log(`[서버] 경로 계산 결과 - destination: ${pathResult.destination}`);

        if (!pathResult.valid) {
            return pathResult;
        }

        const destination = pathResult.destination;
        this.gameState.pendingMove = null;

        if (destination === 23) {
            if (token.location === 22) token.fromCorner = 5;
            else if (token.location === 25) token.fromCorner = 10;
        }

        this.executeMove(token, destination, yutResultIndex, yutResult.value === 4 || yutResult.value === 5);

        return { success: true };
    }

    executeMove(token, destination, yutResultIndex, wasYutOrMo) {
        const currentPlayer = this.players[this.gameState.currentTurnIndex];

        const movingTokens = [token];
        token.stackWith.forEach(stackedId => {
            const stackedToken = this.gameState.tokens.find(t => t.id === stackedId);
            if (stackedToken) {
                movingTokens.push(stackedToken);
            }
        });

        const occupants = this.gameState.tokens.filter(t =>
            t.location === destination &&
            t.location !== 0 &&
            t.location !== 99 &&
            t.id !== token.id &&
            !token.stackWith.includes(t.id)
        );

        let caughtOpponent = false;

        if (occupants.length > 0) {
            const firstOccupant = occupants[0];

            if (firstOccupant.ownerIndex === token.ownerIndex) {
                occupants.forEach(occ => {
                    if (!token.stackWith.includes(occ.id)) {
                        token.stackWith.push(occ.id);
                    }
                    occ.stackWith.forEach(sid => {
                        if (!token.stackWith.includes(sid) && sid !== token.id) {
                            token.stackWith.push(sid);
                        }
                    });
                    occ.stackWith = [];
                });

            } else {
                const allCaught = [...occupants];
                occupants.forEach(occ => {
                    occ.stackWith.forEach(sid => {
                        const stacked = this.gameState.tokens.find(t => t.id === sid);
                        if (stacked && !allCaught.includes(stacked)) {
                            allCaught.push(stacked);
                        }
                    });
                });

                allCaught.forEach(t => {
                    t.location = 0;
                    t.stackWith = [];
                    t.fromCorner = null;
                });

                caughtOpponent = true;
            }
        }

        movingTokens.forEach(t => {
            t.location = destination;
            if (destination === 23) {
                t.fromCorner = token.fromCorner;
            }
        });

        this.gameState.yutResults.splice(yutResultIndex, 1);

        if (destination === 99) {
            currentPlayer.finishedCount += movingTokens.length;
            movingTokens.forEach(t => {
                t.stackWith = [];
                t.fromCorner = null;
            });
        }

        if (currentPlayer.finishedCount >= this.config.tokensPerPlayer) {
            this.gameState.phase = 'ended';
            this.gameState.winner = currentPlayer;
            return false;
        }

        let extraTurn = false;

        if (caughtOpponent && !wasYutOrMo) {
            extraTurn = true;
        }

        if (extraTurn) {
            this.gameState.waitingForThrow = true;
        } else if (this.gameState.yutResults.length === 0) {
            if (!this.gameState.waitingForThrow) {
                this.nextTurn();
            }
        }

        return extraTurn;
    }

    nextTurn() {
        this.gameState.currentTurnIndex = (this.gameState.currentTurnIndex + 1) % this.players.length;
        this.gameState.waitingForThrow = true;
        this.gameState.yutResults = [];
        this.gameState.pendingMove = null;
    }

    getState() {
        return {
            ...this.gameState,
            players: this.players.map(p => ({
                id: p.id,
                name: p.name,
                color: p.color,
                finishedCount: p.finishedCount,
                tokens: p.tokens
            }))
        };
    }
}

module.exports = function initYutGame(io) {
    const nsp = io.of('/yut');

    nsp.on('connection', (socket) => {
        console.log(`[Yut] 플레이어 연결: ${socket.id}`);

        socket.on('createRoom', ({ playerName, options }) => {
            const roomId = Math.floor(1000 + Math.random() * 9000).toString();
            const room = new YutRoom(roomId, socket.id, options);

            if (!room.addPlayer(socket.id, playerName)) {
                socket.emit('error', { message: '플레이어 추가 실패' });
                return;
            }

            rooms.set(roomId, room);
            socket.join(roomId);

            socket.emit('roomCreated', {
                roomId,
                players: room.players,
                config: room.config
            });
        });

        socket.on('joinRoom', ({ roomId, playerName }) => {
            const room = rooms.get(roomId);
            if (!room) {
                socket.emit('error', { message: '방을 찾을 수 없습니다' });
                return;
            }

            if (!room.addPlayer(socket.id, playerName)) {
                socket.emit('error', { message: '방이 가득 찼습니다' });
                return;
            }

            socket.join(roomId);

            socket.emit('roomJoined', {
                roomId,
                players: room.players,
                config: room.config
            });

            nsp.to(roomId).emit('updateRoom', {
                players: room.players,
                config: room.config
            });
        });

        socket.on('startGame', () => {
            const room = findRoomByPlayer(socket.id);
            if (!room) return;

            if (room.hostId !== socket.id) {
                socket.emit('error', { message: '방장만 게임을 시작할 수 있습니다' });
                return;
            }

            const result = room.startGame();
            if (!result.success) {
                socket.emit('error', { message: result.message });
                return;
            }

            nsp.to(room.roomId).emit('gameStarted', {
                gameState: room.getState()
            });
        });

        socket.on('throwYut', () => {
            const room = findRoomByPlayer(socket.id);
            if (!room || room.gameState.phase !== 'playing') return;

            const currentPlayer = room.players[room.gameState.currentTurnIndex];
            if (currentPlayer.id !== socket.id) {
                socket.emit('error', { message: '자신의 차례가 아닙니다' });
                return;
            }

            const result = room.throwYut();
            if (!result.success) {
                socket.emit('error', { message: result.message });
                return;
            }

            nsp.to(room.roomId).emit('yutThrown', {
                result: result.result,
                gameState: room.getState(),
                isNak: result.isNak
            });
        });

        socket.on('moveToken', ({ tokenId, yutResultIndex, useDiagonal }) => {
            const room = findRoomByPlayer(socket.id);
            if (!room || room.gameState.phase !== 'playing') return;

            const result = room.moveToken(tokenId, yutResultIndex, useDiagonal);
            if (!result.success) {
                socket.emit('error', { message: result.message });
                return;
            }

            nsp.to(room.roomId).emit('gameStateUpdated', {
                gameState: room.getState()
            });

            if (room.gameState.phase === 'ended') {
                nsp.to(room.roomId).emit('gameOver', {
                    winner: room.gameState.winner
                });
            }
        });

        socket.on('disconnect', () => {
            const room = findRoomByPlayer(socket.id);
            if (room) {
                room.removePlayer(socket.id);
                if (room.players.length === 0) {
                    rooms.delete(room.roomId);
                } else {
                    nsp.to(room.roomId).emit('updateRoom', {
                        players: room.players,
                        config: room.config
                    });
                }
            }
        });
    });

    function findRoomByPlayer(playerId) {
        for (const room of rooms.values()) {
            if (room.players.some(p => p.id === playerId)) {
                return room;
            }
        }
        return null;
    }
};
