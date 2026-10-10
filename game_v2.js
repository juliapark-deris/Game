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

const state = {
  running: false,
  score: 0,
  bestScore: Number(localStorage.getItem("flyingTakoyakiBest") || 0),
  bird: {
    x: 220,
    y: canvas.height * 0.45,
    radius: 31,
    renderHeight: 100,
    velocityY: 0,
    jumpPower: -9.6,
    gravity: 0.47,
  },
  pipes: [],
  pipeGap: 204,
  pipeWidth: 96,
  pipeHandleOutside: 58,
  pipeHandleHeight: 34,
  pipeTipHeight: 26,
  pipeSpeed: 4.8,
  spawnEveryMs: 1500,
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

function buildForegroundSprite(sourceImage, options = {}) {
  const {
    edgeSeedTolerance = 52,
    floodTolerance = 60,
    componentMinsize = 140,
    removeNearWhite = false,
    nearWhiteThreshold = 235,
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

  bird.velocityY += bird.gravity * dt;
  bird.y += bird.velocityY * dt;

  if (nowMs - state.lastSpawnMs >= state.spawnEveryMs) {
    createPipe();
    state.lastSpawnMs = nowMs;
  }

  for (const pipe of state.pipes) {
    pipe.x -= state.pipeSpeed * dt;
    if (!pipe.passed && pipe.x + state.pipeWidth < bird.x - bird.radius) {
      pipe.passed = true;
      state.score += 1;
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
  const birdLeft = bird.x - bird.radius;
  const birdRight = bird.x + bird.radius;
  const birdTop = bird.y - bird.radius;
  const birdBottom = bird.y + bird.radius;

  if (birdTop <= 0 || birdBottom >= canvas.height) {
    return true;
  }

  for (const pipe of state.pipes) {
    const pipeLeft = pipe.x;
    const pipeRight = pipe.x + state.pipeWidth;
    const gapTop = pipe.topHeight;
    const gapBottom = gapTop + state.pipeGap;

    const horizontalHit = birdRight > pipeLeft && birdLeft < pipeRight;
    const verticalHit = birdTop < gapTop || birdBottom > gapBottom;
    if (horizontalHit && verticalHit) {
      return true;
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

function draw() {
  drawBackground();
  drawPipes();
  drawBird();
}

function endGame() {
  state.running = false;
  finalScoreEl.textContent = String(state.score);
  gameOverOverlay.classList.remove("hidden");
}

function loop(nowMs) {
  if (!state.running) {
    draw();
    return;
  }

  if (state.lastFrameMs === 0) {
    state.lastFrameMs = nowMs;
  }
  const deltaMs = nowMs - state.lastFrameMs;
  state.lastFrameMs = nowMs;

  update(deltaMs, nowMs);
  draw();

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
    processedBirdSprite = buildForegroundSprite(images.bird, {
      edgeSeedTolerance: 52,
      floodTolerance: 60,
      componentMinsize: 140,
      removeNearWhite: false,
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
