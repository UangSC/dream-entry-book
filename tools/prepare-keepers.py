"""从官方动作与预留矢量原件制作梦斋角色，保留原始素材。"""
from pathlib import Path
import argparse
import copy
import hashlib
import json
import xml.etree.ElementTree as ET
from PIL import Image, ImageSequence, ImageChops, ImageStat

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/mascot'
SVG = 'http://www.w3.org/2000/svg'
ET.register_namespace('', SVG)


def asset_record(asset_id, path, source, **extra):
    return {'id': asset_id, 'file': path.name, 'bytes': path.stat().st_size,
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'source': source.relative_to(ROOT).as_posix(),
            'rights': {'status': 'pending'}, **extra}


def prepare(preview=False):
    OUT.mkdir(exist_ok=True)
    records = []
    for prefix, name, label in [('待机_', 'idle', '待机'), ('打招呼_', 'wave', '打招呼'),
                                ('晃悠_', 'sway', '晃悠'), ('电脑_', 'computer', '电脑'),
                                ('瞌睡_', 'doze', '瞌睡'), ('运球_', 'dribble', '运球')]:
        original = next((ROOT / 'zhihu/imgs/看山动态图').glob(prefix + '*.gif'))
        with Image.open(original) as source:
            frames, durations = [], []
            for frame in ImageSequence.Iterator(source):
                frames.append(frame.convert('RGBA'))
                durations.append(frame.info.get('duration', 50))
        output = OUT / f'{name}.webp'
        frames[0].save(output, save_all=True, append_images=frames[1:], duration=durations,
                       loop=0, quality=82, method=6)
        with Image.open(output) as result:
            # WebP 会合并连续相同帧；按时间轴比对，不能要求压缩后帧数不变。
            assert 1 < result.n_frames <= len(frames), f'{name}: 动画帧异常'
            encoded_frames = result.n_frames
            assert result.size == (320, 320), f'{name}: 尺寸不一致'
            elapsed, timeline = 0, []
            for index in range(result.n_frames):
                result.seek(index)
                result.load()
                elapsed += result.info['duration']
                timeline.append((elapsed, result.convert('RGBA')))
            assert elapsed == sum(durations), f'{name}: 时长不一致'
            timestamp, encoded_index = 0, 0
            white = Image.new('RGBA', (320, 320), (255, 255, 255, 255))
            for frame, duration in zip(frames, durations):
                while timeline[encoded_index][0] <= timestamp:
                    encoded_index += 1
                decoded = timeline[encoded_index][1]
                expected = Image.alpha_composite(white, frame).convert('RGB').resize((40, 40))
                actual = Image.alpha_composite(white, decoded).convert('RGB').resize((40, 40))
                error = sum(ImageStat.Stat(ImageChops.difference(expected, actual)).mean) / 3
                assert error < 6, f'{name}: 第 {timestamp}ms 的画面偏差过大'
                timestamp += duration
        records.append(asset_record(f'MASCOT_{name.upper()}', output, original, label=label,
                                    frames=encoded_frames, sourceFrames=len(frames), durationMs=sum(durations), animated=True,
                                    width=320, height=320,
                                    modifications='保留官方 GIF 的帧序、透明通道和时长，转为动画 WebP。'))
        if name == 'idle':
            still = OUT / 'still.webp'
            frames[0].save(still, quality=90)
            records.append(asset_record('MASCOT_STILL', still, original, frames=1, animated=False,
                                        width=320, height=320, modifications='提取待机首帧，供减少动态效果及加载失败时使用。'))

    original = ROOT / 'assets/source/art/reserve/poster-girl.svg'
    source = ET.parse(original).getroot()
    root = ET.Element(f'{{{SVG}}}svg', {'width': '480', 'height': '720', 'viewBox': '0 0 480 720'})
    ET.SubElement(root, f'{{{SVG}}}title').text = '梦斋小馆员'
    ET.SubElement(root, f'{{{SVG}}}desc').text = '捧着书的少女，浅紫长发、月牙书徽与星光发饰。'
    # 原有造型和矢量路径保持不变，增加可独立编辑的细节层。
    for element in source:
        root.append(copy.deepcopy(element))
    details = ET.fromstring(f'''<g xmlns="{SVG}" id="dream-library-details" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <defs>
        <linearGradient id="library-gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f5e2b5"/><stop offset="1" stop-color="#b99a6c"/></linearGradient>
        <linearGradient id="library-silk" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fffdf7" stop-opacity=".9"/><stop offset="1" stop-color="#d6c9e3" stop-opacity=".2"/></linearGradient>
      </defs>
      <g id="star-hairpin" transform="translate(287 90) rotate(15)" stroke="url(#library-gold)" stroke-width="1.25">
        <path d="M0 -9 2.7 -2.7 9 0 2.7 2.7 0 9 -2.7 2.7 -9 0 -2.7 -2.7Z" fill="#fff5d7"/>
        <circle r="2" fill="#c7b6d8" stroke="#fffbed"/>
        <path d="M0 10Q-3 17 1 24"/><circle cx="1" cy="26" r="2" fill="#fff9df"/>
      </g>
      <g id="moon-bookplate" transform="translate(278 183) rotate(8)" stroke="url(#library-gold)">
        <rect x="-10" y="-10" width="20" height="25" rx="3" stroke-width=".8"/>
        <path d="M3 -5A7 7 0 1 0 5 7 6 6 0 0 1 3 -5" fill="#fff7d8" stroke-width=".6"/>
        <path d="M-5 19H5M-2 22H2" stroke-width=".8"/>
      </g>
      <g id="hair-silk" stroke="url(#library-silk)" stroke-width="1.4">
        <path d="M228 35Q196 39 192 78M278 130Q307 168 324 217M332 264Q356 307 346 340M140 277Q125 311 128 328"/>
      </g>
      <g id="skirt-embroidery" stroke="#f8f5ef" stroke-width="1" opacity=".78">
        <path d="M230 429 247 440 255 460 277 470" stroke-dasharray="2 5"/>
        <path d="M230 424V434M225 429H235M255 456V464M251 460H259"/>
        <circle cx="247" cy="440" r="1.8" fill="#fcf8e7"/><circle cx="277" cy="470" r="2" fill="#fcf8e7"/>
        <path d="M160 510Q196 531 224 534M274 537Q310 533 332 521" stroke="#f7f4e9" stroke-width="1.5"/>
      </g>
    </g>''')
    root.append(details)
    output = OUT / 'librarian.svg'
    ET.ElementTree(root).write(output, encoding='utf-8', xml_declaration=True)
    records.append(asset_record('MASCOT_LIBRARIAN', output, original, width=480, height=720,
                                animated=False, modifications='保留原角色矢量路径；增加星光发饰、月牙书徽、发丝高光与裙摆刺绣细节。'))
    (OUT / 'manifest.json').write_text(json.dumps({'manifestVersion': 1, 'status': 'draft', 'assets': records}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if preview:
        import cairosvg
        preview_path = ROOT / '.work/librarian-after.png'
        preview_path.parent.mkdir(exist_ok=True)
        cairosvg.svg2png(url=str(output), write_to=str(preview_path))
    print(f'已制作 6 组动作、静帧和看板娘 SVG，共 {sum(record["bytes"] for record in records) / 1024 / 1024:.2f} MiB；逐帧时间轴与画面校验通过。')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='制作梦斋角色发布素材；原件保持不变。')
    parser.add_argument('--preview', action='store_true', help='同时生成看板娘 PNG 预览（需要 CairoSVG）')
    prepare(parser.parse_args().preview)
