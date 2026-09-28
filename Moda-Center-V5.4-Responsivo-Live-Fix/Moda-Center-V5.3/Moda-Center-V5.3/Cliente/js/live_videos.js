/* ================================================================
   MODA CENTER — LIVE E VÍDEOS (VISÃO DO CLIENTE)
   ---------------------------------------------------------------
   - Lista as lives ativas (WebRTC) e os vídeos publicados pelas lojas.
   - Ao assistir uma live, entra como "viewer" e faz a sinalização
     WebRTC com o comerciante (mesmo protocolo usado em
     Comerciante/js/modacenterliveandvideo.js).
   - Todo erro de rede é tratado e exibido como mensagem amigável —
     nunca deixamos o JSON de erro do servidor aparecer na tela.
================================================================ */

const SESSION_KEY = "modaCenterSession";
const API_ENABLED = window.location.protocol !== "file:";

const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
if (!session || session.profile !== "cliente") {
    window.location.href = "../../index.html?login=1";
}

document.getElementById("clientGreeting").textContent = `Olá, ${session?.name || "cliente"}. Veja quem está ao vivo agora.`;

document.getElementById("clientLogout").addEventListener("click", () => {
    localStorage.removeItem(SESSION_KEY);
    window.location.href = "../../index.html?login=1";
});

const noteElement = document.getElementById("liveVideosNote");
const livesGrid = document.getElementById("livesGrid");
const videosGrid = document.getElementById("videosGrid");
const reelsFeed = document.getElementById("reelsFeed");

function escapeHtml(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/**
 * Faz uma chamada à API sempre tratando o corpo como JSON e nunca
 * deixando um erro "estourar" como texto cru na tela do usuário.
 */
async function api(path, options = {}) {
    const response = await fetch(path, { cache: "no-store", ...options });
    let data = {};
    try { data = await response.json(); } catch (_) { /* resposta sem corpo JSON */ }
    if (!response.ok) throw new Error(data.error || "Não foi possível concluir a operação.");
    return data;
}

/* ----------------------------------------------------------------
   FILTROS, ABAS E CONTEÚDO
---------------------------------------------------------------- */
const tabTudo = document.getElementById("tabTudo");
const searchInput = document.getElementById("liveVideosSearch");
const storeFilter = document.getElementById("liveVideosStoreFilter");
const clearFiltersButton = document.getElementById("clearLiveVideosFilters");

let todasLives = [];
let todosVideos = [];
let lojasDisponiveis = [];
let filtroTipo = "tudo";

function normalizarTexto(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function atualizarAbas() {
    const estados = { tudo: tabTudo, lives: tabLives, videos: tabVideos };
    Object.entries(estados).forEach(([tipo, botao]) => {
        const ativo = filtroTipo === tipo;
        botao.classList.toggle("ativa", ativo);
        botao.setAttribute("aria-selected", String(ativo));
    });
}

function mostrarAba(aba) {
    filtroTipo = aba;
    atualizarAbas();
    aplicarFiltros();
}

tabTudo.addEventListener("click", () => mostrarAba("tudo"));
tabLives.addEventListener("click", () => mostrarAba("lives"));
tabVideos.addEventListener("click", () => mostrarAba("videos"));

function obterTermoBusca() {
    return normalizarTexto(searchInput.value);
}

function correspondeFiltro(item, tipo) {
    const termo = obterTermoBusca();
    const lojaSelecionada = String(storeFilter.value || "");
    const ownerId = String(item.ownerId || "");
    const texto = normalizarTexto([
        item.title, item.titulo, item.description, item.descricao,
        item.ownerName, item.storeName, item.name
    ].join(" "));

    const lojaOk = !lojaSelecionada || ownerId === lojaSelecionada;
    const buscaOk = !termo || texto.includes(termo);
    return lojaOk && buscaOk;
}

function aplicarFiltros() {
    const lives = todasLives.filter(live => correspondeFiltro(live, "live"));
    const videos = todosVideos.filter(video => correspondeFiltro(video, "video"));

    livesGrid.hidden = true;
    videosGrid.hidden = true;
    renderFeed(lives, videos);

    const total = lives.length + videos.length;
    const termo = searchInput.value.trim();
    const loja = storeFilter.options[storeFilter.selectedIndex]?.textContent || "";
    if (termo || storeFilter.value) {
        noteElement.textContent = `${total} resultado${total === 1 ? "" : "s"}${termo ? ` para “${termo}”` : ""}${storeFilter.value ? ` • ${loja}` : ""}.`;
    } else {
        noteElement.textContent = "";
    }
}

function preencherFiltroLojas() {
    const mapa = new Map();
    lojasDisponiveis.forEach(store => {
        const id = String(store.id || store.ownerId || "");
        const name = String(store.name || store.ownerName || "").trim();
        if (id && name) mapa.set(id, name);
    });
    [...todasLives, ...todosVideos].forEach(item => {
        const id = String(item.ownerId || "");
        const name = String(item.ownerName || "").trim();
        if (id && name && !mapa.has(id)) mapa.set(id, name);
    });

    const atual = String(storeFilter.value || "");
    storeFilter.innerHTML = '<option value="">Todas as lojas</option>';
    [...mapa.entries()]
        .sort((a, b) => a[1].localeCompare(b[1], "pt-BR", { sensitivity: "base" }))
        .forEach(([id, name]) => {
            const option = document.createElement("option");
            option.value = id;
            option.textContent = name;
            storeFilter.appendChild(option);
        });
    if ([...storeFilter.options].some(option => option.value === atual)) storeFilter.value = atual;
}

async function carregarLojas() {
    if (!API_ENABLED) return;
    try {
        const data = await api("/api/catalog");
        const stores = data.stores || {};
        lojasDisponiveis = Object.entries(stores).map(([id, store]) => ({ id, ...(store || {}) }));
        preencherFiltroLojas();
    } catch (_) {
        // O filtro ainda funciona com as lojas que aparecem nas lives/vídeos.
    }
}

async function carregarLives() {
    if (!API_ENABLED) { livesGrid.innerHTML = `<div class="empty-state">Abra o site pelo servidor para ver as lives.</div>`; return; }
    try {
        const data = await api("/api/live");
        todasLives = Array.isArray(data.lives) ? data.lives : [];
        preencherFiltroLojas();
        aplicarFiltros();
    } catch (error) {
        livesGrid.innerHTML = `<div class="empty-state">Não foi possível carregar as lives agora. Tente novamente em instantes.</div>`;
    }
}

function feedItemId(type, item) { return `${type}-${String(item.id || Math.random()).replace(/[^a-zA-Z0-9_-]/g, "")}`; }
function renderFeed(lives, videos) {
    const items = [];
    if (filtroTipo !== "videos") lives.forEach(live => items.push({type:"live", item:live}));
    if (filtroTipo !== "lives") videos.forEach(video => items.push({type:"video", item:video}));
    if (!items.length) {
        reelsFeed.innerHTML = `<div class="lv-reels-empty"><strong>Nada por aqui ainda.</strong><span>Quando uma loja entrar ao vivo ou publicar um vídeo, ele aparecerá neste feed.</span></div>`;
        return;
    }
    reelsFeed.innerHTML = items.map(({type,item}) => {
        const isLive = type === "live";
        const title = item.title || item.titulo || (isLive ? "Live da loja" : "Publicação");
        const store = item.ownerName || item.storeName || "Loja Moda Center";
        const desc = item.description || item.descricao || "";
        const src = item.url || item.videoUrl || "";
        const poster = item.capa || item.cover || "";
        const likes = Number(item.likeCount || 0);
        const comments = Number(item.commentCount || 0);
        const shares = Number(item.shareCount || 0);
        return `<article class="lv-reel" data-type="${type}" data-id="${escapeHtml(item.id)}">
            <div class="lv-reel-media">
                ${isLive
                    ? `<div class="lv-reel-live-placeholder"><div class="lv-live-orb">🔴</div><strong>AO VIVO</strong><span>Toque para entrar na transmissão</span></div>`
                    : src ? `<video class="lv-reel-video" src="${escapeHtml(src)}" ${poster ? `poster="${escapeHtml(poster)}"` : ""} playsinline loop muted preload="metadata"></video>` : (poster ? `<img class="lv-reel-video" src="${escapeHtml(poster)}" alt="Publicação de ${escapeHtml(store)}">` : `<div class="lv-reel-live-placeholder"><div class="lv-live-orb">🎬</div><strong>PUBLICAÇÃO</strong></div>`)}
                <div class="lv-reel-shade"></div>
                <div class="lv-reel-top">${isLive ? `<span class="lv-reel-live-pill">🔴 AO VIVO</span><span class="lv-reel-viewers">${Number(item.viewers || 0)} assistindo</span>` : `<span class="lv-reel-video-pill">🎬 VÍDEO</span>`}</div>
                <button type="button" class="lv-reel-open" aria-label="${isLive ? "Entrar na live" : "Abrir publicação"}">${isLive ? "Entrar na live" : "Abrir publicação"}</button>
                ${!isLive ? `<button type="button" class="lv-reel-play" aria-label="Reproduzir ou pausar">▶</button>` : ""}
            </div>
            <aside class="lv-reel-actions" aria-label="Ações">
                <button type="button" class="lv-reel-action lv-reel-like" data-action="like" aria-label="Curtir"><span>❤️</span><b>${likes}</b></button>
                <button type="button" class="lv-reel-action lv-reel-comment" data-action="comment" aria-label="Comentários"><span>💬</span><b>${comments}</b></button>
                <button type="button" class="lv-reel-action lv-reel-share" data-action="share" aria-label="Compartilhar"><span>↗</span><b>${shares}</b></button>
                ${isLive ? `<button type="button" class="lv-reel-action lv-reel-participate" data-action="participate" aria-label="Pedir para participar"><span>🎥</span><b>Entrar</b></button>` : ""}
            </aside>
            <div class="lv-reel-caption">
                <div class="lv-reel-store"><span class="lv-avatar">${escapeHtml(store.slice(0,1).toUpperCase())}</span><div><strong>${escapeHtml(store)}</strong><small>${isLive ? "Transmitindo agora" : "Publicação"}</small></div></div>
                <h2>${escapeHtml(title)}</h2>
                ${desc ? `<p>${escapeHtml(desc)}</p>` : ""}
                <span class="lv-reel-hint">${isLive ? "💬 Converse com a loja • 🎥 peça para aparecer na live" : "❤️ Curta • 💬 comente • ↗ compartilhe"}</span>
            </div>
        </article>`;
    }).join("");
    bindFeedInteractions(items);
    setupReelPlayback();
}
function bindFeedInteractions(items) {
    reelsFeed.querySelectorAll(".lv-reel").forEach(card => {
        const type = card.dataset.type;
        const item = items.find(x => x.type === type && String(x.item.id) === String(card.dataset.id))?.item;
        if (!item) return;
        card.querySelector(".lv-reel-open")?.addEventListener("click", e => { e.stopPropagation(); type === "live" ? assistirLive(item) : assistirVideo(item); });
        card.querySelector(".lv-reel-media")?.addEventListener("click", e => {
            if (e.target.closest("button")) return;
            type === "live" ? assistirLive(item) : assistirVideo(item);
        });
        card.querySelector("[data-action=like]")?.addEventListener("click", async e => {
            e.stopPropagation();
            if (type !== "video") return;
            try {
                const d = await api(`/api/videos/${encodeURIComponent(item.id)}/like`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({clientId:clientId(),clientName:clientName()})});
                const b = card.querySelector("[data-action=like] b"); if (b) b.textContent = Number(d.likes || 0);
                card.querySelector("[data-action=like]")?.classList.toggle("ativo", !!d.liked);
            } catch (_) {}
        });
        card.querySelector("[data-action=share]")?.addEventListener("click", async e => {
            e.stopPropagation();
            if (type !== "video") return;
            try {
                const d = await api(`/api/videos/${encodeURIComponent(item.id)}/share`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({clientId:clientId(),clientName:clientName()})});
                try { await navigator.share?.({title:item.title || item.titulo || "Moda Center", text:item.description || item.descricao || "", url:location.href}); } catch (_) {}
                const b = card.querySelector("[data-action=share] b"); if (b) b.textContent = Number(d.shares || 0);
            } catch (_) {}
        });
        card.querySelector("[data-action=comment]")?.addEventListener("click", e => { e.stopPropagation(); type === "video" ? assistirVideo(item) : assistirLive(item); setTimeout(() => (type === "video" ? document.getElementById("videoCommentInput") : document.getElementById("liveChatInput"))?.focus(), 120); });
        card.querySelector("[data-action=participate]")?.addEventListener("click", e => { e.stopPropagation(); assistirLive(item); });
    });
}
function setupReelPlayback() {
    const videos = [...reelsFeed.querySelectorAll(".lv-reel-video")];
    if (!videos.length || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
        const v = entry.target;
        if (entry.isIntersecting && entry.intersectionRatio > .65) v.play().catch(() => {});
        else v.pause();
    }), {root: reelsFeed, threshold:[.25,.65,.9]});
    videos.forEach(v => observer.observe(v));
    reelsFeed.querySelectorAll(".lv-reel-play").forEach(btn => btn.addEventListener("click", e => {
        e.stopPropagation(); const v = e.currentTarget.closest(".lv-reel-media")?.querySelector("video"); if (!v) return;
        if (v.paused) { v.play().catch(() => {}); e.currentTarget.textContent = "❚❚"; } else { v.pause(); e.currentTarget.textContent = "▶"; }
    }));
}
function renderLives(lives) { renderFeed(lives, []); }
function renderVideos(videos) { renderFeed([], videos); }

searchInput.addEventListener("input", aplicarFiltros);
storeFilter.addEventListener("change", aplicarFiltros);
clearFiltersButton.addEventListener("click", () => {
    searchInput.value = "";
    storeFilter.value = "";
    filtroTipo = "tudo";
    atualizarAbas();
    aplicarFiltros();
    searchInput.focus();
});

/* ----------------------------------------------------------------
   ASSISTIR VÍDEO (arquivo já publicado)
---------------------------------------------------------------- */
const videoWatchModal = document.getElementById("videoWatchModal");
const videoWatchVideo = document.getElementById("videoWatchVideo");
let currentVideoSocial = null;
let currentLiveSocial = null;
let socialPollTimer = null;

function clientId() { return String(session?.id || session?.userId || session?.email || "cliente"); }
function clientName() { return String(session?.name || session?.nome || "Cliente"); }
async function carregarVideoSocial(videoId) {
    try {
        const data = await api(`/api/videos/${encodeURIComponent(videoId)}/social`);
        const likeBtn=document.getElementById("videoLikeBtn"), shareBtn=document.getElementById("videoShareBtn"), comments=document.getElementById("videoCommentsList");
        if (likeBtn) { likeBtn.textContent=`❤️ Curtir (${Number(data.likes||0)})`; likeBtn.dataset.liked = data.liked ? "1":"0"; }
        if (shareBtn) shareBtn.textContent=`↗ Compartilhar (${Number(data.shares||0)})`;
        if (comments) comments.innerHTML=(data.comments||[]).map(c=>`<div class="lv-comment"><strong>${escapeHtml(c.clientName)}</strong><span>${escapeHtml(c.message)}</span></div>`).join("") || '<div class="lv-empty-social">Ainda não há comentários.</div>';
    } catch (_) {}
}


function assistirVideo(video) {
    currentVideoSocial = video;
    document.getElementById("videoWatchTitle").textContent = video.title || video.titulo || "Vídeo";
    document.getElementById("videoWatchStore").textContent = video.ownerName || "Loja Moda Center";
    document.getElementById("videoWatchDescription").textContent = video.description || video.descricao || "";
    videoWatchVideo.src = video.url || video.videoUrl || "";
    videoWatchModal.hidden = false;
    videoWatchVideo.play().catch(() => {});
    carregarVideoSocial(video.id);
}

function fecharVideoWatch() {
    videoWatchVideo.pause();
    videoWatchVideo.removeAttribute("src");
    videoWatchVideo.load();
    videoWatchModal.hidden = true;
}
document.getElementById("closeVideoWatch").addEventListener("click", fecharVideoWatch);

/* ----------------------------------------------------------------
   ASSISTIR LIVE (visualizador WebRTC)
   Mesmo protocolo de sinalização usado pelo comerciante:
   /api/live/:id/join, /api/live/:id/signal, /api/live/:id/signals,
   /api/live/:id/leave.
---------------------------------------------------------------- */
const liveWatchModal = document.getElementById("liveWatchModal");
const liveWatchVideo = document.getElementById("liveWatchVideo");
const liveWatchStatus = document.getElementById("liveWatchStatus");
const liveWatchUnmute = document.getElementById("liveWatchUnmute");
const liveWatchPip = document.getElementById("liveWatchPip");
const liveWatchMini = document.getElementById("liveWatchMini");
const liveMiniPlayer = document.getElementById("liveMiniPlayer");
const liveMiniVideoSlot = document.getElementById("liveMiniVideoSlot");
const liveMiniRestore = document.getElementById("liveMiniRestore");
const liveMiniClose = document.getElementById("liveMiniClose");

let viewerState = null;
let liveModalScrollY = 0;
let liveVideoInMini = false;
let viewerPc = null;
let viewerPollTimer = null;
let viewerPolling = false;
let viewerPendingIce = [];

function mostrarStatusLive(mensagem) {
    if (!mensagem) { liveWatchStatus.hidden = true; return; }
    liveWatchStatus.hidden = false;
    liveWatchStatus.textContent = mensagem;
}

async function carregarLiveSocial() {
    if (!viewerState) return;
    try {
        const data = await api(`/api/live/${encodeURIComponent(viewerState.liveId)}/social?since=0&peerId=${encodeURIComponent(viewerState.peerId)}`);
        const chat=document.getElementById("liveChatList");
        if (chat) { chat.innerHTML=(data.messages||[]).map(m=>`<div class="lv-chat-msg"><strong>${escapeHtml(m.clientName)}</strong><span>${escapeHtml(m.message)}</span></div>`).join("") || '<div class="lv-empty-social">Seja o primeiro a comentar.</div>'; chat.scrollTop=chat.scrollHeight; }
        const requestBtn=document.getElementById("liveParticipationBtn");
        const mine=(data.participationRequests||[]).find(r=>String(r.clientId)===String(viewerState.peerId));
        if (requestBtn) { requestBtn.disabled=!!mine && ["pending","approved"].includes(mine.status); requestBtn.textContent=mine?.status==="approved"?"✅ Participação aprovada":mine?.status==="pending"?"⏳ Pedido enviado":"🎥 Pedir para participar"; }
    } catch (_) {}
}
async function enviarChatLive() {
    const input=document.getElementById("liveChatInput"); const message=String(input?.value||"").trim();
    if (!message || !viewerState) return;
    try { await api(`/api/live/${encodeURIComponent(viewerState.liveId)}/social`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"chat",clientId:clientId(),clientName:clientName(),message})}); input.value=""; await carregarLiveSocial(); } catch(e) { mostrarStatusLive(e.message); }
}
async function pedirParticipacaoLive() {
    if (!viewerState) return;
    try { await api(`/api/live/${encodeURIComponent(viewerState.liveId)}/social`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"participation",clientId:viewerState.peerId,clientName:clientName()})}); await carregarLiveSocial(); } catch(e) { mostrarStatusLive(e.message); }
}

function bloquearScrollPagina() {
    liveModalScrollY = window.scrollY || 0;
    document.documentElement.classList.add("lv-live-open");
    document.body.classList.add("lv-live-open");
    document.body.style.top = `-${liveModalScrollY}px`;
}

function liberarScrollPagina() {
    document.documentElement.classList.remove("lv-live-open");
    document.body.classList.remove("lv-live-open");
    document.body.style.top = "";
    if (!liveVideoInMini) window.scrollTo(0, liveModalScrollY);
}

async function alternarLivePictureInPicture() {
    if (!liveWatchVideo?.srcObject) return mostrarStatusLive("A transmissão ainda está conectando.");
    try {
        if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
            return;
        }
        if (document.pictureInPictureEnabled && typeof liveWatchVideo.requestPictureInPicture === "function") {
            await liveWatchVideo.requestPictureInPicture();
            return;
        }
        if (window.documentPictureInPicture?.requestWindow) {
            await abrirLiveMiniWindow();
            return;
        }
        await abrirLiveMiniPlayer();
    } catch (error) {
        console.warn("PiP indisponível", error);
        await abrirLiveMiniPlayer();
    }
}

async function abrirLiveMiniPlayer() {
    if (!viewerState || !liveWatchVideo.srcObject) return;
    liveVideoInMini = true;
    liveWatchModal.hidden = true;
    liveMiniPlayer.hidden = false;
    liveMiniVideoSlot.appendChild(liveWatchVideo);
    liveWatchVideo.controls = true;
    liveWatchVideo.muted = false;
    document.documentElement.classList.remove("lv-live-open");
    document.body.classList.remove("lv-live-open");
    await liveWatchVideo.play().catch(() => {});
}

async function restaurarLiveDoMini() {
    if (!liveVideoInMini) return;
    liveVideoInMini = false;
    liveMiniPlayer.hidden = true;
    document.querySelector(".lv-watch-video-wrap")?.prepend(liveWatchVideo);
    liveWatchModal.hidden = false;
    bloquearScrollPagina();
    await liveWatchVideo.play().catch(() => {});
}

async function fecharMiniLive() {
    liveMiniPlayer.hidden = true;
    if (document.pictureInPictureElement) {
        try { await document.exitPictureInPicture(); } catch (_) {}
    }
    liveVideoInMini = false;
    pararAssistirLive(true);
    liveWatchModal.hidden = true;
    liberarScrollPagina();
}

async function abrirLiveMiniWindow() {
    // Document PiP é uma opção adicional para navegadores que a suportam.
    const pipWindow = await window.documentPictureInPicture.requestWindow({ width: 360, height: 640 });
    [...document.styleSheets].forEach(sheet => {
        try {
            const link = pipWindow.document.createElement("link");
            link.rel = "stylesheet";
            link.href = sheet.href;
            if (link.href) pipWindow.document.head.appendChild(link);
        } catch (_) {}
    });
    pipWindow.document.body.style.margin = "0";
    pipWindow.document.body.style.background = "#000";
    const wrap = pipWindow.document.createElement("div");
    wrap.style.cssText = "width:100vw;height:100vh;background:#000;display:flex;align-items:center;justify-content:center;overflow:hidden";
    pipWindow.document.body.appendChild(wrap);
    wrap.appendChild(liveWatchVideo);
    liveWatchVideo.style.cssText = "width:100%;height:100%;object-fit:contain;background:#000";
    pipWindow.addEventListener("pagehide", () => {
        document.querySelector(".lv-watch-video-wrap")?.prepend(liveWatchVideo);
        liveWatchVideo.style.cssText = "";
        if (viewerState) {
            liveWatchModal.hidden = false;
            bloquearScrollPagina();
            liveWatchVideo.play().catch(() => {});
        }
    }, { once: true });
    await liveWatchVideo.play().catch(() => {});
}

async function assistirLive(live) {
    document.getElementById("liveWatchTitle").textContent = live.title;
    document.getElementById("liveWatchStore").textContent = live.ownerName || "Loja Moda Center";
    document.getElementById("liveWatchDescription").textContent = live.description || "";
    liveWatchVideo.srcObject = null;
    liveWatchVideo.muted = false;
    liveWatchVideo.volume = 1;
    if (liveWatchUnmute) liveWatchUnmute.hidden = true;
    liveWatchModal.hidden = false;
    liveMiniPlayer.hidden = true;
    liveVideoInMini = false;
    bloquearScrollPagina();
    mostrarStatusLive("Conectando à transmissão...");

    try {
        const data = await api(`/api/live/${encodeURIComponent(live.id)}/join`, { method: "POST" });
        viewerState = { liveId: live.id, peerId: data.peerId, broadcasterPeerId: data.broadcasterPeerId };
        viewerPollTimer = setInterval(pollSignals, 900);
        socialPollTimer = setInterval(carregarLiveSocial, 1500);
        await pollSignals();
        await carregarLiveSocial();
    } catch (error) {
        mostrarStatusLive(error.message || "Essa live não está mais disponível.");
    }
}

async function pollSignals() {
    /* Evita polls sobrepostos: senão um candidato ICE podia ser processado antes da oferta. */
    if (!viewerState || viewerPolling) return;
    viewerPolling = true;
    try {
        const data = await api(`/api/live/${encodeURIComponent(viewerState.liveId)}/signals?peerId=${encodeURIComponent(viewerState.peerId)}`);
        for (const signal of (data.signals || [])) await handleSignal(signal);
    } catch (error) {
        mostrarStatusLive("A transmissão foi encerrada.");
        pararAssistirLive(false);
    } finally {
        viewerPolling = false;
    }
}

async function handleSignal(signal) {
    if (!viewerState || signal.from !== viewerState.broadcasterPeerId) return;

    if (signal.type === "offer") {
        if (viewerPc) { try { viewerPc.close(); } catch (_) {} }
        viewerPc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        viewerPc.ontrack = event => {
            const stream = event.streams?.[0] || new MediaStream([event.track]);
            liveWatchVideo.srcObject = stream;
            liveWatchVideo.muted = false;
            liveWatchVideo.volume = 1;
            mostrarStatusLive(null);
            liveWatchVideo.play().then(() => {
                if (liveWatchUnmute) liveWatchUnmute.hidden = true;
            }).catch(() => {
                /* A política de autoplay pode bloquear o som. O cliente recebe um botão explícito. */
                if (liveWatchUnmute) liveWatchUnmute.hidden = false;
            });
        };
        viewerPc.onicecandidate = event => { if (event.candidate) enviarSinal("ice", event.candidate); };
        viewerPc.onconnectionstatechange = () => {
            if (viewerPc && ["failed", "closed", "disconnected"].includes(viewerPc.connectionState)) {
                mostrarStatusLive("A conexão com a transmissão caiu.");
            }
        };
        try {
            if (signal.data?._interactive) {
                if (!navigator.mediaDevices?.getUserMedia) throw new Error("Seu navegador não permite câmera/microfone.");
                if (!viewerState.participantStream) viewerState.participantStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:"user"},audio:true});
                viewerState.participantStream.getTracks().forEach(track => viewerPc.addTrack(track, viewerState.participantStream));
                mostrarStatusLive("🎥 Você entrou na transmissão.");
            }
            const remoteOffer = { ...signal.data }; delete remoteOffer._interactive;
            await viewerPc.setRemoteDescription(new RTCSessionDescription(remoteOffer));
            for (const candidate of viewerPendingIce) { try { await viewerPc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (_) {} }
            viewerPendingIce = [];
            const answer = await viewerPc.createAnswer();
            await viewerPc.setLocalDescription(answer);
            await enviarSinal("answer", answer);
        } catch (_) { mostrarStatusLive("Não foi possível conectar à transmissão."); }
    }

    if (signal.type === "ice" && signal.data) {
        if (!viewerPc || !viewerPc.remoteDescription) { viewerPendingIce.push(signal.data); return; }
        try { await viewerPc.addIceCandidate(new RTCIceCandidate(signal.data)); } catch (_) { /* ignora candidato inválido */ }
    }
}

async function enviarSinal(type, data) {
    if (!viewerState) return;
    try {
        await api(`/api/live/${encodeURIComponent(viewerState.liveId)}/signal`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ from: viewerState.peerId, to: viewerState.broadcasterPeerId, type, data })
        });
    } catch (_) { /* sinal perdido: o próximo polling tenta de novo */ }
}

function pararAssistirLive(avisarServidor = true) {
    clearInterval(viewerPollTimer);
    viewerPollTimer = null;
    clearInterval(socialPollTimer);
    socialPollTimer = null;
    if (viewerPc) { viewerPc.close(); viewerPc = null; }
    viewerState?.participantStream?.getTracks().forEach(track => track.stop());
    viewerPendingIce = [];
    liveWatchVideo.muted = false;
    liveWatchVideo.volume = 1;
    if (liveWatchUnmute) liveWatchUnmute.hidden = true;
    liveWatchVideo.srcObject = null;
    liveMiniPlayer.hidden = true;
    liveVideoInMini = false;
    if (viewerState && avisarServidor) {
        api(`/api/live/${encodeURIComponent(viewerState.liveId)}/leave`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ peerId: viewerState.peerId })
        }).catch(() => {});
    }
    viewerState = null;
}

liveWatchUnmute?.addEventListener("click", async () => {
    try {
        liveWatchVideo.muted = false;
        liveWatchVideo.volume = 1;
        await liveWatchVideo.play();
        liveWatchUnmute.hidden = true;
        mostrarStatusLive(null);
    } catch (_) {
        mostrarStatusLive("Clique novamente em “Ativar som” para liberar o áudio.");
    }
});

document.getElementById("closeLiveWatch").addEventListener("click", async () => {
    if (document.pictureInPictureElement) { try { await document.exitPictureInPicture(); } catch (_) {} }
    liveMiniPlayer.hidden = true;
    liveVideoInMini = false;
    pararAssistirLive(true);
    liveWatchModal.hidden = true;
    liberarScrollPagina();
});

liveWatchPip?.addEventListener("click", alternarLivePictureInPicture);
liveWatchMini?.addEventListener("click", abrirLiveMiniPlayer);
liveMiniRestore?.addEventListener("click", restaurarLiveDoMini);
liveMiniClose?.addEventListener("click", fecharMiniLive);

liveWatchModal?.addEventListener("wheel", event => {
    // O fundo nunca recebe o scroll enquanto a live está aberta.
    if (!event.target.closest(".lv-watch-dialog")) event.preventDefault();
}, { passive: false, capture: true });
liveWatchModal?.addEventListener("touchmove", event => {
    // Permite rolagem somente dentro do diálogo; o backdrop fica travado.
    if (!event.target.closest(".lv-watch-dialog")) event.preventDefault();
}, { passive: false, capture: true });
// Garante que o toque no X nunca seja interpretado como gesto de rolagem.
liveWatchModal?.addEventListener("pointerdown", event => {
    if (event.target.closest("#closeLiveWatch")) event.stopPropagation();
}, { capture: true });

liveWatchVideo?.addEventListener("enterpictureinpicture", () => {
    liveWatchPip?.classList.add("ativo");
});
liveWatchVideo?.addEventListener("leavepictureinpicture", () => {
    liveWatchPip?.classList.remove("ativo");
});

window.addEventListener("pagehide", () => {
    if (!viewerState) return;
    try { navigator.sendBeacon(`/api/live/${encodeURIComponent(viewerState.liveId)}/leave`, new Blob([JSON.stringify({ peerId: viewerState.peerId })], { type: "application/json" })); } catch (_) {}
});

/* ----------------------------------------------------------------
   INICIALIZAÇÃO
---------------------------------------------------------------- */
carregarLojas();
carregarLives();
carregarVideos();
if (API_ENABLED) window.setInterval(() => { if (!liveWatchModal.hidden) return; carregarLives(); }, 6000);
if (API_ENABLED) window.setInterval(() => { if (!videoWatchModal.hidden) return; carregarVideos(); }, 15000);


/* Interações sociais */
document.getElementById("liveChatSend")?.addEventListener("click", enviarChatLive);
document.getElementById("liveChatInput")?.addEventListener("keydown", e => { if (e.key === "Enter") enviarChatLive(); });
document.getElementById("liveParticipationBtn")?.addEventListener("click", pedirParticipacaoLive);
document.getElementById("videoLikeBtn")?.addEventListener("click", async () => { if (!currentVideoSocial) return; const d=await api(`/api/videos/${encodeURIComponent(currentVideoSocial.id)}/like`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({clientId:clientId(),clientName:clientName()})}); document.getElementById("videoLikeBtn").textContent=`❤️ Curtir (${d.likes})`; });
document.getElementById("videoShareBtn")?.addEventListener("click", async () => { if (!currentVideoSocial) return; const d=await api(`/api/videos/${encodeURIComponent(currentVideoSocial.id)}/share`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({clientId:clientId(),clientName:clientName()})}); try { await navigator.share?.({title:currentVideoSocial.title,url:location.href}); } catch(_) {} document.getElementById("videoShareBtn").textContent=`↗ Compartilhar (${d.shares})`; });
document.getElementById("videoCommentSend")?.addEventListener("click", async () => { if (!currentVideoSocial) return; const input=document.getElementById("videoCommentInput"), message=String(input?.value||"").trim(); if(!message)return; await api(`/api/videos/${encodeURIComponent(currentVideoSocial.id)}/comments`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({clientId:clientId(),clientName:clientName(),message})}); input.value=""; carregarVideoSocial(currentVideoSocial.id); });
const originalAssistirLive = assistirLive;
const oldCloseLive = document.getElementById("closeLiveWatch");
oldCloseLive?.addEventListener("click",()=>{ clearInterval(socialPollTimer); socialPollTimer=null; });
