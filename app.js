        (function() {
            const canvas = document.getElementById('boardCanvas');
            const ctx = canvas.getContext('2d');
            const padding = 20;
            const cellSize = 48;
            const colLetters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
            const ITEMS_PER_PAGE = 8;
            let sfxCtx = null;
            let sfxEnabled = localStorage.getItem('barricade-sfx') !== 'off';

            function getSfxCtx() {
                if (!sfxEnabled) return null;
                if (!sfxCtx) {
                    try {
                        sfxCtx = new(window.AudioContext || window.webkitAudioContext)()
                    } catch (e) {
                        sfxCtx = null
                    }
                }
                if (sfxCtx && sfxCtx.state === 'suspended') sfxCtx.resume();
                return sfxCtx
            }

            function sfxTone(ctx, t0, freq, endFreq, duration, type, peak) {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = type;
                osc.frequency.setValueAtTime(freq, t0);
                if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + duration * 0.9);
                gain.gain.setValueAtTime(0, t0);
                gain.gain.linearRampToValueAtTime(peak, t0 + 0.012);
                gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(t0);
                osc.stop(t0 + duration + 0.03);
                return { osc, gain }
            }

            function sfxNoiseBurst(ctx, t0, duration, filterType, filterFreq, peak, q) {
                const bufSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
                const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 1.4);
                const noise = ctx.createBufferSource();
                noise.buffer = buffer;
                const filter = ctx.createBiquadFilter();
                filter.type = filterType;
                filter.frequency.setValueAtTime(filterFreq, t0);
                if (q) filter.Q.setValueAtTime(q, t0);
                const gain = ctx.createGain();
                gain.gain.setValueAtTime(peak, t0);
                gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
                noise.connect(filter);
                filter.connect(gain);
                gain.connect(ctx.destination);
                noise.start(t0);
                noise.stop(t0 + duration + 0.02)
            }

            function sfxKick(ctx, t0, peak) {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(160, t0);
                osc.frequency.exponentialRampToValueAtTime(42, t0 + 0.16);
                gain.gain.setValueAtTime(peak, t0);
                gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.24);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(t0);
                osc.stop(t0 + 0.26);
                sfxNoiseBurst(ctx, t0, 0.03, 'lowpass', 900, peak * 0.45)
            }

            function sfxBrassNote(ctx, t0, freq, duration, peak) {
                [0, -7].forEach(detune => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    const filter = ctx.createBiquadFilter();
                    filter.type = 'lowpass';
                    filter.frequency.setValueAtTime(freq * 3.2, t0);
                    filter.frequency.exponentialRampToValueAtTime(freq * 1.4, t0 + duration);
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(freq, t0);
                    osc.detune.setValueAtTime(detune, t0);
                    gain.gain.setValueAtTime(0, t0);
                    gain.gain.linearRampToValueAtTime(peak, t0 + 0.02);
                    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
                    osc.connect(filter);
                    filter.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(t0);
                    osc.stop(t0 + duration + 0.03)
                })
            }

            function haptic(pattern) {
                try {
                    if (navigator.vibrate) navigator.vibrate(pattern)
                } catch (e) {}
            }

            function sfxMove() {
                const ctx = getSfxCtx();
                if (!ctx) return;
                haptic(10);
                const t0 = ctx.currentTime;
                sfxTone(ctx, t0, 200, 130, 0.08, 'sine', 0.2);
                sfxNoiseBurst(ctx, t0, 0.02, 'highpass', 2400, 0.13)
            }

            function sfxWall() {
                const ctx = getSfxCtx();
                if (!ctx) return;
                haptic(18);
                const t0 = ctx.currentTime;
                sfxKick(ctx, t0, 0.42);
                sfxNoiseBurst(ctx, t0 + 0.005, 0.09, 'lowpass', 550, 0.22);
                sfxTone(ctx, t0 + 0.02, 950, 680, 0.16, 'triangle', 0.07)
            }

            function sfxGameStart() {
                const ctx = getSfxCtx();
                if (!ctx) return;
                const t0 = ctx.currentTime;
                sfxKick(ctx, t0, 0.46);
                sfxNoiseBurst(ctx, t0, 0.05, 'bandpass', 3200, 0.11, 6);
                sfxTone(ctx, t0, 110, 100, 0.55, 'sawtooth', 0.05);
                [220, 220, 330, 440].forEach((freq, i) => {
                    sfxBrassNote(ctx, t0 + [0.09, 0.21, 0.33, 0.45][i], freq, 0.15, 0.15)
                });
                sfxBrassNote(ctx, t0 + 0.6, 440, 0.35, 0.2)
            }

            function sfxWin() {
                const ctx = getSfxCtx();
                if (!ctx) return;
                haptic([30, 50, 30, 50, 70]);
                const t0 = ctx.currentTime;
                sfxKick(ctx, t0, 0.48);
                [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
                    sfxBrassNote(ctx, t0 + i * 0.11, freq, 0.28, 0.17)
                });
                const chordTime = t0 + 0.46;
                [523.25, 659.25, 783.99, 1046.5].forEach(freq => {
                    sfxBrassNote(ctx, chordTime, freq, 0.55, 0.13)
                });
                sfxNoiseBurst(ctx, chordTime, 0.35, 'highpass', 4200, 0.05)
            }

            function sfxBite() {
                const ctx = getSfxCtx();
                if (!ctx) return;
                haptic([40, 30, 40, 30, 50]);
                const t0 = ctx.currentTime;
                sfxNoiseBurst(ctx, t0, 0.06, 'lowpass', 650, 0.32);
                sfxTone(ctx, t0, 280, 80, 0.13, 'square', 0.2);
                sfxNoiseBurst(ctx, t0 + 0.16, 0.06, 'lowpass', 650, 0.3);
                sfxTone(ctx, t0 + 0.16, 280, 80, 0.13, 'square', 0.18);
                sfxNoiseBurst(ctx, t0 + 0.32, 0.08, 'lowpass', 500, 0.35);
                sfxTone(ctx, t0 + 0.32, 220, 60, 0.18, 'square', 0.22)
            }

            function sfxProximity() {
                const ctx = getSfxCtx();
                if (!ctx) return;
                const t0 = ctx.currentTime;
                sfxTone(ctx, t0, 520, 420, 0.14, 'triangle', 0.16);
                sfxNoiseBurst(ctx, t0, 0.05, 'highpass', 3000, 0.09)
            }

            function sfxClick() {
                const ctx = getSfxCtx();
                if (!ctx) return;
                haptic(7);
                const t0 = ctx.currentTime;
                sfxTone(ctx, t0, 760, 560, 0.055, 'sine', 0.11);
                sfxNoiseBurst(ctx, t0, 0.012, 'highpass', 4000, 0.05)
            }

            function sfxToggle() {
                const ctx = getSfxCtx();
                if (!ctx) return;
                haptic(9);
                const t0 = ctx.currentTime;
                sfxTone(ctx, t0, 500, 780, 0.07, 'sine', 0.12);
                sfxTone(ctx, t0 + 0.03, 780, 900, 0.06, 'sine', 0.08)
            }
            const translations = {
                en: {
                    pageTitle: 'Route 9 - Dark Mode',
                    modeTitle: 'Route 9',
                    aboutBtn: 'About',
                    soundOn: 'Sound',
                    soundOff: 'Muted',
                    shakeToShowHint: 'Tap the small dot to bring the icon back',
                    langBtn: 'فارسی',
                    aboutTitle: 'About Us',
                    aboutTagline: 'Strategy. Walls. Victory.',
                    aboutText: 'Route 9 is an offline, pass-and-play strategy board game where players race to reach the opposite side while placing walls to slow each other down.',
                    aboutFeature1: 'Offline play',
                    aboutFeature2: '2–4 players',
                    aboutFeature3: 'Wall strategy',
                    aboutCreatorLabel: 'Created by',
                    aboutCreatorName: 'Mohammad hossein shamsi',
                    aboutFollowLabel: 'Follow us',
                    aboutClose: 'Close',
                    startSubtitle: 'Your path to victory starts here.',
                    howToPlay: 'How to Play',
                    modeClassicTitle: 'Classic Game',
                    modeClassicShort: 'Classic',
                    modeClassicDesc: 'Block your rivals and race to the other side.',
                    modeClassicBadge: '2-4',
                    pc2Label: '2 Players',
                    pc4Label: '4 Players',
                    modeHunterTitle: 'Wolf VS Sheep',
                    modeHunterDesc: 'One escapes, one hunts — first to win takes it.',
                    modeOnlineTitle: 'Online Game',
                    modeOnlineDesc: 'Play with a friend remotely; one creates a room, the other joins with a code',
                    onlineHeroTitle: 'Online Game',
                    onlinePick2pLabel: 'Classic 1 vs 1',
                    onlinePick4pLabel: '4 Players',
                    onlinePickHunterLabel: 'Wolf and Sheep',
                    onlineCreateTitle: 'Create Room',
                    onlineCreateDesc: 'Make a code and send it to your opponent',
                    onlineJoinTitle: 'Join with Code',
                    onlineJoinDesc: "Enter your opponent's code",
                    onlineBackLabel: 'Back',
                    onlineCodeHint: 'Send this code to your opponent',
                    onlineCancelLabel: 'Cancel',
                    onlineConnectLabel: 'Connect',
                    onlineCopyCodeAria: 'Copy code',
                    move: 'Move',
                    horizontal: 'Horizontal',
                    vertical: 'Vertical',
                    undo: 'Undo',
                    repeat: 'Repeat',
                    resign: 'Resign',
                    newGame: 'Back to Home',
                    moveHistory: 'MOVE HISTORY',
                    startGame: 'Start a game',
                    gameInfo: 'GAME INFO',
                    mode: 'Mode',
                    wallsLeft: 'Walls Left',
                    status: 'Status',
                    objective: 'OBJECTIVE',
                    walls: 'WALLS',
                    wallsText: '• Tap a spot to select a wall, then confirm.<br>• 10 walls per player.',
                    wallsText4p: '• Tap a spot to select a wall, then confirm.<br>• 6 walls per player, 2v2 teams.',
                    wallsTextHunter: '• Tap a spot to select a wall, then confirm.<br>• Survivor: 10 walls, Hunter: 8 walls.',
                    rules: 'RULES',
                    rulesText: '• A wall can never fully block a path.<br>• Walls can\'t overlap or cross like a "+".',
                    placeWall: 'Place Wall',
                    match: 'MATCH',
                    vs: 'VS',
                    gameOver: 'Game Over',
                    turnSuffix: "'s Turn",
                    mode2p: '2 Player',
                    mode4p: '4 Player',
                    modeHunter: 'Hunter & Survivor',
                    objective2p: 'Reach the opposite side before your opponent.',
                    objective4p: 'Get both teammates to their target edge before the other team.',
                    objectiveHunter: '• Survivor must reach the opposite side.\n• Hunter must catch the survivor by moving onto their square, or corner them 7 times.',
                    teamA: 'Team A',
                    teamB: 'Team B',
                    players: {
                        player1: 'Player 1 (Red)',
                        player2: 'Player 2 (Blue)',
                        red: 'Red',
                        blue: 'Blue',
                        green: 'Green',
                        yellow: 'Yellow',
                        hunterRole: 'Hunter (Red)',
                        escaperRole: 'Survivor (Blue)'
                    },
                    roleHunter: 'Hunter',
                    roleEscaper: 'Survivor',
                    teamNames: {
                        0: 'Red & Blue',
                        1: 'Green & Yellow'
                    },
                    alertPerpendicular: 'Cannot intersect perpendicular walls!',
                    alertBlocked: 'This wall would completely block a path — not allowed!',
                    alertWins: '{name} Wins!',
                    alertTeamWins: 'Team {team} Wins!',
                    confirmResign: '{name} resigns — end the game?',
                    resignWinner: '{name} Resigned! Winner: {winner}',
                    resignTeamWinner: '{name} Resigned! Team {team} Wins!',
                    confirmNewGame: 'Go back to home? Current progress will be lost.',
                    confirmRepeat: 'Repeat this game with the same players?',
                    nameEntryTitle: 'Enter Player Names',
                    startGameBtn: 'Start Game',
                    backBtn: 'Back',
                    toastNoWalls: 'You have no walls left to place!',
                    toastWallExists: 'There is already a wall in this spot.',
                    toastInvalidMove: "You can't move there.",
                    toastNothingToUndo: 'Nothing to undo yet.',
                    dangerWarning: 'The hunter is right next to you!',
                    huntProximityToast: 'Hunter closing in: {n}/7',
                    huntProximityWinToast: 'The hunter cornered the survivor 7 times!',
                    defaultPlayerNames: ['Player 1', 'Player 2', 'Player 3', 'Player 4'],
                    goWinnerLabel: 'WINNER',
                    goTagWinner: 'Winner',
                    goTagLoser: 'Loser',
                    goPlayAgain: 'Play Again',
                    goBackHome: 'Back to Home',
                    confirmYesLabel: 'Yes, Continue',
                    confirmNoLabel: 'Cancel',
                    confirmHomeYes: 'Yes, Go Home',
                    confirmHomeNo: 'Stay in Game',
                    confirmRepeatYes: 'Yes, Repeat',
                    confirmRepeatNo: 'Cancel',
                    confirmResignYes: 'Yes, Resign',
                    confirmResignNo: 'Keep Playing',
                    settingsBtn: 'Settings',
                    settingsTitle: 'Settings',
                    settingsLangLabel: 'Language',
                    settingsLangDesc: 'Choose the app language',
                    settingsSoundLabel: 'Sound Effects',
                    settingsSoundDesc: 'Enable or mute in-game sounds',
                    onlineLobbyTitle: 'Set Name & Avatar',
                    onlineLobbyDesc: 'You have up to {n} seconds to set your name and avatar color',
                    onlineLobbyDescHunter: 'You have up to {n} seconds to set your name, avatar color, and role',
                    onlineLobbyHint: 'You can only change your own name and color',
                    rolePickTitle: 'Choose your role',
                    rolePickEscaper: 'Survivor',
                    rolePickHunter: 'Hunter',
                    rolePickStatusMe: 'Your pick: {role}',
                    rolePickStatusWaiting: 'Pick a role',
                    rolePickStatusOppWaiting: "Waiting for opponent's pick...",
                    rolePickStatusOppChosen: 'Opponent has picked too',
                    roleLotteryTitle: 'Drawing roles...',
                    roleLotteryWaitTitle: 'Deciding roles...',
                    roleLotteryResultHunter: "You're the Hunter!",
                    roleLotteryResultEscaper: "You're the Survivor!",
                    rematchAcceptLabel: "Accept Opponent's Rematch",
                    rematchWaitingLabel: 'Waiting for opponent...',
                    opponentLeftMsg: 'Opponent left the game',
                    toastRematchRequested: 'Opponent wants a rematch',
                    gtOfflineLabel: 'Offline',
                    gtOnlineLabel: 'Online',
                    gtLockHint4p: '4-player mode is offline only',
                    onlineNameLockTitle: 'Name & avatar are set inside the room',
                    onlineNameLockDesc: "After you create or join a room, you'll pick your name and avatar color in the lobby.",
                    timerSelectLabel: "Each Player's Total Time",
                    timerUnitSec: 'sec',
                    timerUnitMin: 'min',
                    timerNoneLabel: 'No timer',
                    onlineCodeEntryLabel: 'Join with Code',
                    timeUpToast: "{name}'s time ran out — turn forfeited"
                },
                fa: {
                    pageTitle: 'مسیر ۹ - حالت تیره',
                    modeTitle: 'مسیر ۹',
                    aboutBtn: 'درباره ما',
                    soundOn: 'صدا',
                    soundOff: 'بی‌صدا',
                    shakeToShowHint: 'برای بازگرداندن آیکون، روی نقطهٔ کوچک ضربه بزنید',
                    langBtn: 'English',
                    aboutTitle: 'درباره ما',
                    aboutTagline: 'استراتژی. دیوار. پیروزی.',
                    aboutText: 'مسیر ۹ یک بازی فکری آفلاین و نوبتی است که در آن بازیکنان باید زودتر از بقیه به سمت مقابل برسند و در همین حین با گذاشتن دیوار مسیر حریف را کندتر کنند.',
                    aboutFeature1: 'بدون اینترنت',
                    aboutFeature2: '۲ تا ۴ نفره',
                    aboutFeature3: 'استراتژی دیوار',
                    aboutCreatorLabel: 'سازنده',
                    aboutCreatorName: 'محمدحسین شمسی',
                    aboutFollowLabel: 'ما را دنبال کنید',
                    aboutClose: 'بستن',
                    startSubtitle: 'مسیر برد از اینجا شروع می‌شود',
                    howToPlay: 'آموزش بازی',
                    modeClassicTitle: 'بازی کلاسیک',
                    modeClassicShort: 'کلاسیک',
                    modeClassicDesc: 'با گذاشتن دیوار جلوی حریف را بگیر و زودتر به سمت مقابل برس.',
                    modeClassicBadge: '۲-۴',
                    pc2Label: 'دو نفره',
                    pc4Label: 'چهار نفره',
                    modeOnlineTitle: 'بازی آنلاین',
                    modeOnlineDesc: 'با یک دوست از راه دور بازی کن؛ یکی اتاق می‌سازد، دیگری با کد وصل می‌شود',
                    onlineHeroTitle: 'بازی آنلاین',
                    onlinePick2pLabel: 'کلاسیک ۱ در برابر ۱',
                    onlinePick4pLabel: 'چهار نفره',
                    onlinePickHunterLabel: 'شکارچی و فراری',
                    onlineCreateTitle: 'ساخت اتاق',
                    onlineCreateDesc: 'یک کد بساز و برای حریف بفرست',
                    onlineJoinTitle: 'پیوستن با کد',
                    onlineJoinDesc: 'کد حریف را وارد کن',
                    onlineBackLabel: 'بازگشت',
                    onlineCodeHint: 'این کد را برای حریفت بفرست',
                    onlineCancelLabel: 'لغو',
                    onlineConnectLabel: 'اتصال',
                    onlineCopyCodeAria: 'کپی کد',
                    modeHunterTitle: 'گرگ مقابل میش',
                    modeHunterDesc: 'یکی فرار می‌کند، یکی شکار می‌کند — برنده کسی است که زودتر برسد.',
                    move: 'حرکت',
                    horizontal: 'افقی',
                    vertical: 'عمودی',
                    undo: 'واگرد',
                    repeat: 'تکرار',
                    resign: 'انصراف',
                    newGame: 'بازگشت به خانه',
                    moveHistory: 'تاریخچه حرکات',
                    startGame: 'یک بازی را شروع کنید',
                    gameInfo: 'اطلاعات بازی',
                    mode: 'حالت',
                    wallsLeft: 'دیوار باقی‌مانده',
                    status: 'وضعیت',
                    objective: 'هدف',
                    walls: 'دیوارها',
                    wallsText: '• برای انتخاب دیوار، لمس کنید سپس تایید کنید.<br>• هر بازیکن ۱۰ دیوار دارد.',
                    wallsText4p: '• برای انتخاب دیوار، لمس کنید سپس تایید کنید.<br>• هر بازیکن ۶ دیوار دارد، به‌صورت دو تیم دونفره.',
                    wallsTextHunter: '• برای انتخاب دیوار، لمس کنید سپس تایید کنید.<br>• بازمانده: ۱۰ دیوار، شکارچی: ۸ دیوار.',
                    rules: 'قوانین',
                    rulesText: '• هیچ دیواری نباید مسیر را کاملاً ببندد.<br>• دیوارها نباید هم‌پوشانی داشته یا به‌شکل "+" با هم تلاقی کنند.',
                    placeWall: 'قرار دادن دیوار',
                    match: 'مسابقه',
                    vs: 'مقابل',
                    gameOver: 'پایان بازی',
                    turnSuffix: ' نوبت اوست',
                    mode2p: 'دو نفره',
                    mode4p: 'چهار نفره',
                    modeHunter: 'گرگ و میش',
                    objective2p: 'زودتر از حریف به سمت مقابل برسید.',
                    objective4p: 'هر دو هم‌تیمی باید زودتر از تیم مقابل به لبه‌ی هدف خود برسند.',
                    objectiveHunter: '• بازمانده باید به سمت مقابل برسد\n• شکارچی باید با رفتن به خانه بازمانده زودتر اورا شکار کند یا ۷ بار به میش نزدیک شود',
                    teamA: 'تیم الف',
                    teamB: 'تیم ب',
                    players: {
                        player1: 'بازیکن ۱ (قرمز)',
                        player2: 'بازیکن ۲ (آبی)',
                        red: 'قرمز',
                        blue: 'آبی',
                        green: 'سبز',
                        yellow: 'زرد',
                        hunterRole: 'شکارچی (قرمز)',
                        escaperRole: 'بازمانده (آبی)'
                    },
                    roleHunter: 'شکارچی',
                    roleEscaper: 'بازمانده',
                    teamNames: {
                        0: 'قرمز و آبی',
                        1: 'سبز و زرد'
                    },
                    alertPerpendicular: 'دیوارها نمی‌توانند به‌صورت عمود بر هم تلاقی کنند!',
                    alertBlocked: 'این دیوار مسیر را کاملاً می‌بندد — مجاز نیست!',
                    alertWins: '{name} برنده شد!',
                    alertTeamWins: 'تیم {team} برنده شد!',
                    confirmResign: '{name} انصراف می‌دهد — بازی تمام شود؟',
                    resignWinner: '{name} انصراف داد! برنده: {winner}',
                    resignTeamWinner: '{name} انصراف داد! تیم {team} برنده شد!',
                    confirmNewGame: 'به خانه بازگردید؟ پیشرفت فعلی از بین می‌رود.',
                    confirmRepeat: 'همین بازی با همین بازیکنان دوباره تکرار شود؟',
                    nameEntryTitle: 'اسم بازیکنان را وارد کنید',
                    startGameBtn: 'شروع بازی',
                    backBtn: 'بازگشت',
                    toastNoWalls: 'دیگر دیواری برای گذاشتن ندارید!',
                    toastWallExists: 'در این محل از قبل دیوار قرار دارد.',
                    toastInvalidMove: 'نمی‌توانید به آنجا حرکت کنید.',
                    toastNothingToUndo: 'چیزی برای واگرد کردن وجود ندارد.',
                    dangerWarning: 'شکارچی درست کنار توست، مراقب باش!',
                    huntProximityToast: 'نزدیک شدن شکارچی: {n}/۷',
                    huntProximityWinToast: 'شکارچی ۷ بار فراری را گیر انداخت!',
                    defaultPlayerNames: ['بازیکن ۱', 'بازیکن ۲', 'بازیکن ۳', 'بازیکن ۴'],
                    goWinnerLabel: 'برنده',
                    goTagWinner: 'برنده',
                    goTagLoser: 'بازنده',
                    goPlayAgain: 'تکرار بازی',
                    goBackHome: 'بازگشت به خانه',
                    confirmYesLabel: 'بله، ادامه بده',
                    confirmNoLabel: 'انصراف',
                    confirmHomeYes: 'بله، بازگشت به خانه',
                    confirmHomeNo: 'ماندن در بازی',
                    confirmRepeatYes: 'بله، تکرار شود',
                    confirmRepeatNo: 'انصراف',
                    confirmResignYes: 'بله، بازی تمام شود',
                    confirmResignNo: 'ادامه بازی',
                    settingsBtn: 'تنظیمات',
                    settingsTitle: 'تنظیمات',
                    settingsLangLabel: 'زبان',
                    settingsLangDesc: 'زبان اپلیکیشن را انتخاب کنید',
                    settingsSoundLabel: 'جلوه‌های صوتی',
                    settingsSoundDesc: 'فعال یا بی‌صدا کردن صدای بازی',
                    onlineLobbyTitle: 'تنظیم اسم و آواتار',
                    onlineLobbyDesc: 'تا {n} ثانیه فرصت داری اسم و رنگ آواتار خودت را تنظیم کنی',
                    onlineLobbyDescHunter: 'تا {n} ثانیه فرصت داری اسم، رنگ آواتار و نقشت را انتخاب کنی',
                    onlineLobbyHint: 'فقط می‌توانی اسم و رنگ خودت را تغییر بدهی',
                    rolePickTitle: 'نقشت رو انتخاب کن',
                    rolePickEscaper: 'بازمانده',
                    rolePickHunter: 'شکارچی',
                    rolePickStatusMe: 'انتخابت: {role}',
                    rolePickStatusWaiting: 'یک نقش انتخاب کن',
                    rolePickStatusOppWaiting: 'در انتظار انتخاب حریف...',
                    rolePickStatusOppChosen: 'حریف هم انتخاب کرد',
                    roleLotteryTitle: 'در حال قرعه‌کشی نقش‌ها...',
                    roleLotteryWaitTitle: 'در حال تعیین نقش‌ها...',
                    roleLotteryResultHunter: 'شکارچی شدی!',
                    roleLotteryResultEscaper: 'بازمانده شدی!',
                    rematchAcceptLabel: 'قبول بازی دوباره حریف',
                    rematchWaitingLabel: 'در انتظار پاسخ حریف...',
                    opponentLeftMsg: 'حریف بازی را ترک کرد',
                    toastRematchRequested: 'حریف درخواست بازی مجدد داد',
                    gtOfflineLabel: 'آفلاین',
                    gtOnlineLabel: 'آنلاین',
                    gtLockHint4p: 'مود چهار نفره فقط به‌صورت آفلاین قابل بازی است',
                    onlineNameLockTitle: 'اسم و آواتار داخل اتاق تنظیم می‌شود',
                    onlineNameLockDesc: 'بعد از ساخت یا پیوستن به اتاق، در لابی بازی اسم و رنگ آواتارت را انتخاب می‌کنی.',
                    timerSelectLabel: 'مجموع زمان هر بازیکن',
                    timerUnitSec: 'ثانیه',
                    timerUnitMin: 'دقیقه',
                    timerNoneLabel: 'بدون تایمر',
                    onlineCodeEntryLabel: 'پیوستن با کد',
                    timeUpToast: 'وقت {name} تمام شد و نوبتش از دست رفت'
                }
            };
            let currentLang = localStorage.getItem('barricade-lang') || 'fa';

            function t(key) {
                const str = translations[currentLang][key];
                return (str === undefined) ? translations.en[key] : str
            }

            function toFaDigits(str) {
                const map = {
                    '0': '۰',
                    '1': '۱',
                    '2': '۲',
                    '3': '۳',
                    '4': '۴',
                    '5': '۵',
                    '6': '۶',
                    '7': '۷',
                    '8': '۸',
                    '9': '۹'
                };
                return String(str).replace(/[0-9]/g, d => map[d])
            }

            function localizeNum(n) {
                return currentLang === 'fa' ? toFaDigits(n) : String(n)
            }

            function fmt(str, params) {
                const localizedParams = {};
                for (const k in params) {
                    localizedParams[k] = typeof params[k] === 'number' ? localizeNum(params[k]) : params[k]
                }
                return str.replace(/\{(\w+)\}/g, (m, k) => (localizedParams[k] !== undefined ? localizedParams[k] : m))
            }

            function setTextContent(elId, text) {
                const el = document.getElementById(elId);
                if (el) el.textContent = text
            }

            function escapeHTML(str) {
                return String(str).replace(/[&<>"]/g, function(m) {
                    if (m === '&') return '&amp;';
                    if (m === '<') return '&lt;';
                    if (m === '>') return '&gt;';
                    if (m === '"') return '&quot;';
                    return m
                })
            }

            function showToast(message) {
                const container = document.getElementById('toast-container');
                if (!container) return;
                container.innerHTML = '';
                const el = document.createElement('div');
                el.className = 'toast';
                el.textContent = message;
                container.appendChild(el);
                requestAnimationFrame(() => el.classList.add('show'));
                setTimeout(() => {
                    el.classList.remove('show');
                    setTimeout(() => el.remove(), 300)
                }, 2600)
            }
            const startOverlay = document.getElementById('start-overlay');
            const appEl = document.getElementById('app');
            const topbarEl = document.getElementById('topbar');
            const boardWrapper = document.getElementById('board-wrapper');
            const btnMove = document.getElementById('btn-move');
            const btnHWall = document.getElementById('btn-hwall');
            const btnVWall = document.getElementById('btn-vwall');
            const btnUndo = document.getElementById('btn-undo');
            const btnRepeat = document.getElementById('btn-repeat');
            const btnResign = document.getElementById('btn-resign');
            const btnHome = document.getElementById('btn-home');
            const historyList = document.getElementById('history-list');
            const statusText = document.getElementById('status-text');
            const infoMode = document.getElementById('info-mode');
            const infoWalls = document.getElementById('info-walls');
            const infoObjective = document.getElementById('info-objective');
            const wallConfirmPopup = document.getElementById('wall-confirm-popup');
            const wallConfirmYes = document.getElementById('wall-confirm-yes');
            const wallConfirmNo = document.getElementById('wall-confirm-no');
            const gameOverOverlay = document.getElementById('game-over-overlay');
            const confirmOverlay = document.getElementById('confirm-overlay');
            const confirmText = document.getElementById('confirm-text');
            const confirmBtnYes = document.getElementById('confirm-btn-yes');
            const confirmBtnNo = document.getElementById('confirm-btn-no');
            let confirmResolver = null;

            function showConfirmDialog(message, yesLabel, noLabel) {
                confirmText.textContent = message;
                setTextContent('lbl-confirm-yes', yesLabel || t('confirmYesLabel'));
                setTextContent('lbl-confirm-no', noLabel || t('confirmNoLabel'));
                confirmOverlay.classList.add('visible');
                return new Promise((resolve) => {
                    confirmResolver = resolve
                })
            }

            function closeConfirmDialog(result) {
                confirmOverlay.classList.remove('visible');
                if (confirmResolver) {
                    const resolve = confirmResolver;
                    confirmResolver = null;
                    resolve(result)
                }
            }
            confirmBtnYes.onclick = () => closeConfirmDialog(true);
            confirmBtnNo.onclick = () => closeConfirmDialog(false);
            confirmOverlay.addEventListener('click', (e) => {
                if (e.target.id === 'confirm-overlay') closeConfirmDialog(false)
            });
            const goWinnerName = document.getElementById('go-winner-name');
            const goNameWinner = document.getElementById('go-name-winner');
            const goNameLoser = document.getElementById('go-name-loser');
            const btnGoRepeat = document.getElementById('btn-go-repeat');
            const btnGoHome = document.getElementById('btn-go-home');

            // ================= ONLINE MULTIPLAYER (WebRTC via PeerJS, no game logic changed) =================
            const onlineModeSelectView = document.getElementById('online-mode-pick');
            const onlineChoiceView = document.getElementById('online-choice-view');
            const onlineCreateView = document.getElementById('online-create-view');
            const onlineJoinView = document.getElementById('online-join-view');
            const onlineSetupView = document.getElementById('online-setup-view');
            const onlineStatusText = document.getElementById('online-status-text');
            const onlineCodeBox = document.getElementById('online-code-box');
            const onlineJoinInput = document.getElementById('online-join-input');
            const onlineJoinStatus = document.getElementById('online-join-status');
            // Room-code field that now lives on the settings screen (next to
            // the timer picker) instead of its own separate "Join with code"
            // step — typing a code here and confirming connects directly.
            const onlineNameEntryCodeInput = document.getElementById('online-name-entry-code');
            if (onlineNameEntryCodeInput) {
                onlineNameEntryCodeInput.addEventListener('input', () => {
                    onlineNameEntryCodeInput.value = onlineNameEntryCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)
                })
            }

            // ===== OTP-style room-code boxes: keep them in sync with the hidden #online-join-input =====
            const otpBoxes = Array.from(document.querySelectorAll('.otp-box'));

            function otpSyncHiddenInput() {
                onlineJoinInput.value = otpBoxes.map(b => b.value).join('')
            }

            function otpClear() {
                otpBoxes.forEach(b => { b.value = ''; b.classList.remove('filled', 'otp-error') });
                otpSyncHiddenInput()
            }

            function otpShakeError() {
                otpBoxes.forEach(b => b.classList.add('otp-error'));
                setTimeout(() => otpBoxes.forEach(b => b.classList.remove('otp-error')), 340)
            }
            otpBoxes.forEach((box, idx) => {
                box.addEventListener('input', () => {
                    box.value = box.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-1);
                    box.classList.toggle('filled', !!box.value);
                    otpSyncHiddenInput();
                    if (box.value && idx < otpBoxes.length - 1) otpBoxes[idx + 1].focus()
                });
                box.addEventListener('keydown', (e) => {
                    if (e.key === 'Backspace' && !box.value && idx > 0) {
                        otpBoxes[idx - 1].focus();
                        otpBoxes[idx - 1].value = '';
                        otpBoxes[idx - 1].classList.remove('filled');
                        otpSyncHiddenInput()
                    } else if (e.key === 'ArrowLeft' && idx > 0) {
                        otpBoxes[idx - 1].focus()
                    } else if (e.key === 'ArrowRight' && idx < otpBoxes.length - 1) {
                        otpBoxes[idx + 1].focus()
                    } else if (e.key === 'Enter') {
                        document.getElementById('btn-online-connect').click()
                    }
                });
                box.addEventListener('paste', (e) => {
                    e.preventDefault();
                    const text = (e.clipboardData || window.clipboardData).getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '');
                    if (!text) return;
                    otpBoxes.forEach((b, i) => {
                        b.value = text[i] || '';
                        b.classList.toggle('filled', !!b.value)
                    });
                    otpSyncHiddenInput();
                    const nextEmpty = otpBoxes.find(b => !b.value);
                    (nextEmpty || otpBoxes[otpBoxes.length - 1]).focus()
                })
            });

            function omsg(fa, en) { return currentLang === 'fa' ? fa : en }

            const onlineState = {
                active: !1,
                peer: null,
                conn: null,
                isHost: !1,
                localPlayerId: null,
                mode: '2p',
                applyingRemote: !1,
                peerLeft: !1,
                timerSeconds: 120
            };

            const onlineRematch = {
                requestedByMe: !1,
                requestedByOpponent: !1
            };

            // Which player id (0 or 1) is the hunter in hunter/wolf-vs-sheep
            // mode — decided by the online role-pick/lottery flow before each
            // game start, and kept as-is across rematches until re-decided.
            let onlineHunterRoleId = 1;

            // Setup-lobby countdown: hunter/wolf-vs-sheep mode gets extra time
            // since players also have to pick a role in it; other modes just
            // set name/avatar.
            const ONLINE_LOBBY_SECONDS_HUNTER = 27;
            const ONLINE_LOBBY_SECONDS_DEFAULT = 18;

            function lobbySecondsForMode(mode) {
                return mode === 'hunter' ? ONLINE_LOBBY_SECONDS_HUNTER : ONLINE_LOBBY_SECONDS_DEFAULT
            }
            const onlineLobby = {
                me: { name: '', color: '#E74C3C' },
                othersById: {},
                mySlot: 'p1',
                timer: null,
                totalSeconds: ONLINE_LOBBY_SECONDS_DEFAULT,
                secondsLeft: ONLINE_LOBBY_SECONDS_DEFAULT,
                deadline: null,
                // --- hunter-mode role pick/lottery state ---
                myRolePick: null,
                oppRolePick: null,
                roleDecision: null,
                awaitingRoleDecision: !1,
                roleFinalizeDone: !1
            };

            function genRoomCode() {
                const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
                let s = '';
                for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
                return s
            }

            function sendOnline(data) {
                if (window.FBRoom && window.FBRoom._roomCode) {
                    window.FBRoom.send(data)
                }
            }

            function resetOnlineSetupUI() {
                onlineModeSelectView.style.display = 'block';
                onlineChoiceView.style.display = 'none';
                onlineCreateView.style.display = 'none';
                onlineJoinView.style.display = 'none';
                onlineJoinView.classList.remove('autoconnecting');
                otpClear();
                onlineJoinStatus.textContent = ''
            }

            // Back out of the create/join waiting screens to the settings
            // screen (timer + room-code field), so the player can fix the
            // code or change the timer and try again — this replaces the
            // old "back to the create/join picker" behavior, since that
            // in-between picker screen is no longer part of the flow.
            function backToOnlineSettings() {
                onlineSetupView.style.display = 'none';
                document.getElementById('name-entry-view').style.display = 'block'
            }

            function teardownOnline(notifyPeer) {
                if (notifyPeer) sendOnline({ type: 'leave' });
                if (window.FBRoom) { try { window.FBRoom.leaveRoom() } catch (e) {} }
                onlineState.active = !1;
                onlineState.peer = null;
                onlineState.conn = null;
                onlineState.localPlayerId = null;
                onlineState.peerLeft = !1;
                onlineRematch.requestedByMe = !1;
                onlineRematch.requestedByOpponent = !1;
                if (onlineLobby.timer) { clearInterval(onlineLobby.timer); onlineLobby.timer = null }
                stopTurnTimer();
                turnTimerPlayerId = null;
                const lobbyView = document.getElementById('online-lobby-view');
                if (lobbyView) lobbyView.style.display = 'none';
                hideTurnBanner()
            }

            function isMyOnlineTurn() {
                if (!onlineState.active) return !0;
                const p = currentPlayer();
                return !!p && p.id === onlineState.localPlayerId
            }

            document.getElementById('btn-start-online').onclick = () => {
                onlineEntryFromNameEntry = false;
                document.getElementById('mode-select-view').style.display = 'none';
                onlineSetupView.style.display = 'block';
                resetOnlineSetupUI()
            };
            // Picking a mode here now goes straight to the settings screen
            // (timer + room-code field) instead of an extra "create or join"
            // picker screen — one less step, and it's where the code field
            // lives now.
            function enterOnlinePresetSettings(mode) {
                onlineState.mode = mode;
                onlineSetupView.style.display = 'none';
                showNameEntry(mode, mode !== 'hunter');
                setGameType(!0)
            }
            document.getElementById('btn-online-pick-2p').onclick = () => enterOnlinePresetSettings('2p');
            document.getElementById('btn-online-pick-4p').onclick = () => enterOnlinePresetSettings('4p');
            document.getElementById('btn-online-pick-hunter').onclick = () => enterOnlinePresetSettings('hunter');
            document.getElementById('btn-online-back1').onclick = () => {
                onlineSetupView.style.display = 'none';
                if (onlineEntryFromNameEntry) {
                    onlineEntryFromNameEntry = false;
                    document.getElementById('name-entry-view').style.display = 'block'
                } else {
                    document.getElementById('mode-select-view').style.display = 'block'
                }
                resetOnlineSetupUI()
            };

            const networkHintMsg = omsg(
                'اتصال برقرار نشد. لطفاً اینترنتت را چک کن و دوباره امتحان کن.',
                'Could not connect. Please check your internet connection and try again.'
            );
            const rateLimitedMsg = omsg(
                'درخواست‌های زیادی فرستادی. چند لحظه صبر کن و دوباره امتحان کن.',
                "You're sending requests too fast. Wait a bit and try again."
            );
            const serverFullMsg = omsg(
                'سرور بازی الان شلوغه. چند لحظه دیگه دوباره امتحان کن.',
                'The game server is at capacity right now. Please try again shortly.'
            );

            function onlineErrorMessage(e) {
                const code = e && (e.code || e.message);
                if (code === 'rate-limited') return rateLimitedMsg;
                if (code === 'server-full') return serverFullMsg;
                return networkHintMsg + '\n[debug: ' + (code || e) + ']'
            }

            function attachRoomMessageListener() {
                window.FBRoom.onMessage((data) => { handleOnlineData(data) })
            }

            function attachRoomPresenceListener(maxPlayers) {
                window.FBRoom.onPresence(maxPlayers, (playersObj) => {
                    onOnlinePresenceChange(playersObj)
                })
            }

            function onlineMaxPlayers() {
                return onlineState.mode === '4p' ? 4 : 2
            }

            // Create-room flow, now reached directly from the settings screen
            // (name-entry-view) when the room-code field was left empty —
            // the separate "Create room" card/screen is no longer a required
            // step in between.
            async function startOnlineCreateFlow() {
                onlineChoiceView.style.display = 'none';
                onlineCreateView.style.display = 'flex';
                onlineCodeBox.textContent = '...';
                onlineStatusText.textContent = omsg('در حال آماده‌سازی اتاق...', 'Setting up room...');
                onlineState.isHost = !0;
                onlineState._startSent = !1;
                const maxP = onlineMaxPlayers();
                try {
                    const code = await window.FBRoom.createRoom(maxP);
                    const slot = await window.FBRoom.joinRoom(code, maxP);
                    onlineState.localPlayerId = slot;
                    onlineCodeBox.textContent = code;
                    onlineStatusText.textContent = maxP === 2 ?
                        omsg('در انتظار پیوستن حریف...', 'Waiting for opponent to join...') :
                        omsg('در انتظار پیوستن بازیکن‌ها...', 'Waiting for players to join...');
                    attachRoomMessageListener();
                    attachRoomPresenceListener(maxP);
                    window.FBRoom.onPresence(maxP, (playersObj) => {
                        if (onlineState.active) return;
                        const others = [];
                        for (let i = 0; i < maxP; i++) if (i !== slot) others.push(i);
                        const allJoined = playersObj && others.every(i => playersObj[i] && playersObj[i].connected);
                        if (allJoined && !onlineState._startSent) {
                            onlineState._startSent = !0;
                            onlineStatusText.textContent = maxP === 2 ?
                                omsg('حریف متصل شد!', 'Opponent connected!') :
                                omsg('همه متصل شدند!', 'Everyone connected!');
                            sendOnline({ type: 'start', mode: onlineState.mode, timerSeconds: onlineState.timerSeconds });
                            beginOnlineGame(onlineState.mode)
                        }
                    })
                } catch (e) {
                    onlineStatusText.textContent = onlineErrorMessage(e)
                }
            }
            document.getElementById('btn-online-create').onclick = startOnlineCreateFlow;
            document.getElementById('btn-online-copy-code').onclick = () => {
                const code = onlineCodeBox.textContent;
                if (code && navigator.clipboard) {
                    navigator.clipboard.writeText(code).then(() => {
                        showToast(omsg('کد کپی شد', 'Code copied'));
                        const btn = document.getElementById('btn-online-copy-code');
                        btn.classList.add('copied');
                        setTimeout(() => btn.classList.remove('copied'), 1400)
                    }).catch(() => {})
                }
            };
            document.getElementById('btn-online-cancel-create').onclick = () => {
                teardownOnline(!1);
                onlineCreateView.style.display = 'none';
                backToOnlineSettings()
            };
            document.getElementById('btn-online-join').onclick = () => {
                onlineChoiceView.style.display = 'none';
                onlineJoinView.style.display = 'flex';
                onlineJoinView.classList.remove('autoconnecting');
                otpClear();
                setTimeout(() => otpBoxes[0] && otpBoxes[0].focus(), 60)
            };
            document.getElementById('btn-online-cancel-join').onclick = () => {
                teardownOnline(!1);
                onlineJoinView.style.display = 'none';
                onlineJoinView.classList.remove('autoconnecting');
                backToOnlineSettings()
            };
            // Join-room flow. `code` normally comes straight from the
            // room-code field on the settings screen; `fromOtp` is used by
            // the (now-fallback) manual OTP boxes so their own error-shake
            // still works if that path is ever reached.
            async function startOnlineJoinFlow(code, fromOtp) {
                onlineState.isHost = !1;
                onlineJoinStatus.textContent = omsg('در حال اتصال...', 'Connecting...');
                const maxP = onlineMaxPlayers();
                try {
                    const exists = await window.FBRoom.roomExists(code);
                    if (!exists) {
                        onlineJoinStatus.textContent = omsg('اتاقی با این کد پیدا نشد', 'No room found with this code');
                        if (fromOtp) otpShakeError();
                        return
                    }
                    const slot = await window.FBRoom.joinRoom(code, maxP);
                    onlineState.localPlayerId = slot;
                    onlineJoinStatus.textContent = omsg('متصل شد! در انتظار شروع بازی...', 'Connected! Waiting for the game to start...');
                    attachRoomMessageListener();
                    attachRoomPresenceListener(maxP)
                } catch (e) {
                    const code = e && (e.code || e.message);
                    if (code === 'full') {
                        onlineJoinStatus.textContent = omsg('این اتاق پر است', 'This room is full');
                        if (fromOtp) otpShakeError();
                        return
                    }
                    onlineJoinStatus.textContent = onlineErrorMessage(e);
                    if (fromOtp && code !== 'rate-limited' && code !== 'server-full') otpShakeError()
                }
            }
            document.getElementById('btn-online-connect').onclick = () => {
                const raw = onlineJoinInput.value.trim().toUpperCase();
                if (raw.length < 5) { otpShakeError(); return }
                onlineChoiceView.style.display = 'none';
                onlineJoinView.style.display = 'flex';
                startOnlineJoinFlow(raw, !0)
            };

            function onOnlinePresenceChange(playersObj) {
                if (!onlineState.active) return;
                const maxP = onlineMaxPlayers();
                for (let i = 0; i < maxP; i++) {
                    if (i === onlineState.localPlayerId) continue;
                    const p = players.find(pl => pl.id === i);
                    const other = playersObj && playersObj[i];
                    if (p && !p.forfeited && !p.finished && other && other.connected === !1) {
                        if (gameMode === '4p') {
                            performForfeit4p(p);
                            showToast(fmt2(omsg('{name} از بازی خارج شد', '{name} disconnected'), playerDisplayName(p)))
                        } else if (!onlineState.peerLeft) {
                            onlineState.peerLeft = !0;
                            if (typeof gameOver !== 'undefined' && gameOver) {
                                showToast(omsg('حریف بازی را ترک کرد', 'Opponent left the game'));
                                refreshGameOverDialogOnlineState()
                            } else {
                                showToast(omsg('اتصال حریف قطع شد', 'Opponent disconnected'));
                                teardownOnline(!1);
                                goHome()
                            }
                        }
                    }
                }
            }

            function fmt2(str, name) {
                return str.replace('{name}', name)
            }

            function beginOnlineGame(mode) {
                onlineState.active = !0;
                onlineState.mode = mode;
                onlineState.peerLeft = !1;
                currentTurnTimerSeconds = onlineState.timerSeconds || DEFAULT_TIMER_SECONDS;
                document.getElementById('name-entry-view').style.display = 'none';
                onlineSetupView.style.display = 'none';
                showOnlineLobby(mode)
            }

            function handleOnlineData(data) {
                if (!data || !data.type) return;
                if (data.type === 'start') {
                    onlineState.timerSeconds = data.timerSeconds || DEFAULT_TIMER_SECONDS;
                    beginOnlineGame(data.mode);
                    return
                }
                onlineState.applyingRemote = !0;
                try {
                    if (data.type === 'move') {
                        executeMove(data.row, data.col)
                    } else if (data.type === 'wall') {
                        pendingWallPos = { row: data.row, col: data.col, mode: data.mode };
                        confirmWall()
                    } else if (data.type === 'resign') {
                        const resignedPlayer = (data.playerId !== undefined) ? players.find(p => p.id === data.playerId) : null;
                        performResign(resignedPlayer || currentPlayer())
                    } else if (data.type === 'forfeit') {
                        const p = players.find(p => p.id === data.playerId);
                        if (p && !p.forfeited) performForfeit4p(p)
                    } else if (data.type === 'rematch-request') {
                        if (onlineRematch.requestedByMe) {
                            onlineRematch.requestedByMe = !1;
                            onlineRematch.requestedByOpponent = !1;
                            restartSameGame()
                        } else {
                            onlineRematch.requestedByOpponent = !0;
                            refreshGameOverDialogOnlineState();
                            showToast(t('toastRematchRequested'))
                        }
                    } else if (data.type === 'rematch-accept') {
                        onlineRematch.requestedByMe = !1;
                        onlineRematch.requestedByOpponent = !1;
                        restartSameGame()
                    } else if (data.type === 'role-pick') {
                        onlineLobby.oppRolePick = data.role;
                        updateRolePickStatusUI()
                    } else if (data.type === 'role-decision') {
                        onlineLobby.roleDecision = { hunterId: data.hunterId, lottery: !!data.lottery };
                        if (onlineLobby.awaitingRoleDecision) {
                            onlineLobby.awaitingRoleDecision = !1;
                            revealHunterRolesAndFinalize(onlineState.mode, onlineLobby.roleDecision)
                        }
                    } else if (data.type === 'profile') {
                        const pid = (data.id !== undefined) ? data.id : (onlineState.localPlayerId === 0 ? 1 : 0);
                        onlineLobby.othersById[pid] = { name: (data.name || '').slice(0, 13), color: data.color || customColor(slotNameForId(onlineState.mode, pid)) };
                        updateOnlineOppUI()
                    } else if (data.type === 'timer-sync') {
                        // Authoritative deadline from whichever device's player
                        // just started their turn — replaces our own
                        // provisional estimate so both devices count down from
                        // the exact same real-world instant, regardless of the
                        // network delay it took this message to arrive.
                        turnTimerPlayerId = data.playerId;
                        turnTimerDeadline = data.deadline;
                        if (!turnTimerInterval) turnTimerInterval = setInterval(tickTurnTimer, 250);
                        renderAllPlayerClocks()
                    }
                } finally {
                    onlineState.applyingRemote = !1
                }
            }
            // ================= END ONLINE MULTIPLAYER =================

            let gameMode = '2p';
            let players = [];
            let turnOrder = [];
            let turnIndex = 0;
            let turn = 0;
            let hWalls = Array.from({ length: 9 }, () => Array(9).fill(!1));
            let vWalls = Array.from({ length: 9 }, () => Array(9).fill(!1));
            let uiMode = 'move';
            let gameOver = !1;
            let history = [];
            let undoStack = [];
            let currentPage = 0;
            let isAnimating = !1;
            let animData = null;
            let wallAnimation = null;
            let wallPreviewPos = null;
            let touchAnchorPos = null;
            let touchDidMove = false;
            let pendingWallPos = null;
            let selectedMode = '2p';
            let huntProximity = 0;
            const HUNT_PROXIMITY_MAX = 7;

            // ================= TURN TIMER (graphic/UX addition — reuses existing resign flow, no core game logic changed) =================
            // Each player gets a total time BANK for the whole game (like a chess clock),
            // not a per-turn reset. Only the current player's bank ticks down; it pauses
            // on their opponent's turn and resumes exactly where it left off.
            const DEFAULT_TIMER_SECONDS = 120;
            let selectedGameTypeOnline = false;
            let selectedTimerSeconds = DEFAULT_TIMER_SECONDS;
            let currentTurnTimerSeconds = DEFAULT_TIMER_SECONDS;
            let turnTimerInterval = null;
            let turnTimerPlayerId = null;
            // Absolute real-world timestamp (Date.now()) at which the current
            // player's time bank hits zero. We always recompute the remaining
            // time from this fixed target instead of subtracting 1 on every
            // tick, so the displayed number can never drift out of sync with
            // real elapsed time — regardless of setInterval jitter, a
            // backgrounded/throttled tab, or a device that briefly slept.
            // This is what keeps the two players' clocks (and two devices)
            // agreeing with each other instead of slowly falling behind.
            let turnTimerDeadline = null;
            let onlineEntryFromNameEntry = false;

            function timerIsEnabled() {
                return !!currentTurnTimerSeconds
            }

            function initPlayerTimeBanks() {
                if (!timerIsEnabled()) { players.forEach(p => { p.timeBank = null }); return }
                players.forEach(p => { p.timeBank = currentTurnTimerSeconds })
            }

            function formatTimerLabel(secs) {
                if (secs < 0) secs = 0;
                const m = Math.floor(secs / 60),
                    s = secs % 60;
                const str = m > 0 ? (m + ':' + String(s).padStart(2, '0')) : ('0:' + String(s).padStart(2, '0'));
                return currentLang === 'fa' ? toFaDigits(str) : str
            }

            function stopTurnTimer() {
                if (turnTimerInterval) { clearInterval(turnTimerInterval); turnTimerInterval = null }
            }

            function renderAllPlayerClocks() {
                document.querySelectorAll('.player-timer').forEach(el => {
                    el.classList.remove('visible', 'ticking', 'warning', 'critical');
                    if (!timerIsEnabled()) return;
                    const pid = parseInt(el.dataset.playerId, 10);
                    const p = players.find(pl => pl.id === pid);
                    if (!p) return;
                    const bank = (p.timeBank != null) ? p.timeBank : currentTurnTimerSeconds;
                    el.classList.add('visible');
                    const timeEl = el.querySelector('.pt-time');
                    if (timeEl) timeEl.textContent = formatTimerLabel(bank);
                    const fillEl = el.querySelector('.pt-fill');
                    if (fillEl) {
                        const pct = currentTurnTimerSeconds > 0 ? Math.max(0, Math.min(1, bank / currentTurnTimerSeconds)) : 1;
                        fillEl.style.width = (pct * 100).toFixed(1) + '%';
                    }
                    const isActiveTurn = !gameOver && p.id === turn;
                    el.classList.toggle('ticking', isActiveTurn);
                    if (bank <= 10) el.classList.add('critical');
                    else if (bank <= Math.max(11, Math.ceil(currentTurnTimerSeconds * 0.3))) el.classList.add('warning')
                })
            }

            function tickTurnTimer() {
                const p = currentPlayer();
                if (!p) { stopTurnTimer(); return }
                // Recompute remaining time from the fixed deadline every tick —
                // never from "previous value minus one" — so any delay in when
                // this tick actually fired (throttled background tab, slow
                // device, etc.) is automatically corrected instead of
                // accumulating into drift.
                const remainingMs = turnTimerDeadline - Date.now();
                const remainingSecs = Math.max(0, Math.ceil(remainingMs / 1000));
                if (p.timeBank !== remainingSecs) {
                    p.timeBank = remainingSecs;
                    renderAllPlayerClocks()
                }
                if (remainingMs <= 0) {
                    stopTurnTimer();
                    handleTurnTimeout()
                }
            }

            function startTurnTimer() {
                stopTurnTimer();
                if (!timerIsEnabled() || gameOver) { renderAllPlayerClocks(); return }
                const p = currentPlayer();
                if (!p) { renderAllPlayerClocks(); return }
                const bank = (p.timeBank != null) ? p.timeBank : currentTurnTimerSeconds;
                // In online mode, only the device whose own player's turn is
                // starting is authoritative for the deadline — it computes it
                // once from its own clock and broadcasts it. The other device
                // must NOT compute its own deadline independently: doing so
                // means each side anchors "now" at a different real-world
                // moment (whenever the move message happens to arrive on
                // their end), which is exactly what caused the two players'
                // clocks to disagree. The non-owner sets a provisional value
                // here only so the UI isn't blank for the instant before the
                // 'timer-sync' message (sent right below) arrives; it gets
                // overwritten the moment that message is handled.
                turnTimerDeadline = Date.now() + bank * 1000;
                if (onlineState.active && isMyOnlineTurn()) {
                    sendOnline({ type: 'timer-sync', playerId: p.id, deadline: turnTimerDeadline })
                }
                renderAllPlayerClocks();
                // Ticking more often than once a second just means the on-screen
                // number and the progress bar update smoothly; the actual
                // countdown accuracy comes from the deadline check above, not
                // from this interval's timing.
                turnTimerInterval = setInterval(tickTurnTimer, 250)
            }

            function syncTurnTimer() {
                if (gameOver || !players.length) {
                    stopTurnTimer();
                    turnTimerPlayerId = null;
                    renderAllPlayerClocks();
                    return
                }
                if (!timerIsEnabled()) { stopTurnTimer(); renderAllPlayerClocks(); return }
                const p = currentPlayer();
                if (!p) return;
                if (p.id !== turnTimerPlayerId) {
                    turnTimerPlayerId = p.id;
                    startTurnTimer()
                } else {
                    renderAllPlayerClocks()
                }
            }

            // If the tab was backgrounded (screen off, switched app, etc.),
            // browsers throttle or fully pause timers. The moment the tab is
            // visible again, force an immediate recompute instead of waiting
            // for the next tick, so the number snaps to the correct value
            // right away rather than sitting stale for a second.
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    if (turnTimerInterval) tickTurnTimer();
                    if (onlineLobby.timer) tickOnlineLobbyCountdown()
                }
            });

            function handleTurnTimeout() {
                if (gameOver) return;
                const p = currentPlayer();
                if (!p) return;
                if (onlineState.active) {
                    if (!isMyOnlineTurn()) return;
                    showToast(fmt(t('timeUpToast'), { name: playerDisplayName(p) }));
                    performResign(p);
                    sendOnline({ type: 'resign', playerId: p.id })
                } else {
                    showToast(fmt(t('timeUpToast'), { name: playerDisplayName(p) }));
                    performResign(p)
                }
            }
            // ================= END TURN TIMER =================
            let captureAnim = null;

            function isAdjacent(r1, c1, r2, c2) {
                return (Math.abs(r1 - r2) + Math.abs(c1 - c2)) === 1
            }
            let currentNames = {
                p1: localStorage.getItem('barricade-name-p1') || '',
                p2: localStorage.getItem('barricade-name-p2') || '',
                red: localStorage.getItem('barricade-name-red') || '',
                blue: localStorage.getItem('barricade-name-blue') || '',
                green: localStorage.getItem('barricade-name-green') || '',
                yellow: localStorage.getItem('barricade-name-yellow') || '',
                hunter: localStorage.getItem('barricade-name-hunter') || '',
                escaper: localStorage.getItem('barricade-name-escaper') || ''
            };
            const CUSTOM_COLORS = ['#E74C3C', '#E91E63', '#FF5722', '#FF9800', '#F1C40F', '#CDDC39', '#8BC34A', '#2ECC71', '#1ABC9C', '#00BCD4', '#03A9F4', '#3498DB', '#2979FF', '#3F51B5', '#673AB7', '#9C27B0', '#E040FB', '#FF4081', '#795548', '#607D8B', '#FF6F00', '#76FF03', '#00E676', '#448AFF'];
            const DEFAULT_COLOR_FOR = {
                p1: '#E74C3C',
                p2: '#3498DB',
                red: '#E74C3C',
                blue: '#3498DB',
                green: '#2ECC71',
                yellow: '#F1C40F',
                hunter: '#E74C3C',
                escaper: '#3498DB'
            };

            function loadCustom(slot) {
                try {
                    return JSON.parse(localStorage.getItem('barricade-custom-' + slot)) || {}
                } catch (e) {
                    return {}
                }
            }
            let currentCustom = {
                p1: loadCustom('p1'),
                p2: loadCustom('p2'),
                red: loadCustom('red'),
                blue: loadCustom('blue'),
                green: loadCustom('green'),
                yellow: loadCustom('yellow'),
                hunter: loadCustom('hunter'),
                escaper: loadCustom('escaper')
            };

            function customColor(slot) {
                return (currentCustom[slot] && currentCustom[slot].color) || DEFAULT_COLOR_FOR[slot]
            }

            function customBackground(slot) {
                return customColor(slot)
            }

            function refreshSwatchUI(slot) {
                const avatarEl = document.getElementById('avatar-preview-' + slot);
                if (avatarEl) {
                    avatarEl.style.background = customColor(slot)
                }
                const colorContainer = document.getElementById('swatches-' + slot);
                if (colorContainer)[...colorContainer.children].forEach(b => {
                    const sel = b.dataset.color === customColor(slot);
                    b.classList.toggle('selected', sel)
                })
                const teamDotEl = document.getElementById('team-dot-' + slot);
                if (teamDotEl) {
                    teamDotEl.style.background = customColor(slot);
                    teamDotEl.style.boxShadow = `0 0 6px ${customColor(slot)}`
                }
            }

            function buildSwatches(slot) {
                const colorContainer = document.getElementById('swatches-' + slot);
                if (!colorContainer) return;
                colorContainer.innerHTML = '';
                if (!currentCustom[slot]) currentCustom[slot] = {};
                CUSTOM_COLORS.forEach(c => {
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.className = 'swatch-btn';
                    b.style.background = c;
                    b.dataset.color = c;
                    b.onclick = () => {
                        currentCustom[slot].color = c;
                        localStorage.setItem('barricade-custom-' + slot, JSON.stringify(currentCustom[slot]));
                        refreshSwatchUI(slot)
                    };
                    colorContainer.appendChild(b)
                });
                refreshSwatchUI(slot)
            }

            // ================= ONLINE LOBBY (live name/avatar setup, online-only) =================
            const SLOT_DPN_INDEX = { p1: 0, p2: 1, hunter: 0, escaper: 1 };
            const FOUR_P_SLOTS = ['red', 'blue', 'green', 'yellow'];

            function slotPlaceholder(slot) {
                const dpn = translations[currentLang].defaultPlayerNames;
                return dpn[SLOT_DPN_INDEX[slot]] || dpn[0]
            }

            function slotNameForId(mode, id) {
                if (mode === '4p') return FOUR_P_SLOTS[id];
                if (mode === 'hunter') return id === 1 ? 'hunter' : 'escaper';
                return id === 0 ? 'p1' : 'p2'
            }

            function lobbyOtherIds(mode) {
                const maxP = mode === '4p' ? 4 : 2;
                const ids = [];
                for (let i = 0; i < maxP; i++) if (i !== onlineState.localPlayerId) ids.push(i);
                return ids
            }

            function lobbySlots(mode) {
                if (mode === 'hunter') {
                    return onlineState.localPlayerId === 0 ? { me: 'escaper', opp: 'hunter' } : { me: 'hunter', opp: 'escaper' }
                }
                return onlineState.localPlayerId === 0 ? { me: 'p1', opp: 'p2' } : { me: 'p2', opp: 'p1' }
            }

            function broadcastOnlineProfile() {
                if (onlineState.active) sendOnline({ type: 'profile', id: onlineState.localPlayerId, name: onlineLobby.me.name, color: onlineLobby.me.color })
            }

            function refreshOnlineLobbySwatchUI() {
                const avatarEl = document.getElementById('avatar-preview-online-me');
                if (avatarEl) avatarEl.style.background = onlineLobby.me.color;
                const container = document.getElementById('swatches-online-me');
                if (container)[...container.children].forEach(b => {
                    b.classList.toggle('selected', b.dataset.color === onlineLobby.me.color)
                })
            }

            function buildOnlineSwatches() {
                const el = document.getElementById('swatches-online-me');
                if (!el) return;
                el.innerHTML = '';
                CUSTOM_COLORS.forEach(c => {
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.className = 'swatch-btn';
                    b.style.background = c;
                    b.dataset.color = c;
                    b.onclick = () => {
                        onlineLobby.me.color = c;
                        localStorage.setItem('barricade-online-color', c);
                        refreshOnlineLobbySwatchUI();
                        broadcastOnlineProfile()
                    };
                    el.appendChild(b)
                })
            }
            buildOnlineSwatches();
            const onlineLobbyNameInput = document.getElementById('input-name-online-me');
            if (onlineLobbyNameInput) {
                onlineLobbyNameInput.oninput = (e) => {
                    onlineLobby.me.name = e.target.value.slice(0, 13);
                    localStorage.setItem('barricade-online-name', onlineLobby.me.name);
                    broadcastOnlineProfile()
                }
            }

            const OPP_CARD_ELS = [
                { avatar: 'avatar-preview-online-opp', name: 'name-online-opp', card: 'online-lobby-opp1-card', badge: 'forfeit-badge-online-opp1' },
                { avatar: 'avatar-preview-online-opp2', name: 'name-online-opp2', card: 'online-lobby-opp2-card', badge: 'forfeit-badge-online-opp2' },
                { avatar: 'avatar-preview-online-opp3', name: 'name-online-opp3', card: 'online-lobby-opp3-card', badge: 'forfeit-badge-online-opp3' }
            ];

            function placeholderForId(mode, id) {
                const dpn = translations[currentLang].defaultPlayerNames;
                if (mode === '4p') return dpn[id] || dpn[0];
                return slotPlaceholder(slotNameForId(mode, id))
            }

            function updateOnlineOppUI() {
                const otherIds = lobbyOtherIds(onlineState.mode);
                OPP_CARD_ELS.forEach((els, idx) => {
                    const cardEl = document.getElementById(els.card);
                    if (idx >= otherIds.length) { if (cardEl) cardEl.style.display = 'none'; return }
                    if (cardEl) cardEl.style.display = '';
                    const id = otherIds[idx];
                    const slot = slotNameForId(onlineState.mode, id);
                    const data = onlineLobby.othersById[id] || { name: '', color: customColor(slot) };
                    const avatarEl = document.getElementById(els.avatar);
                    if (avatarEl) avatarEl.style.background = data.color;
                    const nameEl = document.getElementById(els.name);
                    if (nameEl) nameEl.textContent = (data.name && data.name.trim()) ? data.name.trim() : placeholderForId(onlineState.mode, id)
                })
            }

            function updateOnlineCountdownUI() {
                const el = document.getElementById('online-lobby-countdown');
                const numEl = document.getElementById('online-lobby-countdown-num');
                const secs = Math.max(0, onlineLobby.secondsLeft);
                if (numEl) numEl.textContent = localizeNum(secs);
                const total = onlineLobby.totalSeconds || ONLINE_LOBBY_SECONDS_DEFAULT;
                if (el) el.style.setProperty('--pct', Math.max(0, Math.min(100, (secs / total) * 100)))
            }

            function showOnlineLobby(mode) {
                const meSlot = slotNameForId(mode, onlineState.localPlayerId);
                onlineLobby.mySlot = meSlot;
                const savedOnlineName = localStorage.getItem('barricade-online-name');
                const savedOnlineColor = localStorage.getItem('barricade-online-color');
                onlineLobby.me = {
                    name: (savedOnlineName !== null ? savedOnlineName : (currentNames[meSlot] || '')),
                    color: savedOnlineColor || customColor(meSlot)
                };
                onlineLobby.othersById = {};
                document.getElementById('mode-select-view').style.display = 'none';
                onlineSetupView.style.display = 'none';
                document.getElementById('name-entry-view').style.display = 'none';
                const lobbyView = document.getElementById('online-lobby-view');
                lobbyView.style.display = 'block';
                startOverlay.style.display = 'flex';
                appEl.classList.remove('visible');
                setThemeColor('#000000');
                if (onlineLobbyNameInput) {
                    onlineLobbyNameInput.value = onlineLobby.me.name;
                    onlineLobbyNameInput.placeholder = placeholderForId(mode, onlineState.localPlayerId)
                }
                refreshOnlineLobbySwatchUI();
                updateOnlineOppUI();
                broadcastOnlineProfile();
                // --- hunter-mode role pick reset ---
                onlineLobby.myRolePick = null;
                onlineLobby.oppRolePick = null;
                onlineLobby.roleDecision = null;
                onlineLobby.awaitingRoleDecision = !1;
                onlineLobby.roleFinalizeDone = !1;
                if (btnRolePickEscaper) btnRolePickEscaper.classList.remove('selected');
                if (btnRolePickHunter) btnRolePickHunter.classList.remove('selected');
                if (rolePickSection) rolePickSection.style.display = (mode === 'hunter') ? '' : 'none';
                updateRolePickStatusUI();
                onlineLobby.totalSeconds = lobbySecondsForMode(mode);
                onlineLobby.secondsLeft = onlineLobby.totalSeconds;
                updateOnlineLobbyDescText();
                // Deadline-based, same reasoning as the in-game turn timer: each
                // player's browser starts this lobby countdown at a slightly
                // different real moment (network delay in receiving "start"),
                // and a plain "subtract 1 every 1000ms" timer drifts further
                // from there. Anchoring to a fixed real-world deadline keeps it
                // accurate and keeps both players landing in the game together.
                onlineLobby.deadline = Date.now() + onlineLobby.totalSeconds * 1000;
                updateOnlineCountdownUI();
                if (onlineLobby.timer) clearInterval(onlineLobby.timer);
                onlineLobby.timer = setInterval(tickOnlineLobbyCountdown, 250)
            }

            function tickOnlineLobbyCountdown() {
                const mode = onlineState.mode;
                const remainingMs = onlineLobby.deadline - Date.now();
                onlineLobby.secondsLeft = Math.max(0, Math.ceil(remainingMs / 1000));
                updateOnlineCountdownUI();
                if (remainingMs <= 0) {
                    clearInterval(onlineLobby.timer);
                    onlineLobby.timer = null;
                    if (mode === 'hunter') {
                        handleHunterLobbyDeadline(mode)
                    } else {
                        finalizeOnlineLobby(mode)
                    }
                }
            }

            function updateOnlineLobbyDescText() {
                const mode = onlineState.mode;
                const total = onlineLobby.totalSeconds || lobbySecondsForMode(mode);
                const key = mode === 'hunter' ? 'onlineLobbyDescHunter' : 'onlineLobbyDesc';
                setTextContent('online-lobby-desc', fmt(t(key), { n: total }))
            }

            // --- hunter-mode role pick ---
            const rolePickSection = document.getElementById('online-role-pick-section');
            const btnRolePickEscaper = document.getElementById('btn-role-pick-escaper');
            const btnRolePickHunter = document.getElementById('btn-role-pick-hunter');
            const rolePickStatusEl = document.getElementById('role-pick-status');

            function updateRolePickStatusUI() {
                if (!rolePickStatusEl) return;
                if (!onlineLobby.myRolePick) {
                    rolePickStatusEl.textContent = t('rolePickStatusWaiting')
                } else if (onlineLobby.oppRolePick) {
                    rolePickStatusEl.textContent = t('rolePickStatusOppChosen')
                } else {
                    rolePickStatusEl.textContent = t('rolePickStatusOppWaiting')
                }
            }

            function pickRole(role) {
                if (onlineState.mode !== 'hunter') return;
                onlineLobby.myRolePick = role;
                if (btnRolePickEscaper) btnRolePickEscaper.classList.toggle('selected', role === 'escaper');
                if (btnRolePickHunter) btnRolePickHunter.classList.toggle('selected', role === 'hunter');
                updateRolePickStatusUI();
                sendOnline({ type: 'role-pick', role })
            }
            if (btnRolePickEscaper) btnRolePickEscaper.onclick = () => pickRole('escaper');
            if (btnRolePickHunter) btnRolePickHunter.onclick = () => pickRole('hunter');

            // Figures out which player id ends up as the hunter. Only ever
            // called by the host, since it's the single source of truth both
            // sides act on (avoids the two devices independently rolling
            // different random results). If both picked different roles,
            // that's honored directly; otherwise (same pick, or someone ran
            // out the clock without picking) it's a coin-flip lottery.
            function resolveHunterRoleDecision() {
                const myId = onlineState.localPlayerId;
                const oppId = myId === 0 ? 1 : 0;
                const myPick = onlineLobby.myRolePick;
                const oppPick = onlineLobby.oppRolePick;
                if (myPick && oppPick && myPick !== oppPick) {
                    return { hunterId: myPick === 'hunter' ? myId : oppId, lottery: !1 }
                }
                return { hunterId: Math.random() < 0.5 ? myId : oppId, lottery: !0 }
            }

            function handleHunterLobbyDeadline(mode) {
                if (onlineLobby.roleFinalizeDone) return;
                if (onlineState.isHost) {
                    const decision = resolveHunterRoleDecision();
                    onlineLobby.roleDecision = decision;
                    sendOnline({ type: 'role-decision', hunterId: decision.hunterId, lottery: decision.lottery });
                    revealHunterRolesAndFinalize(mode, decision)
                } else if (onlineLobby.roleDecision) {
                    revealHunterRolesAndFinalize(mode, onlineLobby.roleDecision)
                } else {
                    onlineLobby.awaitingRoleDecision = !0;
                    const titleEl = document.getElementById('role-lottery-title');
                    const overlay = document.getElementById('role-lottery-overlay');
                    const resultEl = document.getElementById('role-lottery-result');
                    const spinIcon = document.getElementById('role-lottery-spin-icon');
                    if (overlay && titleEl) {
                        if (resultEl) resultEl.style.display = 'none';
                        if (spinIcon) spinIcon.textContent = '🐺';
                        titleEl.style.display = '';
                        titleEl.textContent = t('roleLotteryWaitTitle');
                        overlay.style.display = 'flex';
                        void overlay.offsetWidth;
                        overlay.classList.add('visible')
                    }
                }
            }

            function revealHunterRolesAndFinalize(mode, decision) {
                if (onlineLobby.roleFinalizeDone) return;
                onlineLobby.roleFinalizeDone = !0;
                const lobbyView = document.getElementById('online-lobby-view');
                if (lobbyView) lobbyView.style.display = 'none';
                if (decision.lottery) {
                    runRoleLotteryAnimation(decision.hunterId, () => finalizeOnlineLobbyHunter(mode, decision.hunterId))
                } else {
                    const overlay = document.getElementById('role-lottery-overlay');
                    if (overlay) { overlay.classList.remove('visible'); overlay.style.display = 'none' }
                    finalizeOnlineLobbyHunter(mode, decision.hunterId)
                }
            }

            // Decelerating icon-shuffle that lands on each player's own
            // result — a little lottery-draw moment before the match begins.
            function runRoleLotteryAnimation(hunterId, callback) {
                const overlay = document.getElementById('role-lottery-overlay');
                const spinIcon = document.getElementById('role-lottery-spin-icon');
                const titleEl = document.getElementById('role-lottery-title');
                const resultEl = document.getElementById('role-lottery-result');
                if (!overlay || !spinIcon || !titleEl || !resultEl) { callback(); return }
                resultEl.style.display = 'none';
                resultEl.className = 'role-lottery-result';
                titleEl.style.display = '';
                titleEl.textContent = t('roleLotteryTitle');
                overlay.style.display = 'flex';
                void overlay.offsetWidth;
                overlay.classList.add('visible');
                overlay.classList.remove('reveal');
                const icons = ['🐺', '🐑'];
                let i = 0;
                let delay = 80;
                let elapsed = 0;
                const totalSpin = 1700;
                function spinStep() {
                    spinIcon.textContent = icons[i % 2];
                    spinIcon.classList.remove('role-lottery-icon');
                    void spinIcon.offsetWidth;
                    spinIcon.classList.add('role-lottery-icon');
                    i++;
                    elapsed += delay;
                    delay = Math.min(delay + 16, 260);
                    if (elapsed < totalSpin) {
                        setTimeout(spinStep, delay)
                    } else {
                        const iAmHunter = onlineState.localPlayerId === hunterId;
                        spinIcon.textContent = iAmHunter ? '🐺' : '🐑';
                        overlay.classList.add('reveal');
                        titleEl.style.display = 'none';
                        resultEl.textContent = iAmHunter ? t('roleLotteryResultHunter') : t('roleLotteryResultEscaper');
                        resultEl.classList.add(iAmHunter ? 'is-hunter' : 'is-escaper');
                        resultEl.style.display = '';
                        setTimeout(() => {
                            overlay.classList.remove('visible');
                            overlay.classList.remove('reveal');
                            overlay.style.display = 'none';
                            callback()
                        }, 1300)
                    }
                }
                spinStep()
            }

            function finalizeOnlineLobbyHunter(mode, hunterId) {
                onlineHunterRoleId = (hunterId === 0 || hunterId === 1) ? hunterId : 1;
                finalizeOnlineLobby(mode)
            }

            function applyOnlineProfilesToPlayers() {
                const meP = players.find(p => p.id === onlineState.localPlayerId);
                if (meP) {
                    meP.customName = onlineLobby.me.name;
                    meP.color = onlineLobby.me.color
                }
                for (const idStr in onlineLobby.othersById) {
                    const id = parseInt(idStr, 10);
                    const p = players.find(pl => pl.id === id);
                    const data = onlineLobby.othersById[id];
                    if (p && data) {
                        p.customName = data.name;
                        p.color = data.color
                    }
                }
            }

            function finalizeOnlineLobby(mode) {
                const lobbyView = document.getElementById('online-lobby-view');
                if (lobbyView) lobbyView.style.display = 'none';
                initGame(mode);
                applyOnlineProfilesToPlayers();
                renderTopbar();
                updateScores();
                updateActivePlayerUI();
                draw()
            }
            // ================= END ONLINE LOBBY =================

            function setLanguage(lang) {
                currentLang = lang;
                localStorage.setItem('barricade-lang', lang);
                applyStaticTranslations();
                if (appEl.classList.contains('visible')) {
                    renderTopbar();
                    updateBtnState();
                    updateScores();
                    updateActivePlayerUI();
                    updateHistory();
                    infoMode.textContent = gameMode === '2p' ? t('mode2p') : (gameMode === '4p' ? t('mode4p') : t('modeHunter'));
                    infoObjective.innerHTML = (gameMode === '2p' ? t('objective2p') : (gameMode === '4p' ? t('objective4p') : t(
                        'objectiveHunter'))).replace(/\n/g, '<br>');
                    // به‌روزرسانی متن دیوارها بر اساس حالت بازی
                    const wallsTextEl = document.getElementById('info-walls-text');
                    if (gameMode === 'hunter') {
                        wallsTextEl.innerHTML = t('wallsTextHunter');
                    } else if (gameMode === '4p') {
                        wallsTextEl.innerHTML = t('wallsText4p');
                    } else {
                        wallsTextEl.innerHTML = t('wallsText');
                    }
                }
            }

            function applyStaticTranslations() {
                setTextContent('page-title', t('pageTitle'));
                setTextContent('about-btn-label', t('aboutBtn'));
                setTextContent('settings-btn-label', t('settingsBtn'));
                setTextContent('settings-title', t('settingsTitle'));
                setTextContent('settings-lang-label', t('settingsLangLabel'));
                setTextContent('settings-lang-desc', t('settingsLangDesc'));
                setTextContent('settings-sound-label', t('settingsSoundLabel'));
                setTextContent('settings-sound-desc', t('settingsSoundDesc'));
                setTextContent('about-title', t('aboutTitle'));
                setTextContent('about-tagline', t('aboutTagline'));
                setTextContent('about-text', t('aboutText'));
                setTextContent('about-feature1', t('aboutFeature1'));
                setTextContent('about-feature2', t('aboutFeature2'));
                setTextContent('about-feature3', t('aboutFeature3'));
                setTextContent('about-creator-label', t('aboutCreatorLabel'));
                setTextContent('about-creator-name', t('aboutCreatorName'));
                setTextContent('about-follow-label', t('aboutFollowLabel'));
                setTextContent('start-subtitle', t('startSubtitle'));
                setTextContent('lbl-help', t('howToPlay'));
                setTextContent('mode-classic-title', t('modeClassicTitle'));
                setTextContent('mode-classic-desc', t('modeClassicDesc'));
                setTextContent('mode-classic-badge', t('modeClassicBadge'));
                setTextContent('pc-2-label', t('pc2Label'));
                setTextContent('pc-4-label', t('pc4Label'));
                setTextContent('team-group-1-label', t('teamA'));
                setTextContent('team-group-2-label', t('teamB'));
                setTextContent('team-vs-label', t('vs'));
                setTextContent('mode-hunter-title', t('modeHunterTitle'));
                setTextContent('mode-hunter-desc', t('modeHunterDesc'));
                setTextContent('mode-online-title', t('modeOnlineTitle'));
                setTextContent('mode-online-desc', t('modeOnlineDesc'));
                setTextContent('online-hero-title', t('onlineHeroTitle'));
                setTextContent('online-pick-2p-label', t('onlinePick2pLabel'));
                setTextContent('online-pick-4p-label', t('onlinePick4pLabel'));
                setTextContent('online-pick-hunter-label', t('onlinePickHunterLabel'));
                setTextContent('online-create-title', t('onlineCreateTitle'));
                setTextContent('online-create-desc', t('onlineCreateDesc'));
                setTextContent('online-join-title', t('onlineJoinTitle'));
                setTextContent('online-join-desc', t('onlineJoinDesc'));
                setTextContent('online-back-label', t('onlineBackLabel'));
                setTextContent('online-code-hint', t('onlineCodeHint'));
                setTextContent('online-connect-label', t('onlineConnectLabel'));
                setTextContent('btn-online-cancel-create', t('onlineCancelLabel'));
                setTextContent('btn-online-cancel-join', t('onlineCancelLabel'));
                const copyCodeBtn = document.getElementById('btn-online-copy-code');
                if (copyCodeBtn) copyCodeBtn.setAttribute('aria-label', t('onlineCopyCodeAria'));
                setTextContent('gt-offline-label', t('gtOfflineLabel'));
                setTextContent('gt-online-label', t('gtOnlineLabel'));
                setTextContent('game-type-lock-hint', t('gtLockHint4p'));
                setTextContent('online-name-lock-title', t('onlineNameLockTitle'));
                setTextContent('online-name-lock-desc', t('onlineNameLockDesc'));
                setTextContent('timer-select-label-text', t('timerSelectLabel'));
                setTextContent('timer-chip-none-label', t('timerNoneLabel'));
                setTextContent('online-code-entry-label-text', t('onlineCodeEntryLabel'));
                if (onlineNameEntryCodeInput) onlineNameEntryCodeInput.placeholder = 'CYRU5';
                document.querySelectorAll('.tc-unit').forEach(el => {
                    el.textContent = el.dataset.unit === 'sec' ? t('timerUnitSec') : t('timerUnitMin')
                });
                document.querySelectorAll('#timer-chip-group .timer-chip:not(.no-timer-chip) .tc-num').forEach(el => {
                    const secs = parseInt(el.closest('.timer-chip').dataset.secs, 10);
                    const n = secs < 60 ? secs : Math.round(secs / 60);
                    el.textContent = localizeNum(n)
                });
                setTextContent('lbl-move', t('move'));
                setTextContent('lbl-hwall', t('horizontal'));
                setTextContent('lbl-vwall', t('vertical'));
                setTextContent('lbl-undo', t('undo'));
                setTextContent('lbl-repeat', t('repeat'));
                setTextContent('lbl-resign', t('resign'));
                setTextContent('lbl-home', t('newGame'));
                setTextContent('go-winner-label', t('goWinnerLabel'));
                setTextContent('go-tag-winner', t('goTagWinner'));
                setTextContent('go-tag-loser', t('goTagLoser'));
                setTextContent('lbl-go-repeat', t('goPlayAgain'));
                setTextContent('lbl-go-home', t('goBackHome'));
                setTextContent('lbl-confirm-yes', t('confirmYesLabel'));
                setTextContent('lbl-confirm-no', t('confirmNoLabel'));
                setTextContent('lbl-move-history', t('moveHistory'));
                setTextContent('lbl-game-info', t('gameInfo'));
                setTextContent('lbl-mode', t('mode'));
                setTextContent('lbl-walls-left', t('wallsLeft'));
                setTextContent('lbl-status', t('status'));
                setTextContent('lbl-online-turn', omsg('نوبت', 'Turn'));
                setTextContent('lbl-objective', t('objective'));
                setTextContent('lbl-walls', t('walls'));
                document.getElementById('info-walls-text').innerHTML = t('wallsText');
                setTextContent('lbl-rules', t('rules'));
                document.getElementById('info-rules-text').innerHTML = t('rulesText');
                setTextContent('lbl-place-wall', t('placeWall'));
                const startLbl = document.getElementById('lbl-start-game');
                if (startLbl) startLbl.textContent = t('startGame');
                setTextContent('name-entry-title', t('nameEntryTitle'));
                setTextContent('btn-name-confirm', t('startGameBtn'));
                setTextContent('btn-name-back', t('backBtn'));
                setTextContent('online-lobby-title', t('onlineLobbyTitle'));
                updateOnlineLobbyDescText();
                setTextContent('online-lobby-hint', t('onlineLobbyHint'));
                setTextContent('role-pick-title', t('rolePickTitle'));
                setTextContent('role-pick-escaper-label', t('rolePickEscaper'));
                setTextContent('role-pick-hunter-label', t('rolePickHunter'));
                updateRolePickStatusUI();
                setTextContent('mode-title', t('modeTitle'));
                const dpn = translations[currentLang].defaultPlayerNames;
                const ph = (id, idx) => {
                    const el = document.getElementById(id);
                    if (el) el.placeholder = dpn[idx]
                };
                ph('input-name-p1', 0);
                ph('input-name-p2', 1);
                ph('input-name-red', 0);
                ph('input-name-blue', 1);
                ph('input-name-green', 2);
                ph('input-name-yellow', 3);
                ph('input-name-hunter', 0);
                ph('input-name-escaper', 1);
                document.documentElement.lang = currentLang;
                document.documentElement.dir = currentLang === 'fa' ? 'rtl' : 'ltr';
                updateLangSwitch()
            }

            function updateLangSwitch() {
                const sw = document.getElementById('lang-switch');
                if (!sw) return;
                sw.dataset.active = currentLang;
                const faBtn = document.getElementById('lang-opt-fa'),
                    enBtn = document.getElementById('lang-opt-en');
                if (faBtn) faBtn.classList.toggle('active', currentLang === 'fa');
                if (enBtn) enBtn.classList.toggle('active', currentLang === 'en')
            }
            const langOptFa = document.getElementById('lang-opt-fa'),
                langOptEn = document.getElementById('lang-opt-en');
            const langLoadingOverlay = document.getElementById('lang-loading-overlay');

            function switchLanguageAnimated(lang) {
                if (lang === currentLang) return;
                langLoadingOverlay.classList.add('visible');
                setTimeout(() => {
                    setLanguage(lang);
                    setTimeout(() => {
                        langLoadingOverlay.classList.remove('visible')
                    }, 130)
                }, 570)
            }
            if (langOptFa) langOptFa.onclick = () => switchLanguageAnimated('fa');
            if (langOptEn) langOptEn.onclick = () => switchLanguageAnimated('en');
            updateLangSwitch();
            document.getElementById('btn-about').onclick = () => document.getElementById('about-overlay').classList.add('visible');
            const btnAboutCloseX = document.getElementById('btn-about-close-x');
            if (btnAboutCloseX) btnAboutCloseX.onclick = () => document.getElementById('about-overlay').classList.remove('visible');
            document.getElementById('about-overlay').addEventListener('click', (e) => {
                if (e.target.id === 'about-overlay') e.target.classList.remove('visible')
            });

            const settingsOverlay = document.getElementById('settings-overlay');
            document.getElementById('btn-settings').onclick = () => settingsOverlay.classList.add('visible');
            document.getElementById('btn-settings-close-x').onclick = () => settingsOverlay.classList.remove('visible');
            settingsOverlay.addEventListener('click', (e) => {
                if (e.target.id === 'settings-overlay') settingsOverlay.classList.remove('visible')
            });

            // ===== منوی موبایل (سه‌نقطه) برای Help/About/Settings =====
            const btnTopMenu = document.getElementById('btn-top-menu');
            const topMenuPanel = document.getElementById('top-menu-panel');
            if (btnTopMenu && topMenuPanel) {
                const closeTopMenu = () => {
                    topMenuPanel.classList.remove('open');
                    btnTopMenu.classList.remove('active');
                    btnTopMenu.setAttribute('aria-expanded', 'false')
                };
                btnTopMenu.onclick = (e) => {
                    e.stopPropagation();
                    const isOpen = topMenuPanel.classList.toggle('open');
                    btnTopMenu.classList.toggle('active', isOpen);
                    btnTopMenu.setAttribute('aria-expanded', isOpen ? 'true' : 'false')
                };
                topMenuPanel.querySelectorAll('.top-ctrl-btn').forEach(item => {
                    item.addEventListener('click', closeTopMenu)
                });
                document.addEventListener('click', (e) => {
                    if (topMenuPanel.classList.contains('open') && !topMenuPanel.contains(e.target) && e.target !==
                        btnTopMenu && !btnTopMenu.contains(e.target)) closeTopMenu()
                });
                window.addEventListener('resize', closeTopMenu)
            }

            // وقتی هرکدام از دیالوگ‌ها (تنظیمات، درباره ما، تأیید، برنده بازی) باز است،
            // بقیه دکمه‌های صفحه غیرفعال و اسکرول صفحه قفل می‌شود
            const lockableOverlays = [
                document.getElementById('about-overlay'),
                settingsOverlay,
                confirmOverlay,
                gameOverOverlay
            ];

            function refreshModalLock() {
                const anyOpen = lockableOverlays.some(el => el && el.classList.contains('visible'));
                document.body.classList.toggle('modal-locked', anyOpen)
            }
            lockableOverlays.forEach(el => {
                if (el) new MutationObserver(refreshModalLock).observe(el, { attributes: !0, attributeFilter: ['class'] })
            });
            refreshModalLock();

            function updateSoundUI() {
                const onIconBoard = document.getElementById('icon-sound-on-board');
                const offIconBoard = document.getElementById('icon-sound-off-board');
                if (onIconBoard) onIconBoard.style.display = sfxEnabled ? 'block' : 'none';
                if (offIconBoard) offIconBoard.style.display = sfxEnabled ? 'none' : 'block';
                const label = sfxEnabled ? t('soundOn') : t('soundOff');
                const boardBtn = document.getElementById('btn-sound-board');
                if (boardBtn) boardBtn.setAttribute('aria-label', label);
                const boardBtnLabel = document.getElementById('lbl-sound-board');
                if (boardBtnLabel) boardBtnLabel.textContent = label;
                const settingsToggle = document.getElementById('btn-sound-settings');
                if (settingsToggle) {
                    settingsToggle.classList.toggle('on', sfxEnabled);
                    settingsToggle.setAttribute('aria-checked', sfxEnabled ? 'true' : 'false');
                    settingsToggle.setAttribute('aria-label', label)
                }
            }

            function toggleSound() {
                sfxEnabled = !sfxEnabled;
                localStorage.setItem('barricade-sfx', sfxEnabled ? 'on' : 'off');
                updateSoundUI();
                if (sfxEnabled) sfxToggle()
            }
            const btnSoundBoard = document.getElementById('btn-sound-board');
            if (btnSoundBoard) {
                btnSoundBoard.onclick = function () {
                    if (btnSoundBoard.dataset.dragMoved === '1') {
                        btnSoundBoard.dataset.dragMoved = '0';
                        return
                    }
                    toggleSound()
                };
                makeSoundBtnDraggable(btnSoundBoard, document.getElementById('board-wrapper'))
                setupSoundBtnHideOnLongPress(btnSoundBoard, document.getElementById('board-wrapper'))
            }
            const btnSoundSettings = document.getElementById('btn-sound-settings');
            if (btnSoundSettings) btnSoundSettings.onclick = toggleSound;
            updateSoundUI();

            function makeSoundBtnDraggable(btn, wrapper) {
                if (!btn || !wrapper) return;
                const DRAG_THRESHOLD = 12;
                let dragging = false, moved = false;
                let startX = 0, startY = 0, startLeft = 0, startTop = 0;
                let savedPos = null;

                function clampAndApply(leftPx, topPx) {
                    const wrapRect = wrapper.getBoundingClientRect();
                    const btnRect = btn.getBoundingClientRect();
                    const minLeft = -btnRect.width * 0.4;
                    const minTop = -btnRect.height * 1.5;
                    const maxLeft = wrapRect.width - btnRect.width * 0.6;
                    const maxTop = wrapRect.height - btnRect.height * 0.6;
                    leftPx = Math.max(minLeft, Math.min(leftPx, maxLeft));
                    topPx = Math.max(minTop, Math.min(topPx, maxTop));
                    btn.style.left = leftPx + 'px';
                    btn.style.top = topPx + 'px';
                    btn.style.right = 'auto';
                    return { leftPx, topPx, wrapRect, btnRect }
                }

                function savePosition(leftPx, topPx, wrapRect, btnRect) {
                    const maxLeft = wrapRect.width - btnRect.width * 0.6;
                    const maxTop = wrapRect.height - btnRect.height * 0.6;
                    const minLeft = -btnRect.width * 0.4;
                    const minTop = -btnRect.height * 1.5;
                    const spanLeft = maxLeft - minLeft;
                    const spanTop = maxTop - minTop;
                    const leftPct = spanLeft > 0 ? (leftPx - minLeft) / spanLeft : 0;
                    const topPct = spanTop > 0 ? (topPx - minTop) / spanTop : 0;
                    savedPos = { leftPct, topPct };
                }

                function restorePosition() {
                    const saved = savedPos;
                    if (!saved || typeof saved.leftPct !== 'number' || typeof saved.topPct !== 'number') return;
                    const wrapRect = wrapper.getBoundingClientRect();
                    const btnRect = btn.getBoundingClientRect();
                    const minLeft = -btnRect.width * 0.4;
                    const minTop = -btnRect.height * 1.5;
                    const maxLeft = wrapRect.width - btnRect.width * 0.6;
                    const maxTop = wrapRect.height - btnRect.height * 0.6;
                    const leftPx = minLeft + saved.leftPct * (maxLeft - minLeft);
                    const topPx = minTop + saved.topPct * (maxTop - minTop);
                    clampAndApply(leftPx, topPx)
                }

                btn.addEventListener('pointerdown', function (e) {
                    dragging = true;
                    moved = false;
                    const wrapRect = wrapper.getBoundingClientRect();
                    const btnRect = btn.getBoundingClientRect();
                    startX = e.clientX;
                    startY = e.clientY;
                    startLeft = btnRect.left - wrapRect.left;
                    startTop = btnRect.top - wrapRect.top;
                    try { btn.setPointerCapture(e.pointerId) } catch (err) {}
                });

                btn.addEventListener('pointermove', function (e) {
                    if (!dragging) return;
                    const dx = e.clientX - startX;
                    const dy = e.clientY - startY;
                    if (!moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
                        moved = true;
                        btn.classList.add('dragging')
                    }
                    if (moved) {
                        e.preventDefault();
                        clampAndApply(startLeft + dx, startTop + dy)
                    }
                });

                function endDrag(e) {
                    if (!dragging) return;
                    dragging = false;
                    btn.classList.remove('dragging');
                    if (moved) {
                        btn.dataset.dragMoved = '1';
                        setTimeout(() => { if (btn.dataset.dragMoved === '1') btn.dataset.dragMoved = '0' }, 400);
                        const wrapRect = wrapper.getBoundingClientRect();
                        const btnRect = btn.getBoundingClientRect();
                        savePosition(btnRect.left - wrapRect.left, btnRect.top - wrapRect.top, wrapRect, btnRect)
                    }
                    moved = false
                }

                btn.addEventListener('pointerup', endDrag);
                btn.addEventListener('pointercancel', endDrag);
                window.addEventListener('resize', restorePosition);
                restorePosition()
            }

            function setupSoundBtnHideOnLongPress(btn, wrapper) {
                if (!btn || !wrapper) return;
                const LONG_PRESS_MS = 500;
                const HOLD_VISUAL_DELAY_MS = 130;
                const MOVE_CANCEL_PX = 12;

                let pressTimer = null;
                let holdVisualTimer = null;
                let pressStartX = 0, pressStartY = 0, pressMoved = false;
                let suppressNextClick = false;
                let isHidden = false;
                let ghostPos = null;

                const badge = document.createElement('div');
                badge.className = 'sound-close-badge no-click-sfx';
                badge.setAttribute('role', 'button');
                badge.setAttribute('aria-label', 'Close');
                badge.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>';
                wrapper.appendChild(badge);

                const ring = document.createElement('div');
                ring.className = 'sound-reappear-ring';
                wrapper.appendChild(ring);

                const ghost = document.createElement('div');
                ghost.className = 'sound-ghost-dot no-click-sfx';
                ghost.setAttribute('role', 'button');
                ghost.setAttribute('aria-label', 'Show sound button');
                ghost.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/></svg>';
                wrapper.appendChild(ghost);

                function positionBadge() {
                    const wrapRect = wrapper.getBoundingClientRect();
                    const btnRect = btn.getBoundingClientRect();
                    const left = (btnRect.left - wrapRect.left) - 6;
                    const top = (btnRect.top - wrapRect.top) - 6;
                    badge.style.left = left + 'px';
                    badge.style.top = top + 'px'
                }

                function showBadge() {
                    positionBadge();
                    badge.classList.add('visible');
                    document.addEventListener('pointerdown', dismissOnOutsideTap, true)
                }

                function hideBadge() {
                    badge.classList.remove('visible');
                    document.removeEventListener('pointerdown', dismissOnOutsideTap, true)
                }

                function dismissOnOutsideTap(e) {
                    if (e.target === badge || badge.contains(e.target) || e.target === btn) return;
                    hideBadge()
                }

                function positionRing() {
                    const wrapRect = wrapper.getBoundingClientRect();
                    const btnRect = btn.getBoundingClientRect();
                    const size = btnRect.width * 2.2;
                    ring.style.width = size + 'px';
                    ring.style.height = size + 'px';
                    ring.style.left = ((btnRect.left - wrapRect.left) - (size - btnRect.width) / 2) + 'px';
                    ring.style.top = ((btnRect.top - wrapRect.top) - (size - btnRect.height) / 2) + 'px'
                }

                function placeGhostAt(centerLeft, centerTop) {
                    ghost.style.left = (centerLeft - 9) + 'px';
                    ghost.style.top = (centerTop - 9) + 'px'
                }

                function showGhostAt(centerLeft, centerTop) {
                    placeGhostAt(centerLeft, centerTop);
                    ghostPos = { left: centerLeft, top: centerTop };
                    ghost.classList.add('visible')
                }

                function restoreGhostFromStorage() {
                    if (ghostPos && typeof ghostPos.left === 'number' && typeof ghostPos.top === 'number') {
                        placeGhostAt(ghostPos.left, ghostPos.top)
                    } else {
                        const wrapRect = wrapper.getBoundingClientRect();
                        const btnRect = btn.getBoundingClientRect();
                        placeGhostAt((btnRect.left - wrapRect.left) + btnRect.width / 2, (btnRect.top - wrapRect.top) + btnRect.height / 2)
                    }
                    ghost.classList.add('visible')
                }

                function hideGhost() {
                    ghost.classList.remove('visible')
                }

                function hideSoundBtn() {
                    hideBadge();
                    btn.classList.remove('btn-holding');
                    btn.classList.add('btn-hidden-anim');
                    const wrapRect = wrapper.getBoundingClientRect();
                    const btnRect = btn.getBoundingClientRect();
                    const centerLeft = (btnRect.left - wrapRect.left) + btnRect.width / 2;
                    const centerTop = (btnRect.top - wrapRect.top) + btnRect.height / 2;
                    setTimeout(() => {
                        btn.style.display = 'none';
                        btn.classList.remove('btn-hidden-anim');
                        showGhostAt(centerLeft, centerTop)
                    }, 380);
                    isHidden = true;
                    showToast(t('shakeToShowHint'))
                }

                function revealSoundBtn() {
                    if (btn.style.display !== 'none') return;
                    hideGhost();
                    btn.style.display = 'flex';
                    btn.classList.add('btn-reappear-anim');
                    positionRing();
                    ring.classList.remove('ping');
                    void ring.offsetWidth;
                    ring.classList.add('ping');
                    if (navigator.vibrate) { try { navigator.vibrate(35) } catch (e) {} }
                    setTimeout(() => btn.classList.remove('btn-reappear-anim'), 650);
                    isHidden = false;
                }

                badge.addEventListener('pointerdown', (e) => { e.stopPropagation() });
                badge.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    hideSoundBtn()
                });

                ghost.addEventListener('pointerdown', (e) => { e.stopPropagation() });
                ghost.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    revealSoundBtn()
                });

                btn.addEventListener('pointerdown', function (e) {
                    pressMoved = false;
                    pressStartX = e.clientX;
                    pressStartY = e.clientY;
                    clearTimeout(pressTimer);
                    clearTimeout(holdVisualTimer);
                    holdVisualTimer = setTimeout(() => {
                        if (!pressMoved) btn.classList.add('btn-holding')
                    }, HOLD_VISUAL_DELAY_MS);
                    pressTimer = setTimeout(() => {
                        if (!pressMoved) {
                            btn.classList.remove('btn-holding');
                            suppressNextClick = true;
                            if (navigator.vibrate) { try { navigator.vibrate(18) } catch (err) {} }
                            showBadge()
                        }
                    }, LONG_PRESS_MS)
                });
                btn.addEventListener('pointermove', function (e) {
                    const dx = e.clientX - pressStartX, dy = e.clientY - pressStartY;
                    if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) {
                        pressMoved = true;
                        btn.classList.remove('btn-holding');
                        clearTimeout(pressTimer);
                        clearTimeout(holdVisualTimer)
                    }
                });
                function clearHoldState() {
                    clearTimeout(pressTimer);
                    clearTimeout(holdVisualTimer);
                    btn.classList.remove('btn-holding')
                }
                btn.addEventListener('pointerup', clearHoldState);
                btn.addEventListener('pointercancel', clearHoldState);

                const originalOnClick = btn.onclick;
                btn.onclick = function (e) {
                    if (suppressNextClick) {
                        suppressNextClick = false;
                        return
                    }
                    if (typeof originalOnClick === 'function') originalOnClick.call(btn, e)
                };

                window.addEventListener('resize', () => {
                    if (badge.classList.contains('visible')) positionBadge();
                    if (btn.style.display === 'none' && ghost.classList.contains('visible')) restoreGhostFromStorage()
                });

                if (isHidden) {
                    btn.style.display = 'none';
                    restoreGhostFromStorage()
                }
            }

            document.addEventListener('click', (e) => {
                const target = e.target.closest('button, a.top-ctrl-btn');
                if (target && !target.classList.contains('no-click-sfx')) sfxClick()
            }, true);
            applyStaticTranslations();
            ['p1', 'p2', 'red', 'blue', 'green', 'yellow', 'hunter', 'escaper'].forEach(buildSwatches);

            function setup2P() {
                players = [{
                    id: 0,
                    name: 'Player 1 (Red)',
                    customName: currentNames.p1,
                    color: customColor('p1'),
                    colorClass: 'red',
                    row: 8,
                    col: 4,
                    walls: 10,
                    maxWalls: 10,
                    target: 'row0',
                    team: 0,
                    finished: !1
                }, {
                    id: 1,
                    name: 'Player 2 (Blue)',
                    customName: currentNames.p2,
                    color: customColor('p2'),
                    colorClass: 'blue',
                    row: 0,
                    col: 4,
                    walls: 10,
                    maxWalls: 10,
                    target: 'row8',
                    team: 1,
                    finished: !1
                }, ];
                turnOrder = [0, 1]
            }

            function setup4P() {
                players = [{
                    id: 0,
                    name: 'Red',
                    customName: currentNames.red,
                    color: customColor('red'),
                    colorClass: 'red',
                    row: 0,
                    col: 2,
                    walls: 6,
                    maxWalls: 6,
                    target: 'row8',
                    team: 0,
                    finished: !1,
                    forfeited: !1
                }, {
                    id: 1,
                    name: 'Blue',
                    customName: currentNames.blue,
                    color: customColor('blue'),
                    colorClass: 'blue',
                    row: 0,
                    col: 6,
                    walls: 6,
                    maxWalls: 6,
                    target: 'row8',
                    team: 0,
                    finished: !1,
                    forfeited: !1
                }, {
                    id: 2,
                    name: 'Green',
                    customName: currentNames.green,
                    color: customColor('green'),
                    colorClass: 'green',
                    row: 8,
                    col: 2,
                    walls: 6,
                    maxWalls: 6,
                    target: 'row0',
                    team: 1,
                    finished: !1,
                    forfeited: !1
                }, {
                    id: 3,
                    name: 'Yellow',
                    customName: currentNames.yellow,
                    color: customColor('yellow'),
                    colorClass: 'yellow',
                    row: 8,
                    col: 6,
                    walls: 6,
                    maxWalls: 6,
                    target: 'row0',
                    team: 1,
                    finished: !1,
                    forfeited: !1
                }, ];
                turnOrder = [0, 2, 1, 3]
            }

            function setupHunter(hunterId) {
                // hunterId picks which player id (0 or 1) plays the hunter —
                // decided online by the role-pick/lottery flow, or defaults
                // to 1 for local (same-device) play where it doesn't matter.
                if (hunterId !== 0 && hunterId !== 1) hunterId = 1;
                const escaperId = hunterId === 0 ? 1 : 0;
                const byId = {};
                byId[escaperId] = {
                    id: escaperId,
                    name: 'Escaper',
                    customName: currentNames.escaper,
                    color: customColor('escaper'),
                    colorClass: 'blue',
                    row: 0,
                    col: 4,
                    walls: 10,
                    maxWalls: 10,
                    target: 'row8',
                    team: 0,
                    finished: !1,
                    role: 'escaper'
                };
                byId[hunterId] = {
                    id: hunterId,
                    name: 'Hunter',
                    customName: currentNames.hunter,
                    color: customColor('hunter'),
                    colorClass: 'red',
                    row: 8,
                    col: 4,
                    walls: 8,
                    maxWalls: 8,
                    target: null,
                    team: 1,
                    finished: !1,
                    role: 'hunter'
                };
                players = [byId[0], byId[1]];
                // The survivor always moves first regardless of which id
                // (join slot) ended up with which role.
                turnOrder = [escaperId, hunterId]
            }

            function getDefaultPlayerName(p) {
                const dpn = translations[currentLang].defaultPlayerNames;
                if (gameMode === 'hunter') {
                    return p.role === 'hunter' ? dpn[0] : dpn[1]
                }
                return dpn[p.id] || dpn[0]
            }

            function playerDisplayName(p) {
                if (p.customName && p.customName.trim()) return p.customName.trim();
                return getDefaultPlayerName(p)
            }

            function teamName(team) {
                return translations[currentLang].teamNames[team]
            }

            function teamPlayerNames(team) {
                const sep = currentLang === 'fa' ? ' و ' : ' & ';
                return players.filter(p => p.team === team).map(playerDisplayName).join(sep)
            }

            function currentPlayer() {
                return players[turn]
            }

            function setThemeColor(color) {
                const m = document.querySelector('meta[name="theme-color"]');
                if (m) m.setAttribute('content', color)
            }

            function initGame(mode) {
                gameMode = mode;
                stopTurnTimer();
                turnTimerPlayerId = null;
                if (mode === '2p') setup2P();
                else if (mode === '4p') setup4P();
                else setupHunter(onlineState.active ? onlineHunterRoleId : undefined);
                initPlayerTimeBanks();
                hWalls = Array.from({ length: 9 }, () => Array(9).fill(!1));
                vWalls = Array.from({ length: 9 }, () => Array(9).fill(!1));
                turnIndex = 0;
                turn = turnOrder[0];
                gameOver = !1;
                history = [];
                undoStack = [];
                currentPage = 0;
                uiMode = 'move';
                wallPreviewPos = null;
                pendingWallPos = null;
                isAnimating = !1;
                animData = null;
                wallAnimation = null;
                captureAnim = null;
                huntProximity = 0;
                hideWallConfirm();
                infoMode.textContent = mode === '2p' ? t('mode2p') : (mode === '4p' ? t('mode4p') : t('modeHunter'));
                infoObjective.innerHTML = (mode === '2p' ? t('objective2p') : (mode === '4p' ? t('objective4p') : t(
                    'objectiveHunter'))).replace(/\n/g, '<br>');
                // به‌روزرسانی متن دیوارها بر اساس حالت بازی
                const wallsTextEl = document.getElementById('info-walls-text');
                if (mode === 'hunter') {
                    wallsTextEl.innerHTML = t('wallsTextHunter');
                } else if (mode === '4p') {
                    wallsTextEl.innerHTML = t('wallsText4p');
                } else {
                    wallsTextEl.innerHTML = t('wallsText');
                }
                renderTopbar();
                updateBtnState();
                updateScores();
                updateActivePlayerUI();
                updateHistory();
                draw();
                startOverlay.style.display = 'none';
                appEl.classList.add('visible');
                setThemeColor('#000000');
                btnHome.style.display = onlineState.active ? 'none' : '';
                btnUndo.style.display = onlineState.active ? 'none' : '';
                btnRepeat.style.display = onlineState.active ? 'none' : '';
                const topCtrls = document.getElementById('top-controls');
                if (topCtrls) topCtrls.style.display = 'none';
                const soundBtnHeader = document.getElementById('btn-sound-board');
                if (soundBtnHeader) soundBtnHeader.classList.add('visible');
                sfxGameStart()
            }
            let classicSubMode = '2p';
            document.getElementById('btn-start-classic').onclick = () => showNameEntry(classicSubMode, !0);
            document.getElementById('btn-start-hunter').onclick = () => showNameEntry('hunter');
            document.getElementById('btn-pc-2').onclick = () => switchClassicSubMode('2p');
            document.getElementById('btn-pc-4').onclick = () => switchClassicSubMode('4p');

            function playCardAnimation() {
                const card = document.getElementById('name-entry-view');
                if (!card) return;
                card.classList.remove('card-anim');
                void card.offsetWidth;
                card.classList.add('card-anim')
            }

            function setGameType(isOnline) {
                const onlineBtn = document.getElementById('btn-gt-online');
                if (isOnline && onlineBtn.disabled) return;
                selectedGameTypeOnline = isOnline;
                document.getElementById('game-type-toggle').dataset.active = isOnline ? 'online' : 'offline';
                document.getElementById('btn-gt-offline').classList.toggle('active', !isOnline);
                onlineBtn.classList.toggle('active', isOnline);
                document.getElementById('name-entry-view').classList.toggle('gt-online', isOnline);
                updateTimerAvailabilityForGameType()
            }
            document.getElementById('btn-gt-offline').onclick = () => setGameType(!1);
            document.getElementById('btn-gt-online').onclick = () => setGameType(!0);

            function updateGameTypeAvailability(mode) {
                const onlineBtn = document.getElementById('btn-gt-online');
                const lockHint = document.getElementById('game-type-lock-hint');
                const locked = !1;
                onlineBtn.disabled = locked;
                onlineBtn.classList.toggle('locked', locked);
                lockHint.style.display = locked ? 'block' : 'none';
                if (locked && selectedGameTypeOnline) setGameType(!1)
            }

            function updateTimerAvailabilityForGameType() {
                const noTimerChip = document.querySelector('#timer-chip-group .no-timer-chip');
                if (!noTimerChip) return;
                noTimerChip.classList.toggle('locked', selectedGameTypeOnline);
                if (selectedGameTypeOnline && selectedTimerSeconds === 0) setSelectedTimer(DEFAULT_TIMER_SECONDS)
            }

            function setSelectedTimer(secs) {
                if (secs === 0 && selectedGameTypeOnline) return;
                selectedTimerSeconds = secs;
                document.querySelectorAll('#timer-chip-group .timer-chip').forEach(chip => {
                    chip.classList.toggle('active', parseInt(chip.dataset.secs, 10) === secs)
                })
            }
            document.querySelectorAll('#timer-chip-group .timer-chip').forEach(chip => {
                chip.onclick = () => setSelectedTimer(parseInt(chip.dataset.secs, 10))
            });

            function switchClassicSubMode(mode) {
                classicSubMode = mode;
                selectedMode = mode;
                const fields2p = document.getElementById('name-fields-2p');
                const fields4p = document.getElementById('name-fields-4p');
                fields2p.style.display = mode === '2p' ? 'block' : 'none';
                fields4p.style.display = mode === '4p' ? 'block' : 'none';
                document.getElementById('btn-pc-2').classList.toggle('active', mode === '2p');
                document.getElementById('btn-pc-4').classList.toggle('active', mode === '4p');
                document.getElementById('player-count-toggle').dataset.active = (mode === '4p' ? '4' : '2');
                updateGameTypeAvailability(mode)
            }

            function showNameEntry(mode, isClassic) {
                selectedMode = mode;
                document.getElementById('mode-select-view').style.display = 'none';
                document.getElementById('name-entry-view').style.display = 'block';
                setGameType(!1);
                setSelectedTimer(DEFAULT_TIMER_SECONDS);
                const pcToggle = document.getElementById('player-count-toggle');
                if (isClassic) {
                    pcToggle.style.display = 'flex';
                    switchClassicSubMode(mode)
                } else {
                    pcToggle.style.display = 'none';
                    document.getElementById('name-fields-2p').style.display = mode === '2p' ? 'block' : 'none';
                    document.getElementById('name-fields-4p').style.display = mode === '4p' ? 'block' : 'none';
                    updateGameTypeAvailability(mode)
                }
                document.getElementById('name-fields-hunter').style.display = mode === 'hunter' ? 'block' : 'none';
                document.getElementById('input-name-p1').value = currentNames.p1;
                document.getElementById('input-name-p2').value = currentNames.p2;
                document.getElementById('input-name-red').value = currentNames.red;
                document.getElementById('input-name-blue').value = currentNames.blue;
                document.getElementById('input-name-green').value = currentNames.green;
                document.getElementById('input-name-yellow').value = currentNames.yellow;
                document.getElementById('input-name-hunter').value = currentNames.hunter;
                document.getElementById('input-name-escaper').value = currentNames.escaper;
                ['p1', 'p2', 'red', 'blue', 'green', 'yellow', 'hunter', 'escaper'].forEach(refreshSwatchUI);
                applyStaticTranslations();
                setTextContent('name-entry-title', t(mode === 'hunter' ? 'modeHunterTitle' : 'modeClassicShort'))
            }
            document.getElementById('btn-name-back').onclick = () => {
                document.getElementById('name-entry-view').style.display = 'none';
                document.getElementById('mode-select-view').style.display = 'block'
            };
            document.getElementById('btn-name-confirm').onclick = () => {
                if (selectedGameTypeOnline) {
                    onlineState.mode = selectedMode;
                    onlineState.timerSeconds = selectedTimerSeconds;
                    onlineEntryFromNameEntry = !0;
                    const codeVal = onlineNameEntryCodeInput ? onlineNameEntryCodeInput.value.trim().toUpperCase() : '';
                    document.getElementById('name-entry-view').style.display = 'none';
                    onlineSetupView.style.display = 'block';
                    onlineModeSelectView.style.display = 'none';
                    onlineChoiceView.style.display = 'none';
                    onlineCreateView.style.display = 'none';
                    onlineJoinStatus.textContent = '';
                    if (codeVal.length >= 5) {
                        // A code was typed right here on the settings screen —
                        // connect directly instead of asking for it again on
                        // a separate "join" screen.
                        onlineJoinView.style.display = 'flex';
                        onlineJoinView.classList.add('autoconnecting');
                        startOnlineJoinFlow(codeVal, !1)
                    } else {
                        startOnlineCreateFlow()
                    }
                    return
                }
                if (selectedMode === '2p') {
                    currentNames.p1 = document.getElementById('input-name-p1').value.trim();
                    currentNames.p2 = document.getElementById('input-name-p2').value.trim();
                    localStorage.setItem('barricade-name-p1', currentNames.p1);
                    localStorage.setItem('barricade-name-p2', currentNames.p2)
                } else if (selectedMode === '4p') {
                    currentNames.red = document.getElementById('input-name-red').value.trim();
                    currentNames.blue = document.getElementById('input-name-blue').value.trim();
                    currentNames.green = document.getElementById('input-name-green').value.trim();
                    currentNames.yellow = document.getElementById('input-name-yellow').value.trim();
                    localStorage.setItem('barricade-name-red', currentNames.red);
                    localStorage.setItem('barricade-name-blue', currentNames.blue);
                    localStorage.setItem('barricade-name-green', currentNames.green);
                    localStorage.setItem('barricade-name-yellow', currentNames.yellow)
                } else {
                    currentNames.hunter = document.getElementById('input-name-hunter').value.trim();
                    currentNames.escaper = document.getElementById('input-name-escaper').value.trim();
                    localStorage.setItem('barricade-name-hunter', currentNames.hunter);
                    localStorage.setItem('barricade-name-escaper', currentNames.escaper)
                }
                currentTurnTimerSeconds = selectedTimerSeconds;
                initGame(selectedMode)
            };
            async function confirmGoHome() {
                if (!(await showConfirmDialog(t('confirmNewGame'), t('confirmHomeYes'), t('confirmHomeNo')))) return;
                goHome()
            }
            btnHome.onclick = confirmGoHome;
            btnRepeat.onclick = async () => {
                if (isAnimating) return;
                if (!(await showConfirmDialog(t('confirmRepeat'), t('confirmRepeatYes'), t('confirmRepeatNo')))) return;
                restartSameGame()
            };
            function performResign(player) {
                gameOver = !0;
                pendingWallPos = null;
                wallPreviewPos = null;
                hideWallConfirm();
                updateActivePlayerUI();
                draw();
                if (gameMode === '2p' || gameMode === 'hunter') {
                    const winner = players.find(p => p.id !== player.id);
                    setTimeout(() => showGameOverDialog(winner, player), 50)
                } else {
                    const winTeam = player.team === 0 ? 1 : 0;
                    setTimeout(() => showGameOverDialog(null, null, winTeam), 50)
                }
            }
            function performForfeit4p(player) {
                player.forfeited = !0;
                const mate = players.find(p => p.team === player.team && p.id !== player.id);
                const bothOut = !mate || mate.forfeited;
                if (bothOut) {
                    gameOver = !0;
                    updateActivePlayerUI();
                    renderTopbar();
                    draw();
                    setTimeout(() => showGameOverDialog(null, null, player.team === 0 ? 1 : 0), 50);
                    return
                }
                if (currentPlayer() && currentPlayer().id === player.id) {
                    advanceTurn()
                }
                updateActivePlayerUI();
                renderTopbar();
                draw()
            }

            btnResign.onclick = async () => {
                if (gameOver || isAnimating) return;
                const player = onlineState.active ? (players.find(p => p.id === onlineState.localPlayerId) || currentPlayer()) : currentPlayer();
                if (!(await showConfirmDialog(fmt(t('confirmResign'), { name: playerDisplayName(player) }), t('confirmResignYes'), t('confirmResignNo')))) return;
                if (onlineState.active && gameMode === '4p') {
                    performForfeit4p(player);
                    sendOnline({ type: 'forfeit', playerId: player.id })
                } else {
                    performResign(player);
                    if (onlineState.active) sendOnline({ type: 'resign', playerId: player.id })
                }
            };

            function renderTopbar() {
                topbarEl.innerHTML = '';
                if (gameMode === '2p' || gameMode === 'hunter') {
                    topbarEl.className = 'topbar mode-2p';
                    const p0 = players[0],
                        p1 = players[1];
                    const card0 = createPlayerCard(p0);
                    const card1 = createPlayerCard(p1);
                    const vsBox = document.createElement('div');
                    vsBox.className = 'bet-box';
                    vsBox.innerHTML = `<span class="vs-x">VS</span>`;
                    topbarEl.append(card0, vsBox, card1);
                    const mobileTopbar = document.getElementById('topbar-4p-mobile');
                    if (mobileTopbar) mobileTopbar.remove()
                } else {
                    topbarEl.className = 'topbar mode-4p desktop-4p';
                    for (const p of players) {
                        topbarEl.appendChild(createPlayerCard(p))
                    }
                    renderMobileTeamTopbar()
                }
            }

            function renderMobileTeamTopbar() {
                let mobileTopbar = document.getElementById('topbar-4p-mobile');
                if (mobileTopbar) mobileTopbar.remove();
                mobileTopbar = document.createElement('div');
                mobileTopbar.className = 'topbar-4p-mobile';
                mobileTopbar.id = 'topbar-4p-mobile';
                const teamAPlayers = players.filter(p => p.team === 0);
                const teamBPlayers = players.filter(p => p.team === 1);
                const colA = document.createElement('div');
                colA.className = 'team-col';
                teamAPlayers.forEach(p => colA.appendChild(createPlayerCard(p, !0)));
                const vsBox = document.createElement('div');
                vsBox.className = 'bet-box';
                vsBox.innerHTML = `<span class="vs-x">VS</span>`;
                const colB = document.createElement('div');
                colB.className = 'team-col';
                teamBPlayers.forEach(p => colB.appendChild(createPlayerCard(p, !0)));
                mobileTopbar.append(colA, vsBox, colB);
                topbarEl.insertAdjacentElement('afterend', mobileTopbar)
            }

            function createWallGauge(p, alignRight, mobileTeamRight) {
                const wrap = document.createElement('div');
                wrap.className = 'wall-gauge' + (alignRight ? ' align-right' : '');
                wrap.dataset.playerId = p.id;
                const pipRow = document.createElement('div');
                pipRow.className = 'wall-gauge-pips';
                const maxWalls = p.maxWalls || 10;
                for (let i = 0; i < maxWalls; i++) {
                    const pip = document.createElement('span');
                    pip.className = 'wall-pip';
                    if (i < p.walls) {
                        pip.classList.add('filled');
                        pip.style.background = p.color;
                        pip.style.color = p.color
                    }
                    pipRow.appendChild(pip)
                }
                const label = document.createElement('div');
                label.className = 'wall-gauge-label';
                const numSpan = document.createElement('span');
                numSpan.className = 'wall-gauge-num';
                numSpan.dataset.playerId = p.id;
                numSpan.textContent = localizeNum(p.walls);
                const iconSpan = document.createElement('span');
                iconSpan.className = 'wall-gauge-icon';
                iconSpan.innerHTML = '<svg class="icon-svg sm" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="4" y1="12" x2="20" y2="12"/></svg>';
                if (mobileTeamRight) {
                    wrap.style.direction = 'ltr';
                    wrap.style.flexDirection = 'row';
                    wrap.style.justifyContent = 'flex-end';
                    label.append(numSpan, iconSpan);
                    wrap.append(pipRow, label);
                } else {
                    label.append(iconSpan, numSpan);
                    wrap.append(label, pipRow);
                }
                return wrap
            }

            function createPlayerTimer(p, mobileTeamRight) {
                const wrap = document.createElement('div');
                wrap.className = 'player-timer';
                wrap.dataset.playerId = p.id;
                const iconSpan = document.createElement('span');
                iconSpan.className = 'pt-icon';
                iconSpan.innerHTML = '<svg class="icon-svg sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/></svg>';
                const track = document.createElement('div');
                track.className = 'pt-track';
                const fill = document.createElement('div');
                fill.className = 'pt-fill';
                const timeSpan = document.createElement('span');
                timeSpan.className = 'pt-time';
                timeSpan.textContent = '--:--';
                track.append(fill, timeSpan);
                if (mobileTeamRight) {
                    wrap.style.direction = 'ltr';
                    wrap.style.flexDirection = 'row';
                    wrap.style.justifyContent = 'flex-end';
                }
                wrap.append(iconSpan, track);
                return wrap
            }

            function createPlayerCard(p, forMobileTeamLayout) {
                const card = document.createElement('div');
                card.className = `player-card ${p.colorClass}`;
                card.dataset.playerId = p.id;
                const isTeamBIn4p = gameMode === '4p' && p.team === 1;
                if (isTeamBIn4p) card.classList.add('team-b-align');
                const isRightSide = (!forMobileTeamLayout && (gameMode === '2p' || gameMode === 'hunter') && p.id === 1) || (forMobileTeamLayout && p.team === 1) || isTeamBIn4p;
                const avatar = document.createElement('div');
                avatar.className = 'avatar';
                avatar.style.background = p.color;
                const info = document.createElement('div');
                info.className = 'player-info';
                
                if (isRightSide) {
                    info.style.direction = 'rtl';
                    info.style.textAlign = 'right';
                } else {
                    info.style.direction = 'ltr';
                    info.style.textAlign = 'left';
                }

                const nameDiv = document.createElement('div');
                nameDiv.className = 'name';
                nameDiv.textContent = playerDisplayName(p);
                if (p.forfeited) {
                    card.classList.add('forfeited');
                    const badge = document.createElement('span');
                    badge.className = 'forfeit-badge';
                    badge.textContent = omsg('انصراف داد', 'Forfeited');
                    nameDiv.appendChild(badge)
                }
                info.appendChild(nameDiv);
                if (gameMode === '4p') {
                    const teamDiv = document.createElement('div');
                    teamDiv.className = 'team-label';
                    teamDiv.textContent = p.team === 0 ? t('teamA') : t('teamB');
                    info.appendChild(teamDiv)
                } else if (gameMode === 'hunter') {
                    const roleDiv = document.createElement('div');
                    roleDiv.className = 'team-label';
                    roleDiv.textContent = p.role === 'hunter' ? t('roleHunter') : t('roleEscaper');
                    info.appendChild(roleDiv);
                    if (p.role === 'escaper') {
                        const proxDiv = document.createElement('div');
                        proxDiv.className = 'hunt-proximity';
                        proxDiv.dataset.huntProximity = '1';
                        for (let i = 0; i < HUNT_PROXIMITY_MAX; i++) {
                            const dot = document.createElement('span');
                            dot.className = 'hunt-dot';
                            proxDiv.appendChild(dot)
                        }
                        info.appendChild(proxDiv)
                    }
                }
                const reverseInternal = isTeamBIn4p || (forMobileTeamLayout && isRightSide);
                info.appendChild(createWallGauge(p, isRightSide, reverseInternal));
                info.appendChild(createPlayerTimer(p, reverseInternal));
                card.append(avatar, info);
                return card
            }

            function getCoordStr(row, col) {
                return colLetters[col] + (9 - row)
            }

            function inBounds(r, c) {
                return r >= 0 && r < 9 && c >= 0 && c < 9
            }

            function canPassBetween(r, c, dr, dc) {
                if (dr === -1) {
                    if (r <= 0) return !1;
                    return !hWalls[r - 1][c]
                }
                if (dr === 1) {
                    if (r >= 8) return !1;
                    return !hWalls[r][c]
                }
                if (dc === -1) {
                    if (c <= 0) return !1;
                    return !vWalls[r][c - 1]
                }
                if (dc === 1) {
                    if (c >= 8) return !1;
                    return !vWalls[r][c]
                }
                return !1
            }

            function isTargetCell(player, r, c) {
                switch (player.target) {
                    case 'row0':
                        return r === 0;
                    case 'row8':
                        return r === 8;
                    default:
                        return !1
                }
            }

            function playerAt(r, c, excludeId) {
                return players.find(p => p.id !== excludeId && p.row === r && p.col === c) || null
            }

            function getValidMoves(player) {
                let moves = [];
                const r = player.row,
                    c = player.col;
                const dirs = [
                    [-1, 0],
                    [1, 0],
                    [0, -1],
                    [0, 1]
                ];
                if (gameMode === 'hunter') {
                    const opponent = players.find(p => p.id !== player.id);
                    for (const [dr, dc] of dirs) {
                        if (!canPassBetween(r, c, dr, dc)) continue;
                        const nr = r + dr,
                            nc = c + dc;
                        if (player.role === 'escaper' && opponent && nr === opponent.row && nc === opponent.col) continue;
                        moves.push([nr, nc])
                    }
                    return moves
                }
                for (const [dr, dc] of dirs) {
                    if (!canPassBetween(r, c, dr, dc)) continue;
                    const nr = r + dr,
                        nc = c + dc;
                    const occ = playerAt(nr, nc, player.id);
                    if (!occ) {
                        moves.push([nr, nc]);
                        continue
                    }
                    if (canPassBetween(nr, nc, dr, dc)) {
                        const jr = nr + dr,
                            jc = nc + dc;
                        if (!playerAt(jr, jc, player.id)) moves.push([jr, jc]);
                    }
                    const perp = dr === 0 ? [
                        [-1, 0],
                        [1, 0]
                    ] : [
                        [0, -1],
                        [0, 1]
                    ];
                    for (const [pdr, pdc] of perp) {
                        if (canPassBetween(nr, nc, pdr, pdc)) {
                            const jr = nr + pdr,
                                jc = nc + pdc;
                            if (!playerAt(jr, jc, player.id)) moves.push([jr, jc]);
                        }
                    }
                }
                return moves
            }

            function canReachTarget(player) {
                const visited = new Set();
                const startKey = player.row + ',' + player.col;
                visited.add(startKey);
                const queue = [
                    [player.row, player.col]
                ];
                while (queue.length > 0) {
                    const [r, c] = queue.shift();
                    if (isTargetCell(player, r, c)) return !0;
                    const dirs = [
                        [-1, 0],
                        [1, 0],
                        [0, -1],
                        [0, 1]
                    ];
                    for (const [dr, dc] of dirs) {
                        if (!canPassBetween(r, c, dr, dc)) continue;
                        const nr = r + dr,
                            nc = c + dc;
                        const key = nr + ',' + nc;
                        if (visited.has(key)) continue;
                        visited.add(key);
                        queue.push([nr, nc])
                    }
                }
                return !1
            }

            function canReachCell(player, targetRow, targetCol) {
                const visited = new Set();
                const startKey = player.row + ',' + player.col;
                visited.add(startKey);
                const queue = [
                    [player.row, player.col]
                ];
                while (queue.length > 0) {
                    const [r, c] = queue.shift();
                    if (r === targetRow && c === targetCol) return !0;
                    const dirs = [
                        [-1, 0],
                        [1, 0],
                        [0, -1],
                        [0, 1]
                    ];
                    for (const [dr, dc] of dirs) {
                        if (!canPassBetween(r, c, dr, dc)) continue;
                        const nr = r + dr,
                            nc = c + dc;
                        const key = nr + ',' + nc;
                        if (visited.has(key)) continue;
                        visited.add(key);
                        queue.push([nr, nc])
                    }
                }
                return !1
            }

            function startAnimation(oldRow, oldCol, newRow, newCol, player, callback) {
                if (isAnimating) return;
                isAnimating = !0;
                const startX = padding + oldCol * cellSize + cellSize / 2;
                const startY = padding + oldRow * cellSize + cellSize / 2;
                const endX = padding + newCol * cellSize + cellSize / 2;
                const endY = padding + newRow * cellSize + cellSize / 2;
                animData = {
                    x1: startX,
                    y1: startY,
                    x2: endX,
                    y2: endY,
                    color: player.color,
                    playerId: player.id,
                    progress: 0,
                    callback
                };
                loopAnimation()
            }

            function animateWall(wallKey, callback) {
                wallAnimation = {
                    row: wallKey.row,
                    col: wallKey.col,
                    isH: wallKey.isH,
                    progress: 0,
                    callback
                };
                loopAnimation()
            }

            function loopAnimation() {
                const step = 1 / 12;
                let updated = !1;
                if (animData) {
                    animData.progress += step;
                    if (animData.progress >= 1) {
                        animData.progress = 1;
                        draw();
                        const cb = animData.callback;
                        animData = null;
                        isAnimating = !1;
                        if (cb) cb();
                        updated = !0
                    } else {
                        draw();
                        updated = !0
                    }
                }
                if (wallAnimation) {
                    wallAnimation.progress += step;
                    if (wallAnimation.progress >= 1) {
                        wallAnimation.progress = 1;
                        draw();
                        const cb = wallAnimation.callback;
                        wallAnimation = null;
                        if (cb) cb();
                        updated = !0
                    } else {
                        draw();
                        updated = !0
                    }
                }
                if (updated && (animData || wallAnimation)) requestAnimationFrame(loopAnimation)
            }

            function draw() {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.strokeStyle = '#282f3a';
                ctx.lineWidth = 1.2;
                for (let i = 0; i <= 9; i++) {
                    ctx.beginPath();
                    ctx.moveTo(padding, padding + i * cellSize);
                    ctx.lineTo(padding + 9 * cellSize, padding + i * cellSize);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(padding + i * cellSize, padding);
                    ctx.lineTo(padding + i * cellSize, padding + 9 * cellSize);
                    ctx.stroke()
                }
                for (const p of players) {
                    ctx.fillStyle = hexToRgba(p.color, 0.09);
                    if (p.target === 'row0') ctx.fillRect(padding, padding, 9 * cellSize, cellSize);
                    else if (p.target === 'row8') ctx.fillRect(padding, padding + 8 * cellSize, 9 * cellSize, cellSize);
                }
                if (!gameOver && uiMode === 'move' && !isAnimating && !captureAnim && players.length && (!onlineState.active || isMyOnlineTurn())) {
                    const player = currentPlayer();
                    const moves = getValidMoves(player);
                    const pulse = Math.sin(Date.now() / 300) * 0.3 + 0.7;
                    let capturePos = null;
                    if (gameMode === 'hunter' && player.role === 'hunter') {
                        const escaperP = players.find(p => p.role === 'escaper');
                        capturePos = { row: escaperP.row, col: escaperP.col }
                    }
                    ctx.lineWidth = 2.5;
                    ctx.shadowBlur = 8;
                    for (let [r, c] of moves) {
                        const isCapture = capturePos && r === capturePos.row && c === capturePos.col;
                        if (isCapture) {
                            ctx.strokeStyle = `rgba(255,59,48,${Math.min(1,pulse+0.15)})`;
                            ctx.shadowColor = 'rgba(255,59,48,0.65)'
                        } else {
                            ctx.strokeStyle = `rgba(255,255,255,${pulse*0.6})`;
                            ctx.shadowColor = 'rgba(255,255,255,0.4)'
                        }
                        ctx.strokeRect(padding + c * cellSize + 3, padding + r * cellSize + 3, cellSize - 6, cellSize - 6)
                    }
                    ctx.shadowBlur = 0
                }
                if (!gameOver && (uiMode === 'hwall' || uiMode === 'vwall') && wallPreviewPos && !pendingWallPos && !
                    isAnimating && (!onlineState.active || isMyOnlineTurn())) {
                    let pos = wallPreviewPos;
                    ctx.fillStyle = 'rgba(255,255,255,0.35)';
                    ctx.shadowBlur = 12;
                    ctx.shadowColor = 'rgba(255,255,255,0.25)';
                    ctx.beginPath();
                    if (uiMode === 'hwall') ctx.roundRect(padding + pos.col * cellSize, padding + (pos.row + 1) * cellSize -
                        4, cellSize * 2, 8, 4);
                    else ctx.roundRect(padding + (pos.col + 1) * cellSize - 4, padding + pos.row * cellSize, 8, cellSize * 2,
                        4);
                    ctx.fill();
                    ctx.shadowBlur = 0;
                    if (touchAnchorPos) {
                        const barCx = padding + (pos.col + 1) * cellSize;
                        const barCy = padding + (pos.row + 1) * cellSize;
                        const anchorX = padding + touchAnchorPos.x;
                        const anchorY = padding + touchAnchorPos.y;
                        ctx.save();
                        ctx.setLineDash([3, 4]);
                        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
                        ctx.lineWidth = 1.5;
                        ctx.beginPath();
                        ctx.moveTo(barCx, barCy);
                        ctx.lineTo(anchorX, anchorY);
                        ctx.stroke();
                        ctx.restore();
                        ctx.beginPath();
                        ctx.fillStyle = 'rgba(255,255,255,0.18)';
                        ctx.arc(anchorX, anchorY, 13, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.beginPath();
                        ctx.fillStyle = 'rgba(255,255,255,0.55)';
                        ctx.arc(anchorX, anchorY, 3.5, 0, Math.PI * 2);
                        ctx.fill()
                    }
                }
                if (!gameOver && pendingWallPos && !isAnimating) {
                    let pos = pendingWallPos;
                    const pulse = Math.sin(Date.now() / 220) * 0.25 + 0.75;
                    const col = currentPlayer() ? currentPlayer().color : '#ffffff';
                    ctx.fillStyle = hexToRgba(col, 0.55 * pulse);
                    ctx.shadowBlur = 16;
                    ctx.shadowColor = hexToRgba(col, 0.7);
                    ctx.beginPath();
                    if (pos.mode === 'hwall') ctx.roundRect(padding + pos.col * cellSize, padding + (pos.row + 1) * cellSize -
                        4, cellSize * 2, 8, 4);
                    else ctx.roundRect(padding + (pos.col + 1) * cellSize - 4, padding + pos.row * cellSize, 8, cellSize * 2,
                        4);
                    ctx.fill();
                    ctx.shadowBlur = 0
                }
                ctx.fillStyle = '#acb8c8';
                ctx.shadowColor = 'rgba(255,255,255,0.1)';
                ctx.shadowBlur = 6;
                for (let r = 0; r < 9; r++)
                    for (let c = 0; c < 9; c++) {
                        if (hWalls[r][c]) {
                            let wp = 1;
                            if (wallAnimation && wallAnimation.isH && wallAnimation.row === r && wallAnimation.col === c) wp =
                                wallAnimation.progress;
                            ctx.globalAlpha = wp;
                            ctx.beginPath();
                            ctx.roundRect(padding + c * cellSize, padding + (r + 1) * cellSize - 3, cellSize, 6, 3);
                            ctx.fill()
                        }
                    }
                for (let r = 0; r < 9; r++)
                    for (let c = 0; c < 9; c++) {
                        if (vWalls[r][c]) {
                            let wp = 1;
                            if (wallAnimation && !wallAnimation.isH && wallAnimation.row === r && wallAnimation.col === c) wp =
                                wallAnimation.progress;
                            ctx.globalAlpha = wp;
                            ctx.beginPath();
                            ctx.roundRect(padding + (c + 1) * cellSize - 3, padding + r * cellSize, 8, cellSize, 3);
                            ctx.fill()
                        }
                    }
                ctx.globalAlpha = 1;
                ctx.shadowBlur = 0;
                for (const p of players) {
                    if (captureAnim && (p.role === 'hunter' || p.role === 'escaper')) continue;
                    drawPiece(p, animData && animData.playerId === p.id)
                }
                if (captureAnim) drawCaptureAnimation()
            }

            function drawCaptureAnimation() {
                const hunterP = players.find(p => p.role === 'hunter');
                const escaperP = players.find(p => p.role === 'escaper');
                const x = padding + escaperP.col * cellSize + cellSize / 2;
                const y = padding + escaperP.row * cellSize + cellSize / 2;
                const p = captureAnim.progress;
                ctx.save();
                if (p < 0.55) {
                    const shockP = p / 0.55;
                    const shockR = cellSize * 0.15 + shockP * cellSize * 0.9;
                    ctx.globalAlpha = Math.max(0, 0.5 * (1 - shockP));
                    ctx.beginPath();
                    ctx.arc(x, y, shockR, 0, Math.PI * 2);
                    ctx.strokeStyle = hunterP.color;
                    ctx.lineWidth = 3 * (1 - shockP) + 0.5;
                    ctx.stroke()
                }
                ctx.restore();
                const escRadius = cellSize * 0.34 * Math.max(0, 1 - Math.pow(p * 1.15, 1.4));
                if (escRadius > 0.6) {
                    ctx.save();
                    const wobble = Math.sin(p * 40) * 2 * (1 - p);
                    ctx.translate(wobble, 0);
                    ctx.globalAlpha = Math.max(0, 1 - p * 1.25);
                    ctx.beginPath();
                    ctx.arc(x, y, escRadius, 0, Math.PI * 2);
                    ctx.fillStyle = escaperP.color;
                    ctx.fill();
                    ctx.restore();
                    if (p < 0.5) {
                        const sparkCount = 6;
                        for (let i = 0; i < sparkCount; i++) {
                            const ang = (i / sparkCount) * Math.PI * 2 + p * 3;
                            const dist = escRadius * 0.6 + p * cellSize * 0.5;
                            const sx = x + Math.cos(ang) * dist,
                                sy = y + Math.sin(ang) * dist;
                            ctx.save();
                            ctx.globalAlpha = Math.max(0, (0.5 - p) * 1.6);
                            ctx.beginPath();
                            ctx.arc(sx, sy, 2.2 * (1 - p * 1.5), 0, Math.PI * 2);
                            ctx.fillStyle = escaperP.color;
                            ctx.fill();
                            ctx.restore()
                        }
                    }
                }
                const mouthAngle = Math.abs(Math.sin(p * Math.PI * 3.2)) * 0.42 + 0.03;
                const squash = 1 + Math.sin(Math.min(1, p * 2.2) * Math.PI) * 0.14;
                const radius = cellSize * 0.38 * squash;
                ctx.save();
                ctx.translate(x, y);
                ctx.scale(1, 1 / squash);
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.arc(0, 0, radius, mouthAngle, Math.PI * 2 - mouthAngle);
                ctx.closePath();
                const grad = ctx.createRadialGradient(0, 0, radius * 0.15, 0, 0, radius);
                grad.addColorStop(0, hexToRgba(hunterP.color, 1));
                grad.addColorStop(1, hexToRgba(hunterP.color, 0.85));
                ctx.fillStyle = grad;
                ctx.shadowColor = hexToRgba(hunterP.color, 0.75);
                ctx.shadowBlur = 14;
                ctx.fill();
                ctx.restore();
                if (p > 0.55) {
                    const ringP = (p - 0.55) / 0.45;
                    ctx.save();
                    ctx.globalAlpha = Math.max(0, 0.55 * (1 - ringP));
                    ctx.beginPath();
                    ctx.arc(x, y, radius * (1 + ringP * 0.7), 0, Math.PI * 2);
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 2 * (1 - ringP);
                    ctx.stroke();
                    ctx.restore()
                }
            }

            function hexToRgba(hex, alpha) {
                const r = parseInt(hex.slice(1, 3), 16),
                    g = parseInt(hex.slice(3, 5), 16),
                    b = parseInt(hex.slice(5, 7), 16);
                return `rgba(${r},${g},${b},${alpha})`
            }

            function drawPiece(player, isAnimatingPiece) {
                let x = padding + player.col * cellSize + cellSize / 2;
                let y = padding + player.row * cellSize + cellSize / 2;
                if (isAnimatingPiece && animData) {
                    const p = Math.min(1, animData.progress);
                    const ease = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
                    x = animData.x1 + (animData.x2 - animData.x1) * ease;
                    y = animData.y1 + (animData.y2 - animData.y1) * ease;
                }
                const radius = cellSize * 0.34;
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fillStyle = player.color;
                ctx.fill();
            }
            if (!CanvasRenderingContext2D.prototype.roundRect) {
                CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
                    if (r > w / 2) r = w / 2;
                    if (r > h / 2) r = h / 2;
                    this.moveTo(x + r, y);
                    this.arcTo(x + w, y, x + w, y + h, r);
                    this.arcTo(x + w, y + h, x, y + h, r);
                    this.arcTo(x, y + h, x, y, r);
                    this.arcTo(x, y, x + w, y, r);
                    return this
                }
            }

            function makeSnapshot() {
                return {
                    players: players.map(p => ({ ...p })),
                    hWalls: hWalls.map(a => [...a]),
                    vWalls: vWalls.map(a => [...a]),
                    turnIndex: turnIndex,
                    turn: turn,
                    historyLen: history.length,
                    gameOver: gameOver,
                    huntProximity: huntProximity
                }
            }
            btnUndo.onclick = () => {
                if (isAnimating) return;
                if (onlineState.active) { showToast(omsg('در حالت آنلاین امکان بازگشت نیست', 'Undo is not available in online games')); return }
                if (undoStack.length === 0) {
                    showToast(t('toastNothingToUndo'));
                    return
                }
                const snap = undoStack.pop();
                players = snap.players.map(p => ({ ...p }));
                hWalls = snap.hWalls.map(a => [...a]);
                vWalls = snap.vWalls.map(a => [...a]);
                turnIndex = snap.turnIndex;
                turn = snap.turn;
                gameOver = snap.gameOver;
                huntProximity = snap.huntProximity || 0;
                history.splice(snap.historyLen);
                animData = null;
                wallAnimation = null;
                captureAnim = null;
                isAnimating = !1;
                pendingWallPos = null;
                wallPreviewPos = null;
                hideWallConfirm();
                const totalPages = Math.max(1, Math.ceil(history.length / ITEMS_PER_PAGE));
                if (currentPage >= totalPages) currentPage = totalPages - 1;
                if (currentPage < 0) currentPage = 0;
                updateHistory();
                updateScores();
                updateActivePlayerUI();
                updateProximityUI();
                draw()
            };

            function executeMove(row, col) {
                if (gameOver || isAnimating) return;
                if (onlineState.active && !onlineState.applyingRemote && !isMyOnlineTurn()) return;
                const player = currentPlayer();
                const moves = getValidMoves(player);
                const valid = moves.some(m => m[0] === row && m[1] === col);
                if (!valid) {
                    showToast(t('toastInvalidMove'));
                    return
                }
                if (onlineState.active && !onlineState.applyingRemote) sendOnline({ type: 'move', row, col });
                let captureTarget = null;
                if (gameMode === 'hunter' && player.role === 'hunter') {
                    const escaperP = players.find(p => p.role === 'escaper');
                    if (escaperP.row === row && escaperP.col === col) captureTarget = escaperP
                }
                sfxMove();
                undoStack.push(makeSnapshot());
                const oldRow = player.row,
                    oldCol = player.col;
                player.row = row;
                player.col = col;
                history.push({
                    type: 'MOVE',
                    player: player.name,
                    colorClass: player.colorClass,
                    colorHex: player.color,
                    action: getCoordStr(row, col)
                });
                goToLastHistoryPage();
                updateHistory();
                startAnimation(oldRow, oldCol, row, col, player, () => {
                    if (captureTarget) {
                        animateCapture(() => {
                            checkWinAfterMove(player);
                            if (!gameOver) advanceTurn();
                            updateActivePlayerUI();
                            draw()
                        })
                    } else {
                        checkWinAfterMove(player);
                        if (!gameOver && gameMode === 'hunter' && player.role === 'hunter') checkHuntProximity();
                        if (!gameOver) advanceTurn();
                        updateActivePlayerUI();
                        draw()
                    }
                })
            }

            function animateCapture(callback) {
                isAnimating = !0;
                captureAnim = { progress: 0 };
                sfxBite();

                function loop() {
                    captureAnim.progress += 1 / 24;
                    draw();
                    if (captureAnim.progress >= 1) {
                        captureAnim = null;
                        isAnimating = !1;
                        draw();
                        if (callback) callback();
                        return
                    }
                    requestAnimationFrame(loop)
                }
                loop()
            }

            function confirmWall() {
                if (!pendingWallPos || gameOver || isAnimating) return;
                if (onlineState.active && !onlineState.applyingRemote && !isMyOnlineTurn()) {
                    pendingWallPos = null;
                    wallPreviewPos = null;
                    hideWallConfirm();
                    draw();
                    return
                }
                const player = currentPlayer();
                if (player.walls <= 0) {
                    showToast(t('toastNoWalls'));
                    pendingWallPos = null;
                    wallPreviewPos = null;
                    hideWallConfirm();
                    draw();
                    return
                }
                const snap0 = makeSnapshot();
                const pos = pendingWallPos;
                const backupH = hWalls.map(a => [...a]);
                const backupV = vWalls.map(a => [...a]);
                let wallKey = null;
                try {
                    if (pos.mode === 'hwall') {
                        const row = pos.row,
                            col = pos.col;
                        if (row < 0 || row > 7 || col < 0 || col > 7) return;
                        if (vWalls[row][col] && vWalls[row + 1][col]) {
                            showToast(t('alertPerpendicular'));
                            pendingWallPos = null;
                            wallPreviewPos = null;
                            hideWallConfirm();
                            draw();
                            return
                        }
                        if (hWalls[row][col] || hWalls[row][col + 1]) {
                            showToast(t('toastWallExists'));
                            pendingWallPos = null;
                            wallPreviewPos = null;
                            hideWallConfirm();
                            draw();
                            return
                        }
                        hWalls[row][col] = !0;
                        hWalls[row][col + 1] = !0;
                        wallKey = { row, col, isH: !0 }
                    } else {
                        const row = pos.row,
                            col = pos.col;
                        if (row < 0 || row > 7 || col < 0 || col > 7) return;
                        if (hWalls[row][col] && hWalls[row][col + 1]) {
                            showToast(t('alertPerpendicular'));
                            pendingWallPos = null;
                            wallPreviewPos = null;
                            hideWallConfirm();
                            draw();
                            return
                        }
                        if (vWalls[row][col] || vWalls[row + 1][col]) {
                            showToast(t('toastWallExists'));
                            pendingWallPos = null;
                            wallPreviewPos = null;
                            hideWallConfirm();
                            draw();
                            return
                        }
                        vWalls[row][col] = !0;
                        vWalls[row + 1][col] = !0;
                        wallKey = { row, col, isH: !1 }
                    }
                    let blocksSomeone;
                    if (gameMode === 'hunter') {
                        const hunterP = players.find(p => p.role === 'hunter');
                        const escaperP = players.find(p => p.role === 'escaper');
                        blocksSomeone = !canReachCell(hunterP, escaperP.row, escaperP.col) || !canReachTarget(escaperP)
                    } else {
                        blocksSomeone = players.some(p => !p.finished && !canReachTarget(p))
                    }
                    if (blocksSomeone) {
                        hWalls = backupH;
                        vWalls = backupV;
                        showToast(t('alertBlocked'));
                        pendingWallPos = null;
                        wallPreviewPos = null;
                        hideWallConfirm();
                        draw();
                        return
                    }
                    if (onlineState.active && !onlineState.applyingRemote) sendOnline({ type: 'wall', row: pos.row, col: pos.col, mode: pos.mode });
                    undoStack.push(snap0);
                    sfxWall();
                    player.walls--;
                    const wallStr = (pos.mode === 'hwall' ? 'H ' : 'V ') + getCoordStr(pos.row, pos.col);
                    history.push({
                        type: 'WALL',
                        player: player.name,
                        colorClass: player.colorClass,
                        colorHex: player.color,
                        action: wallStr
                    });
                    goToLastHistoryPage();
                    updateHistory();
                    updateScores();
                    pendingWallPos = null;
                    wallPreviewPos = null;
                    hideWallConfirm();
                    animateWall(wallKey, () => {
                        advanceTurn();
                        updateActivePlayerUI();
                        draw()
                    })
                } catch (e) {
                    hWalls = backupH;
                    vWalls = backupV
                }
            }

            function goToLastHistoryPage() {
                const totalPages = Math.ceil(history.length / ITEMS_PER_PAGE);
                if (currentPage !== totalPages - 1) currentPage = totalPages - 1
            }

            function checkWinAfterMove(player) {
                if (gameMode === 'hunter') {
                    const hunterP = players.find(p => p.role === 'hunter');
                    const escaperP = players.find(p => p.role === 'escaper');
                    if (hunterP.row === escaperP.row && hunterP.col === escaperP.col) {
                        gameOver = !0;
                        setTimeout(() => showGameOverDialog(hunterP, escaperP), 100);
                        updateScores();
                        return
                    }
                    if (isTargetCell(escaperP, escaperP.row, escaperP.col)) {
                        escaperP.finished = !0;
                        gameOver = !0;
                        setTimeout(() => showGameOverDialog(escaperP, hunterP), 100)
                    }
                    updateScores();
                    return
                }
                if (!isTargetCell(player, player.row, player.col)) return;
                player.finished = !0;
                if (gameMode === '2p') {
                    gameOver = !0;
                    const loser = players.find(p => p.id !== player.id);
                    setTimeout(() => showGameOverDialog(player, loser), 100)
                } else {
                    const mate = players.find(p => p.team === player.team && p.id !== player.id);
                    if (mate && mate.finished) {
                        gameOver = !0;
                        setTimeout(() => showGameOverDialog(null, null, player.team), 100)
                    }
                }
                updateScores()
            }

            function updateProximityUI() {
                document.querySelectorAll('.hunt-proximity').forEach(badge => {
                    const dots = badge.querySelectorAll('.hunt-dot');
                    dots.forEach((d, i) => d.classList.toggle('filled', i < huntProximity))
                })
            }

            function wallBetween(r1, c1, r2, c2) {
                if (r1 === r2) {
                    const col = Math.min(c1, c2);
                    return !!vWalls[r1][col]
                }
                if (c1 === c2) {
                    const row = Math.min(r1, r2);
                    return !!hWalls[row][c1]
                }
                return !1
            }

            function checkHuntProximity() {
                if (gameMode !== 'hunter' || gameOver) return;
                const hunterP = players.find(p => p.role === 'hunter');
                const escaperP = players.find(p => p.role === 'escaper');
                if (isAdjacent(hunterP.row, hunterP.col, escaperP.row, escaperP.col) && !wallBetween(hunterP.row, hunterP.col,
                        escaperP.row, escaperP.col)) {
                    huntProximity++;
                    updateProximityUI();
                    sfxProximity();
                    if (huntProximity >= HUNT_PROXIMITY_MAX) {
                        gameOver = !0;
                        showToast(t('huntProximityWinToast'));
                        setTimeout(() => showGameOverDialog(hunterP, escaperP), 150)
                    } else {
                        showToast(fmt(t('huntProximityToast'), { n: huntProximity }))
                    }
                }
            }

            function updateDangerState() {
                if (gameMode !== 'hunter') {
                    boardWrapper.classList.remove('danger');
                    return
                }
                const hunterP = players.find(p => p.role === 'hunter');
                const escaperP = players.find(p => p.role === 'escaper');
                const player = currentPlayer();
                const dangerNow = !gameOver && player && player.role === 'escaper' && isAdjacent(hunterP.row, hunterP.col,
                    escaperP.row, escaperP.col) && !wallBetween(hunterP.row, hunterP.col, escaperP.row, escaperP.col);
                boardWrapper.classList.toggle('danger', dangerNow);
            }

            function showGameOverDialog(winnerPlayer, loserPlayer, winnerTeam) {
                let winnerLabel, loserLabel, winnerColorClass, winnerColor;
                if (winnerTeam !== undefined && winnerTeam !== null) {
                    const loserTeam = winnerTeam === 0 ? 1 : 0;
                    winnerLabel = teamPlayerNames(winnerTeam);
                    loserLabel = teamPlayerNames(loserTeam);
                    const wp = players.find(p => p.team === winnerTeam);
                    winnerColorClass = wp.colorClass;
                    winnerColor = wp.color
                } else {
                    winnerLabel = playerDisplayName(winnerPlayer);
                    loserLabel = playerDisplayName(loserPlayer);
                    winnerColorClass = winnerPlayer.colorClass;
                    winnerColor = winnerPlayer.color
                }
                goWinnerName.textContent = winnerLabel;
                goWinnerName.className = 'go-winner-name ' + winnerColorClass;
                goWinnerName.style.color = winnerColor;
                goNameWinner.textContent = winnerLabel;
                goNameLoser.textContent = loserLabel;
                gameOverOverlay.classList.add('visible');
                resetOnlineRematchState();
                refreshGameOverDialogOnlineState();
                sfxWin()
            }

            function hideGameOverOverlay() {
                gameOverOverlay.classList.remove('visible')
            }

            function resetOnlineRematchState() {
                onlineRematch.requestedByMe = !1;
                onlineRematch.requestedByOpponent = !1
            }

            function refreshGameOverDialogOnlineState() {
                const statusEl = document.getElementById('go-online-status');
                if (!onlineState.active) {
                    btnGoRepeat.style.display = '';
                    btnGoRepeat.disabled = !1;
                    setTextContent('lbl-go-repeat', t('goPlayAgain'));
                    if (statusEl) statusEl.style.display = 'none';
                    return
                }
                if (onlineState.peerLeft) {
                    btnGoRepeat.style.display = 'none';
                    if (statusEl) { statusEl.textContent = t('opponentLeftMsg'); statusEl.style.display = 'block' }
                    return
                }
                if (statusEl) statusEl.style.display = 'none';
                btnGoRepeat.style.display = '';
                if (onlineRematch.requestedByOpponent) {
                    btnGoRepeat.disabled = !1;
                    setTextContent('lbl-go-repeat', t('rematchAcceptLabel'))
                } else if (onlineRematch.requestedByMe) {
                    btnGoRepeat.disabled = !0;
                    setTextContent('lbl-go-repeat', t('rematchWaitingLabel'))
                } else {
                    btnGoRepeat.disabled = !1;
                    setTextContent('lbl-go-repeat', t('goPlayAgain'))
                }
            }

            function restartSameGame() {
                hideGameOverOverlay();
                resetOnlineRematchState();
                initGame(gameMode);
                if (onlineState.active) {
                    applyOnlineProfilesToPlayers();
                    renderTopbar();
                    updateScores();
                    updateActivePlayerUI();
                    draw()
                }
            }

            function goHome() {
                hideGameOverOverlay();
                stopTurnTimer();
                turnTimerPlayerId = null;
                onlineEntryFromNameEntry = false;
                if (onlineState.active) { teardownOnline(!0); resetOnlineSetupUI() }
                document.getElementById('name-entry-view').style.display = 'none';
                const lobbyView = document.getElementById('online-lobby-view');
                if (lobbyView) lobbyView.style.display = 'none';
                document.getElementById('mode-select-view').style.display = 'block';
                startOverlay.style.display = 'flex';
                appEl.classList.remove('visible');
                setThemeColor('#000000');
                const topCtrls = document.getElementById('top-controls');
                if (topCtrls) topCtrls.style.display = 'flex';
                const soundBtnHeader = document.getElementById('btn-sound-board');
                if (soundBtnHeader) soundBtnHeader.classList.remove('visible');
                const mobileTopbar = document.getElementById('topbar-4p-mobile');
                if (mobileTopbar) mobileTopbar.remove();
                window.scrollTo(0, 0)
            }
            btnGoRepeat.onclick = async () => {
                if (!onlineState.active) { restartSameGame(); return }
                if (onlineState.peerLeft) return;
                if (onlineRematch.requestedByOpponent) {
                    onlineRematch.requestedByOpponent = !1;
                    onlineRematch.requestedByMe = !1;
                    sendOnline({ type: 'rematch-accept' });
                    restartSameGame();
                    return
                }
                if (!onlineRematch.requestedByMe) {
                    onlineRematch.requestedByMe = !0;
                    sendOnline({ type: 'rematch-request' });
                    refreshGameOverDialogOnlineState()
                }
            };
            btnGoHome.onclick = goHome;

            function advanceTurn() {
                if (gameOver) return;
                let attempts = 0;
                const allFinished = players.every(p => p.finished || p.forfeited);
                if (allFinished) return;
                do {
                    turnIndex = (turnIndex + 1) % turnOrder.length;
                    attempts++
                } while ((players[turnOrder[turnIndex]].finished || players[turnOrder[turnIndex]].forfeited) && attempts <= turnOrder.length);
                turn = turnOrder[turnIndex]
            }

            function updateActivePlayerUI() {
                for (const p of players) {
                    document.querySelectorAll(`.player-card[data-player-id="${p.id}"]`).forEach(card => {
                        card.classList.toggle('active', p.id === turn && !gameOver);
                        card.classList.toggle('finished', p.finished)
                    })
                }
                const player = currentPlayer();
                if (player) {
                    statusText.textContent = gameOver ? t('gameOver') : `${playerDisplayName(player)}${t('turnSuffix')}`;
                    statusText.className = gameOver ? '' : `text-${player.colorClass}`;
                    statusText.style.color = gameOver ? '' : player.color;
                    infoWalls.textContent = `${localizeNum(player.walls)} / ${localizeNum(player.maxWalls || 10)}`
                }
                updateDangerState();
                updateOnlineTurnLockUI();
                syncTurnTimer()
            }

            function updateOnlineTurnLockUI() {
                if (!onlineState.active) {
                    hideTurnBanner();
                    return
                }
                const myTurn = isMyOnlineTurn();
                if (!myTurn) {
                    uiMode = 'move';
                    wallPreviewPos = null;
                    pendingWallPos = null;
                    hideWallConfirm();
                    updateBtnState()
                }
                if (!gameOver) showTurnBanner(myTurn); else hideTurnBanner();
                draw()
            }

            function showTurnBanner(myTurn) {
                const row = document.getElementById('online-turn-row');
                if (!row) return;
                row.classList.toggle('otb-mine', myTurn);
                row.classList.toggle('otb-theirs', !myTurn);
                row.querySelector('.otb-text').textContent = myTurn ?
                    omsg('نوبت شماست', 'Your turn') :
                    omsg('نوبت حریف', "Opponent's turn");
                row.style.display = 'flex'
            }

            function hideTurnBanner() {
                const row = document.getElementById('online-turn-row');
                if (row) row.style.display = 'none'
            }

            function updateScores() {
                for (const p of players) {
                    document.querySelectorAll(`.wall-gauge-num[data-player-id="${p.id}"]`).forEach(el => {
                        el.textContent = localizeNum(p.walls)
                    });
                    document.querySelectorAll(`.wall-gauge[data-player-id="${p.id}"]`).forEach(gauge => {
                        const pips = gauge.querySelectorAll('.wall-pip');
                        pips.forEach((pip, i) => {
                            const filled = i < p.walls;
                            pip.classList.toggle('filled', filled);
                            pip.style.background = filled ? p.color : '';
                            pip.style.color = p.color
                        })
                    })
                }
                const player = currentPlayer();
                if (player) infoWalls.textContent = `${localizeNum(player.walls)} / ${localizeNum(player.maxWalls || 10)}`
            }

            function updateHistory() {
                historyList.innerHTML = '';
                if (history.length === 0) {
                    const msg = document.createElement('div');
                    msg.style.cssText = 'color: #4a5568; font-size: 12px; text-align: center; padding: 20px 0;';
                    msg.textContent = t('startGame');
                    historyList.appendChild(msg);
                    document.querySelector('.history-pagination').innerHTML =
                        `<span>‹</span> ${localizeNum(1)} / ${localizeNum(1)} <span>›</span>`;
                    return
                }
                const totalPages = Math.ceil(history.length / ITEMS_PER_PAGE);
                if (currentPage >= totalPages) currentPage = totalPages - 1;
                if (currentPage < 0) currentPage = 0;
                const startIndex = currentPage * ITEMS_PER_PAGE;
                const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, history.length);
                const displayHistory = history.slice(startIndex, endIndex);
                const groupSize = (gameMode === '2p' || gameMode === 'hunter') ? 2 : 4;
                const fragment = document.createDocumentFragment();
                for (let i = 0; i < displayHistory.length; i++) {
                    const move = displayHistory[i];
                    const item = document.createElement('div');
                    item.className = 'history-item';
                    const numSpan = document.createElement('span');
                    numSpan.className = 'num';
                    if ((startIndex + i) % groupSize === 0) {
                        numSpan.textContent = localizeNum(Math.floor((startIndex + i) / groupSize) + 1) + '.'
                    }
                    const symbolContainer = document.createElement('span');
                    symbolContainer.className = 'symbol-container';
                    const symbolInner = document.createElement('span');
                    const pClass = move.colorClass || 'red';
                    if (move.type === 'WALL') {
                        symbolInner.className = `symbol-line ${pClass}`;
                        if (move.action.startsWith('H ')) symbolInner.classList.add('horizontal');
                        else symbolInner.classList.add('vertical')
                    } else {
                        symbolInner.className = `symbol-circle ${pClass}`
                    }
                    if (move.colorHex) symbolInner.style.background = move.colorHex;
                    symbolContainer.appendChild(symbolInner);
                    const moveSpan = document.createElement('span');
                    moveSpan.className = 'action-text';
                    moveSpan.textContent = move.action;
                    item.append(numSpan, symbolContainer, moveSpan);
                    fragment.appendChild(item)
                }
                historyList.appendChild(fragment);
                const pagination = document.querySelector('.history-pagination');
                pagination.innerHTML =
                    `<span id="history-prev">‹</span> ${localizeNum(currentPage + 1)} / ${localizeNum(totalPages)} <span id="history-next">›</span>`;
                const prevBtn = document.getElementById('history-prev');
                const nextBtn = document.getElementById('history-next');
                if (currentPage === 0) {
                    prevBtn.style.cursor = 'default';
                    prevBtn.style.color = '#4a5568'
                } else {
                    prevBtn.style.cursor = 'pointer';
                    prevBtn.style.color = 'var(--text-muted)';
                    prevBtn.onclick = () => {
                        if (currentPage > 0) {
                            currentPage--;
                            updateHistory()
                        }
                    }
                }
                if (currentPage === totalPages - 1) {
                    nextBtn.style.cursor = 'default';
                    nextBtn.style.color = '#4a5568'
                } else {
                    nextBtn.style.cursor = 'pointer';
                    nextBtn.style.color = 'var(--text-muted)';
                    nextBtn.onclick = () => {
                        if (currentPage < totalPages - 1) {
                            currentPage++;
                            updateHistory()
                        }
                    }
                }
            }

            function updateBtnState() {
                btnMove.classList.toggle('active', uiMode === 'move');
                btnHWall.classList.toggle('active', uiMode === 'hwall');
                btnVWall.classList.toggle('active', uiMode === 'vwall')
            }

            function showWallConfirm(pos) {
                const canvasRect = canvas.getBoundingClientRect();
                const wrapperRect = boardWrapper.getBoundingClientRect();
                const scaleX = canvasRect.width / canvas.width;
                const scaleY = canvasRect.height / canvas.height;
                let cx, cy;
                if (pos.mode === 'hwall') {
                    cx = padding + pos.col * cellSize + cellSize;
                    cy = padding + (pos.row + 1) * cellSize
                } else {
                    cx = padding + (pos.col + 1) * cellSize;
                    cy = padding + pos.row * cellSize + cellSize
                }
                let screenX = (canvasRect.left - wrapperRect.left) + cx * scaleX;
                let screenY = (canvasRect.top - wrapperRect.top) + cy * scaleY;

                const margin = 6;
                const popupW = wallConfirmPopup.offsetWidth;
                const popupH = wallConfirmPopup.offsetHeight;
                const wrapperW = wrapperRect.width;
                const wrapperH = wrapperRect.height;

                if (popupW > 0 && popupH > 0) {
                    // Horizontal clamp: transform is translate(-50%, -140%), so the
                    // popup's rendered left/right edges sit at screenX ± popupW/2.
                    const leftEdge = screenX - popupW / 2;
                    const rightEdge = screenX + popupW / 2;
                    if (leftEdge < margin) screenX += margin - leftEdge;
                    else if (rightEdge > wrapperW - margin) screenX -= rightEdge - (wrapperW - margin);

                    // Vertical clamp: top edge is screenY - 1.4*popupH, bottom edge
                    // is screenY - 0.4*popupH.
                    const topEdge = screenY - popupH * 1.4;
                    const bottomEdge = screenY - popupH * 0.4;
                    if (topEdge < margin) screenY += margin - topEdge;
                    else if (bottomEdge > wrapperH - margin) screenY -= bottomEdge - (wrapperH - margin);
                }

                wallConfirmPopup.style.left = screenX + 'px';
                wallConfirmPopup.style.top = screenY + 'px';
                wallConfirmPopup.classList.add('visible')
            }

            function hideWallConfirm() {
                wallConfirmPopup.classList.remove('visible')
            }
            wallConfirmYes.onclick = confirmWall;
            wallConfirmNo.onclick = () => {
                pendingWallPos = null;
                wallPreviewPos = null;
                hideWallConfirm();
                draw()
            };

            const TOUCH_PREVIEW_OFFSET_Y = 56;
            const TOUCH_PREVIEW_OFFSET_X = 56;

            function getCellFromEvent(e, offsetX, offsetY) {
                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width;
                const scaleY = canvas.height / rect.height;
                const clientX = e.clientX - (offsetX || 0);
                const clientY = e.clientY - (offsetY || 0);
                let x = (clientX - rect.left) * scaleX - padding;
                let y = (clientY - rect.top) * scaleY - padding;
                if (x < 0 || y < 0 || x > 9 * cellSize || y > 9 * cellSize) return null;
                return { x, y }
            }

            function getWallSnap(e, offsetX, offsetY) {
                const pos = getCellFromEvent(e, offsetX, offsetY);
                if (!pos) return null;
                let x = pos.x,
                    y = pos.y;
                if (uiMode === 'hwall') {
                    let lineIdx = Math.round(y / cellSize);
                    if (lineIdx < 1 || lineIdx > 8) return null;
                    let row = lineIdx - 1;
                    let col = Math.floor(x / cellSize);
                    if (col < 0 || col > 7) return null;
                    return { row, col, mode: 'hwall' }
                } else if (uiMode === 'vwall') {
                    let lineIdx = Math.round(x / cellSize);
                    if (lineIdx < 1 || lineIdx > 8) return null;
                    let col = lineIdx - 1;
                    let row = Math.floor(y / cellSize);
                    if (row < 0 || row > 7) return null;
                    return { row, col, mode: 'vwall' }
                }
                return null
            }

            function handleWallTap(e, offsetX, offsetY) {
                const snap = getWallSnap(e, offsetX, offsetY);
                if (!snap) {
                    if (pendingWallPos) {
                        pendingWallPos = null;
                        hideWallConfirm();
                        draw()
                    }
                    return
                }
                if (!pendingWallPos || pendingWallPos.row !== snap.row || pendingWallPos.col !== snap.col || pendingWallPos
                    .mode !== snap.mode) {
                    pendingWallPos = snap;
                    wallPreviewPos = snap;
                    showWallConfirm(snap);
                    draw()
                }
            }
            canvas.addEventListener('mousemove', (e) => {
                if (gameOver || isAnimating) return;
                if (onlineState.active && !isMyOnlineTurn()) return;
                touchAnchorPos = null;
                if (uiMode !== 'move' && !pendingWallPos) {
                    wallPreviewPos = getWallSnap(e) || null;
                    draw()
                }
            });
            canvas.addEventListener('mousedown', (e) => {
                if (gameOver || isAnimating) return;
                if (onlineState.active && !isMyOnlineTurn()) return;
                if (uiMode === 'move') {
                    const pos = getCellFromEvent(e);
                    if (!pos) return;
                    let col = Math.floor(pos.x / cellSize);
                    let row = Math.floor(pos.y / cellSize);
                    executeMove(row, col)
                } else {
                    handleWallTap(e)
                }
            });
            canvas.addEventListener('mouseleave', () => {
                if (!pendingWallPos) {
                    wallPreviewPos = null;
                    draw()
                }
            });
            canvas.addEventListener('touchstart', (e) => {
                touchDidMove = false
            }, { passive: !0 });
            canvas.addEventListener('touchmove', (e) => {
                e.preventDefault();
                if (gameOver || isAnimating) return;
                if (onlineState.active && !isMyOnlineTurn()) return;
                touchDidMove = true;
                const touch = e.touches[0];
                if (uiMode !== 'move' && !pendingWallPos) {
                    const offsetX = uiMode === 'vwall' ? TOUCH_PREVIEW_OFFSET_X : 0;
                    const offsetY = uiMode === 'hwall' ? TOUCH_PREVIEW_OFFSET_Y : 0;
                    wallPreviewPos = getWallSnap(touch, offsetX, offsetY) || null;
                    touchAnchorPos = wallPreviewPos ? (getCellFromEvent(touch) || null) : null;
                    draw()
                }
            }, { passive: !1 });
            canvas.addEventListener('touchend', (e) => {
                e.preventDefault();
                if (gameOver || isAnimating) return;
                if (onlineState.active && !isMyOnlineTurn()) return;
                const touch = e.changedTouches[0];
                const offsetX = (touchDidMove && uiMode === 'vwall') ? TOUCH_PREVIEW_OFFSET_X : 0;
                const offsetY = (touchDidMove && uiMode === 'hwall') ? TOUCH_PREVIEW_OFFSET_Y : 0;
                if (uiMode === 'move') {
                    const pos = getCellFromEvent(touch);
                    if (!pos) return;
                    let col = Math.floor(pos.x / cellSize);
                    let row = Math.floor(pos.y / cellSize);
                    executeMove(row, col)
                } else {
                    handleWallTap(touch, offsetX, offsetY)
                }
                touchAnchorPos = null;
                if (!pendingWallPos) wallPreviewPos = null;
                draw()
            }, { passive: !1 });
            btnMove.onclick = () => {
                uiMode = 'move';
                wallPreviewPos = null;
                pendingWallPos = null;
                hideWallConfirm();
                updateBtnState();
                draw()
            };
            btnHWall.onclick = () => {
                if (onlineState.active && !isMyOnlineTurn()) return;
                uiMode = (uiMode === 'hwall' ? 'move' : 'hwall');
                wallPreviewPos = null;
                pendingWallPos = null;
                hideWallConfirm();
                updateBtnState();
                draw()
            };
            btnVWall.onclick = () => {
                if (onlineState.active && !isMyOnlineTurn()) return;
                uiMode = (uiMode === 'vwall' ? 'move' : 'vwall');
                wallPreviewPos = null;
                pendingWallPos = null;
                hideWallConfirm();
                updateBtnState();
                draw()
            };

            function animateLoop() {
                if (!isAnimating && !gameOver && uiMode === 'move') draw();
                if (pendingWallPos && !isAnimating) draw();
                requestAnimationFrame(animateLoop)
            }
            animateLoop();

            // ========== هدر ثابت: همیشه ارتفاع واقعی آن را اندازه می‌گیریم تا محتوای وسط هرگز زیرش نرود ==========
            const topControls = document.getElementById('top-controls');
            if (topControls) {
                const syncHeaderHeight = () => {
                    document.documentElement.style.setProperty('--header-h', topControls.offsetHeight + 'px');
                };
                syncHeaderHeight();
                window.addEventListener('resize', syncHeaderHeight);
                window.addEventListener('orientationchange', syncHeaderHeight);
                if (window.visualViewport) {
                    window.visualViewport.addEventListener('resize', syncHeaderHeight);
                }
                if (window.ResizeObserver) {
                    new ResizeObserver(syncHeaderHeight).observe(topControls);
                }
            }

            // ========== مدیریت دکمه بازگشت گوشی: هرگز کاربر را کلا از سایت خارج نکن ==========
            // هر بار که back فشرده می‌شود، فقط بالاترین لایه‌ی باز (دیالوگ یا صفحه) بسته/برگردانده
            // می‌شود و یک state تله دوباره push می‌شود تا خروج تصادفی از سایت رخ ندهد.
            function trapBackNav() {
                try {
                    window.history.pushState({ route9BackTrap: true }, '')
                } catch (err) {}
            }

            function handleHardwareBack() {
                const nameEntryView = document.getElementById('name-entry-view');
                if (settingsOverlay.classList.contains('visible')) {
                    settingsOverlay.classList.remove('visible');
                    trapBackNav();
                    return
                }
                const aboutOverlayEl = document.getElementById('about-overlay');
                if (aboutOverlayEl.classList.contains('visible')) {
                    aboutOverlayEl.classList.remove('visible');
                    trapBackNav();
                    return
                }
                if (confirmOverlay.classList.contains('visible')) {
                    closeConfirmDialog(false);
                    trapBackNav();
                    return
                }
                if (gameOverOverlay.classList.contains('visible')) {
                    trapBackNav();
                    btnGoHome.click();
                    return
                }
                if (wallConfirmPopup.classList.contains('visible')) {
                    wallConfirmNo.onclick();
                    trapBackNav();
                    return
                }
                if (appEl.classList.contains('visible')) {
                    trapBackNav();
                    confirmGoHome();
                    return
                }
                if (nameEntryView && nameEntryView.style.display === 'block') {
                    document.getElementById('btn-name-back').click();
                    trapBackNav();
                    return
                }
                // در صفحه‌ی اصلی (انتخاب حالت بازی) و بدون هیچ دیالوگ بازی: اجازه بده رفتار عادی مرورگر انجام شود
            }
            trapBackNav();
            window.addEventListener('popstate', handleHardwareBack);
        })()
