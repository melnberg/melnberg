"""
posts/*.md → output/blog.html 생성
각 포스트 파일명: YYYY-MM-DD-slug.md
프론트매터: title, date, tag, excerpt
"""

import json
import re
from pathlib import Path
import markdown as md

BASE_DIR    = Path(__file__).resolve().parent.parent
POSTS_DIR   = BASE_DIR / "posts"
OUTPUT_DIR  = BASE_DIR / "output"

UTIL_BAR = """
  <div class="util-bar">
    <div class="inner">
      <span>멜른버그 공식 페이지</span>
      <div>
        <a href="짧은상담.html">짧은상담</a>
        <a href="중간상담.html">중간상담</a>
        <a href="신규가입.html">신규가입</a>
        <a href="갱신.html">갱신</a>
      </div>
    </div>
  </div>"""

MASTHEAD = """
  <div class="masthead">
    <a class="masthead-logo" href="index.html">멜른버그</a>
  </div>"""

NAV_BAR = """
  <nav class="nav-bar">
    <div class="inner">
      <div class="nav-item"><a class="nav-link" href="index.html">홈</a></div>
      <div class="nav-item"><a class="nav-link active" href="blog.html">블로그</a></div>
      <div class="nav-item">
        <a class="nav-link" href="짧은상담.html">짧은상담</a>
        <div class="nav-dropdown">
          <a class="dropdown-item" href="짧은상담.html"><span class="di-label">30분 집중 상담</span><span class="di-price">33,000원</span></a>
        </div>
      </div>
      <div class="nav-item">
        <a class="nav-link" href="중간상담.html">중간상담</a>
        <div class="nav-dropdown">
          <a class="dropdown-item" href="중간상담.html"><span class="di-label">60~90분 심층 상담</span><span class="di-price">99,000원</span></a>
        </div>
      </div>
      <div class="nav-item">
        <a class="nav-link" href="신규가입.html">멤버십</a>
        <div class="nav-dropdown">
          <a class="dropdown-item" href="신규가입.html"><span class="di-label">신규가입</span><span class="di-price">109,000원</span></a>
          <a class="dropdown-item" href="갱신.html"><span class="di-label">갱신</span><span class="di-price">99,000원</span></a>
        </div>
      </div>
    </div>
  </nav>"""

TICKER = """
  <div class="ticker-wrap">
    <div class="ticker-track">
      <div class="ticker-item"><span class="t-name">짧은상담</span><span class="t-price">33,000원</span><span class="ticker-sep">|</span></div>
      <div class="ticker-item"><span class="t-name">중간상담</span><span class="t-price">99,000원</span><span class="ticker-sep">|</span></div>
      <div class="ticker-item"><span class="t-name">2분기 신규가입</span><span class="t-price">109,000원</span><span class="ticker-sep">|</span></div>
      <div class="ticker-item"><span class="t-name">2분기 갱신</span><span class="t-price">99,000원</span><span class="ticker-sep">|</span></div>
      <div class="ticker-item"><span class="t-name">짧은상담</span><span class="t-price">33,000원</span><span class="ticker-sep">|</span></div>
      <div class="ticker-item"><span class="t-name">중간상담</span><span class="t-price">99,000원</span><span class="ticker-sep">|</span></div>
      <div class="ticker-item"><span class="t-name">2분기 신규가입</span><span class="t-price">109,000원</span><span class="ticker-sep">|</span></div>
      <div class="ticker-item"><span class="t-name">2분기 갱신</span><span class="t-price">99,000원</span><span class="ticker-sep">|</span></div>
    </div>
  </div>"""


def parse_frontmatter(text: str) -> tuple[dict, str]:
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.DOTALL)
    if not m:
        return {}, text
    fm_raw = m.group(1)
    body = text[m.end():]
    fm = {}
    for line in fm_raw.splitlines():
        if ":" in line:
            k, _, v = line.partition(":")
            fm[k.strip()] = v.strip()
    return fm, body


def load_posts() -> list[dict]:
    posts = []
    for path in sorted(POSTS_DIR.glob("*.md"), reverse=True):
        text = path.read_text(encoding="utf-8")
        fm, body = parse_frontmatter(text)
        slug = path.stem  # e.g. 2026-04-21-첫번째글
        posts.append({
            "slug":    slug,
            "title":   fm.get("title", slug),
            "date":    fm.get("date", ""),
            "tag":     fm.get("tag", "멜른버그"),
            "excerpt": fm.get("excerpt", ""),
            "html":    md.markdown(body.strip(), extensions=["nl2br"]),
        })
    return posts


def format_date(s: str) -> str:
    try:
        y, mo, d = s.split("-")
        return f"{y}년 {int(mo)}월 {int(d)}일"
    except Exception:
        return s


def render_card(post: dict, featured: bool = False) -> str:
    tag    = post["tag"]
    title  = post["title"]
    date   = format_date(post["date"])
    ex     = post["excerpt"]
    slug   = post["slug"]
    cls    = "post-card featured" if featured else "post-card"
    title_tag = "h2" if featured else "h3"

    if featured:
        return f"""<a class="{cls}" href="post-{slug}.html">
  <div class="post-content">
    <p class="post-tag">{tag}</p>
    <{title_tag} class="post-title">{title}</{title_tag}>
    {"<p class='post-excerpt'>" + ex + "</p>" if ex else ""}
    <p class="post-meta">{date}</p>
  </div>
</a>"""
    return f"""<a class="{cls}" href="post-{slug}.html">
  <p class="post-tag">{tag}</p>
  <{title_tag} class="post-title">{title}</{title_tag}>
  {"<p class='post-excerpt'>" + ex + "</p>" if ex else ""}
  <p class="post-meta">{date}</p>
</a>"""


def render_blog_html(posts: list[dict]) -> str:
    if not posts:
        grid = '<p class="state-msg">아직 게시된 글이 없습니다.</p>'
    else:
        cards = render_card(posts[0], featured=True)
        for p in posts[1:]:
            cards += "\n" + render_card(p)
        grid = f'<div class="posts-grid">{cards}</div>'

    return f"""<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>블로그 — 멜른버그</title>
  <style>
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
    :root {{
      --navy: #1B2D4F; --navy-dark: #0E1B2E; --yellow: #F7C94B;
      --text: #111111; --muted: #777777; --border: #D8D8D8; --white: #FFFFFF;
    }}
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; background: var(--white); color: var(--text); line-height: 1.6; -webkit-font-smoothing: antialiased; }}
    .inner {{ max-width: 1060px; margin: 0 auto; padding: 0 40px; }}
    .util-bar {{ background: var(--navy-dark); color: rgba(255,255,255,0.6); font-size: 11px; letter-spacing: 0.06em; padding: 6px 0; }}
    .util-bar .inner {{ display: flex; justify-content: space-between; align-items: center; }}
    .util-bar a {{ color: rgba(255,255,255,0.55); text-decoration: none; margin-left: 16px; }}
    .util-bar a:hover {{ color: var(--white); }}
    .masthead {{ background: var(--white); border-bottom: 3px solid var(--navy); padding: 20px 0 18px; text-align: center; }}
    .masthead-logo {{ font-family: Georgia, serif; font-size: 52px; font-weight: 700; color: var(--navy); letter-spacing: -0.02em; text-decoration: none; }}
    .nav-bar {{ background: var(--white); border-bottom: 1px solid var(--border); }}
    .nav-bar .inner {{ display: flex; align-items: stretch; }}
    .nav-item {{ position: relative; flex-shrink: 0; }}
    .nav-link {{ display: block; font-size: 12px; font-weight: 600; letter-spacing: 0.04em; color: var(--text); text-decoration: none; padding: 12px 16px; border-bottom: 2px solid transparent; white-space: nowrap; }}
    .nav-link:hover, .nav-link.active {{ color: var(--navy); border-bottom-color: var(--navy); }}
    .nav-dropdown {{ display: none; position: absolute; top: 100%; left: 0; background: var(--white); border: 1px solid var(--border); border-top: 2px solid var(--navy); min-width: 200px; z-index: 200; box-shadow: 0 4px 16px rgba(0,0,0,0.08); }}
    .nav-item:hover .nav-dropdown {{ display: block; }}
    .dropdown-item {{ display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; text-decoration: none; color: var(--text); font-size: 12px; border-bottom: 1px solid var(--border); gap: 20px; }}
    .dropdown-item:last-child {{ border-bottom: none; }}
    .dropdown-item:hover {{ background: #F5F5F0; }}
    .di-label {{ font-weight: 600; }}
    .di-price {{ color: var(--navy); font-weight: 700; white-space: nowrap; }}
    .ticker-wrap {{ background: var(--navy); overflow: hidden; padding: 8px 0; }}
    .ticker-track {{ display: flex; width: max-content; animation: ticker-scroll 28s linear infinite; }}
    @keyframes ticker-scroll {{ from {{ transform: translateX(0); }} to {{ transform: translateX(-50%); }} }}
    .ticker-item {{ display: flex; align-items: center; gap: 8px; padding: 0 32px; white-space: nowrap; font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.75); }}
    .ticker-item .t-name {{ color: var(--white); font-weight: 700; }}
    .ticker-item .t-price {{ color: var(--yellow); font-weight: 700; }}
    .ticker-sep {{ color: rgba(255,255,255,0.2); }}
    .blog-hero {{ padding: 56px 0 40px; border-bottom: 1px solid var(--border); }}
    .blog-hero .section-header {{ display: flex; align-items: baseline; gap: 14px; padding-bottom: 12px; border-bottom: 2px solid var(--navy); }}
    .blog-hero-title {{ font-family: Georgia, serif; font-size: 28px; font-weight: 700; color: var(--navy); }}
    .section-rule {{ flex: 1; height: 1px; background: var(--border); }}
    .posts-section {{ padding: 48px 0; }}
    .posts-grid {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; }}
    .post-card {{ padding: 24px 24px 24px 0; border-bottom: 1px solid var(--border); border-right: 1px solid var(--border); text-decoration: none; color: inherit; display: block; }}
    .post-card:nth-child(3n+2) {{ border-right: none; padding-right: 0; }}
    .post-card:hover .post-title {{ color: var(--navy); text-decoration: underline; }}
    .post-tag {{ font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; }}
    .post-title {{ font-family: Georgia, serif; font-size: 18px; font-weight: 700; line-height: 1.3; color: var(--text); margin-bottom: 10px; word-break: keep-all; }}
    .post-excerpt {{ font-size: 13px; color: var(--muted); line-height: 1.65; margin-bottom: 14px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }}
    .post-meta {{ font-size: 11px; color: var(--muted); letter-spacing: 0.04em; }}
    .post-card.featured {{ grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; padding: 0 0 32px 0; border-right: none; }}
    .post-card.featured .post-content {{ display: flex; flex-direction: column; justify-content: center; }}
    .post-card.featured .post-title {{ font-size: 28px; margin-bottom: 14px; }}
    .post-card.featured .post-excerpt {{ font-size: 15px; -webkit-line-clamp: 4; }}
    .state-msg {{ text-align: center; padding: 80px 0; color: var(--muted); font-size: 15px; }}
    .footer {{ background: var(--navy-dark); color: rgba(255,255,255,0.45); padding: 32px 0; font-size: 12px; text-align: center; letter-spacing: 0.04em; }}
    @media (max-width: 780px) {{
      .inner {{ padding: 0 20px; }} .masthead-logo {{ font-size: 36px; }}
      .posts-grid {{ grid-template-columns: 1fr; }}
      .post-card {{ border-right: none; padding-right: 0; }}
      .post-card.featured {{ grid-template-columns: 1fr; }}
    }}
  </style>
</head>
<body>
{UTIL_BAR}
{MASTHEAD}
{NAV_BAR}
{TICKER}
  <section class="blog-hero">
    <div class="inner">
      <div class="section-header">
        <h1 class="blog-hero-title">블로그</h1>
        <div class="section-rule"></div>
      </div>
    </div>
  </section>
  <section class="posts-section">
    <div class="inner">{grid}</div>
  </section>
  <footer class="footer"><div class="inner">© 멜른버그</div></footer>
</body>
</html>"""


def render_post_html(post: dict) -> str:
    date = format_date(post["date"])
    return f"""<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{post['title']} — 멜른버그</title>
  <style>
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
    :root {{ --navy: #1B2D4F; --navy-dark: #0E1B2E; --yellow: #F7C94B; --text: #111111; --muted: #777777; --border: #D8D8D8; --white: #FFFFFF; }}
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; background: var(--white); color: var(--text); line-height: 1.6; -webkit-font-smoothing: antialiased; }}
    .inner {{ max-width: 1060px; margin: 0 auto; padding: 0 40px; }}
    .util-bar {{ background: var(--navy-dark); color: rgba(255,255,255,0.6); font-size: 11px; letter-spacing: 0.06em; padding: 6px 0; }}
    .util-bar .inner {{ display: flex; justify-content: space-between; align-items: center; }}
    .util-bar a {{ color: rgba(255,255,255,0.55); text-decoration: none; margin-left: 16px; }}
    .util-bar a:hover {{ color: var(--white); }}
    .masthead {{ background: var(--white); border-bottom: 3px solid var(--navy); padding: 20px 0 18px; text-align: center; }}
    .masthead-logo {{ font-family: Georgia, serif; font-size: 52px; font-weight: 700; color: var(--navy); letter-spacing: -0.02em; text-decoration: none; }}
    .nav-bar {{ background: var(--white); border-bottom: 1px solid var(--border); }}
    .nav-bar .inner {{ display: flex; align-items: stretch; }}
    .nav-item {{ position: relative; flex-shrink: 0; }}
    .nav-link {{ display: block; font-size: 12px; font-weight: 600; letter-spacing: 0.04em; color: var(--text); text-decoration: none; padding: 12px 16px; border-bottom: 2px solid transparent; white-space: nowrap; }}
    .nav-link:hover, .nav-link.active {{ color: var(--navy); border-bottom-color: var(--navy); }}
    .nav-dropdown {{ display: none; position: absolute; top: 100%; left: 0; background: var(--white); border: 1px solid var(--border); border-top: 2px solid var(--navy); min-width: 200px; z-index: 200; box-shadow: 0 4px 16px rgba(0,0,0,0.08); }}
    .nav-item:hover .nav-dropdown {{ display: block; }}
    .dropdown-item {{ display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; text-decoration: none; color: var(--text); font-size: 12px; border-bottom: 1px solid var(--border); gap: 20px; }}
    .dropdown-item:last-child {{ border-bottom: none; }}
    .dropdown-item:hover {{ background: #F5F5F0; }}
    .di-label {{ font-weight: 600; }}
    .di-price {{ color: var(--navy); font-weight: 700; white-space: nowrap; }}
    .ticker-wrap {{ background: var(--navy); overflow: hidden; padding: 8px 0; }}
    .ticker-track {{ display: flex; width: max-content; animation: ticker-scroll 28s linear infinite; }}
    @keyframes ticker-scroll {{ from {{ transform: translateX(0); }} to {{ transform: translateX(-50%); }} }}
    .ticker-item {{ display: flex; align-items: center; gap: 8px; padding: 0 32px; white-space: nowrap; font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.75); }}
    .ticker-item .t-name {{ color: var(--white); font-weight: 700; }}
    .ticker-item .t-price {{ color: var(--yellow); font-weight: 700; }}
    .ticker-sep {{ color: rgba(255,255,255,0.2); }}
    .post-header {{ padding: 56px 0 32px; border-bottom: 1px solid var(--border); }}
    .post-header-tag {{ font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); margin-bottom: 12px; }}
    .post-header-title {{ font-family: Georgia, serif; font-size: 42px; font-weight: 700; color: var(--navy); line-height: 1.2; margin-bottom: 16px; word-break: keep-all; }}
    .post-header-meta {{ font-size: 12px; color: var(--muted); letter-spacing: 0.04em; }}
    .post-body {{ max-width: 680px; padding: 48px 0 80px; }}
    .post-body p {{ margin-bottom: 1.5em; font-size: 17px; line-height: 1.8; }}
    .post-body h2 {{ font-family: Georgia, serif; font-size: 26px; font-weight: 700; color: var(--navy); margin: 2em 0 0.8em; }}
    .post-body h3 {{ font-family: Georgia, serif; font-size: 20px; font-weight: 700; color: var(--navy); margin: 1.8em 0 0.6em; }}
    .post-body ul, .post-body ol {{ margin: 0 0 1.5em 1.5em; font-size: 17px; line-height: 1.8; }}
    .post-body blockquote {{ border-left: 3px solid var(--navy); padding-left: 20px; margin: 1.5em 0; color: var(--muted); font-style: italic; }}
    .back-link {{ display: inline-block; font-size: 12px; font-weight: 700; color: var(--navy); text-decoration: none; letter-spacing: 0.04em; border-bottom: 1px solid var(--navy); margin-top: 8px; }}
    .footer {{ background: var(--navy-dark); color: rgba(255,255,255,0.45); padding: 32px 0; font-size: 12px; text-align: center; letter-spacing: 0.04em; }}
    @media (max-width: 780px) {{
      .inner {{ padding: 0 20px; }} .masthead-logo {{ font-size: 36px; }}
      .post-header-title {{ font-size: 28px; }}
      .post-body p {{ font-size: 16px; }}
    }}
  </style>
</head>
<body>
{UTIL_BAR}
{MASTHEAD}
{NAV_BAR}
{TICKER}
  <article>
    <div class="post-header">
      <div class="inner">
        <p class="post-header-tag">{post['tag']}</p>
        <h1 class="post-header-title">{post['title']}</h1>
        <p class="post-header-meta">{date}</p>
      </div>
    </div>
    <div class="inner">
      <div class="post-body">
        {post['html']}
        <a class="back-link" href="blog.html">← 블로그로 돌아가기</a>
      </div>
    </div>
  </article>
  <footer class="footer"><div class="inner">© 멜른버그</div></footer>
</body>
</html>"""


def main():
    OUTPUT_DIR.mkdir(exist_ok=True)
    posts = load_posts()

    # blog.html
    blog_html = render_blog_html(posts)
    (OUTPUT_DIR / "blog.html").write_text(blog_html, encoding="utf-8")
    print("OK blog.html")

    # 개별 포스트 페이지
    for post in posts:
        out = OUTPUT_DIR / f"post-{post['slug']}.html"
        out.write_text(render_post_html(post), encoding="utf-8")
        print(f"OK {out.name}")

    print(f"\n완료: {len(posts)}개 포스트")


if __name__ == "__main__":
    main()
