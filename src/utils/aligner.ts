export interface AlignWord {
    text: string;
    idx: number;
    time?: number;
    lineIdx?: number;
}

export function forceAlign(userWords: AlignWord[], whisperWords: AlignWord[]): AlignWord[] {
    const N = userWords.length;
    const M = whisperWords.length;
    
    // Score parameters
    const MATCH = 2;
    const MISMATCH = -1;
    const GAP = -1;
    
    // DP matrix
    const score = Array.from({length: N + 1}, () => new Float32Array(M + 1).fill(0));
    
    // Initialize edges
    for (let i = 0; i <= N; i++) score[i][0] = i * GAP;
    for (let j = 0; j <= M; j++) score[0][j] = j * GAP;
    
    function similarity(w1: string, w2: string) {
        const a = w1.toLowerCase().replace(/[^a-z0-9]/g, '');
        const b = w2.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (a === b) return MATCH;
        if (a.length > 2 && b.length > 2 && (a.includes(b) || b.includes(a))) return 1;
        return MISMATCH;
    }
    
    // Fill matrix
    for (let i = 1; i <= N; i++) {
        for (let j = 1; j <= M; j++) {
            const matchScore = score[i-1][j-1] + similarity(userWords[i-1].text, whisperWords[j-1].text);
            const delScore = score[i-1][j] + GAP;
            const insScore = score[i][j-1] + GAP;
            score[i][j] = Math.max(matchScore, delScore, insScore);
        }
    }
    
    // Backtrack
    let i = N;
    let j = M;
    const alignment: { userIdx: number | null, whisperIdx: number | null }[] = [];
    
    while (i > 0 && j > 0) {
        const current = score[i][j];
        const matchScore = score[i-1][j-1] + similarity(userWords[i-1].text, whisperWords[j-1].text);
        const delScore = score[i-1][j] + GAP;
        
        if (current === matchScore) {
            alignment.push({ userIdx: i-1, whisperIdx: j-1 });
            i--; j--;
        } else if (current === delScore) {
            alignment.push({ userIdx: i-1, whisperIdx: null });
            i--;
        } else {
            alignment.push({ userIdx: null, whisperIdx: j-1 });
            j--;
        }
    }
    while (i > 0) { alignment.push({ userIdx: i-1, whisperIdx: null }); i--; }
    while (j > 0) { alignment.push({ userIdx: null, whisperIdx: j-1 }); j--; }
    
    alignment.reverse();

    // Map matched times to user words
    const result: AlignWord[] = userWords.map(uw => ({ ...uw, time: undefined }));
    
    for (const item of alignment) {
        if (item.userIdx !== null && item.whisperIdx !== null) {
            result[item.userIdx].time = whisperWords[item.whisperIdx].time;
        }
    }

    // Second pass: interpolate missing times
    for (let idx = 0; idx < result.length; idx++) {
        if (result[idx].time === undefined) {
            // Find previous time
            let prevTime = 0;
            let prevIdx = idx - 1;
            while(prevIdx >= 0 && result[prevIdx].time === undefined) prevIdx--;
            if (prevIdx >= 0) prevTime = result[prevIdx].time as number;
            
            // Find next time
            let nextTime = prevTime + 2.0; // fallback gap of 2 seconds
            let nextIdx = idx + 1;
            while(nextIdx < result.length && result[nextIdx].time === undefined) nextIdx++;
            if (nextIdx < result.length) nextTime = result[nextIdx].time as number;
            
            const ratio = (idx - prevIdx) / (nextIdx - prevIdx);
            result[idx].time = prevTime + (nextTime - prevTime) * ratio;
        }
    }

    return result;
}
