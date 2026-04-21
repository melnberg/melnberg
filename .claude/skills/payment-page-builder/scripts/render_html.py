"""
결제페이지 렌더러
products.json + template.html → output/{상품명}.html (4개)

사용법:
    python render_html.py
"""

import json
from pathlib import Path

BASE_DIR      = Path(__file__).resolve().parent.parent.parent.parent.parent
TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "references" / "template.html"
PRODUCTS_PATH = BASE_DIR / "output" / "products.json"
OUTPUT_DIR    = BASE_DIR / "output"


def render_details(items: list[str]) -> str:
    rows = []
    for item in items:
        rows.append(f'<li><div class="d-check"></div><span>{item}</span></li>')
    return "\n        ".join(rows)


def render_process(steps: list[str]) -> str:
    # 히어로 사이드바(aside-list)와 본문(process-list) 두 곳에 __PROCESS_HTML__ 삽입됨.
    # aside-list 는 <li><span class="aside-num">…</span><span>…</span></li> 구조,
    # process-list 는 <li><div class="p-num">…</div><div class="p-text">…</div></li> 구조.
    # 두 구조가 다르므로 각각 따로 placeholder 사용.
    # → 여기서는 process-list(본문) 구조만 반환하고,
    #   aside-list는 __PROCESS_ASIDE_HTML__ 로 분리.
    rows = []
    for i, step in enumerate(steps, 1):
        rows.append(
            f'<li>'
            f'<div class="p-num">{i:02d}</div>'
            f'<div class="p-text">{step}</div>'
            f'</li>'
        )
    return "\n        ".join(rows)


def render_process_aside(steps: list[str]) -> str:
    rows = []
    for i, step in enumerate(steps, 1):
        rows.append(
            f'<li>'
            f'<span class="aside-num">{i:02d}</span>'
            f'<span>{step}</span>'
            f'</li>'
        )
    return "\n        ".join(rows)


def render_openchat_button(link: str, label: str) -> str:
    if not link or "PLACEHOLDER" in link:
        return ""
    return f'<a href="{link}" class="btn-openchat" target="_blank" rel="noopener">{label}</a>'


def render_product(template: str, p: dict) -> str:
    openchat_btn = render_openchat_button(
        p.get("openchat_link", ""),
        p.get("openchat_label", "오픈채팅 바로가기"),
    )
    replacements = {
        "__PRODUCT_NAME__":       p["name"],
        "__PRICE_DISPLAY__":      p["price_display"],
        "__HOOK__":               p["hook"],
        "__SUB_HOOK__":           p["sub_hook"],
        "__DETAILS_HTML__":       render_details(p["details"]),
        "__PROCESS_HTML__":       render_process(p["process"]),
        "__PROCESS_ASIDE_HTML__": render_process_aside(p["process"]),
        "__FORM_ENDPOINT__":      p.get("form_endpoint", "FORM_ENDPOINT_PLACEHOLDER"),
        "__KAKAOPAY_LINK__":      p.get("kakaopay_link", "#"),
        "__NAVERPAY_LINK__":      p.get("naverpay_link", "#"),
        "__POST_PAYMENT_TEXT__":  p.get("post_payment_text", ""),
        "__OPENCHAT_BUTTON__":    openchat_btn,
        "__META_DESC__":          p.get("meta_desc", f"{p['name']} — 멜른버그"),
    }
    html = template
    for placeholder, value in replacements.items():
        html = html.replace(placeholder, value)
    return html


def main():
    OUTPUT_DIR.mkdir(exist_ok=True)

    with open(TEMPLATE_PATH, encoding="utf-8") as f:
        template = f.read()

    with open(PRODUCTS_PATH, encoding="utf-8") as f:
        data = json.load(f)

    for p in data["products"]:
        rendered  = render_product(template, p)
        out_path  = OUTPUT_DIR / f"{p['filename']}.html"
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(rendered)
        print(f"OK {out_path.name}")

    print(f"\n{len(data['products'])}개 파일 생성 완료: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
