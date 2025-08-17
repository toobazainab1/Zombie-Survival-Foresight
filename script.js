/* ============================
   Zombie Survival: Foresight
   Minimax + Alpha-Beta pruning
   Pure HTML/CSS/JS (frontend only)
   ============================ */

const N = 10;                 // board size
const SURVIVE_TURNS_TO_WIN = 20;

// DOM
const boardEl = document.getElementById('board');
const turnEl  = document.getElementById('turn');
const statusEl= document.getElementById('status');
const hintEl  = document.getElementById('hint');
const oracleEl= document.getElementById('oracle');
const overlay = document.getElementById('overlay');
const endTitle= document.getElementById('end-title');
const endDetail=document.getElementById('end-detail');

const btnNew  = document.getElementById('btn-new');
const btnRestart = document.getElementById('btn-restart');
const btnClose = document.getElementById('btn-close');
const depthSel= document.getElementById('depth');
const zSel    = document.getElementById('zcount');
const wSel    = document.getElementById('wcount');
const blurbTA = document.getElementById('blurb');

const DIRS = [
  {r:-1,c:0,name:'up'}, {r:1,c:0,name:'down'},
  {r:0,c:-1,name:'left'}, {r:0,c:1,name:'right'},
];

// Symbols for display (no external assets)
const EMOJI = {
  player: '🧍',
  zombie: '🧟',
  wall:   '🧱',
  goal:   '🚪'
};

// ---------- Game State ----------
let state = null;

/* State structure:
{
  turn: number,
  player: {r,c},
  zombies: [{r,c}, ...],
  walls: Set('r,c'),
  goal: {r,c} | null,
  alive: boolean,
  won: boolean,
  depth: number
}
*/

function coordKey(r,c){ return `${r},${c}`; }
function inBounds(r,c){ return r>=0 && c>=0 && r<N && c<N; }

function makeEmptyBoard(){
  boardEl.style.setProperty('--n', N);
  boardEl.innerHTML = '';
  for(let i=0;i<N*N;i++){
    const d=document.createElement('div');
    d.className='cell';
    d.setAttribute('role','gridcell');
    boardEl.appendChild(d);
  }
}

function render(){
  const cells = boardEl.children;
  for(let i=0;i<N*N;i++){
    const d=cells[i];
    d.className='cell';
    d.textContent='';
    const r = Math.floor(i/N), c = i%N;
    const key = coordKey(r,c);

    if(state.walls.has(key)){
      d.classList.add('wall');
      d.textContent = EMOJI.wall;
    }
    if(state.goal && state.goal.r===r && state.goal.c===c){
      d.classList.add('goal');
      d.textContent = EMOJI.goal;
      badge(d,'goal');
    }
    if(state.player.r===r && state.player.c===c){
      d.classList.add('player');
      d.textContent = EMOJI.player;
      badge(d,'you');
    }
    for(const z of state.zombies){
      if(z.r===r && z.c===c){
        d.classList.add('zombie');
        d.textContent = EMOJI.zombie;
      }
    }
  }
  turnEl.textContent = state.turn;
  if(!state.alive && !state.won){
    statusEl.textContent = 'Caught! Game Over.';
  }else if(state.won){
    statusEl.textContent = 'You survived. Victory!';
  }else{
    statusEl.textContent = 'Your move (Arrow keys or WASD)';
  }
}

function badge(cell, text){
  const b=document.createElement('div');
  b.className='badge';
  b.textContent = text;
  cell.appendChild(b);
}

function randomEmptyCell(occupied){
  while(true){
    const r = Math.floor(Math.random()*N);
    const c = Math.floor(Math.random()*N);
    const k = coordKey(r,c);
    if(!occupied.has(k)) return {r,c};
  }
}

function initGame(){
  const depth = parseInt(depthSel.value,10);
  const zombieCount = parseInt(zSel.value,10);
  const wallCount = parseInt(wSel.value,10);

  const walls = new Set();
  const occupied = new Set();

  // border walls (optional flavor) – disabled to keep escape routes open
  // for(let i=0;i<N;i++){ walls.add(coordKey(0,i)); walls.add(coordKey(N-1,i)); walls.add(coordKey(i,0)); walls.add(coordKey(i,N-1)); }

  // random inner walls
  for(let i=0;i<wallCount;i++){
    const pos = randomEmptyCell(occupied);
    walls.add(coordKey(pos.r,pos.c));
    occupied.add(coordKey(pos.r,pos.c));
  }

  // player spawn
  const player = randomEmptyCell(occupied);
  occupied.add(coordKey(player.r,player.c));

  // goal (survival doesn’t need goal, but fun to have exit option)
  const goal = randomEmptyCell(occupied);
  occupied.add(coordKey(goal.r,goal.c));

  // zombies
  const zombies = [];
  for(let i=0;i<zombieCount;i++){
    const z = randomEmptyCell(occupied);
    zombies.push(z);
    occupied.add(coordKey(z.r,z.c));
  }

  state = {
    turn: 0,
    player,
    zombies,
    walls,
    goal,
    alive: true,
    won: false,
    depth
  };

  updateBlurb();
  oracleEl.textContent = 'AI is watching your options…';
  render();
}

function updateBlurb(){
  const text = `🧠 Foresight: Zombie Survival

What it does:
Turn-based survival on a 10×10 grid. You move first. Zombies think ahead using Minimax + alpha–beta pruning to cut off your future escape paths.

How Minimax fits in:
The AI simulates alternating turns (Zombie → Player → Zombie …) up to ${state?.depth ?? 3} ply. On zombie turns it maximizes a trap score; on player turns it assumes you choose the safest escape (minimizes that score). The heuristic favors closing distance, flanking (multi-zombie pressure), and penalizes your future mobility.

Tech:
HTML + CSS + JavaScript (frontend only). Deployed on GitHub Pages.

Goal:
Survive ${SURVIVE_TURNS_TO_WIN} turns (or reach the exit 🚪).`;
  blurbTA.value = text;
}

// ---------- Input ----------
window.addEventListener('keydown', (e)=>{
  if(!state?.alive || state?.won) return;

  const key = e.key.toLowerCase();
  let dir = null;
  if(['arrowup','w'].includes(key)) dir = DIRS[0];
  else if(['arrowdown','s'].includes(key)) dir = DIRS[1];
  else if(['arrowleft','a'].includes(key)) dir = DIRS[2];
  else if(['arrowright','d'].includes(key)) dir = DIRS[3];

  if(dir){
    e.preventDefault();
    playerMove(dir);
  }
});

btnNew.addEventListener('click', initGame);
btnRestart.addEventListener('click', ()=>{ overlay.classList.add('hidden'); initGame(); });
btnClose.addEventListener('click', ()=> overlay.classList.add('hidden'));

// ---------- Movement & Turn Loop ----------
function isBlocked(r,c, walls, zombies){
  if(!inBounds(r,c)) return true;
  const k=coordKey(r,c);
  if(walls.has(k)) return true;
  for(const z of zombies) if(z.r===r && z.c===c) return true;
  return false;
}

function positionsEqual(a,b){ return a.r===b.r && a.c===b.c; }

function playerMovesFrom(st){
  const moves=[];
  for(const d of DIRS){
    const nr = st.player.r + d.r;
    const nc = st.player.c + d.c;
    if(!inBounds(nr,nc)) continue;
    const k = coordKey(nr,nc);
    // player can move onto goal or even onto zombie (which means caught)
    if(!st.walls.has(k)) moves.push({r:nr,c:nc});
  }
  // also allow staying put (adds strategy)
  moves.push({r:st.player.r, c:st.player.c, stay:true});
  return moves;
}

function zombieMovesForOne(st, zi){
  const z = st.zombies[zi];
  const options=[];
  for(const d of DIRS){
    const nr=z.r+d.r, nc=z.c+d.c;
    if(!inBounds(nr,nc)) continue;
    const k=coordKey(nr,nc);
    if(st.walls.has(k)) continue;

    // avoid moving onto another zombie (simple rule—prevents overlap issues)
    let blockedByZombie=false;
    for(let i=0;i<st.zombies.length;i++){
      if(i===zi) continue;
      const oz=st.zombies[i];
      if(oz.r===nr && oz.c===nc){ blockedByZombie=true; break; }
    }
    if(blockedByZombie) continue;

    options.push({r:nr,c:nc});
  }
  // also allow staying
  options.push({r:z.r,c:z.c,stay:true});
  return options;
}

function cloneState(st){
  return {
    turn: st.turn,
    player: {r:st.player.r, c:st.player.c},
    zombies: st.zombies.map(z=>({r:z.r, c:z.c})),
    walls: st.walls, // immutable set reused
    goal: st.goal ? {r:st.goal.r, c:st.goal.c} : null,
    alive: st.alive,
    won: st.won,
    depth: st.depth
  };
}

function applyPlayer(st, pos){
  const ns = cloneState(st);
  ns.player = {r:pos.r, c:pos.c};
  // Win by reaching goal or by surviving max turns
  if(ns.goal && positionsEqual(ns.player, ns.goal)){
    ns.won = true; ns.alive = false;
  }
  return ns;
}

function applyZombiesSequential(st, choicePerZombie){
  const ns = cloneState(st);
  for(let i=0;i<ns.zombies.length;i++){
    const mv = choicePerZombie[i];
    if(!mv) continue;
    ns.zombies[i] = {r:mv.r, c:mv.c};
    // if a zombie steps onto player, player dies
    if(positionsEqual(ns.zombies[i], ns.player)){
      ns.alive = false; ns.won=false;
    }
  }
  return ns;
}

function caught(st){
  if(!st.alive) return true;
  for(const z of st.zombies) if(positionsEqual(z, st.player)) return true;
  return false;
}

function wonByTurns(st){
  return st.turn >= SURVIVE_TURNS_TO_WIN;
}

function mobility(st){
  // how many safe tiles can the player step to next turn
  let count=0;
  for(const m of playerMovesFrom(st)){
    if(st.walls.has(coordKey(m.r,m.c))) continue;
    // stepping onto a zombie means immediate loss; not "safe"
    let onZombie=false;
    for(const z of st.zombies){ if(z.r===m.r && z.c===m.c) { onZombie=true; break; } }
    if(!onZombie) count++;
  }
  return count;
}

function manhattan(a,b){ return Math.abs(a.r-b.r) + Math.abs(a.c-b.c); }

// Heuristic: higher is worse for the player (better for zombies)
function evaluate(st){
  if(caught(st)) return 10_000;                 // zombies win
  if(wonByTurns(st) || (st.won)) return -10_000; // player wins

  // sum of (inverse) distances to nearest 2 zombies + flanking pressure
  const dists = st.zombies.map(z => manhattan(z, st.player)).sort((a,b)=>a-b);
  const nearest = dists[0] ?? 99;
  const second  = dists[1] ?? 99;

  // flanking: zombies closer from different axes is more dangerous
  let axisPressure = 0;
  for(const z of st.zombies){
    if(z.r === st.player.r || z.c === st.player.c) axisPressure += 0.6;
  }

  const mob = mobility(st); // higher mobility is good for player → negative for eval

  // weight tuning
  const score =
      (8 / (nearest+1)) +
      (4 / (second+1)) +
      axisPressure -
      (0.9 * mob);

  return score;
}

// Minimax with alpha-beta; alternating turns: zombies (max) then player (min)
// NOTE: To keep branching under control, zombies move sequentially in a fixed order this ply.
// This gives strong "cornering" without exponential blowup.
function minimax(st, depth, alpha, beta, maximizing){
  if(depth === 0 || caught(st) || wonByTurns(st) || st.won===true){
    return {score: evaluate(st)};
  }

  if(maximizing){ // ZOMBIE TURN (maximize trap score)
    let bestScore = -Infinity;
    let bestMoves = null;

    // we choose moves per zombie sequentially (greedy within the ply)
    // but evaluate with lookahead including player reply
    // try small set of promising moves per zombie: sorted by approaching the player
    const seqChoices = new Array(st.zombies.length);

    function recurseZombie(i, curState){
      if(i === curState.zombies.length){
        // After choosing all zombies, next turn is player's (min)
        const res = minimax(curState, depth, alpha, beta, false);
        const sc = res.score;
        if(sc > bestScore){
          bestScore = sc;
          bestMoves = seqChoices.map(x=>x); // copy
        }
        alpha = Math.max(alpha, sc);
        return;
      }
      const z = curState.zombies[i];
      const opts = zombieMovesForOne(curState, i);

      // Sort options by distance-to-player ascending (approach first)
      opts.sort((a,b)=>{
        const da = manhattan(a, curState.player);
        const db = manhattan(b, curState.player);
        return da - db;
      });

      // cap branching: try top 3 promising options
      const capped = opts.slice(0,3);

      for(const mv of capped){
        if(beta <= alpha) break; // pruning
        const next = cloneState(curState);
        next.zombies[i] = {r:mv.r, c:mv.c};
        // immediate catch?
        if(positionsEqual(next.zombies[i], next.player)){
          bestScore = 10_000;
          bestMoves = (seqChoices[i]=mv, seqChoices.map(x=>x));
          alpha = Math.max(alpha, bestScore);
          return;
        }
        seqChoices[i]=mv;
        recurseZombie(i+1, next);
      }
    }
    recurseZombie(0, st);

    return {score: bestScore, moves: bestMoves};
  }else{
    // PLAYER TURN (minimize trap score)
    let bestScore = Infinity;
    let bestMove = null;
    const options = playerMovesFrom(st);

    // order player moves by farthest-from-nearest-zombie to encourage pruning
    options.sort((a,b)=>{
      const da = Math.min(...st.zombies.map(z=>manhattan(a,z)));
      const db = Math.min(...st.zombies.map(z=>manhattan(b,z)));
      return db - da; // try safer first (higher distance)
    });

    for(const mv of options){
      if(beta <= alpha) break;
      const next = applyPlayer(st, mv);
      // if player stepped onto zombie, it will be caught on eval anyway
      const res = minimax(next, depth-1, alpha, beta, true); // back to zombie (max)
      const sc = res.score;
      if(sc < bestScore){
        bestScore = sc;
        bestMove = mv;
      }
      beta = Math.min(beta, sc);
    }
    return {score: bestScore, move: bestMove};
  }
}

function playerMove(dir){
  if(!state.alive || state.won) return;
  const nr = state.player.r + dir.r;
  const nc = state.player.c + dir.c;
  if(!inBounds(nr,nc)) return;
  const k = coordKey(nr,nc);
  if(state.walls.has(k)) return;

  // apply player
  state.player = {r:nr,c:nc};

  // goal check
  if(state.goal && positionsEqual(state.player, state.goal)){
    state.won = true; state.alive = false;
    endGame(true, 'You reached the exit!');
    render(); return;
  }

  // zombie catches immediately?
  for(const z of state.zombies){
    if(positionsEqual(z, state.player)){
      state.alive = false;
      endGame(false, 'You ran into a zombie.');
      render(); return;
    }
  }

  // ZOMBIE TURN (AI)
  aiTurn();
}

function aiTurn(){
  // show oracle hint: what AI expects you to do next from its POV
  oracleEl.textContent = 'Simulating futures…';

  // Zombies think with chosen depth
  const {score, moves} = minimax(state, state.depth, -Infinity, Infinity, true);

  // moves can be null if pruning found immediate catch
  if(moves){
    state = applyZombiesSequential(state, moves);
  }else{
    // fallback: greedy step toward player
    state = greedyZombies(state);
  }

  // if caught
  if(caught(state)){
    state.alive=false;
    endGame(false, 'Zombies cornered you.');
    render(); return;
  }

  state.turn++;
  if(wonByTurns(state)){
    state.won = true; state.alive=false;
    endGame(true, `Survived ${SURVIVE_TURNS_TO_WIN} turns!`);
    render(); return;
  }

  // compute a player "hint" from AI perspective (what it expects you to do)
  const reply = minimax(state, 1, -Infinity, Infinity, false);
  const mv = reply.move;
  hintEl.textContent = mv ? `Try ${moveName(mv, state.player)}` : '—';

  oracleEl.textContent = `AI trap score: ${score.toFixed(2)} (higher = worse for you)`;
  render();
}

function moveName(move, from){
  if(!move) return '—';
  if(move.stay) return 'stay';
  if(move.r < from.r) return 'up';
  if(move.r > from.r) return 'down';
  if(move.c < from.c) return 'left';
  if(move.c > from.c) return 'right';
  return '—';
}

function greedyZombies(st){
  const ns = cloneState(st);
  for(let i=0;i<ns.zombies.length;i++){
    const z = ns.zombies[i];
    let best = z;
    let bestD = manhattan(z, ns.player);
    for(const d of DIRS){
      const nr=z.r+d.r, nc=z.c+d.c;
      if(!inBounds(nr,nc)) continue;
      const k=coordKey(nr,nc);
      if(ns.walls.has(k)) continue;
      // avoid stepping into another zombie
      let blocked=false;
      for(let j=0;j<ns.zombies.length;j++){
        if(j===i) continue;
        if(ns.zombies[j].r===nr && ns.zombies[j].c===nc){ blocked=true; break; }
      }
      if(blocked) continue;

      const dd = manhattan({r:nr,c:nc}, ns.player);
      if(dd < bestD){ bestD=dd; best = {r:nr,c:nc}; }
    }
    ns.zombies[i]=best;
    if(positionsEqual(best, ns.player)){ ns.alive=false; }
  }
  return ns;
}

function endGame(victory, detail){
  overlay.classList.remove('hidden');
  endTitle.textContent = victory ? 'Victory!' : 'Game Over';
  endDetail.textContent = detail;
}

// ---------- Boot ----------
makeEmptyBoard();
initGame();