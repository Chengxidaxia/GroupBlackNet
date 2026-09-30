package com.groupblacknet.client.core;

import java.awt.Graphics2D;
import java.awt.Image;
import java.awt.RenderingHints;
import java.awt.geom.Ellipse2D;
import java.awt.geom.RoundRectangle2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;

import javax.imageio.ImageIO;
import javax.swing.ImageIcon;
import javax.swing.SwingUtilities;

/**
 * 图片异步加载 + 内存缓存（头像、封面）。
 * 失败时不抛异常，交给调用方画分类渐变占位（对齐网页端的兜底行为）。
 */
public final class ImgCache {

    private static final Map<String, Image> CACHE = new ConcurrentHashMap<>();
    private static final Map<String, Boolean> FAILED = new ConcurrentHashMap<>();
    private static final ExecutorService POOL = Executors.newFixedThreadPool(4, r -> {
        Thread t = new Thread(r, "gb-img");
        t.setDaemon(true);
        return t;
    });
    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    private ImgCache() {}

    private static String key(String url, int w, int h, boolean cover) {
        return url + "|" + w + "x" + h + (cover ? "|c" : "|f");
    }

    public static Image cached(String url, int w, int h, boolean cover) {
        if (url == null || url.isBlank()) return null;
        return CACHE.get(key(url, w, h, cover));
    }

    /** 已缓存立即回调（EDT），否则后台下载，完成后回调（EDT）；失败回调 onFail。 */
    public static void load(String url, int w, int h, boolean cover,
                            Consumer<Image> onOk, Runnable onFail) {
        if (url == null || url.isBlank()) {
            if (onFail != null) onFail.run();
            return;
        }
        String k = key(url, w, h, cover);
        Image hit = CACHE.get(k);
        if (hit != null) {
            if (onOk != null) onOk.accept(hit);
            return;
        }
        if (Boolean.TRUE.equals(FAILED.get(k))) {
            if (onFail != null) SwingUtilities.invokeLater(onFail);
            return;
        }
        POOL.submit(() -> {
            try {
                HttpResponse<byte[]> res = HTTP.send(HttpRequest.newBuilder(URI.create(url))
                                .timeout(Duration.ofSeconds(20))
                                .header("User-Agent", "GroupBlackNet-Client/" + Config.VERSION)
                                .GET().build(),
                        HttpResponse.BodyHandlers.ofByteArray());
                if (res.statusCode() >= 400) throw new java.io.IOException("HTTP " + res.statusCode());
                BufferedImage raw = ImageIO.read(new ByteArrayInputStream(res.body()));
                if (raw == null) throw new java.io.IOException("不是有效图片");
                Image out = cover ? cover(raw, w, h) : fit(raw, w, h);
                CACHE.put(k, out);
                if (onOk != null) SwingUtilities.invokeLater(() -> onOk.accept(out));
            } catch (Exception e) {
                FAILED.put(k, Boolean.TRUE);
                if (onFail != null) SwingUtilities.invokeLater(onFail);
            }
        });
    }

    /* ---------------- 图形处理 ---------------- */

    /** 等比缩放后居中裁剪填满（object-fit: cover）。 */
    public static BufferedImage cover(BufferedImage src, int w, int h) {
        if (w <= 0 || h <= 0) return src;
        double scale = Math.max((double) w / src.getWidth(), (double) h / src.getHeight());
        int sw = Math.max(1, (int) Math.round(src.getWidth() * scale));
        int sh = Math.max(1, (int) Math.round(src.getHeight() * scale));
        BufferedImage out = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = gfx(out);
        g.drawImage(src, (w - sw) / 2, (h - sh) / 2, sw, sh, null);
        g.dispose();
        return out;
    }

    /** 等比缩放放进盒子里（contain）。 */
    public static BufferedImage fit(BufferedImage src, int w, int h) {
        double scale = Math.min((double) w / src.getWidth(), (double) h / src.getHeight());
        int sw = Math.max(1, (int) Math.round(src.getWidth() * scale));
        int sh = Math.max(1, (int) Math.round(src.getHeight() * scale));
        BufferedImage out = new BufferedImage(sw, sh, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = gfx(out);
        g.drawImage(src, 0, 0, sw, sh, null);
        g.dispose();
        return out;
    }

    /** 圆角裁切（返回新图，不修改原图）。 */
    public static Image rounded(Image src, int w, int h, int radius) {
        BufferedImage out = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = gfx(out);
        g.setClip(new RoundRectangle2D.Float(0, 0, w, h, radius * 2f, radius * 2f));
        g.drawImage(src, 0, 0, w, h, null);
        g.dispose();
        return out;
    }

    /** 圆形裁切（头像）。 */
    public static Image circular(Image src, int size) {
        BufferedImage out = new BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = gfx(out);
        g.setClip(new Ellipse2D.Float(0, 0, size, size));
        g.drawImage(src, 0, 0, size, size, null);
        g.dispose();
        return out;
    }

    public static ImageIcon icon(Image src) {
        return src == null ? null : new ImageIcon(src);
    }

    private static Graphics2D gfx(BufferedImage img) {
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        return g;
    }
}
