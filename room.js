        (function() {
            // ====== آدرس سرور آنلاین بازی (Socket.io) ======
            // بعد از دیپلوی سرور (پوشه‌ی server/) روی Render یا هر هاست دیگری،
            // این مقدار را با آدرس واقعی سرورت جایگزین کن. همین رشته دقیقاً توی
            // متای CSP بالای فایل هم هست — هر دو جا را با هم عوض کن.
            // مثال: "https://route9-server.onrender.com"
            const GAME_SERVER_URL = "https://barricade.onrender.com";

            let socket = null;

            function getSocket() {
                if (!socket) {
                    socket = io(GAME_SERVER_URL);
                }
                return socket
            }

            function emitAck(event, data) {
                return new Promise((resolve, reject) => {
                    getSocket().emit(event, data, (res) => {
                        if (res === undefined) { reject(new Error('no-response')); return }
                        resolve(res)
                    })
                })
            }

            window.FBRoom = {
                _roomCode: null,
                _mySlotId: null,
                _msgListeners: [],
                _presenceListeners: [],
                _joinedAt: 0,
                // حالت واقعی اتاق (2p/4p/hunter) همونیه که سرور موقع
                // createRoom/joinRoom برمی‌گردونه — این تنها منبع معتبرشه.
                // بلافاصله بعد از join (چه میزبان چه جوین‌شونده) پر می‌شه،
                // بدون نیاز به منتظر موندن برای پیام جداگونه‌ی «start».
                _roomMode: null,

                async createRoom(maxPlayers, mode) {
                    const res = await emitAck('createRoom', { maxPlayers, mode });
                    if (!res || !res.ok) throw new Error((res && res.error) || 'create-failed');
                    return res.code
                },

                async roomExists(code) {
                    const res = await emitAck('roomExists', { code });
                    if (res && res.mode) window.FBRoom._roomMode = res.mode;
                    return !!(res && res.exists)
                },

                async joinRoom(code, maxPlayers) {
                    const res = await emitAck('joinRoom', { code, maxPlayers });
                    if (!res || !res.ok) return null;
                    window.FBRoom._roomCode = code;
                    window.FBRoom._mySlotId = res.slot;
                    window.FBRoom._joinedAt = Date.now();
                    window.FBRoom._roomMode = res.mode || null;
                    return res.slot
                },

                send(data) {
                    if (!window.FBRoom._roomCode) return;
                    getSocket().emit('roomMessage', { payload: data })
                },

                onMessage(callback) {
                    const handler = (msg) => {
                        if (!msg) return;
                        if (msg.from === window.FBRoom._mySlotId) return;
                        if (msg.t && msg.t < window.FBRoom._joinedAt - 2000) return;
                        callback(msg.payload, msg.from)
                    };
                    getSocket().on('roomMessage', handler);
                    const unsub = () => { try { getSocket().off('roomMessage', handler) } catch (e) {} };
                    window.FBRoom._msgListeners.push(unsub);
                    return unsub
                },

                onPresence(maxPlayers, callback) {
                    const handler = (playersObj) => callback(playersObj || {});
                    getSocket().on('presence', handler);
                    const unsub = () => { try { getSocket().off('presence', handler) } catch (e) {} };
                    window.FBRoom._presenceListeners.push(unsub);
                    emitAck('getPresence', {}).then((res) => {
                        if (res && res.players) callback(res.players)
                    }).catch(() => {});
                    return unsub
                },

                async leaveRoom() {
                    if (window.FBRoom._roomCode && socket) {
                        try { socket.emit('leaveRoom') } catch (e) {}
                    }
                    window.FBRoom._msgListeners.forEach(u => { try { u() } catch (e) {} });
                    window.FBRoom._presenceListeners.forEach(u => { try { u() } catch (e) {} });
                    window.FBRoom._msgListeners = [];
                    window.FBRoom._presenceListeners = [];
                    window.FBRoom._roomCode = null;
                    window.FBRoom._mySlotId = null;
                    window.FBRoom._roomMode = null
                }
            };

            window.dispatchEvent(new Event('fbroom-ready'));
        })()
