package com.groupblacknet.client.core;

import java.awt.Color;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;

/**
 * 主题：与站点 assets/site.css 的 CSS 变量一一对应。
 * 默认亮色（--bg:#ffffff），可切暗色；选择持久化到用户目录。
 */
public final class Theme {

    public enum Mode { LIGHT, DARK }

    /** 设计 token（对齐 site.css 的 :root / [data-theme="dark"]） */
    public static final class Tokens {
        public final Color bg, paper, paper2, ink, ink2, muted, line, line2, accent, accentSoft, onAccent;

        Tokens(Color bg, Color paper, Color paper2, Color ink, Color ink2, Color muted,
               Color line, Color line2, Color accent, Color accentSoft, Color onAccent) {
            this.bg = bg; this.paper = paper; this.paper2 = paper2;
            this.ink = ink; this.ink2 = ink2; this.muted = muted;
            this.line = line; this.line2 = line2;
            this.accent = accent; this.accentSoft = accentSoft; this.onAccent = onAccent;
        }

        public Color mix(Color a, Color b, double t) {
            return new Color(
                    (int) (a.getRed() + (b.getRed() - a.getRed()) * t),
                    (int) (a.getGreen() + (b.getGreen() - a.getGreen()) * t),
                    (int) (a.getBlue() + (b.getBlue() - a.getBlue()) * t));
        }
    }

    private static final Tokens LIGHT = new Tokens(
            new Color(0xFFFFFF), new Color(0xF7F6F3), new Color(0xF0EEE9),
            new Color(0x0F1216), new Color(0x3B414B), new Color(0x737A86),
            new Color(0xE8E5DD), new Color(0xDCD8CF),
            new Color(0xC8102E), new Color(0xFDECEF), Color.WHITE);

    private static final Tokens DARK = new Tokens(
            new Color(0x0E1014), new Color(0x151922), new Color(0x1B2029),
            new Color(0xF3F4F6), new Color(0xC9CED8), new Color(0x8B93A1),
            new Color(0x242A35), new Color(0x2F3644),
            new Color(0xFF5470), new Color(0x2A1620), new Color(0x0E1014));

    private static final Path PREFS_DIR =
            Path.of(System.getProperty("user.home"), ".groupblacknet-client");
    private static final Path PREFS_FILE = PREFS_DIR.resolve("prefs.properties");

    private static Mode mode = Mode.LIGHT;   // 默认亮色
    private static final java.util.List<Runnable> LISTENERS = new java.util.ArrayList<>();

    private Theme() {}

    public static Tokens t() { return mode == Mode.DARK ? DARK : LIGHT; }
    public static Mode mode() { return mode; }
    public static boolean isDark() { return mode == Mode.DARK; }

    public static void toggle() { set(mode == Mode.DARK ? Mode.LIGHT : Mode.DARK); }

    public static void set(Mode m) {
        if (m == null || m == mode) return;
        mode = m;
        save();
        for (Runnable r : new java.util.ArrayList<>(LISTENERS)) {
            try { r.run(); } catch (RuntimeException ignore) { }
        }
    }

    /** 主题变化监听（用于整树刷新） */
    public static void onChange(Runnable r) { LISTENERS.add(r); }

    /* ---------------- 持久化 ---------------- */

    public static void load() {
        try {
            if (!Files.exists(PREFS_FILE)) return;
            Properties p = new Properties();
            try (InputStream in = Files.newInputStream(PREFS_FILE)) { p.load(in); }
            String v = p.getProperty("theme", "light");
            mode = "dark".equalsIgnoreCase(v) ? Mode.DARK : Mode.LIGHT;
        } catch (IOException ignore) {
            mode = Mode.LIGHT;
        }
    }

    private static void save() {
        try {
            Files.createDirectories(PREFS_DIR);
            Properties p = new Properties();
            if (Files.exists(PREFS_FILE)) {
                try (InputStream in = Files.newInputStream(PREFS_FILE)) { p.load(in); }
            }
            p.setProperty("theme", mode == Mode.DARK ? "dark" : "light");
            try (OutputStream out = Files.newOutputStream(PREFS_FILE)) {
                p.store(out, "群档案客户端 · 本地偏好");
            }
        } catch (IOException ignore) { }
    }

    /** 用户数据目录（登录态等） */
    public static Path dataDir() {
        try { Files.createDirectories(PREFS_DIR); } catch (IOException ignore) { }
        return PREFS_DIR;
    }

    /* ---------------- 颜色小工具 ---------------- */

    /** 分类色相 → 渐变起止色（对齐 site.js 的 grad()） */
    public static Color hueColor(float hue, float sat, float light) {
        return Color.getHSBColor((((hue % 360) + 360) % 360) / 360f, sat, light);
    }

    public static Color withAlpha(Color c, int a) {
        return new Color(c.getRed(), c.getGreen(), c.getBlue(), a);
    }
}
