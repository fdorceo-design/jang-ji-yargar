"""
index.html / style.css / js/*.js / assets/* を1枚の standalone.html にまとめる。
画像・音声は data: URI として埋め込み、CSS/JSはインライン化する。

使い方: python scripts/build_standalone.py
"""
import base64
import mimetypes
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "standalone.html"

ASSET_REFS = [
    "assets/units/units_sprite.png",
    "assets/markers/marker_jjy_win_01.jpg",
    "assets/markers/marker_zzg_win_01.jpg",
    "assets/sounds/se_place.mp3",
    "assets/sounds/se_rotate.mp3",
    "assets/sounds/se_explosion.mp3",
]


def data_uri(rel_path: str) -> str:
    path = (ROOT / rel_path).resolve()
    mime, _ = mimetypes.guess_type(str(path))
    if mime is None:
        mime = "application/octet-stream"
    b64 = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{b64}"


def inline_css_urls(css: str) -> str:
    def repl(m):
        rel = m.group(1)
        if rel.startswith("data:") or rel.startswith("http"):
            return m.group(0)
        return f'url("{data_uri(rel)}")'

    return re.sub(r'url\("?\'?([^")\']+)"?\'?\)', repl, css)


def patch_asset_paths(js: str) -> str:
    for rel in ASSET_REFS:
        js = js.replace(rel, data_uri(rel))
    return js


def patch_ui_js(js: str) -> str:
    js = patch_asset_paths(js)
    # ui.js の turnAvatar/winAvatar は `assets/markers/marker_${owner}_win_01.jpg` の
    # ようなテンプレートリテラルでパスを組み立てるため、単純な文字列置換では拾えない。
    # jjy/zzg 両方のデータURIを定数として注入し、テンプレートリテラル部分を三項演算子に置き換える。
    jjy_uri = data_uri("assets/markers/marker_jjy_win_01.jpg")
    zzg_uri = data_uri("assets/markers/marker_zzg_win_01.jpg")
    js = js.replace(
        "(function () {",
        f'(function () {{\nconst __MARKER_URI__ = {{ jjy: "{jjy_uri}", zzg: "{zzg_uri}" }};',
        1,
    )
    js = js.replace(
        "`url('assets/markers/marker_${owner}_win_01.jpg')`",
        "`url('${__MARKER_URI__[owner]}')`",
    )
    js = js.replace(
        "`url('assets/markers/marker_${game.winner}_win_01.jpg')`",
        "`url('${__MARKER_URI__[game.winner]}')`",
    )
    if "assets/markers/marker_" in js:
        raise RuntimeError("unpatched marker path remains in ui.js")
    return js


def main():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = inline_css_urls((ROOT / "style.css").read_text(encoding="utf-8"))
    game_js = patch_asset_paths((ROOT / "js" / "game.js").read_text(encoding="utf-8"))
    if "assets/" in game_js:
        raise RuntimeError("unpatched asset path remains in game.js")
    ui_js = patch_ui_js((ROOT / "js" / "ui.js").read_text(encoding="utf-8"))

    # manifest / OGP・Twitterカードは、実際にホスティングされたURLがあって初めて意味を持つ。
    # 単体ファイルには当てはまらないため、standalone版では取り除く。
    html = re.sub(r'\n<link rel="manifest"[^>]*/>', "", html)
    html = re.sub(r'\n<meta property="og:[^>]*/>', "", html)
    html = re.sub(r'\n<meta name="twitter:[^>]*/>', "", html)

    html = html.replace(
        '<link rel="stylesheet" href="style.css" />',
        f"<style>\n{css}\n</style>",
    )

    def img_repl(m):
        attr = m.group(1)
        return f'{attr}="{data_uri(m.group(2))}"'

    html = re.sub(r'(src|href)="(assets/[^"]+)"', img_repl, html)

    html = html.replace(
        '<script src="js/game.js"></script>\n<script src="js/ui.js"></script>',
        f"<script>\n{game_js}\n</script>\n<script>\n{ui_js}\n</script>",
    )

    if re.search(r'(src|href)="assets/', html):
        raise RuntimeError("unpatched assets/ reference remains in standalone.html")

    OUT.write_text(html, encoding="utf-8")
    size_kb = OUT.stat().st_size / 1024
    print(f"wrote {OUT} ({size_kb:.0f} KB)")


if __name__ == "__main__":
    main()
