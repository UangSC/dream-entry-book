import { z } from 'zod';
import { startPackage, type SaveState } from './engine';
import { reconstruct } from './replay';
import type { DreamPackage } from './schema';
import type { AsideBookmark } from '../runtime/asides';

export const HISTORY_LIMIT = 30;
// 只保存位置和实际选择；资源、关系、检查点与已读记录由同一引擎重建，避免嵌套快照撑满浏览器。
const positionSchema = z.object({
  nodeId: z.string(), beatIndex: z.number().int().min(0),
  choiceHistory: z.array(z.object({ nodeId: z.string(), choiceId: z.string() })).max(1000),
  aside: z.object({ phase: z.enum(['pending', 'choosing', 'reply', 'done']), option: z.string().optional(), index: z.number().int().min(0) }).optional(),
  holdChoice: z.boolean().default(false),
});
export const readerSchema = z.object({
  version: z.literal(1), past: z.array(positionSchema).max(HISTORY_LIMIT),
  present: positionSchema, future: z.array(positionSchema).max(HISTORY_LIMIT),
});
export type ReaderPosition = z.infer<typeof positionSchema>;
export type ReaderJournal = z.infer<typeof readerSchema>;
export function readingPosition(state: SaveState, aside?: AsideBookmark, holdChoice = false): ReaderPosition {
  return { nodeId: state.nodeId, beatIndex: state.beatIndex, choiceHistory: [...state.choiceHistory],
    ...(aside ? { aside: { phase: aside.phase, option: aside.option, index: aside.index } } : {}), holdChoice };
}
export const beginJournal = (position: ReaderPosition): ReaderJournal => ({ version: 1, past: [], present: position, future: [] });
export function recordPosition(journal: ReaderJournal | null, position: ReaderPosition): ReaderJournal {
  if (!journal) return beginJournal(position);
  if (JSON.stringify(journal.present) === JSON.stringify(position)) return journal;
  return { version: 1, past: [...journal.past, journal.present].slice(-HISTORY_LIMIT), present: position, future: [] };
}
export function moveJournal(journal: ReaderJournal, direction: -1 | 1): ReaderJournal {
  if (direction < 0) {
    const present = journal.past.at(-1);
    return present ? { ...journal, past: journal.past.slice(0, -1), present, future: [journal.present, ...journal.future].slice(0, HISTORY_LIMIT) } : journal;
  }
  const present = journal.future[0];
  return present ? { ...journal, past: [...journal.past, journal.present].slice(-HISTORY_LIMIT), present, future: journal.future.slice(1) } : journal;
}
export function restorePosition(pkg: DreamPackage, position: ReaderPosition, revision: number, at: string): SaveState | null {
  const start = startPackage(pkg, at);
  if (!start.ok) return null;
  const result = reconstruct(pkg, { ...start.state, nodeId: position.nodeId, beatIndex: position.beatIndex, choiceHistory: position.choiceHistory });
  if (!result.ok || JSON.stringify(result.canonical.choiceHistory) !== JSON.stringify(position.choiceHistory)) return null;
  return { ...result.canonical, revision: Math.max(revision + 1, result.canonical.revision), updatedAt: at };
}
export function validateJournal(pkg: DreamPackage, state: SaveState, input: unknown): ReaderJournal | null {
  const parsed = readerSchema.safeParse(input);
  if (!parsed.success) return null;
  const journal = parsed.data, current = journal.present;
  if (current.nodeId !== state.nodeId || current.beatIndex !== state.beatIndex || JSON.stringify(current.choiceHistory) !== JSON.stringify(state.choiceHistory)) return null;
  return [...journal.past, current, ...journal.future].every(position => restorePosition(pkg, position, state.revision, state.updatedAt)) ? journal : null;
}
export const beforeChoice = (journal: ReaderJournal): ReaderJournal => ({ ...journal, present: { ...journal.present, holdChoice: true }, future: [] });
