/**
 * @name AuraLens
 * @description AuraLens is a plugin for BetterDiscord that adds a button to the user's context menu to view detailed information about their activity 
 * @version 1.0.0
 * @author Helex
 * @github https://github.com/Helexqq
 */

const { Webpack, ContextMenu, React } = BdApi;
const { Filters } = Webpack;

const [ApplicationStreamingStore, ApplicationStreamPreviewStore, useStateFromStores] = Webpack.getBulk(
    { filter: Filters.byStoreName("ApplicationStreamingStore") },
    { filter: Filters.byStoreName("ApplicationStreamPreviewStore") },
    { filter: Filters.byStrings("useStateFromStores"), searchExports: true }
);

module.exports = class AuraLens {
    start() {
        BdApi.showToast("AuraLens activated", { type: "info" });
        this.createContextMenuButton();
    }

    stop() {
        ContextMenu.unpatch("user-context");
        BdApi.showToast("AuraLens disabled", { type: "info" });
    }

    createContextMenuButton() {
        ContextMenu.patch("user-context", (menu, { user }) => {
            if (!user) return;

            menu.props.children.push(
                React.createElement(ContextMenu.Group, {},
                    React.createElement(ContextMenu.Item, {
                        id: "id-test",
                        label: "AuraLens",
                        action: async () => {
                            try {
                                BdApi.showToast(`Loading data for ${user.username}...`, { type: "info" });
                                const [data, livePreview] = await Promise.all([
                                    this.searchInfo(user.id),
                                    this.getLivePreview(user.id)
                                ]);
                                this.showSensorModal(user, data, livePreview);
                            } catch (err) {
                                console.error(err);
                                BdApi.showToast("Error loading, check console", { type: "error" });
                            }
                        }
                    })
                )
            );
        });
    }

    getLivePreview(userID) {
        const stream = ApplicationStreamingStore.getAnyStreamForUser(userID);
        const previewUrl = stream && ApplicationStreamPreviewStore.getPreviewURL(
            stream.guildId,
            stream.channelId,
            stream.ownerId
        );
        return { stream, previewUrl };
    }

    async searchInfo(userID) {
        const fuckCors = "https://corsproxy.io/?https://discord-sensor.com";
        const endpoints = {
            info: `/api/tracker/get-user-info?content=${userID}`,
            avatars: `/api/photos/list?type=avatars&page=1&sort_by=${userID}`,
            streams: `/api/photos/list?type=streams&page=1&sort_by=${userID}`,
            events: `/api/users/get-latest-events/${userID}?subTab=server_history&limit=20&page=1&sortBy=timestamp&sortOrder=desc`,
            nicknames: `/api/tracker/get-nicknames/${userID}?page=0`
        };

        const headers = {
            "Accept": "*/*",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0"
        };

        async function get(url) {
            const r = await fetch(fuckCors + url, { headers });
            if (!r.ok) throw new Error(`Ошибка ${r.status}`);
            return await r.json().catch(() => null);
        }

        const [info, avatars, streams, events, nicknames] = await Promise.all([
            get(endpoints.info),
            get(endpoints.avatars),
            get(endpoints.streams),
            get(endpoints.events),
            get(endpoints.nicknames)
        ]);

        info.creation_date = this.getCreationDate(info.user_id);
        return { info, avatars, streams, events, nicknames };
    }

    getCreationDate(userId) {
        const discordEpoch = 1420070400000;
        const timestamp = (BigInt(userId) >> 22n) + BigInt(discordEpoch);
        return new Date(Number(timestamp));
    }

    showSensorModal(user, data, livePreview) {
        const info = data.info;
        const avatars = data.avatars?.items || [];
        const streams = data.streams?.items || [];
        const events = data.events?.results || [];
        const nicknames = data.nicknames?.nicknames || [];

        const el = document.createElement("div");
        el.className = "sensor-modal";
        el.innerHTML = `
        <div class="sensor-backdrop"></div>
        <div class="sensor-window">
            <div class="sensor-header">
                <img src="https://cdn.discordapp.com/avatars/${info.user_id}/${info.actual_avatar}.png">
                <div>
                    <h2>${info.actual_name}</h2>
                    <p>ID: ${info.user_id}</p>
                    <p>Created: ${info.creation_date.toLocaleDateString()}</p>
                    <p>Messages: ${info.total_messages ?? 0} | Voice Time: ${info.time_in_voice ?? 0} min</p>
                </div>
            </div>

            <div class="sensor-tabs">
                <button class="tab active" data-tab="info">Main</button>
                <button class="tab" data-tab="avatars">Avatars</button>
                <button class="tab" data-tab="streams">Streams</button>
                <button class="tab" data-tab="live">Stream Preview</button>
                <button class="tab" data-tab="events">Server History</button>
                <button class="tab" data-tab="nicknames">Nicknames</button>
            </div>

            <div class="sensor-content">
                <div class="tab-content active" id="info">
                    <h3>Last voice channel</h3>
                    ${
            info.voice_info
                ? `
                            <p><b>Server:</b> ${info.voice_info.server_name}</p>
                            <p><b>Channel:</b> ${info.voice_info.channel_name}</p>
                            <p><b>Date:</b> ${new Date(info.voice_info.last_voice_time).toLocaleString()}</p>
                            `
                : "<p>No Information</p>"
        }
                </div>

                <div class="tab-content" id="avatars">
                    <div class="img-grid">
                        ${
            avatars.length
                ? avatars
                    .map(
                        (a) =>
                            `<img class="previewable" src="https://discord-sensor.com/api/attachments/e20/${a.id}?height=128&width=128">`
                    )
                    .join("")
                : "<p>No Avatars</p>"
        }
                    </div>
                </div>

                <div class="tab-content" id="streams">
                    <div class="img-grid">
                        ${
            streams.length
                ? streams
                    .map(
                        (s) =>
                            `<img class="previewable" src="https://discord-sensor.com/api/attachments/e23/${s.id}?height=144&width=256">`
                    )
                    .join("")
                : "<p>No Saved Streams</p>"
        }
                    </div>
                </div>

                <div class="tab-content" id="live">
                    ${
            livePreview?.previewUrl
                ? `
                            
                            <img class="live-preview" src="${livePreview.previewUrl}" alt="stream preview">
                            
                            `
                : "<p>No active streams</p>"
        }
                </div>

                <div class="tab-content" id="events">
                    <ul class="events-list">
                        ${
            events.length
                ? events
                    .map(
                        (ev) => `
                            <li>
                                <img src="https://cdn.discordapp.com/icons/${ev.guild_id}/${ev.guild_avatar}.png">
                                <span class="copyable-guild" data-gid="${ev.guild_id}" data-vanity="${ev.vanity_url || ""}">${ev.guild_name}</span>
                                <span class="${ev.type ? "join" : "leave"}">${ev.type ? "⤵️ Joined" : "⤴️ Left"}</span>
                                <span>${new Date(ev.timestamp).toLocaleDateString()}</span>
                            </li>`
                    )
                    .join("")
                : "<p>No Events</p>"
        }
                    </ul>
                </div>

                <div class="tab-content" id="nicknames">
                    <ul class="nick-list">
                        ${
            nicknames.length
                ? nicknames
                    .map(
                        (n) => `
                            <li>
                                <img src="https://cdn.discordapp.com/icons/${n.guild.id}/${n.guild.avatar_hash}.png">
                                <span><b>${n.nickname}</b></span>
                                <span>${n.guild.name}</span>
                                <span>${n.time}</span>
                            </li>`
                    )
                    .join("")
                : "<p>No nickname history</p>"
        }
                    </ul>
                </div>
            </div>

            <button class="close-btn">Close</button>
        </div>`;

        document.body.appendChild(el);

        
        const style = document.createElement("style");
        style.textContent = `
        .sensor-modal, 
        .sensor-window, 
        .sensor-content, 
        .sensor-content * {
            user-select: text !important;
            -webkit-user-select: text !important;
        }
        .sensor-modal {
            position: fixed; top: 0; left: 0;
            width: 100%; height: 100%; z-index: 10000;
            font-family: sans-serif; opacity: 0;
            animation: fadeIn 0.3s ease forwards;
        }
        .sensor-backdrop {
            position: absolute; width: 100%; height: 100%;
            background: rgba(0,0,0,.7); backdrop-filter: blur(3px);
            opacity: 0; animation: fadeIn 0.4s ease forwards;
        }
        .sensor-window {
            position: absolute; top: 50%; left: 50%;
            transform: translate(-50%, -45%) scale(0.95);
            background: #2b2d31; color: #fff; border-radius: 8px;
            max-width: 850px; width: 90%; max-height: 85vh;
            overflow: hidden; display: flex; flex-direction: column;
            box-shadow: 0 0 25px rgba(0,0,0,0.5);
            opacity: 0; animation: popIn 0.35s cubic-bezier(0.25, 1, 0.3, 1) forwards;
        }
        .sensor-header { display: flex; gap: 15px; align-items: center; padding: 15px; background: #1e1f22; animation: slideDown 0.4s ease; }
        .sensor-header img {
            border-radius: 8px;
            width: 96px;
            height: 96px;
            object-fit: cover;
            flex-shrink: 0;
        }
        .sensor-tabs { display: flex; background: #232428; border-bottom: 1px solid rgba(255,255,255,0.1); }
        .sensor-tabs .tab { flex: 1; padding: 10px; cursor: pointer; background: none; border: none; color: #ccc; font-weight: 600; transition: background 0.25s, color 0.25s, transform 0.2s; }
        .sensor-tabs .tab:hover { background: #2f3136; color: #fff; transform: translateY(-1px); }
        .sensor-tabs .tab.active { background: #36393f; color: #fff; box-shadow: inset 0 -2px #5865F2; }
        .sensor-content { padding: 15px; overflow-y: auto; flex: 1; }
        .tab-content { display: none; opacity: 0; transform: translateY(5px); transition: opacity 0.25s ease, transform 0.25s ease; }
        .tab-content.active { display: block; opacity: 1; transform: translateY(0); }
        .img-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px,1fr)); gap: 8px; }
        .img-grid img { width: 100%; border-radius: 6px; cursor: pointer; transition: transform 0.25s ease, box-shadow 0.25s ease; }
        .img-grid img:hover { transform: scale(1.05); box-shadow: 0 0 10px rgba(0,0,0,0.4); }
        .live-preview { width: 100%; border-radius: 8px; cursor: pointer; transition: transform .3s ease, box-shadow .3s ease; }
        .live-preview:hover { transform: scale(1.03); box-shadow: 0 0 15px rgba(88,101,242,0.4); }
        .events-list,.nick-list { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:6px; }
        .events-list li,.nick-list li { display:flex; align-items:center; gap:8px; background:#1f2124; padding:6px 8px; border-radius:5px; transition:background 0.25s ease, transform 0.2s ease; }
        .events-list li:hover,.nick-list li:hover { background:#2a2c31; transform:translateX(3px); }
        .copyable-guild { cursor:pointer; color:#00AEEF; transition:color 0.25s; }
        .copyable-guild:hover { text-decoration:underline; color:#58b5ff; }
        .close-btn { margin:10px auto; background:#5865F2; color:white; border:none; border-radius:5px; padding:8px 20px; cursor:pointer; font-weight:600; transition:background 0.25s, transform 0.25s; }
        .close-btn:hover { background:#4752C4; transform:scale(1.05); }
        .img-preview-overlay { position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); z-index:20000; display:flex; align-items:center; justify-content:center; opacity:0; animation:fadeIn 0.3s ease forwards; }
        .img-preview-overlay img { max-width:90%; max-height:90%; border-radius:10px; box-shadow:0 0 30px rgba(0,0,0,0.7); animation:zoomIn 0.3s ease; }

        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes popIn { 0%{opacity:0;transform:translate(-50%,-45%) scale(0.95);} 100%{opacity:1;transform:translate(-50%,-50%) scale(1);} }
        @keyframes slideDown { from { opacity:0; transform:translateY(-10px);} to {opacity:1; transform:translateY(0);} }
        @keyframes zoomIn { from {transform:scale(0.9); opacity:0.8;} to {transform:scale(1); opacity:1;} }
        `;
        el.appendChild(style);

        el.querySelectorAll(".tab").forEach((btn) => {
            btn.onclick = () => {
                el.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
                el.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
                btn.classList.add("active");
                el.querySelector(`#${btn.dataset.tab}`).classList.add("active");
            };
        });

        el.querySelectorAll(".previewable, .live-preview").forEach((img) => {
            img.onclick = () => {
                const overlay = document.createElement("div");
                overlay.className = "img-preview-overlay";
                overlay.innerHTML = `<img src="${img.src.replace(/height=.*&width=.*/, "")}" alt="preview">`;
                overlay.onclick = () => overlay.remove();
                document.body.appendChild(overlay);
            };
        });

        el.querySelectorAll(".copyable-guild").forEach((g) => {
            g.onclick = () => {
                const vanity = g.dataset.vanity;
                const id = g.dataset.gid;
                const link = vanity ? `https://discord.gg/${vanity}` : `https://discord.com/channels/${id}`;
                BdApi.nativeClipboard.copy(link);
                BdApi.showToast(`Copied: ${link}`, { type: "success" });
            };
        });

        const close = () => {
            el.querySelector(".sensor-window").style.animation = "fadeOut 0.25s ease forwards";
            el.querySelector(".sensor-backdrop").style.animation = "fadeOut 0.25s ease forwards";
            setTimeout(() => el.remove(), 250);
        };
        el.querySelector(".sensor-backdrop").onclick = close;
        el.querySelector(".close-btn").onclick = close;

        const fadeOutKeyframes = document.createElement("style");
        fadeOutKeyframes.textContent = `
            @keyframes fadeOut { from { opacity:1; } to { opacity:0; } }
        `;
        document.head.appendChild(fadeOutKeyframes);
    }
};