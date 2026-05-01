/**
 * 멜른버그 카페 전체 글 + 댓글 추출 스크립트
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
 * 댓글 처리 로직:
 *  - 일반 글: 본문 + 댓글들을 하나로 합쳐서 1개 글로 저장
 *  - Q&A 글 (댓글 100개 초과): 본문 + 각 최상위 댓글 스레드를 별도 가상 글로 분리
 *    → 댓글 1개당 임베딩 1세트, 검색 정확도 ↑
 */

(async function extractAllCafePosts() {
  const CAFE_URL = 'hkmarket';
  const PAGE_SIZE = 50;
  const COMMENT_PAGE_SIZE = 100;
  const DELAY_LIST = 300;
  const DELAY_DETAIL = 400;
  const DELAY_COMMENT = 250;
  const CHECKPOINT_KEY = 'cafeExtractCheckpoint';
  const QA_THRESHOLD = 100;       // 댓글 N개 초과 글은 Q&A로 분할 처리
  const QA_MIN_CONTENT_LEN = 5;   // Q&A 가상글 최소 글자 (스팸 1글자 댓글 제외)

  console.log('🚀 멜른버그 카페 전체 글 + 댓글 추출 시작');
  console.log(`   Q&A 분할 임계값: 댓글 ${QA_THRESHOLD}개 초과 시`);

  // ─── 체크포인트 로드
  let checkpoint = (() => {
    try {
      const raw = localStorage.getItem(CHECKPOINT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  })();

  function saveCheckpoint(data) {
    try { localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(data)); } catch (e) {
      console.warn('체크포인트 저장 실패 (용량 한도 초과 가능):', e.message);
    }
  }

  // ─── 1) 카페 클럽 ID
  let clubId = checkpoint?.clubId;
  if (!clubId) {
    try {
      const res = await fetch(`https://apis.naver.com/cafe-web/cafe2/CafeGateInfo.json?cafeUrl=${CAFE_URL}`, { credentials: 'include' });
      const j = await res.json();
      clubId = j.message?.result?.cafeInfoView?.cafeId;
      if (!clubId) throw new Error('클럽 ID 못 찾음');
      console.log(`✅ 클럽 ID: ${clubId}`);
    } catch (e) {
      console.error('❌ 카페 정보 fetch 실패. 로그인 상태 확인.', e);
      return;
    }
  } else {
    console.log(`▶ 체크포인트 클럽 ID: ${clubId}`);
  }

  // ─── 2) 글 목록 전체 수집
  let articleIndex = checkpoint?.articleIndex || null;

  if (!articleIndex) {
    console.log('📋 글 목록 수집 중 (전체 페이지)...');
    const collected = [];
    let page = 1;
    while (true) {
      try {
        const url = `https://apis.naver.com/cafe-web/cafe-articleapi/v2.1/cafes/${clubId}/articles?page=${page}&perPage=${PAGE_SIZE}&query=&sortBy=date`;
        const r = await fetch(url, { credentials: 'include' });
        const j = await r.json();
        const list = j.message?.result?.articleList || [];
        if (list.length === 0) break;
        for (const art of list) {
          collected.push({
            articleId: art.articleId,
            title: art.subject,
            menuId: art.menuId,
            menuName: art.menuName,
            writeDateTimestamp: art.writeDateTimestamp,
            commentCount: art.commentCount || 0,
          });
        }
        if (page % 5 === 0 || list.length < PAGE_SIZE) {
          console.log(`   목록 페이지 ${page} (누적 ${collected.length}건)`);
        }
        if (list.length < PAGE_SIZE) break;
        page++;
        await sleep(DELAY_LIST);
      } catch (e) {
        console.error(`목록 페이지 ${page} 실패, 5초 후 재시도...`, e);
        await sleep(5000);
      }
    }
    console.log(`✅ 글 목록 ${collected.length}건 수집 완료`);
    articleIndex = collected;
    saveCheckpoint({ clubId, articleIndex, posts: [], cursor: 0 });
  } else {
    console.log(`▶ 체크포인트 글 목록 ${articleIndex.length}건`);
  }

  // ─── 3) 각 글의 본문 + 댓글 fetch
  const posts = checkpoint?.posts || [];
  let cursor = checkpoint?.cursor || 0;
  console.log(`📄 본문·댓글 추출 ${cursor} / ${articleIndex.length}부터 시작`);

  for (let i = cursor; i < articleIndex.length; i++) {
    const meta = articleIndex[i];
    try {
      const dRes = await fetch(
        `https://apis.naver.com/cafe-web/cafe-articleapi/v2.1/cafes/${clubId}/articles/${meta.articleId}`,
        { credentials: 'include' }
      );
      const dJson = await dRes.json();
      const article = dJson.message?.result?.article || dJson.result?.article || {};
      const contentText = (article.contentText || htmlToText(article.contentHtml || '')).trim();

      const comments = meta.commentCount > 0
        ? await fetchAllComments(clubId, meta.articleId)
        : [];

      const isQA = comments.length > QA_THRESHOLD;

      if (!isQA) {
        // 일반 글: 본문 + 댓글 통합
        const combined = composeContent(contentText, comments);
        if (combined && combined.length > 10) {
          posts.push({
            title: meta.title || '(제목 없음)',
            content: combined,
            external_id: String(meta.articleId),
            external_url: `https://cafe.naver.com/${CAFE_URL}/${meta.articleId}`,
            posted_at: meta.writeDateTimestamp ? new Date(meta.writeDateTimestamp).toISOString() : null,
          });
        }
      } else {
        // Q&A 글: 본문은 1개 + 각 최상위 댓글 스레드를 별도 가상 글로
        if (contentText && contentText.length > 10) {
          posts.push({
            title: `${meta.title} (안내)`,
            content: contentText,
            external_id: `${meta.articleId}_main`,
            external_url: `https://cafe.naver.com/${CAFE_URL}/${meta.articleId}`,
            posted_at: meta.writeDateTimestamp ? new Date(meta.writeDateTimestamp).toISOString() : null,
          });
        }

        const threads = groupCommentsToThreads(comments);
        for (const thread of threads) {
          const root = thread.root;
          if (!root.content || root.content.trim().length < QA_MIN_CONTENT_LEN) continue;
          const threadContent = composeQAThread(root, thread.replies);
          const titleSnippet = root.content.replace(/\s+/g, ' ').trim().slice(0, 40);
          posts.push({
            title: `[${meta.title}] ${titleSnippet}${root.content.length > 40 ? '…' : ''}`,
            content: threadContent,
            external_id: `${meta.articleId}_c${root.commentId}`,
            external_url: `https://cafe.naver.com/${CAFE_URL}/${meta.articleId}`,
            posted_at: root.writeDate || (meta.writeDateTimestamp ? new Date(meta.writeDateTimestamp).toISOString() : null),
          });
        }
        console.log(`   Q&A 분할: 본문 + ${threads.length}개 스레드 → 가상글로 저장`);
      }

      if ((i + 1) % 10 === 0 || i === articleIndex.length - 1) {
        console.log(`   [${i + 1}/${articleIndex.length}] ${meta.title?.slice(0, 30) ?? ''} (댓글 ${comments.length}${isQA ? ', Q&A 분할' : ''})`);
        saveCheckpoint({ clubId, articleIndex, posts, cursor: i + 1 });
      }

      await sleep(DELAY_DETAIL);
    } catch (e) {
      console.error(`   ❌ [${i + 1}] ${meta.title} 실패, 5초 후 다음:`, e.message);
      saveCheckpoint({ clubId, articleIndex, posts, cursor: i + 1 });
      await sleep(5000);
    }
  }

  // ─── 4) JSON 다운로드
  const validPosts = posts.filter((p) => p.content && p.content.length > 10);
  const exportData = {
    cafeUrl: CAFE_URL,
    clubId,
    extractedAt: new Date().toISOString(),
    totalPosts: validPosts.length,
    posts: validPosts,
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `melnberg_cafe_full_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log(`🎉 완료! 총 ${validPosts.length}개 가상글 — JSON 다운로드됨.`);
  console.log('💾 window.__cafeExportData 로도 접근 가능.');
  window.__cafeExportData = exportData;
  console.log('🧹 다시 처음부터 받으려면: localStorage.removeItem("cafeExtractCheckpoint")');

  // ─── 헬퍼
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

    const threads = [];
    const repliesOf = new Map(); // rootId → [replies]

    for (const c of comments) {
      if (c.isReply && c.refCommentId) {
        // 답글 — 가장 가까운 최상위 부모 찾아서 매달기
        let cur = c;
        let parent = byId.get(c.refCommentId);
        let safety = 10;
        while (parent && parent.isReply && safety-- > 0) {
          parent = byId.get(parent.refCommentId);
        }
        const rootId = parent?.commentId ?? c.refCommentId;
        if (!repliesOf.has(rootId)) repliesOf.set(rootId, []);
        repliesOf.get(rootId).push(c);
      }
    }

    for (const c of comments) {
      if (!c.isReply) {
        threads.push({ root: c, replies: repliesOf.get(c.commentId) ?? [] });
      }
    }
    return threads;
  }

  function composeQAThread(root, replies) {
    const lines = [`Q. ${root.content}`];
    if (root.writer) lines.push(`(질문자: ${root.writer})`);
    if (replies.length > 0) {
      lines.push('');
      for (const r of replies) {
        lines.push(`A. ${r.content}${r.writer ? ` — ${r.writer}` : ''}`);
      }
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
    const div = document.createElement('div');
    div.innerHTML = html;
    div.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
    div.querySelectorAll('p, div').forEach((el) => el.appendChild(document.createTextNode('\n')));
    return (div.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
})();
