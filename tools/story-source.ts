import { createHash } from 'node:crypto';
import { TIMED_EFFECTS, type Beat, type Choice, type DreamNode, type DreamPackage } from '../src/game/schema';
import { combineConditions, FLAG_GROUPS, flagCondition, INLINE_CHOICES, NEXT, NEXT_WHEN } from './story-contract';

export const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
export const CHARACTERS = { 小妖怪: 'little-demon', 毓娘: 'yu-niang', 念念: 'nian-nian', 张老爷: 'zhang', 老道士: 'taoist', 老神仙: 'immortal' };
const SIDES: Record<string, string> = { 真话: 'said-truth', 谎话: 'lied', 吓账: 'scared-him', 讨账: 'just-debt', 受盾: 'shielded-by-all', 独战: 'fought-alone' };

export interface SourceEntry {
  file: string; line: number; raw: string; kind: string; node?: string;
  id?: string; text?: string; speaker?: string; displayPrefix?: string;
}
export interface SourceFile {
  file: string; sha256: string; originalSha256: string; originalTextSha256: string;
  baseline: Record<string, { originalHistorical: number; originalBody: number; historical: number; body: number }>;
  corrections: { node: string; reason: string; before: string; after: string }[];
}
export interface SourceRegistry {
  buildId: string; source: DreamPackage['source']; baselineConvention: string;
  originalHistoricalTotal: number; originalBodyTotal: number; files: SourceFile[];
}

/** 复现交接表历史计数，同时单列排除登记块的正文计数，避免混称。 */
export function countSourceNodes(text: string) {
  const result: Record<string, { historical: number; body: number }> = {};
  let current: (typeof result)[string] | undefined, inRegister = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(), heading = line.match(/^## 节点.*`([^`]+)`/);
    if (heading) { current = { historical: 0, body: 0 }; result[heading[1]!] = current; inRegister = false; continue; }
    if (/^## /.test(line)) { current = undefined; continue; }
    if (!current || !line || /^(?:※|\||-|>|#)/.test(line)) continue;
    if (line === '**终幕登记**') inRegister = true;
    const han = (line.match(/[\u4e00-\u9fff]/g) ?? []).length;
    current.historical += han;
    if (!inRegister) current.body += han;
  }
  return result;
}

export function verifySource(file: SourceFile, bytes: Uint8Array) {
  if (digest(bytes) !== file.sha256) throw new Error(`定稿快照被修改：${file.file}`);
  const text = Buffer.from(bytes).toString('utf8');
  let restored = text;
  for (const correction of [...file.corrections].reverse()) {
    const heading = new RegExp('^## 节点[^\\n]*`' + correction.node + '`[^\\n]*$', 'm').exec(restored);
    if (!heading) throw new Error(`修订节点不存在：${correction.node}`);
    const start = heading.index, next = restored.indexOf('\n## ', start), end = next < 0 ? restored.length : next;
    const section = restored.slice(start, end);
    if (section.split(correction.after).length !== 2) throw new Error(`修订账本不能唯一逆应用：${correction.node} / ${correction.reason}`);
    restored = restored.slice(0, start) + section.replace(correction.after, correction.before) + restored.slice(end);
  }
  if (digest(restored) !== file.originalTextSha256) throw new Error(`出现修订账本之外的文字变化：${file.file}`);
  const counts = countSourceNodes(text), originals = countSourceNodes(restored);
  if (JSON.stringify(Object.keys(counts)) !== JSON.stringify(Object.keys(file.baseline))) throw new Error(`节点清单与基线不符：${file.file}`);
  for (const [id, expected] of Object.entries(file.baseline)) {
    if (counts[id]!.historical !== expected.historical || counts[id]!.body !== expected.body ||
        originals[id]!.historical !== expected.originalHistorical || originals[id]!.body !== expected.originalBody) {
      throw new Error(`节点字数偏差：${file.file} / ${id}`);
    }
  }
  return { file: file.file, sha256: file.sha256, restoredSha256: digest(restored), corrections: file.corrections.length, nodes: counts };
}

/** 只移除舞台标记和 Markdown 强调；正文、标点和选项原样保留。 */
export const displayText = (line: string) => line.replace(/\[特效：[^\]]+\]/g, '').replace(/〈条件：[^〉]+〉/g, '').replaceAll('**', '').trim();

export function parseStoryFile(file: string, text: string) {
  const nodes: DreamNode[] = [], audit: SourceEntry[] = [], chapters: Record<string, string> = {};
  const occurrences = new Map<string, number>();
  let node: DreamNode | undefined, side: string | undefined, mode = 'outside', choiceBoundary: string | undefined, inChoices = false;
  const finish = () => {
    if (!node) return;
    if (!node.scene || !node.beats.length) throw new Error(`节点缺少场景或正文：${node.id}`);
    if (node.kind === 'scene') {
      if (node.choices) {
        if (!choiceBoundary) throw new Error(`选择前没有正文：${node.id}`);
        if (INLINE_CHOICES.has(node.id)) {
          node.choiceAfter = choiceBoundary;
          for (const choice of node.choices) choice.target = node.id;
        } else {
          if (node.beats.at(-1)!.id !== choiceBoundary) throw new Error(`未登记的节点中途选择：${node.id}`);
          delete node.next;
          delete node.nextWhen;
        }
        const flags = FLAG_GROUPS[node.id as keyof typeof FLAG_GROUPS];
        if (!flags || flags.length !== node.choices.length) throw new Error(`选项数量不符：${node.id}`);
      }
    } else if (!node.ending.title || !node.ending.summary) throw new Error(`终幕登记缺失：${node.id}`);
  };
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    const entry: SourceEntry = { file, line: index + 1, raw, kind: 'structure', ...(node ? { node: node.id } : {}) };
    audit.push(entry);
    const heading = line.match(/^## 节点\s+(.+?)\s*｜\s*`([^`]+)`\s*｜\s*(.+)$/);
    if (heading) {
      finish();
      const id = heading[2]!, base = { id, scene: '', origin: 'original' as const, sourceRefs: [] as string[], beats: [] as Beat[] };
      node = id.startsWith('ending-') ? { ...base, kind: 'ending', ending: { id, title: '', summary: '', reflections: [], outcomes: [] } }
        : { ...base, kind: 'scene', ...(NEXT[id] ? { next: NEXT[id] } : {}), ...(NEXT_WHEN[id] ? { nextWhen: NEXT_WHEN[id] } : {}) };
      chapters[id] = `${heading[1]} · ${id === 'fork-c8' ? '第二颗心' : heading[3]!.replace(/·?选择点.*|（.*?）/g, '').trim()}`;
      nodes.push(node); mode = 'body'; side = undefined; choiceBoundary = undefined; inChoices = false;
      entry.node = id; continue;
    }
    if (/^## /.test(line)) { finish(); node = undefined; mode = 'outside'; }
    if (!node || !line || /^(---|※|>|#)/.test(line)) {
      if (line.startsWith('※')) { entry.kind = 'note'; inChoices = false; }
      continue;
    }
    if (line.startsWith('**场景**')) {
      const scene = line.match(/BG_[A-Z_]+/)?.[0];
      if (!scene) throw new Error(`场景标记无法解析：${file}:${index + 1}`);
      node.scene = scene; continue;
    }
    if (line.startsWith('**达成**')) continue;
    if (line === '**终幕登记**') { mode = 'register'; entry.kind = 'register'; continue; }
    if (mode === 'register') {
      if (node.kind !== 'ending') throw new Error('终幕登记出现在普通节点');
      entry.kind = 'register';
      const identity = line.match(/`id`:\s*`([^`]+)`\s*｜\s*`title`:\s*(.+)/);
      const summary = line.match(/^- `summary`:\s*(.+)/);
      const reflection = line.match(/^\d+\.\s*「(.*)」(?:（`when`:\s*([^）]+)）)?$/);
      if (identity) {
        if (identity[1] !== node.id) throw new Error(`终幕 ID 不一致：${node.id}`);
        node.ending.title = identity[2]!; entry.id = `${node.id}:title`; entry.text = identity[2]!;
      } else if (summary) {
        node.ending.summary = summary[1]!; entry.id = `${node.id}:summary`; entry.text = summary[1]!;
      } else if (reflection) {
        const when = reflection[2] && reflection[2] !== '任意' ? flagCondition(reflection[2].trim()) : undefined;
        node.ending.reflections!.push({ text: reflection[1]!, ...(when ? { when } : {}) });
        entry.id = `${node.id}:reflection:${node.ending.reflections!.length - 1}`; entry.text = reflection[1]!;
      } else if (!/^- `(?:reflections|outcomes)`/.test(line)) throw new Error(`未识别的终幕登记：${file}:${index + 1}`);
      continue;
    }
    if (line.startsWith('▸')) {
      if (choiceBoundary) throw new Error(`同一节点出现多个选择点：${node.id}`);
      choiceBoundary = node.beats.at(-1)?.id; inChoices = true; entry.kind = 'choice-marker'; continue;
    }
    const option = line.match(/^- (.+?)\s*→\s*(.+)$/);
    if (option && inChoices) {
      if (node.kind !== 'scene' || !choiceBoundary) throw new Error(`选项缺少选择点：${node.id}`);
      const group = FLAG_GROUPS[node.id as keyof typeof FLAG_GROUPS];
      const flag = group?.[node.choices?.length ?? 0];
      if (!flag) throw new Error(`未登记选项：${node.id}`);
      const explicit = option[2]!.match(/旗标\s+([a-z-]+)/)?.[1];
      if (explicit && explicit !== flag) throw new Error(`选项旗标与定稿契约不一致：${node.id}`);
      const target = INLINE_CHOICES.has(node.id) ? node.id : option[2]!.match(/^([a-z][a-z-]+)/)?.[1] ?? (flag === 'fought-back' ? 'blood-words' : undefined);
      if (!target) throw new Error(`选项目标无法解析：${file}:${index + 1}`);
      const choice: Choice = { id: flag, text: option[1]!, target, effects: { setFlags: [flag], resourceDeltas: {}, relationshipDeltas: {} } };
      (node.choices ??= []).push(choice);
      entry.kind = 'choice'; entry.id = `${node.id}:${choice.id}`; entry.text = choice.text; continue;
    }
    inChoices = false;
    if (line.startsWith('- ') || line.startsWith('|')) { entry.kind = 'note'; continue; }
    const sideMarker = line.match(/^（(.+?)\s*侧(?:）：|：）)$/);
    const variant = line.match(/^（文本 [AB] · ([a-z-]+)：.+）$/);
    if (sideMarker || variant) {
      const label = (sideMarker?.[1] ?? variant?.[1])!.trim();
      side = SIDES[label] ?? label; flagCondition(side);
      entry.kind = 'condition-marker'; continue;
    }
    if (/^（(?:合流|两版共同收尾)(?:）：|：）)$/.test(line)) { side = undefined; entry.kind = 'merge-marker'; continue; }
    if (/^（终幕(?:前)?[：）]+$/.test(line)) { entry.kind = 'stage-marker'; continue; }
    // 此处原稿省略“合流”标记；后面两种人生共同经历立坛收尾。
    if (node.id === 'village-altar' && line.startsWith('清明前，老道说：坛期将满，当除根。')) side = undefined;
    if (/^(?:-|\||▸)/.test(line)) throw new Error(`未识别控制行：${file}:${index + 1}`);

    const effect = line.match(/\[特效：([^\]]+)\]/)?.[1]?.trim();
    const explicit = line.match(/〈条件：([^〉]+)〉/)?.[1];
    let body = line.replace(/\[特效：[^\]]+\]/g, '').replace(/〈条件：[^〉]+〉/g, '').trim();
    if (!body && effect) {
      const target = effect.match(/BG_[A-Z_]+/)?.[0];
      if (!target || !node.beats.length) throw new Error(`无法解析独立演出：${file}:${index + 1}`);
      node.beats.at(-1)!.sceneShift = target; entry.kind = 'effect'; entry.id = node.beats.at(-1)!.id; continue;
    }
    let speaker = 'narrator', kind: Beat['kind'] = 'narration', prefix = '';
    const speech = body.match(/^\*\*([^*]+)\*\*([^：]*?)：([\s\S]*)$/);
    if (speech) {
      const name = speech[1]!.replace(/（.*）/, ''); entry.speaker = name;
      if (name in CHARACTERS) {
        speaker = CHARACTERS[name as keyof typeof CHARACTERS];
        kind = speech[1]!.includes('心声') ? 'thought' : 'dialogue';
        prefix = `${speech[1]}：`;
        body = `${speech[2]}${speech[3]}`;
      }
    }
    body = body.replaceAll('**', '');
    const key = `${node.id}-${digest(line).slice(0, 10)}`, occurrence = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, occurrence);
    const beat: Beat = { id: occurrence === 1 ? key : `${key}-${occurrence}`, kind, speaker, text: body, anim: 'typewriter' };
    const when = combineConditions(side ? flagCondition(side) : undefined, explicit ? flagCondition(explicit) : undefined);
    if (when) beat.when = when;
    if (effect) {
      if ((TIMED_EFFECTS as readonly string[]).includes(effect)) { delete beat.anim; beat.effect = { type: effect as typeof TIMED_EFFECTS[number] }; }
      else if (effect.includes('sceneShift') && effect.match(/BG_[A-Z_]+/)) beat.sceneShift = effect.match(/BG_[A-Z_]+/)![0];
      else throw new Error(`未知演出：${effect}`);
    }
    node.beats.push(beat); entry.kind = 'beat'; entry.id = beat.id; entry.text = body; entry.displayPrefix = prefix;
    // 逐行对照包括人物标签和括号动作，不能凭总字数相同掩盖替换或丢句。
    const expected = displayText(line);
    const restored = speech && prefix ? `${speech[1]}${speech[2]}：${speech[3]}`.replaceAll('**', '') : body;
    if (restored !== expected) throw new Error(`逐字恢复失败：${file}:${index + 1}`);
  }
  finish();
  return { nodes, audit, chapters };
}
