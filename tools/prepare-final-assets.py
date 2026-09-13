"""将定稿资源转换为稳定英文路径，保留全部用户源文件。"""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import math
import wave
import struct
from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]

def encode(source, output, duration=None, music=True):
    args = ['ffmpeg', '-v', 'error', '-y', '-i', str(source)]
    if duration:
        args += ['-t', str(duration)]
    args += ['-ac', '2' if music else '1', '-ar', '44100', '-af', 'loudnorm=I=-23:TP=-3:LRA=9', '-c:a', 'libmp3lame', '-b:a', '112k' if music else '80k', str(output)]
    subprocess.run(args, check=True)

def main():
    manifest_path = ROOT / 'public/audio/manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    entries = []
    tracks = [('CARE', '渡灵气·照护期'), ('MARKET', '市侩诙谐'), ('COLD_DANGER', '冷与危'), ('ACID', '酸心线'), ('SEEK_HER', '万人寻她'), ('FAREWELL', '兑现与送别')]
    for name, title in tracks:
        entries.append(('BGM_' + name, ROOT / f'assets/source/audio/bgm-new/{title}.wav', None, title))
    # 编号依据只读《音频试听核对表》的素材对照，不采用旧剧情。
    for number, name, duration in [(1, 'SFX_FIRE', 2), (2, 'BGM_FIRE_AMBIENCE', 8), (4, 'BGM_RAIN_AMBIENCE', 30), (5, 'BGM_FOREST_RAIN', 25), (6, 'BGM_FOREST_AMBIENCE', 30), (7, 'BGM_SHRINE_AMBIENCE', 20), (8, 'SFX_OFFER', 1), (9, 'SFX_ROPE', 2), (10, 'SFX_GATE', 4), (11, 'SFX_DOOR', 2), (13, 'SFX_SHATTER', 1), (14, 'SFX_COMPASS', 1)]:
        entries.append((name, ROOT / f'assets/source/audio/sfx-new/#S{number}.wav', duration, f'用户音效 S{number}'))
    # 两个缺失音效暂用无语言的轻声合成音，绝不伪造配音台词。
    for name, seconds in [('SFX_SPIRIT', 1.4), ('SFX_CALL', 4)]:
        source = ROOT / f'assets/source/audio/{name.lower()}.wav'
        with wave.open(str(source), 'wb') as output:
            output.setparams((1, 2, 22050, 0, 'NONE', 'not compressed'))
            output.writeframes(b''.join(struct.pack('<h', int(2500 * math.sin(math.pi * i / (22050 * seconds)) ** 2 * sum(math.sin(2 * math.pi * f * i / 22050) for f in ([440, 660, 880] if name == 'SFX_SPIRIT' else [196, 246.94, 293.66])) / 3)) for i in range(int(22050 * seconds))))
        entries.append((name, source, seconds, '本地合成占位 · 灵气微光' if name == 'SFX_SPIRIT' else '本地合成占位 · 山谷和声（无人声）'))
    for asset_id, source, duration, title in entries:
        output = ROOT / 'public/audio' / (asset_id.lower().replace('_', '-') + '.mp3')
        encode(source, output, duration, asset_id.startswith('BGM_'))
        seconds = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(output)]))
        asset = dict(id=asset_id, kind='music' if asset_id.startswith('BGM_') else 'sfx', file=output.name, durationSeconds=seconds, bytes=output.stat().st_size, sha256=hashlib.sha256(output.read_bytes()).hexdigest(), source={'name': title, 'originalPath': str(source.relative_to(ROOT))}, rights={'status': 'pending', 'reference': '用户提供临时素材；合成占位另有标记'})
        if asset['kind'] == 'music':
            asset['loop'] = dict(mode='fadeLoop', startSeconds=0, endSeconds=seconds, overlapMs=800, verified=False)
        manifest['assets'] = [item for item in manifest['assets'] if item['id'] != asset_id] + [asset]
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    art_path = ROOT / 'public/art/manifest.json'
    art = json.loads(art_path.read_text(encoding='utf-8'))
    # 缺少独立小院夜景源，使用现有小院降亮度的临时版本。
    output = ROOT / 'public/art/bg-cottage-n.webp'
    image = Image.open(ROOT / 'public/art/bg-cottage-d.webp').convert('RGB')
    image = ImageEnhance.Brightness(ImageEnhance.Color(image).enhance(.65)).enhance(.42)
    image.save(output, 'WEBP', quality=86)
    art['assets'] = [item for item in art['assets'] if item['id'] != 'BG_COTTAGE_N'] + [dict(id='BG_COTTAGE_N', kind='background', file=output.name, bytes=output.stat().st_size, sha256=hashlib.sha256(output.read_bytes()).hexdigest(), width=image.width, height=image.height, source={'name': '现有小院昼景调暗占位'}, rights={'status': 'pending'})]
    art_path.write_text(json.dumps(art, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    full = ROOT / 'new_TMP_SPR/部分人物完整身体立绘'
    for stem, original in [('zhang-full', '张老爷'), ('taoist-full', '老道士'), ('child-full', '念念_7岁时'), ('adult-full', '念念_长达后'), ('yu-niang-full', '毓娘'), ('demon-bare-full', '小怪物_无袄'), ('demon-coat-full', '小怪物_有袄'), ('demon-injured-full', '小怪物_受伤有袄')]:
        source = full / f'TMP_SPR_{original}.png'
        if source.exists(): shutil.copy2(source, ROOT / f'assets/source/art/characters/{stem}.png')
    print('已接入六首配乐、十二份用户音效、两项合成占位和全身立绘源。')

if __name__ == '__main__':
    main()
