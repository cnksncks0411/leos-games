const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const lexioGame = require('./games/lexio/game');
const yutGame = require('./games/yut/game');

const twentyGame = require('./games/twenty_questions/game');
const seotdaGame = require('./games/seotda/game');

// 앱 초기화
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

// 1. 메인 홈페이지 (레오네 보드게임) 서빙
// 루트 경로에 접속하면 public (메인용) 폴더의 내용을 보여줌
app.use(express.static(path.join(__dirname, 'public')));

// 2. 렉시오 게임 서빙 (경로 기반 라우팅)
// /lexio 로 접속하면 lexio 클라이언트 파일들을 제공
app.use('/lexio', express.static(path.join(__dirname, 'games/lexio/client')));
app.use('/yut', express.static(path.join(__dirname, 'games/yut/client')));
app.use('/twenty', express.static(path.join(__dirname, 'games/twenty_questions/client')));
app.use('/seotda', express.static(path.join(__dirname, 'games/seotda/client')));

// 3. 게임 로직 초기화
// 렉시오 게임 로직을 불러와서 Socket.IO 인스턴스를 넘겨줌 (내부에서 /lexio 네임스페이스 사용)
lexioGame(io);
yutGame(io);
twentyGame(io);
seotdaGame(io);

// 서버 시작
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log('\n=============================================');
    console.log('🦁 레오네 보드게임 플랫폼 서버 시작! 🦁');
    console.log('=============================================\n');
    console.log(`포트: ${PORT}`);
    console.log('\n[접속 주소]');

    const networkInterfaces = os.networkInterfaces();
    Object.keys(networkInterfaces).forEach((interfaceName) => {
        networkInterfaces[interfaceName].forEach((interfaceInfo) => {
            if (interfaceInfo.family === 'IPv4' && !interfaceInfo.internal) {
                console.log(`  🌐 메인: http://${interfaceInfo.address}:${PORT}`);
                console.log(`  🃏 렉시오: http://${interfaceInfo.address}:${PORT}/lexio`);
                console.log(`  🥮 윷놀이: http://${interfaceInfo.address}:${PORT}/yut`);
                console.log(`  ❓ 스무고개: http://${interfaceInfo.address}:${PORT}/twenty`);
            }
        });
    });

    console.log(`\n  📱 로컬 메인: http://localhost:${PORT}`);
    console.log(`  🃏 로컬 렉시오: http://localhost:${PORT}/lexio`);
    console.log(`  🥮 로컬 윷놀이: http://localhost:${PORT}/yut`);
    console.log(`  ❓ 로컬 스무고개: http://localhost:${PORT}/twenty`);
    console.log('\n=============================================\n');
});
