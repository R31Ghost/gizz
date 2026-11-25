// Preserve the original white-key shortcuts; add the five missing semitones.
export const playableNotes = Object.freeze([
  ['a', 'A3', 57, 0], ['w', 'A♯3', 58, 1, true], ['s', 'B3', 59, 1],
  ['d', 'C4', 60, 2], ['r', 'C♯4', 61, 3, true], ['f', 'D4', 62, 3],
  ['t', 'D♯4', 63, 4, true], ['g', 'E4', 64, 4], ['h', 'F4', 65, 5],
  ['u', 'F♯4', 66, 6, true], ['j', 'G4', 67, 6], ['i', 'G♯4', 68, 7, true],
  ['k', 'A4', 69, 7],
]);

// One token per finger. Moving between keys replaces a note without a gate gap.
export function pointerNotes(press, release) {
  const pointers = new Map();
  const move = (id, note) => {
    if (!pointers.has(id) || pointers.get(id) === note) return;
    pointers.set(id, note);
    if (note === null) release(id);
    else press(id, note);
  };
  return {
    start(id, note) { pointers.set(id, null); move(id, note); },
    move,
    end(id) { if (pointers.delete(id)) release(id); },
    clear() { for (const id of pointers.keys()) release(id); pointers.clear(); },
  };
}
