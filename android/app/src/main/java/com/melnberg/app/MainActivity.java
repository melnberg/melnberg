package com.melnberg.app;

import android.graphics.Color;
import android.os.Bundle;
import android.view.ViewGroup;
import android.view.ViewParent;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Android 12+ splash screen 폴리필 — Theme.SplashScreen 부모와 함께 사용
        // super.onCreate 보다 먼저 호출되어야 함
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);
        // 액티비티 열림 애니메이션 끄기 — splash 와 본 화면 사이의 어색한 전환 제거
        overridePendingTransition(0, 0);
        // Android 15+ edge-to-edge 강제 회피 — 컨텐츠 root 에 시스템바 만큼 padding
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        // 상태바·네비바 색을 흰색으로, 아이콘은 검정 (라이트 스타일)
        getWindow().setStatusBarColor(Color.WHITE);
        getWindow().setNavigationBarColor(Color.WHITE);
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView())
            .setAppearanceLightStatusBars(true);
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView())
            .setAppearanceLightNavigationBars(true);

        ViewCompat.setOnApplyWindowInsetsListener(
            findViewById(android.R.id.content),
            (v, insets) -> {
                // 시스템바 + 디스플레이 컷아웃 + 키보드 (IME) 까지 포함
                // → 키보드 뜨면 bottom padding 이 자동으로 늘어나서 입력창 안 가림
                Insets bars = insets.getInsets(
                    WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout()
                    | WindowInsetsCompat.Type.ime()
                );
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return WindowInsetsCompat.CONSUMED;
            }
        );

        // 페이드인 — WebView 처음엔 투명, 1초 뒤 500ms 동안 페이드인
        // splash drawable (windowBackground) 위로 부드럽게 사이트가 떠오름
        WebView webView = getBridge().getWebView();
        webView.setAlpha(0f);
        webView.postDelayed(() -> webView.animate().alpha(1f).setDuration(500).start(), 1000);

        // 풀-투-리프레시 — WebView 를 SwipeRefreshLayout 으로 감싸서 아래로 당기면 reload
        ViewParent parent = webView.getParent();
        if (parent instanceof ViewGroup) {
            ViewGroup parentGroup = (ViewGroup) parent;
            int idx = parentGroup.indexOfChild(webView);
            ViewGroup.LayoutParams lp = webView.getLayoutParams();
            parentGroup.removeView(webView);

            SwipeRefreshLayout refresh = new SwipeRefreshLayout(this);
            // 멜른버그 컬러 — 다크 네이비 / 라이트 시안
            refresh.setColorSchemeColors(0xFF002060, 0xFF00B0F0);
            refresh.addView(webView, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
            refresh.setOnRefreshListener(() -> {
                webView.reload();
                // 1.5초 후 스피너 자동 종료 (페이지 로드 끝날 때쯤)
                refresh.postDelayed(() -> refresh.setRefreshing(false), 1500);
            });
            // 페이지 위쪽에서만 발동 — 컨텐츠 스크롤 중엔 비활성화
            refresh.setOnChildScrollUpCallback((p, c) -> webView.getScrollY() > 0);

            parentGroup.addView(refresh, idx, lp);
        }
    }
}
