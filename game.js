const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = true;

const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const finalScoreEl = document.getElementById("finalScore");
const startOverlay = document.getElementById("startOverlay");
const gameOverOverlay = document.getElementById("gameOverOverlay");
const startButton = document.getElementById("startButton");
const restartButton = document.getElementById("restartButton");

const ASSET_PATHS = {
  bg: "./assets/background.jpeg",
  bird: "./assets/character.png",
  obstacle: "./assets/obstacle.jpg",
};

const BGM_VIDEO_ID = "zw23_hWjmuY";

const state = {
  running: false,
  score: 0,
  bestScore: Number(localStorage.getItem("flyingTakoyakiBest") || 0),
  bird: {
    x: 220,
    y: canvas.height * 0.45,
    radius: 31,
    hitRadiusX: 22,
    hitRadiusY: 21,
    hitOffsetY: -1,
    renderHeight: 100,
    velocityY: 0,
    jumpPower: -10.4,
    gravity: 0.56,
  },
  pipes: [],
  pipeGap: 166,
  pipeWidth: 96,
  pipeCollisionInset: 6,
  topCollisionMargin: 0,
  bottomCollisionMargin: 0,
  skewerHitWidth: 42,
  pipeHandleOutside: 58,
  pipeHandleHeight: 34,
  pipeTipHeight: 26,
  pipeSpeed: 5.2,
  spawnEveryMs: 1400,
  lastSpawnMs: 0,
  lastFrameMs: 0,
};

const images = {
  bg: new Image(),
  bird: new Image(),
  obstacle: new Image(),
};

let processedBirdSprite = null;
let processedObstacleSprite = null;
let ytPlayer = null;
let ytPlayerReady = false;
let ytReadyResolver = null;
let sfxContext = null;
const ytPlayerReadyPromise = new Promise((resolve) => {
  ytReadyResolver = resolve;
});

function ensureSfxContext() {
  if (!sfxContext) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      return null;
    }
    sfxContext = new AudioCtx();
  }
  if (sfxContext.state === "suspended") {
    sfxContext.resume();
  }
  return sfxContext;
}

function playBoingSfx() {
  const ctxRef = ensureSfxContext();
  if (!ctxRef) {
    return;
  }
  const now = ctxRef.currentTime;
  const osc = ctxRef.createOscillator();
  const gain = ctxRef.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(280, now);
  osc.frequency.exponentialRampToValueAtTime(520, now + 0.055);
  osc.frequency.exponentialRampToValueAtTime(250, now + 0.16);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

  osc.connect(gain);
  gain.connect(ctxRef.destination);
  osc.start(now);
  osc.stop(now + 0.19);
}

function playPassSfx() {
  const ctxRef = ensureSfxContext();
  if (!ctxRef) {
    return;
  }
  const now = ctxRef.currentTime;
  const master = ctxRef.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.19, now + 0.006);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
  master.connect(ctxRef.destination);

  const hp = ctxRef.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 900;
  hp.Q.value = 0.7;
  hp.connect(master);

  // 금속성 "띠링" 느낌: 고음 사인 + 짧은 FM 변조
  const carrier = ctxRef.createOscillator();
  carrier.type = "sine";
  carrier.frequency.setValueAtTime(1620, now);
  carrier.frequency.exponentialRampToValueAtTime(1320, now + 0.24);

  const mod = ctxRef.createOscillator();
  mod.type = "sine";
  mod.frequency.setValueAtTime(420, now);

  const modGain = ctxRef.createGain();
  modGain.gain.setValueAtTime(190, now);
  modGain.gain.exponentialRampToValueAtTime(12, now + 0.2);

  mod.connect(modGain);
  modGain.connect(carrier.frequency);
  carrier.connect(hp);

  // 어택 강조용 고주파 짧은 클릭
  const strike = ctxRef.createOscillator();
  strike.type = "square";
  strike.frequency.setValueAtTime(3100, now);
  const strikeGain = ctxRef.createGain();
  strikeGain.gain.setValueAtTime(0.0001, now);
  strikeGain.gain.exponentialRampToValueAtTime(0.045, now + 0.003);
  strikeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
  strike.connect(strikeGain);
  strikeGain.connect(master);

  carrier.start(now);
  mod.start(now);
  strike.start(now);

  strike.stop(now + 0.035);
  mod.stop(now + 0.22);
  carrier.stop(now + 0.29);
}

function playGameOverSizzleSfx() {
  const ctxRef = ensureSfxContext();
  if (!ctxRef) {
    return;
  }
  const now = ctxRef.currentTime;
  const duration = 0.42;
  const bufferSize = Math.floor(ctxRef.sampleRate * duration);
  const noiseBuffer = ctxRef.createBuffer(1, bufferSize, ctxRef.sampleRate);
  const channel = noiseBuffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i += 1) {
    const progress = i / bufferSize;
    const envelope = Math.max(0, 1 - progress * 1.8);
    const crackle = Math.random() < 0.025 ? 1 : 0;
    const baseNoise = (Math.random() * 2 - 1) * 0.45;
    channel[i] = (baseNoise + crackle * (Math.random() * 2 - 1) * 0.9) * envelope;
  }

  const noise = ctxRef.createBufferSource();
  noise.buffer = noiseBuffer;

  const hp = ctxRef.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 850;

  const lp = ctxRef.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(4200, now);
  lp.frequency.exponentialRampToValueAtTime(1300, now + duration);

  const gain = ctxRef.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.2, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  noise.connect(hp);
  hp.connect(lp);
  lp.connect(gain);
  gain.connect(ctxRef.destination);
  noise.start(now);
  noise.stop(now + duration);
}

function ensureYouTubeApi() {
  if (window.YT && window.YT.Player) {
    setupYouTubePlayer();
    return;
  }

  const existingScript = document.getElementById("yt-iframe-api");
  if (!existingScript) {
    const script = document.createElement("script");
    script.id = "yt-iframe-api";
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  }

  const previousReady = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => {
    if (typeof previousReady === "function") {
      previousReady();
    }
    setupYouTubePlayer();
  };
}

function setupYouTubePlayer() {
  if (ytPlayer) {
    return;
  }

  const host = document.createElement("div");
  host.id = "yt-bgm-player";
  host.setAttribute("aria-hidden", "true");
  host.style.position = "fixed";
  host.style.width = "1px";
  host.style.height = "1px";
  host.style.left = "-9999px";
  host.style.top = "0";
  host.style.opacity = "0";
  document.body.appendChild(host);

  ytPlayer = new window.YT.Player("yt-bgm-player", {
    width: "1",
    height: "1",
    videoId: BGM_VIDEO_ID,
    playerVars: {
      autoplay: 0,
      controls: 0,
      disablekb: 1,
      fs: 0,
      modestbranding: 1,
      rel: 0,
      loop: 1,
      playlist: BGM_VIDEO_ID,
    },
    events: {
      onReady: (event) => {
        ytPlayerReady = true;
        event.target.setVolume(35);
        // 반복 재생이 브라우저/플레이어 상태에 따라 풀리는 경우를 대비해 강제 반복
        event.target.setLoop(true);
        if (ytReadyResolver) {
          ytReadyResolver();
        }
      },
      onStateChange: (event) => {
        if (event.data === window.YT.PlayerState.PAUSED) {
          event.target.playVideo();
        }
        if (event.data === window.YT.PlayerState.ENDED) {
          event.target.seekTo(0);
          event.target.playVideo();
        }
      },
    },
  });
}

async function playBgm() {
  try {
    ensureYouTubeApi();
    await ytPlayerReadyPromise;
    if (ytPlayer && ytPlayer.playVideo) {
      ytPlayer.playVideo();
    }
  } catch {
    // BGM 실패 시 게임 진행에는 영향 없도록 처리.
  }
}

function pauseBgm() {
  if (ytPlayer && ytPlayer.pauseVideo) {
    ytPlayer.pauseVideo();
  }
}

function buildForegroundSprite(sourceImage, options = {}) {
  const {
    edgeSeedTolerance = 52,
    floodTolerance = 60,
    componentMinsize = 140,
    removeNearWhite = false,
    nearWhiteThreshold = 235,
    keepLargestComponentOnly = false,
    padding = 6,
  } = options;

  const sw = sourceImage.width;
  const sh = sourceImage.height;

  const offscreen = document.createElement("canvas");
  offscreen.width = sw;
  offscreen.height = sh;
  const offCtx = offscreen.getContext("2d");
  offCtx.imageSmoothingEnabled = true;
  offCtx.drawImage(sourceImage, 0, 0, sw, sh);

  const imageData = offCtx.getImageData(0, 0, sw, sh);
  const data = imageData.data;
  const totalPixels = sw * sh;

  const borderIndices = [];
  for (let x = 0; x < sw; x += 1) {
    borderIndices.push(x);
    borderIndices.push((sh - 1) * sw + x);
  }
  for (let y = 1; y < sh - 1; y += 1) {
    borderIndices.push(y * sw);
    borderIndices.push(y * sw + (sw - 1));
  }

  let r = 0;
  let g = 0;
  let b = 0;
  for (const pixelIndex of borderIndices) {
    const idx = pixelIndex * 4;
    r += data[idx];
    g += data[idx + 1];
    b += data[idx + 2];
  }

  const bgR = r / borderIndices.length;
  const bgG = g / borderIndices.length;
  const bgB = b / borderIndices.length;

  const visited = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  let qHead = 0;
  let qTail = 0;

  function colorDistanceToBg(pixelIndex) {
    const idx = pixelIndex * 4;
    const dr = data[idx] - bgR;
    const dg = data[idx + 1] - bgG;
    const db = data[idx + 2] - bgB;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  for (const pixelIndex of borderIndices) {
    if (visited[pixelIndex] === 1) {
      continue;
    }
    if (colorDistanceToBg(pixelIndex) <= edgeSeedTolerance) {
      visited[pixelIndex] = 1;
      queue[qTail++] = pixelIndex;
    }
  }

  while (qHead < qTail) {
    const pixelIndex = queue[qHead++];
    const px = pixelIndex % sw;
    const py = (pixelIndex - px) / sw;

    const neighbors = [];
    if (px > 0) neighbors.push(pixelIndex - 1);
    if (px < sw - 1) neighbors.push(pixelIndex + 1);
    if (py > 0) neighbors.push(pixelIndex - sw);
    if (py < sh - 1) neighbors.push(pixelIndex + sw);

    for (const next of neighbors) {
      if (visited[next] === 1) {
        continue;
      }
      if (colorDistanceToBg(next) <= floodTolerance) {
        visited[next] = 1;
        queue[qTail++] = next;
      }
    }
  }

  for (let pixelIndex = 0; pixelIndex < totalPixels; pixelIndex += 1) {
    if (visited[pixelIndex] === 1) {
      data[pixelIndex * 4 + 3] = 0;
    }
  }

  if (removeNearWhite) {
    for (let i = 0; i < data.length; i += 4) {
      if (
        data[i] >= nearWhiteThreshold &&
        data[i + 1] >= nearWhiteThreshold &&
        data[i + 2] >= nearWhiteThreshold
      ) {
        data[i + 3] = 0;
      }
    }
  }

  // 배경 제거 후 남는 작은 점 노이즈를 제거하기 위해
  // 연결 컴포넌트를 구해서 충분히 작은 조각은 투명화한다.
  const alphaThreshold = 20;
  const opaqueVisited = new Uint8Array(totalPixels);
  const compQueue = new Int32Array(totalPixels);
  function isOpaque(pixelIndex) {
    return data[pixelIndex * 4 + 3] > alphaThreshold;
  }

  for (let start = 0; start < totalPixels; start += 1) {
    if (opaqueVisited[start] === 1 || !isOpaque(start)) {
      continue;
    }

    let head = 0;
    let tail = 0;
    compQueue[tail++] = start;
    opaqueVisited[start] = 1;

    const component = [];
    while (head < tail) {
      const current = compQueue[head++];
      component.push(current);

      const x = current % sw;
      const y = (current - x) / sw;

      const neighbors = [];
      if (x > 0) neighbors.push(current - 1);
      if (x < sw - 1) neighbors.push(current + 1);
      if (y > 0) neighbors.push(current - sw);
      if (y < sh - 1) neighbors.push(current + sw);

      for (const next of neighbors) {
        if (opaqueVisited[next] === 1 || !isOpaque(next)) {
          continue;
        }
        opaqueVisited[next] = 1;
        compQueue[tail++] = next;
      }
    }

    if (component.length < componentMinsize) {
      for (const pixelIndex of component) {
        data[pixelIndex * 4 + 3] = 0;
      }
    }
  }

  // 캐릭터/오브젝트 본체만 남기고 떠다니는 조각(분리된 레이어)은 제거
  if (keepLargestComponentOnly) {
    const majorVisited = new Uint8Array(totalPixels);
    const majorQueue = new Int32Array(totalPixels);
    let largestComponent = null;

    for (let start = 0; start < totalPixels; start += 1) {
      if (majorVisited[start] === 1 || data[start * 4 + 3] <= alphaThreshold) {
        continue;
      }

      let head = 0;
      let tail = 0;
      majorQueue[tail++] = start;
      majorVisited[start] = 1;
      const component = [];

      while (head < tail) {
        const current = majorQueue[head++];
        component.push(current);

        const x = current % sw;
        const y = (current - x) / sw;

        const neighbors = [];
        if (x > 0) neighbors.push(current - 1);
        if (x < sw - 1) neighbors.push(current + 1);
        if (y > 0) neighbors.push(current - sw);
        if (y < sh - 1) neighbors.push(current + sw);

        for (const next of neighbors) {
          if (majorVisited[next] === 1 || data[next * 4 + 3] <= alphaThreshold) {
            continue;
          }
          majorVisited[next] = 1;
          majorQueue[tail++] = next;
        }
      }

      if (!largestComponent || component.length > largestComponent.length) {
        largestComponent = component;
      }
    }

    if (largestComponent && largestComponent.length > 0) {
      const keep = new Uint8Array(totalPixels);
      for (const pixelIndex of largestComponent) {
        keep[pixelIndex] = 1;
      }
      for (let pixelIndex = 0; pixelIndex < totalPixels; pixelIndex += 1) {
        if (keep[pixelIndex] === 0) {
          data[pixelIndex * 4 + 3] = 0;
        }
      }
    }
  }

  let minX = sw;
  let minY = sh;
  let maxX = -1;
  let maxY = -1;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 20) {
      const pixel = i / 4;
      const x = pixel % sw;
      const y = (pixel - x) / sw;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  offCtx.putImageData(imageData, 0, 0);

  if (maxX < minX || maxY < minY) {
    return offscreen;
  }

  const tx = Math.max(0, minX - padding);
  const ty = Math.max(0, minY - padding);
  const tw = Math.min(sw - tx, maxX - minX + 1 + padding * 2);
  const th = Math.min(sh - ty, maxY - minY + 1 + padding * 2);

  const trimmed = document.createElement("canvas");
  trimmed.width = tw;
  trimmed.height = th;
  const tctx = trimmed.getContext("2d");
  tctx.imageSmoothingEnabled = true;
  tctx.drawImage(offscreen, tx, ty, tw, th, 0, 0, tw, th);

  return trimmed;
}

function rotateSprite90(sourceCanvas) {
  const rotated = document.createElement("canvas");
  rotated.width = sourceCanvas.height;
  rotated.height = sourceCanvas.width;
  const rctx = rotated.getContext("2d");
  rctx.imageSmoothingEnabled = true;
  rctx.translate(rotated.width / 2, rotated.height / 2);
  rctx.rotate(Math.PI / 2);
  rctx.drawImage(sourceCanvas, -sourceCanvas.width / 2, -sourceCanvas.height / 2);
  return rotated;
}

function loadImages() {
  const keys = Object.keys(ASSET_PATHS);
  return Promise.all(
    keys.map((key) => {
      const img = images[key];
      img.src = ASSET_PATHS[key];
      return new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error(`${key} image load failed`));
      });
    })
  );
}

function resetGame() {
  state.running = true;
  state.score = 0;
  state.pipes = [];
  state.lastSpawnMs = 0;
  state.lastFrameMs = 0;
  state.bird.y = canvas.height * 0.45;
  state.bird.velocityY = 0;
  updateScore();
  startOverlay.classList.add("hidden");
  gameOverOverlay.classList.add("hidden");
}

function updateScore() {
  scoreEl.textContent = String(state.score);
  bestEl.textContent = String(state.bestScore);
}

function flap() {
  if (!state.running) {
    return;
  }
  ensureSfxContext();
  playBoingSfx();
  state.bird.velocityY = state.bird.jumpPower;
}

function createPipe() {
  const minTop = 60;
  const maxTop = canvas.height - state.pipeGap - 80;
  const topHeight = Math.floor(Math.random() * (maxTop - minTop + 1)) + minTop;

  state.pipes.push({
    x: canvas.width + 10,
    topHeight,
    passed: false,
  });
}

function update(deltaMs, nowMs) {
  const dt = Math.min(deltaMs / 16.6667, 2);
  const bird = state.bird;
  const hitRadiusX = bird.hitRadiusX || bird.radius;

  bird.velocityY += bird.gravity * dt;
  bird.y += bird.velocityY * dt;

  if (nowMs - state.lastSpawnMs >= state.spawnEveryMs) {
    createPipe();
    state.lastSpawnMs = nowMs;
  }

  for (const pipe of state.pipes) {
    pipe.x -= state.pipeSpeed * dt;
    if (!pipe.passed && pipe.x + state.pipeWidth < bird.x - hitRadiusX) {
      pipe.passed = true;
      state.score += 1;
      playPassSfx();
      if (state.score > state.bestScore) {
        state.bestScore = state.score;
        localStorage.setItem("flyingTakoyakiBest", String(state.bestScore));
      }
      updateScore();
    }
  }

  state.pipes = state.pipes.filter((pipe) => pipe.x + state.pipeWidth > -20);
}

function collides() {
  const bird = state.bird;
  const hitRadiusX = bird.hitRadiusX || bird.radius;
  const hitRadiusY = bird.hitRadiusY || bird.radius;
  const centerY = bird.y + (bird.hitOffsetY || 0);
  const birdLeft = bird.x - hitRadiusX;
  const birdRight = bird.x + hitRadiusX;
  const birdTop = centerY - hitRadiusY;
  const birdBottom = centerY + hitRadiusY;

  // 기울어진(대각선) 상태에서도 충돌이 정확하도록
  // 타코야끼 타원 경계의 주요 포인트를 현재 회전각으로 변환해서 사용.
  const birdAngle = Math.max(-0.5, Math.min(0.8, bird.velocityY * 0.05));
  const cosA = Math.cos(birdAngle);
  const sinA = Math.sin(birdAngle);
  const bodyPoints = [{ x: bird.x, y: centerY }];
  const localSamples = [
    [0.95, 0.0], // 앞 중심
    [0.78, -0.72], // 앞-위 대각
    [0.78, 0.72], // 앞-아래 대각
    [0.32, -0.96], // 위쪽
    [0.32, 0.96], // 아래쪽
    [-0.12, -0.86], // 뒤-위 보강
    [-0.12, 0.86], // 뒤-아래 보강
  ];

  for (const [nx, ny] of localSamples) {
    const lx = nx * hitRadiusX;
    const ly = ny * hitRadiusY;
    const rx = lx * cosA - ly * sinA;
    const ry = lx * sinA + ly * cosA;
    bodyPoints.push({ x: bird.x + rx, y: centerY + ry });
  }

  if (birdTop <= 0 || birdBottom >= canvas.height) {
    return true;
  }

  for (const pipe of state.pipes) {
    const pipeLeft = pipe.x + state.pipeCollisionInset;
    const pipeRight = pipe.x + state.pipeWidth - state.pipeCollisionInset;
    const skewerCenterX = (pipeLeft + pipeRight) * 0.5;
    const skewerHalfWidth = state.skewerHitWidth * 0.5;
    const gapTop = pipe.topHeight;
    const gapBottom = gapTop + state.pipeGap;
    const topBoundary = gapTop + state.topCollisionMargin;
    const bottomBoundary = gapBottom + state.bottomCollisionMargin;

    if (birdRight <= pipeLeft || birdLeft >= pipeRight) {
      continue;
    }

    for (const point of bodyPoints) {
      const inPipeX =
        point.x > skewerCenterX - skewerHalfWidth &&
        point.x < skewerCenterX + skewerHalfWidth;
      const inBlockedY = point.y < topBoundary || point.y > bottomBoundary;
      if (inPipeX && inBlockedY) {
        return true;
      }
    }
  }

  return false;
}

function drawBackground() {
  const bg = images.bg;
  const scale = Math.max(canvas.width / bg.width, canvas.height / bg.height);
  const drawW = bg.width * scale;
  const drawH = bg.height * scale;
  const drawX = (canvas.width - drawW) * 0.5;
  const drawY = (canvas.height - drawH) * 0.5;
  ctx.drawImage(bg, drawX, drawY, drawW, drawH);

  // 팬 탈출 분위기를 위한 은은한 따뜻한 톤
  ctx.fillStyle = "rgba(87, 47, 14, 0.12)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawMarketLighting(timeMs = performance.now()) {
  const t = timeMs * 0.001;
  const flicker = 0.78 + Math.sin(t * 2.1) * 0.08;

  // 상단 등불 줄
  const lanternXs = [120, 280, 440, 600, 760, 900];
  const lanternY = 26;
  for (const x of lanternXs) {
    // 종이등 본체
    ctx.fillStyle = "rgba(247, 202, 118, 0.95)";
    ctx.fillRect(x - 14, lanternY - 9, 28, 18);
    ctx.fillStyle = "rgba(165, 88, 42, 0.65)";
    ctx.fillRect(x - 14, lanternY - 9, 28, 3);
    ctx.fillRect(x - 14, lanternY + 6, 28, 3);

    // 줄
    ctx.strokeStyle = "rgba(70, 45, 27, 0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, lanternY - 9);
    ctx.stroke();

    // 빛 번짐
    const glow = ctx.createRadialGradient(x, lanternY, 5, x, lanternY, 90);
    glow.addColorStop(0, `rgba(255, 225, 165, ${0.24 * flicker})`);
    glow.addColorStop(0.5, `rgba(255, 172, 98, ${0.12 * flicker})`);
    glow.addColorStop(1, "rgba(255, 130, 70, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x - 90, lanternY - 90, 180, 180);
  }

  // 비네트 + 노점 조명 느낌
  const topShade = ctx.createLinearGradient(0, 0, 0, canvas.height * 0.45);
  topShade.addColorStop(0, "rgba(42, 22, 10, 0.42)");
  topShade.addColorStop(1, "rgba(42, 22, 10, 0)");
  ctx.fillStyle = topShade;
  ctx.fillRect(0, 0, canvas.width, canvas.height * 0.45);

  const sideVignette = ctx.createLinearGradient(0, 0, canvas.width, 0);
  sideVignette.addColorStop(0, "rgba(8, 6, 5, 0.28)");
  sideVignette.addColorStop(0.16, "rgba(8, 6, 5, 0)");
  sideVignette.addColorStop(0.84, "rgba(8, 6, 5, 0)");
  sideVignette.addColorStop(1, "rgba(8, 6, 5, 0.28)");
  ctx.fillStyle = sideVignette;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawPipes() {
  const pipeSprite = processedObstacleSprite || images.obstacle;
  const srcW = pipeSprite.width;
  const srcH = pipeSprite.height;

  const srcHandleH = Math.max(10, Math.floor(srcH * 0.24));
  const srcTipH = Math.max(10, Math.floor(srcH * 0.2));
  const srcMidY = srcHandleH;
  const srcMidH = Math.max(1, srcH - srcHandleH - srcTipH);

  function drawPipeWithFixedEnds(x, y, height) {
    let handleH = state.pipeHandleHeight;
    let tipH = state.pipeTipHeight;

    if (height <= handleH + tipH + 1) {
      const scale = (height - 1) / (handleH + tipH);
      handleH = Math.max(8, Math.floor(handleH * scale));
      tipH = Math.max(8, Math.floor(tipH * scale));
    }

    const midH = Math.max(1, height - handleH - tipH);

    // 손잡이(고정 크기)
    ctx.drawImage(pipeSprite, 0, 0, srcW, srcHandleH, x, y, state.pipeWidth, handleH);
    // 바늘 몸통(늘어나는 구간)
    ctx.drawImage(pipeSprite, 0, srcMidY, srcW, srcMidH, x, y + handleH, state.pipeWidth, midH);
    // 바늘 끝(고정 크기)
    ctx.drawImage(
      pipeSprite,
      0,
      srcH - srcTipH,
      srcW,
      srcTipH,
      x,
      y + handleH + midH,
      state.pipeWidth,
      tipH
    );
  }

  for (const pipe of state.pipes) {
    const topHeight = pipe.topHeight;
    const bottomY = topHeight + state.pipeGap;
    const bottomHeight = canvas.height - bottomY;

    // 위쪽 꼬치: 손잡이/끝은 고정, 몸통만 늘어나며
    // 손잡이는 화면 위로 일부 걸치게 그린다.
    const topRenderHeight = topHeight + state.pipeHandleOutside;
    drawPipeWithFixedEnds(pipe.x, -state.pipeHandleOutside, topRenderHeight);

    // 아래쪽 꼬치: 반대 방향(뾰족한 끝이 위)으로 뒤집고,
    // 손잡이 끝은 화면 아래로 일부 걸치게 더 길게 그린다.
    const bottomRenderHeight = bottomHeight + state.pipeHandleOutside;
    ctx.save();
    ctx.translate(0, bottomY + bottomRenderHeight);
    ctx.scale(1, -1);
    drawPipeWithFixedEnds(pipe.x, 0, bottomRenderHeight);
    ctx.restore();
  }
}

function drawBird() {
  const bird = state.bird;
  ctx.save();
  ctx.translate(bird.x, bird.y);
  const angle = Math.max(-0.5, Math.min(0.8, bird.velocityY * 0.05));
  ctx.rotate(angle);
  const sprite = processedBirdSprite || images.bird;
  const aspect = sprite.width / sprite.height;
  const renderH = bird.renderHeight;
  const renderW = renderH * aspect;

  // 진행 방향 기준으로 캐릭터가 오른쪽을 보게 좌우 반전.
  ctx.scale(-1, 1);
  ctx.drawImage(sprite, -renderW / 2, -renderH / 2, renderW, renderH);
  ctx.restore();
}

function draw(nowMs = performance.now()) {
  drawBackground();
  drawMarketLighting(nowMs);
  drawPipes();
  drawBird();
}

function endGame() {
  state.running = false;
  playGameOverSizzleSfx();
  finalScoreEl.textContent = String(state.score);
  gameOverOverlay.classList.remove("hidden");
}

function loop(nowMs) {
  if (!state.running) {
    draw(nowMs);
    return;
  }

  if (state.lastFrameMs === 0) {
    state.lastFrameMs = nowMs;
  }
  const deltaMs = nowMs - state.lastFrameMs;
  state.lastFrameMs = nowMs;

  update(deltaMs, nowMs);
  draw(nowMs);

  if (collides()) {
    endGame();
    return;
  }

  requestAnimationFrame(loop);
}

function beginGame() {
  resetGame();
  requestAnimationFrame(loop);
}

document.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    event.preventDefault();
    flap();
  }
});

canvas.addEventListener("pointerdown", flap);
startButton.addEventListener("click", beginGame);
restartButton.addEventListener("click", beginGame);

loadImages()
  .then(() => {
    ensureYouTubeApi();
    playBgm();
    processedBirdSprite = buildForegroundSprite(images.bird, {
      edgeSeedTolerance: 52,
      floodTolerance: 60,
      componentMinsize: 140,
      removeNearWhite: false,
      keepLargestComponentOnly: true,
      padding: 6,
    });
    const obstacleTrimmed = buildForegroundSprite(images.obstacle, {
      edgeSeedTolerance: 80,
      floodTolerance: 92,
      componentMinsize: 180,
      removeNearWhite: true,
      nearWhiteThreshold: 228,
      padding: 3,
    });
    processedObstacleSprite = rotateSprite90(obstacleTrimmed);
    updateScore();
    draw();
  })
  .catch(() => {
    startOverlay.innerHTML = "<h2>이미지 로딩 실패</h2><p>assets 폴더 경로를 확인하세요.</p>";
  });

// 브라우저 자동재생 정책으로 초기 재생이 막힌 경우를 대비해
// 첫 사용자 입력 시 재생을 다시 시도한다.
window.addEventListener(
  "pointerdown",
  () => {
    playBgm();
  },
  { once: true }
);
