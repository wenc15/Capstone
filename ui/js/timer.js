// ---- Single timer store ----
const listeners = new Set();
const state = {
isRunning: false,
isPaused: false,
durationMs: 0,
remainingMs: 0,
endAt: 0
};
let tickId = null;

function emit(){ listeners.forEach(fn => fn({ ...state })); }
function tick(){
if (!state.isRunning || state.isPaused) return;
const now = Date.now();
state.remainingMs = Math.max(0, state.endAt - now);
if (state.remainingMs === 0) stopInternal();
emit();
}
function stopInternal(){
state.isRunning = false;
state.isPaused = false;
state.durationMs = 0;
state.remainingMs = 0;
state.endAt = 0;
if (tickId){ clearInterval(tickId); tickId = null; }
}

export const FocusTimer = {
start(ms){
    state.isRunning = true;
    state.isPaused = false;
    state.durationMs = ms;
    state.remainingMs = ms;
    state.endAt = Date.now() + ms;
    if (tickId) clearInterval(tickId);
    tickId = setInterval(tick, 200);
    emit();
},
pause(){
    if (!state.isRunning || state.isPaused) return;
    state.isPaused = true;
    state.remainingMs = Math.max(0, state.endAt - Date.now());
    emit();
},
resume(){
    if (!state.isRunning || !state.isPaused) return;
    state.isPaused = false;
    state.endAt = Date.now() + state.remainingMs;
    emit();
},
reset(){ stopInternal(); emit(); },
getState(){ return { ...state }; },
subscribe(fn){ listeners.add(fn); fn({ ...state }); return () => listeners.delete(fn); }
};

window.FocusTimer = FocusTimer;
