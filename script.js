const localPlayer = document.getElementById('localVideoPlayer');
const ytContainer = document.getElementById('ytPlayerContainer');
const mediaPlaceholder = document.getElementById('mediaPlaceholder');
const seekSlider = document.getElementById('seekSlider');
const volumeSlider = document.getElementById('volumeSlider');
const statusMessage = document.getElementById('statusMessage');
const clockDisplay = document.getElementById('clockDisplay');

const hourHand = document.getElementById('hourHand');
const minuteHand = document.getElementById('minuteHand');
const secondHand = document.getElementById('secondHand');

let ytPlayer = null;
let activeSlot = 0; 
let currentSourceType = 'none'; 
let localFiles = {1: null, 2: null, 3: null}; 
let slotApplied = {1: false, 2: false, 3: false};

// 초기화
function initSystem() {
    document.getElementById('startOverlay').style.display = 'none';
    localPlayer.play().then(() => localPlayer.pause()).catch(e => {});
    startScheduler();
    renderHistory(); // 시작 시 히스토리 불러오기
}

// 유튜브 설정
function onYouTubeIframeAPIReady() {
    ytPlayer = new YT.Player('ytPlayerDiv', {
        height: '100%', width: '100%',
        playerVars: { 'autoplay': 0, 'controls': 0, 'rel': 0, 'disablekb': 1 },
        events: {
            'onReady': () => { ytPlayer.setVolume(volumeSlider.value * 100); },
            'onStateChange': onYtStateChange
        }
    });
}
function onYtStateChange(event) {
    if (event.data === YT.PlayerState.ENDED) {
        ytPlayer.seekTo(0); ytPlayer.playVideo();
    }
}
localPlayer.addEventListener('ended', () => {
    localPlayer.currentTime = 0; localPlayer.play();
});

function toggleInput(slot) {
    const type = document.querySelector(`input[name="type${slot}"]:checked`).value;
    if(type === 'file') {
        document.getElementById(`file${slot}`).classList.remove('hidden');
        document.getElementById(`yt${slot}`).classList.add('hidden');
    } else {
        document.getElementById(`file${slot}`).classList.add('hidden');
        document.getElementById(`yt${slot}`).classList.remove('hidden');
    }
    if(slotApplied[slot]) checkSchedule();
}

[1, 2, 3].forEach(slot => {
    document.getElementById(`file${slot}`).addEventListener('change', (e) => {
        const file = e.target.files[0];
        if(file) {
            if(localFiles[slot]) URL.revokeObjectURL(localFiles[slot]);
            localFiles[slot] = URL.createObjectURL(file);
            if(slotApplied[slot] && activeSlot === slot) playSlot(slot); 
        }
    });
});

volumeSlider.addEventListener('input', () => {
    const vol = volumeSlider.value;
    localPlayer.volume = vol;
    if(ytPlayer && ytPlayer.setVolume) ytPlayer.setVolume(vol * 100);
});
seekSlider.addEventListener('input', () => {
    if(activeSlot !== 0) {
        const pct = seekSlider.value / 100;
        if(currentSourceType === 'file' && localPlayer.duration) {
            localPlayer.currentTime = pct * localPlayer.duration;
        } else if(currentSourceType === 'youtube' && ytPlayer && ytPlayer.getDuration) {
            ytPlayer.seekTo(pct * ytPlayer.getDuration(), true);
        }
    }
});

function extractYtId(url) {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:.*v=|.*\/|.*embed\/))([^&?\s]+)/);
    return match ? match[1] : url.trim();
}

function stopAll() {
    localPlayer.pause();
    localPlayer.style.display = 'none';
    ytContainer.style.display = 'none';
    mediaPlaceholder.style.display = 'block';
    if(ytPlayer && ytPlayer.pauseVideo) { try { ytPlayer.pauseVideo(); } catch(e){} }
    currentSourceType = 'none';
}

function playSlot(slot) {
    const type = document.querySelector(`input[name="type${slot}"]:checked`).value;
    mediaPlaceholder.style.display = 'none';

    if(type === 'file') {
        const fileUrl = localFiles[slot];
        if(fileUrl) {
            currentSourceType = 'file';
            localPlayer.src = fileUrl;
            localPlayer.style.display = 'block';
            localPlayer.play().catch(e => console.log(e));
            statusMessage.innerText = `상태: ${slot}차 재생 중 🎵`;
        } else {
            mediaPlaceholder.style.display = 'block';
            statusMessage.innerText = `상태: ${slot}차 대기 중 (파일 필요)`;
        }
    } else {
        const rawUrl = document.getElementById(`yt${slot}`).value;
        const ytId = extractYtId(rawUrl);
        if(ytId && ytPlayer && ytPlayer.loadVideoById) {
            currentSourceType = 'youtube';
            ytContainer.style.display = 'block';
            ytPlayer.loadVideoById(ytId);
            statusMessage.innerText = `상태: ${slot}차 재생 중 📺`;
        } else {
            mediaPlaceholder.style.display = 'block';
            statusMessage.innerText = `상태: ${slot}차 대기 중 (주소 필요)`;
        }
    }
}

// ⭐ [적용하기] 버튼 기능 
function applySlot(slot) {
    slotApplied[slot] = true;
    const badge = document.getElementById(`statusBadge${slot}`);
    badge.innerText = '🟢 적용됨';
    badge.style.color = '#16a34a';

    // 유튜브일 경우 히스토리 자동 저장
    const type = document.querySelector(`input[name="type${slot}"]:checked`).value;
    if(type === 'youtube') {
        const rawUrl = document.getElementById(`yt${slot}`).value;
        const ytId = extractYtId(rawUrl);
        if(ytId) saveToHistory(rawUrl, ytId);
    }
    checkSchedule();
}

function stopSlot(slot) {
    slotApplied[slot] = false;
    const badge = document.getElementById(`statusBadge${slot}`);
    badge.innerText = '🔴 미적용';
    badge.style.color = '#ef4444';
    checkSchedule(); 
}

// ⭐ 히스토리 저장 및 제목 자동 수집 로직
async function saveToHistory(url, id) {
    let ytHistory = JSON.parse(localStorage.getItem('ytHistory')) || [];
    // 중복 제거 (새로 등록하면 위로 올리기 위함)
    ytHistory = ytHistory.filter(item => item.id !== id);
    
    let title = "불러오는 중...";
    ytHistory.unshift({ id, url, title }); // 최상단 추가
    if(ytHistory.length > 10) ytHistory.pop(); // 최대 10개 유지
    localStorage.setItem('ytHistory', JSON.stringify(ytHistory));
    renderHistory();

    try {
        // noembed를 통해 유튜브 원본 제목 가져오기
        const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`);
        const data = await res.json();
        if(data.title) {
            ytHistory[0].title = data.title;
            localStorage.setItem('ytHistory', JSON.stringify(ytHistory));
            renderHistory();
        }
    } catch(e) {
        ytHistory[0].title = `유튜브 영상 (${id})`;
        localStorage.setItem('ytHistory', JSON.stringify(ytHistory));
        renderHistory();
    }
}

// ⭐ 화면에 히스토리 리스트 그려주기
function renderHistory() {
    const list = document.getElementById('historyList');
    list.innerHTML = '';
    let ytHistory = JSON.parse(localStorage.getItem('ytHistory')) || [];
    
    ytHistory.forEach(item => {
        const li = document.createElement('li');
        li.className = 'history-item';
        li.innerHTML = `
            <span class="history-title" title="${item.title}">${item.title}</span>
            <button class="btn-copy" onclick="copyUrl('${item.url}')">복사</button>
        `;
        list.appendChild(li);
    });
}

// ⭐ 클립보드 복사 기능
function copyUrl(url) {
    navigator.clipboard.writeText(url).then(() => {
        alert("🔗 주소가 복사되었습니다! 재생할 빈칸에 붙여넣기 하세요.");
    });
}

function checkSchedule() {
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();
    let targetSlot = 0;

    for(let i=1; i<=3; i++) {
        if(!slotApplied[i]) continue; 

        const sVal = document.getElementById(`start${i}`).value;
        const eVal = document.getElementById(`end${i}`).value;
        if(sVal && eVal) {
            const [sh, sm] = sVal.split(':').map(Number);
            const [eh, em] = eVal.split(':').map(Number);
            const sMins = sh * 60 + sm;
            const eMins = eh * 60 + em;

            if(currentMins >= sMins && currentMins < eMins) {
                targetSlot = i;
                break;
            }
        }
    }

    if(targetSlot !== activeSlot) {
        stopAll();
        activeSlot = targetSlot;
        if(activeSlot !== 0) playSlot(activeSlot);
        else statusMessage.innerText = "상태: 설정된 시간이나 적용된 슬롯이 없습니다.";
    }
}

function startScheduler() {
    setInterval(() => {
        const now = new Date();
        
        const hs = String(now.getHours()).padStart(2, '0');
        const ms = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        clockDisplay.innerText = `${hs}:${ms}:${ss}`;

        const hRot = (now.getHours() % 12) * 30 + now.getMinutes() * 0.5;
        const mRot = now.getMinutes() * 6;
        const sRot = now.getSeconds() * 6;
        hourHand.style.transform = `rotate(${hRot}deg)`;
        minuteHand.style.transform = `rotate(${mRot}deg)`;
        secondHand.style.transform = `rotate(${sRot}deg)`;

        checkSchedule();

        if (activeSlot !== 0 && document.activeElement !== seekSlider) {
            if(currentSourceType === 'file' && localPlayer.duration) {
                seekSlider.value = (localPlayer.currentTime / localPlayer.duration) * 100;
            } else if(currentSourceType === 'youtube' && ytPlayer && ytPlayer.getDuration) {
                const dur = ytPlayer.getDuration();
                if(dur > 0) seekSlider.value = (ytPlayer.getCurrentTime() / dur) * 100;
            }
        }
    }, 1000);
}

window.onload = () => {
    localPlayer.volume = 0.5;
};
