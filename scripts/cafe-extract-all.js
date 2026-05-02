/**
 * 멜른버그 카페 전체 글 + 댓글 추출 스크립트 (v2)
 *
 * 사용법:
 *  1. https://cafe.naver.com/hkmarket 접속 후 매니저 계정으로 로그인
 *  2. F12 → Console 탭
 *  3. 이 파일 전체 내용 복붙 후 Enter
 *  4. 1~3시간 기다리면 JSON 파일 자동 다운로드
 *
 * 중단해도 OK: localStorage에 진행 상황 저장됨 → 다시 실행 시 이어서 진행
 * 처음부터 다시 받으려면: localStorage.removeItem('cafeExtractCheckpoint')
 *
 * 엔드포인트:
 *  - 글 목록: cafe-boardlist-api/v1/cafes/{cafeId}/menus/{menuId}/articles
 *  - 글 상세: cafe-articleapi/v2.1/cafes/{cafeId}/articles/{articleId}
 *  - 댓글:   cafe-articleapi/v2/cafes/{cafeId}/articles/{articleId}/comments
 */

(async function extractAllCafePosts() {
  const CAFE_URL = 'hkmarket';
  const FALLBACK_CLUB_ID = 30851305;
  const PAGE_SIZE = 50;          // 글 목록 페이지당 (네이버 기본 15, 50까지 시도해보고 줄이기)
  const COMMENT_PAGE_SIZE = 100;
  const DELAY_LIST = 300;
  const DELAY_DETAIL = 400;
  const DELAY_COMMENT = 250;
  const CHECKPOINT_KEY = 'cafeExtractCheckpoint';
  const QA_THRESHOLD = 100;
  const QA_MIN_CONTENT_LEN = 5;

  console.log('🚀 멜른버그 카페 전체 글 + 댓글 추출 시작');

  // ─── 체크포인트
  let checkpoint = loadCheckpoint();
  function loadCheckpoint() {
    try { return JSON.parse(localStorage.getItem(CHECKPOINT_KEY) || 'null'); } catch { return null; }
  }
  function saveCheckpoint(data) {
    try { localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(data)); } catch (e) {
      console.warn('체크포인트 저장 실패 (용량 한계 가능):', e.message);
    }
  }

  // ─── 1) 클럽 ID
  let clubId = checkpoint?.clubId || window.g_sClubId || FALLBACK_CLUB_ID;
  console.log(`✅ 클럽 ID: ${clubId}`);

  // ─── 2) 메뉴 ID 자동 발견 (1~MAX 순회, 글이 있는 메뉴만 수집)
  // Naver의 menu list API는 CORS로 차단됨. 대신 articles API를 menuId마다 호출해서
  // 글이 1건 이상 있으면 유효한 메뉴로 판단.
  const MAX_MENU_ID = 60;
  let menus = checkpoint?.menus;
  if (!menus) {
    console.log(`🔍 menuId 1~${MAX_MENU_ID} 자동 탐색 중...`);
    menus = [];
    let consecutiveMisses = 0;
    for (let mid = 1; mid <= MAX_MENU_ID; mid++) {
      const url = `https://apis.naver.com/cafe-web/cafe-boardlist-api/v1/cafes/${clubId}/menus/${mid}/articles?page=1&pageSize=1&sortBy=TIME&viewType=L`;
      try {
        const r = await fetch(url, { credentials: 'include' });
        if (!r.ok) {
          consecutiveMisses++;
          if (consecutiveMisses >= 10 && mid > 20) break;
          continue;
        }
        const j = await r.json();
        const list = extractList(j);
        if (Array.isArray(list) && list.length > 0) {
          const sample = list[0];
          const menuName = sample.menuName || sample.boardName || `menuId=${mid}`;
          menus.push({ menuId: mid, menuName });
          console.log(`   ✓ menuId=${mid} | ${menuName}`);
          consecutiveMisses = 0;
        } else {
          consecutiveMisses++;
        }
        await sleep(150);
      } catch (e) {
        consecutiveMisses++;
      }
    }

    if (menus.length === 0) {
      console.error('❌ 유효한 메뉴를 1개도 찾지 못함.');
      return;
    }
    console.log(`✅ 메뉴 ${menus.length}개 발견`);
  } else {
    console.log(`▶ 체크포인트 메뉴 ${menus.length}개`);
  }

  // ─── 3) 글 목록 전체 수집 (메뉴 순회)
  let articleIndex = checkpoint?.articleIndex;
  if (!articleIndex) {
    console.log('📋 메뉴별 글 목록 수집 시작...');
    const all = [];
    for (const menu of menus) {
      let page = 1;
      let total = 0;
      while (true) {
        const url = `https://apis.naver.com/cafe-web/cafe-boardlist-api/v1/cafes/${clubId}/menus/${menu.menuId}/articles?page=${page}&pageSize=${PAGE_SIZE}&sortBy=TIME&viewType=L`;
        try {
          const r = await fetch(url, { credentials: 'include' });
          if (!r.ok) {
            console.warn(`   ⚠ menu=${menu.menuId} page=${page} HTTP ${r.status}`);
            break;
          }
          const j = await r.json();
          const list = extractList(j);
          if (!list || list.length === 0) break;
          for (const raw of list) {
            const art = raw.item || raw; // 새 API는 {type, item}로 래핑됨
            all.push({
              articleId: art.articleId || art.id,
              title: art.subject || art.title || '(제목 없음)',
              menuId: menu.menuId,
              menuName: menu.menuName,
              headName: art.headName || null,
              writeDateTimestamp: art.writeDateTimestamp || art.writeDate || null,
              commentCount: art.commentCount || art.commentsCount || 0,
            });
          }
          total += list.length;
          if (list.length < PAGE_SIZE) break;
          page++;
          await sleep(DELAY_LIST);
        } catch (e) {
          console.warn(`   ⚠ menu=${menu.menuId} page=${page} 에러:`, e.message);
          break;
        }
      }
      console.log(`   [${menu.menuName}] ${total}건`);
    }

    // 중복 제거 (전체글 메뉴와 일반 메뉴가 겹칠 수 있음)
    const seen = new Set();
    articleIndex = [];
    for (const a of all) {
      const key = String(a.articleId);
      if (seen.has(key)) continue;
      seen.add(key);
      articleIndex.push(a);
    }
    console.log(`✅ 총 ${articleIndex.length}건 (중복 제거 후)`);
    saveCheckpoint({ clubId, menus, articleIndex, posts: [], cursor: 0 });
  } else {
    console.log(`▶ 체크포인트 글 목록 ${articleIndex.length}건`);
  }

  if (articleIndex.length === 0) {
    console.error('❌ 수집된 글이 0건. 체크포인트 비우고 다시 시도해주세요: localStorage.removeItem("cafeExtractCheckpoint")');
    return;
  }

  // ─── 4) 글 상세 + 댓글
  const posts = checkpoint?.posts || [];
  let cursor = checkpoint?.cursor || 0;
  console.log(`📄 본문·댓글 추출 ${cursor} / ${articleIndex.length}부터 시작`);

  for (let i = cursor; i < articleIndex.length; i++) {
    const meta = articleIndex[i];
    try {
      const article = await fetchArticleDetail(clubId, meta.articleId);
      const contentText = (article.contentText || htmlToText(article.contentHtml || '')).trim();
      const comments = meta.commentCount > 0 ? await fetchAllComments(clubId, meta.articleId) : [];
      const isQA = comments.length > QA_THRESHOLD;

      if (!isQA) {
        const combined = composeContent(contentText, comments);
        if (combined && combined.length > 10) {
          posts.push(makePost(meta, meta.title, combined, String(meta.articleId)));
        }
      } else {
        if (contentText && contentText.length > 10) {
          posts.push(makePost(meta, `${meta.title} (안내)`, contentText, `${meta.articleId}_main`));
        }
        const threads = groupCommentsToThreads(comments);
        for (const t of threads) {
          if (!t.root.content || t.root.content.length < QA_MIN_CONTENT_LEN) continue;
          const titleSnippet = t.root.content.replace(/\s+/g, ' ').trim().slice(0, 40);
          posts.push(makePost(
            meta,
            `[${meta.title}] ${titleSnippet}${t.root.content.length > 40 ? '…' : ''}`,
            composeQAThread(t.root, t.replies),
            `${meta.articleId}_c${t.root.commentId}`,
          ));
        }
        console.log(`   Q&A 분할: ${threads.length}개 스레드`);
      }

      if ((i + 1) % 10 === 0 || i === articleIndex.length - 1) {
        console.log(`   [${i + 1}/${articleIndex.length}] ${(meta.title || '').slice(0, 30)} (댓글 ${comments.length}${isQA ? ', Q&A' : ''})`);
        saveCheckpoint({ clubId, menus, articleIndex, posts, cursor: i + 1 });
      }
      await sleep(DELAY_DETAIL);
    } catch (e) {
      console.error(`   ❌ [${i + 1}] ${meta.title} 실패:`, e.message);
      saveCheckpoint({ clubId, menus, articleIndex, posts, cursor: i + 1 });
      await sleep(3000);
    }
  }

  // ─── 5) JSON 다운로드
  const valid = posts.filter((p) => p.content && p.content.length > 10);
  const exportData = {
    cafeUrl: CAFE_URL,
    clubId,
    extractedAt: new Date().toISOString(),
    totalPosts: valid.length,
    posts: valid,
  };
  download(`melnberg_cafe_full_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(exportData, null, 2));
  console.log(`🎉 완료! 유효 ${valid.length} / 시도 ${posts.length}건`);
  window.__cafeExportData = exportData;
  console.log('💡 다시 처음부터: localStorage.removeItem("cafeExtractCheckpoint")');

  // ─── helpers
  function makePost(meta, title, content, externalId) {
    return {
      title,
      content,
      external_id: externalId,
      external_url: `https://cafe.naver.com/${CAFE_URL}/${meta.articleId}`,
      posted_at: meta.writeDateTimestamp ? new Date(meta.writeDateTimestamp).toISOString() : null,
    };
  }

  function extractList(j) {
    return (
      j?.message?.result?.articleList ||
      j?.message?.result?.articles ||
      j?.result?.articleList ||
      j?.result?.articles ||
      j?.articleList ||
      j?.articles ||
      []
    );
  }

  async function fetchMenuList(clubId) {
    const candidates = [
      `https://apis.naver.com/cafe-web/cafe2/SideMenuList.json?clubid=${clubId}`,
      `https://apis.naver.com/cafe-web/cafe2/CafeGateMenuList.json?cafeUrl=${CAFE_URL}`,
      `https://apis.naver.com/cafe-web/cafe-mobile-channel-api/v1/cafes/${clubId}/menus`,
      `https://apis.naver.com/cafe-web/cafe-boardlist-api/v1/cafes/${clubId}/menus`,
      `https://apis.naver.com/cafe-web/cafe2/MenuList.json?clubid=${clubId}`,
    ];
    for (const url of candidates) {
      try {
        const r = await fetch(url, { credentials: 'include' });
        if (!r.ok) {
          console.log(`   ✗ menu API ${r.status}: ${url}`);
          continue;
        }
        const j = await r.json();
        const list =
          j?.message?.result?.menus ||
          j?.message?.result?.cafeMenuList ||
          j?.result?.menus ||
          j?.result?.cafeMenuList ||
          j?.menus ||
          [];
        const filtered = list
          .filter((m) => m.menuType !== 'L' && m.menuType !== 'F') // 라인·폴더 제외
          .filter((m) => m.menuId && (m.menuName || m.name))
          .map((m) => ({
            menuId: m.menuId,
            menuName: m.menuName || m.name,
            menuType: m.menuType,
          }));
        if (filtered.length > 0) {
          console.log(`   ✓ menu API: ${url} (${filtered.length}개)`);
          return filtered;
        }
        console.log(`   ✗ 빈 응답: ${url}`);
      } catch (e) {
        console.log(`   ✗ ${url} → ${e.message}`);
      }
    }
    return null;
  }

  async function fetchArticleDetail(clubId, articleId) {
    const urls = [
      `https://apis.naver.com/cafe-web/cafe-articleapi/v3/cafes/${clubId}/articles/${articleId}`,
      `https://apis.naver.com/cafe-web/cafe-articleapi/v2.1/cafes/${clubId}/articles/${articleId}`,
      `https://apis.naver.com/cafe-web/cafe-articleapi/v2/cafes/${clubId}/articles/${articleId}`,
    ];
    let lastErr;
    for (const u of urls) {
      try {
        const r = await fetch(u, { credentials: 'include' });
        if (!r.ok) { lastErr = `${r.status}`; continue; }
        const j = await r.json();
        const a = j?.message?.result?.article || j?.result?.article || j?.article || null;
        if (a) return a;
        lastErr = '빈 응답';
      } catch (e) { lastErr = e.message; }
    }
    throw new Error(`상세 fetch 실패: ${lastErr}`);
  }

  async function fetchAllComments(clubId, articleId) {
    const all = [];
    const seen = new Set();
    let cursor = null;
    let page = 1;
    while (true) {
      const url = cursor
        ? `https://apis.naver.com/cafe-web/cafe-articleapi/v2/cafes/${clubId}/articles/${articleId}/comments?perPage=${COMMENT_PAGE_SIZE}&orderBy=asc&cursor=${encodeURIComponent(cursor)}`
        : `https://apis.naver.com/cafe-web/cafe-articleapi/v2/cafes/${clubId}/articles/${articleId}/comments?page=${page}&perPage=${COMMENT_PAGE_SIZE}&orderBy=asc`;
      try {
        const r = await fetch(url, { credentials: 'include' });
        const j = await r.json();
        const result = j.result || j.message?.result || {};
        const cObj = result.comments || {};
        const items = cObj.items || result.commentList || [];
        if (items.length === 0) break;
        let added = 0;
        for (const c of items) {
          const id = String(c.commentNo || c.commentId || c.id || '');
          if (id && seen.has(id)) continue;
          if (id) seen.add(id);
          const text = (c.content || c.body || '').trim();
          if (!text) continue;
          all.push({
            commentId: id,
            content: text,
            writer: c.writerNickname || c.nickName || c.writer?.nick || '',
            writeDate: c.writeDate || c.regDate || '',
            isReply: !!(c.refComment || c.refCommentNo || (c.replyLevel && c.replyLevel > 0)),
            refCommentId: String(c.refCommentNo || c.refComment || ''),
          });
          added++;
        }
        if (cObj.hasNext === false || added === 0) break;
        if (cObj.cursor || cObj.nextCursor) cursor = cObj.cursor || cObj.nextCursor;
        else page++;
        await sleep(DELAY_COMMENT);
      } catch (e) {
        console.warn(`   댓글 fetch 실패 article=${articleId}:`, e.message);
        break;
      }
    }
    return all;
  }

  function groupCommentsToThreads(comments) {
    const byId = new Map();
    for (const c of comments) byId.set(c.commentId, c);
    const repliesOf = new Map();
    for (const c of comments) {
      if (c.isReply && c.refCommentId) {
        let parent = byId.get(c.refCommentId);
        let safety = 10;
        while (parent && parent.isReply && safety-- > 0) parent = byId.get(parent.refCommentId);
        const rootId = parent?.commentId ?? c.refCommentId;
        if (!repliesOf.has(rootId)) repliesOf.set(rootId, []);
        repliesOf.get(rootId).push(c);
      }
    }
    const threads = [];
    for (const c of comments) {
      if (!c.isReply) threads.push({ root: c, replies: repliesOf.get(c.commentId) ?? [] });
    }
    return threads;
  }

  function composeQAThread(root, replies) {
    const lines = [`Q. ${root.content}`];
    if (root.writer) lines.push(`(질문자: ${root.writer})`);
    if (replies.length > 0) {
      lines.push('');
      for (const r of replies) lines.push(`A. ${r.content}${r.writer ? ` — ${r.writer}` : ''}`);
    }
    return lines.join('\n');
  }

  function composeContent(body, comments) {
    const parts = [];
    if (body) parts.push(body);
    if (comments && comments.length > 0) {
      const cmtBlock = comments
        .map((c) => `${c.isReply ? '  ↳ ' : '- '}${c.writer ? c.writer + ': ' : ''}${c.content}`)
        .join('\n');
      parts.push(`---\n[댓글 ${comments.length}개]\n${cmtBlock}`);
    }
    return parts.join('\n\n').trim();
  }

  function htmlToText(html) {
    if (!html) return '';
    // img/script/iframe 등 리소스 fetch 유발 태그를 미리 제거해서 콘솔 404 도배 방지
    const cleaned = html
      .replace(/<img[^>]*>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
      .replace(/<source[^>]*>/gi, '')
      .replace(/<video[^>]*>[\s\S]*?<\/video>/gi, '')
      .replace(/<audio[^>]*>[\s\S]*?<\/audio>/gi, '');
    // DOMParser는 innerHTML과 달리 리소스를 자동 fetch하지 않음
    const doc = new DOMParser().parseFromString(cleaned, 'text/html');
    doc.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
    doc.querySelectorAll('p, div').forEach((el) => el.appendChild(doc.createTextNode('\n')));
    return (doc.body?.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  }

  function download(filename, content) {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
})();
