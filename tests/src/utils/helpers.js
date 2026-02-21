/**
 * helpers.js
 * General utility functions
 */

export function showHint(text) {
    const hint = document.getElementById('hint');
    if(!hint) return;
    
    hint.textContent = text;
    hint.classList.add('show');
    setTimeout(() => hint.classList.remove('show'), 2000);
}

export function playSound(type) {
    const audioContext = window.AudioContext || window.webkitAudioContext;
    if(!audioContext) return;
    
    const ctx = new audioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    if(type === 'add') {
        osc.frequency.value = 800;
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
    } else if(type === 'bond') {
        osc.frequency.value = 600;
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    } else if(type === 'delete') {
        osc.frequency.value = 400;
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
    }
    
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
}

export async function loadJSON(url) {
    const response = await fetch(url);
    return await response.json();
}
