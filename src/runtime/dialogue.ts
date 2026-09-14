import type { Beat } from '../game/schema';
import type { ReadingLine } from '../game/replay';
import type { GameData } from './library';

export type NarrationMode = 'fade' | 'text';
export function displayBeat(beat: Beat): Beat {
  return beat.kind === 'thought' && !/^(（[\s\S]*）|\([\s\S]*\))$/.test(beat.text.trim()) ? { ...beat, text: `（${beat.text}）` } : beat;
}
export function dialoguePresentation(data: GameData, beat: Beat, lines: ReadingLine[], mode: NarrationMode, asidePortrait?: string) {
  const { pkg, presentation, art } = data;
  const thought = beat.kind === 'thought';
  const narrator = !thought && (beat.speaker === 'narrator' || beat.kind === 'narration');
  const protagonist = pkg.characters.find(c => c.id === 'little-demon') ?? pkg.characters[0];
  const speaker = thought ? protagonist : pkg.characters.find(c => c.id === beat.speaker);
  const name = narrator ? '旁白' : speaker?.name ?? '梦中人';
  if (mode === 'text' && narrator) return { name, label: name, portrait: undefined, softened: false };
  const cues = presentation.performances ?? {};
  const authored = cues[beat.id];
  const ownCue = authored?.label.split(' · ')[0] === speaker?.name ? authored : undefined;
  const previous = [...lines].reverse().filter(line => line.beat.id !== beat.id);
  const previousCue = previous.map(line => ({ beat: line.beat, cue: cues[line.beat.id] })).find(item =>
    item.cue?.portrait && (narrator ? item.beat.speaker !== 'narrator' || item.beat.kind === 'thought' : item.cue.label.split(' · ')[0] === speaker?.name))?.cue;
  const fallback = Object.values(cues).find(cue => cue.portrait && cue.label.split(' · ')[0] === speaker?.name);
  const cue = narrator ? previousCue ?? authored : ownCue ?? previousCue ?? fallback;
  const portrait = asidePortrait ? art[asidePortrait] : cue?.portrait ? art[cue.portrait] : undefined;
  return { name: narrator ? cue?.label.split(' · ')[0] ?? '旁白' : name, label: cue?.label ?? name, portrait, softened: narrator && mode === 'fade' };
}
