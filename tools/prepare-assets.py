"""整理发布用素材；原件只读，测量与加工报告写入 work 层。"""
import hashlib
import json
import pathlib
import re
import shutil
import subprocess
from PIL import Image, ImageSequence, ImageStat

ROOT = pathlib.Path(__file__).resolve().parents[1]
FFMPEG = shutil.which('ffmpeg') or r'C:\Program Files\ffmpeg\bin\ffmpeg.exe'
FFPROBE = str(pathlib.Path(FFMPEG).with_name('ffprobe.exe'))

def run(args):
    result = subprocess.run([FFMPEG, '-hide_banner', '-nostats', *map(str, args)], capture_output=True, text=True, encoding='utf-8', errors='replace')
    if result.returncode:
        raise RuntimeError(result.stderr[-2000:])
    return result.stderr

def measure(path, filters=None):
    log = run(['-i', path, '-af', (filters + ',' if filters else '') + 'loudnorm=I=-20:TP=-2:LRA=50:print_format=json', '-f', 'null', '-'])
    return json.loads(re.findall(r'\{[^{}]*"input_i"[^{}]*\}', log, re.S)[-1])

def metadata(path):
    raw = path.read_bytes()
    duration = float(subprocess.check_output([FFPROBE, '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', str(path)], text=True).strip())
    return {'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw), 'durationSeconds': round(duration, 4)}

audio_dir = ROOT / 'public/audio'
manifest_path = audio_dir / 'manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
reports = []
work = ROOT / 'assets/work/audio/variants'
work.mkdir(parents=True, exist_ok=True)

# 从第一代 AAC 抽轨切片，避免再压缩用户后来转换的 MP3。
clips = [
    ('BGM_LONG_CALM', 'bgm-long-calm', 'bm96be092dlmtyd53h8.m4a', 18, 66, '舒缓放松·相伴'),
    ('BGM_LONG_CALM_ALT', 'bgm-long-calm-alt', 'bm96be092dlmtyd53h8.m4a', 92, 140, '舒缓放松·回望'),
    ('BGM_LONG_LIGHT', 'bgm-long-light', 'ceu2aa6gu7smtyd5wjc.m4a', 32, 80, '欢快遗憾·山风'),
    ('BGM_LONG_LIGHT_ALT', 'bgm-long-light-alt', 'ceu2aa6gu7smtyd5wjc.m4a', 102, 150, '欢快遗憾·迟疑'),
    ('BGM_LONG_FAREWELL', 'bgm-long-farewell', 'i0bccnp4zcdmtyd4sld.m4a', 24, 72, '诀别感·灯火'),
    ('BGM_LONG_FAREWELL_ALT', 'bgm-long-farewell-alt', 'i0bccnp4zcdmtyd4sld.m4a', 110, 158, '诀别感·晨光'),
]

def register(asset):
    manifest['assets'] = [a for a in manifest['assets'] if a['id'] != asset['id']] + [asset]

for asset_id, name, original, start, end, label in clips:
    source_path = ROOT / 'assets/work/audio' / original
    filters = f'atrim=start={start}:end={end},asetpts=N/SR/TB'
    measured = measure(source_path, filters)
    gain = min(-20.4 - float(measured['input_i']), -2 - float(measured['input_tp']))
    wav = work / (name + '.wav')
    run(['-y', '-i', source_path, '-af', filters + f',volume={gain:.5f}dB', '-ar', '48000', '-c:a', 'pcm_s16le', wav])
    output = audio_dir / (name + '.mp3')
    run(['-y', '-i', wav, '-map_metadata', '-1', '-c:a', 'libmp3lame', '-b:a', '128k', output])
    final = measure(output)
    if not (-22 <= float(final['input_i']) <= -18 and float(final['input_tp']) <= -1):
        raise RuntimeError(f'{asset_id} 响度不合格：{final}')
    register({'id': asset_id, 'kind': 'music', 'file': output.name, 'label': label, **metadata(output),
              'loop': {'mode': 'fadeLoop', 'startSeconds': 0, 'endSeconds': end - start, 'overlapMs': 2400, 'verified': False},
              'source': {'originalPath': source_path.relative_to(ROOT).as_posix(), 'startSeconds': start, 'endSeconds': end},
              'rights': {'status': 'pending'}, 'modifications': ['第一代 AAC 抽轨裁切；不变速；线性增益；128kbps MP3', '循环重叠由播放器排程；人工听测待验收']})
    reports.append({'id': asset_id, 'input': measured, 'gainDb': gain, 'output': final})
    print(f'{asset_id}: {final["input_i"]} LUFS-I / {final["input_tp"]} dBTP', flush=True)

variants = [
    ('SFX_PAGE_SOFT', '翻页声#1.wav', 0, .42, -22),
    ('SFX_PAGE_DREAM', '翻页声#2.wav', 0, .48, -20),
    ('SFX_CHOICE_CLEAR', '轻触确认_文件_#1.wav', .14, .19, -18),
    ('SFX_CHOICE_LIGHT', '轻触确认_文件_#1.wav', .195, .285, -23),
    ('SFX_DREAM_IN_SHORT', '推开梦门__#2.wav', 0, .38, -20),
    ('SFX_DREAM_IN_SOFT', '推开梦门__#3.wav', 0, .86, -24),
    ('SFX_DREAM_OUT_SHORT', '合页梦醒_#2.wav', 0, .62, -20),
    ('SFX_DREAM_OUT_SOFT', '合页梦醒_#3.wav', 0, .9, -24),
]
for asset_id, original, start, end, target_peak in variants:
    source_path = ROOT / 'assets/source/audio' / original
    filters = f'atrim=start={start}:end={end},asetpts=N/SR/TB,pan=mono|c0=0.5*c0+0.5*c1'
    log = run(['-i', source_path, '-af', filters + ',volumedetect', '-f', 'null', '-'])
    peak = float(re.findall(r'max_volume: ([\-\d.]+) dB', log)[-1])
    if peak < -40:
        raise RuntimeError(f'{original} 选窗近乎静音，保留原件并停止派生')
    duration = end - start
    output = audio_dir / (asset_id.lower().replace('_', '-') + '.wav')
    run(['-y', '-i', source_path, '-af', filters + f',volume={target_peak-peak}dB,afade=t=in:d=0.004,afade=t=out:st={duration-.008}:d=0.008', '-ar', '48000', '-c:a', 'pcm_s16le', output])
    register({'id': asset_id, 'kind': 'sfx', 'file': output.name, **metadata(output),
              'loop': {'mode': 'none'}, 'source': {'originalPath': source_path.relative_to(ROOT).as_posix()},
              'rights': {'status': 'pending'}, 'modifications': [f'裁切 {start}–{end}s；单声道；目标峰值 {target_peak} dBFS；首尾消爆音']})
    reports.append({'id': asset_id, 'sourcePeakDb': peak, 'gainDb': target_peak - peak})

manifest['assetSetId'] = 'audio-2026-09-13-variants'
manifest['groups'] = {prefix: [a['id'] for a in manifest['assets'] if a['id'].startswith(prefix)] for prefix in ['SFX_PAGE', 'SFX_CHOICE', 'SFX_DREAM_IN', 'SFX_DREAM_OUT']}
manifest['reserves'] = [{'file': 'assets/source/audio/轻触确认_文件_#2.wav', 'reason': '信号过弱，保留原件；未抬高噪声作为成品'}]
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
(work / 'measurements.json').write_text(json.dumps(reports, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# 背景亮度供转场选择使用；实际测量，不按文件名猜昼夜。
art_path = ROOT / 'public/art/manifest.json'
art = json.loads(art_path.read_text(encoding='utf-8'))
for asset in art['assets']:
    img = Image.open(ROOT / 'public/art' / asset['file']).convert('RGB').resize((48, 27))
    rgb = ImageStat.Stat(img).mean
    asset['luminance'] = round((.2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2]) / 255, 4)
art_path.write_text(json.dumps(art, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

import runpy
runpy.run_path(str(ROOT / 'tools/prepare-keepers.py'))['prepare']()
print('已完成 6 段长曲变体、8 条新增音效、角色发布副本与亮度测量。全部原件保留。')
