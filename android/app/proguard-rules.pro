# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Capacitor — 브리지 클래스가 obfuscation 되면 WebView↔Native 통신 깨짐
-keep class com.getcapacitor.** { *; }
-keep class com.melnberg.app.** { *; }

# WebView JS 인터페이스 — Capacitor 가 사용
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# AndroidX SwipeRefreshLayout
-keep class androidx.swiperefreshlayout.** { *; }

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile
