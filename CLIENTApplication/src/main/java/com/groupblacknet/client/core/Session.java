package com.groupblacknet.client.core;

import com.groupblacknet.client.core.Model.Author;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Consumer;

import javax.swing.SwingUtilities;

/**
 * 登录态。
 *
 * 鉴权链路与网页端一致：所有写入请求带 Cookie: github_token=&lt;GitHub access token&gt;。
 * 获取 token 的两条路（后端零改动）：
 *   1) GitHub Device Flow —— 从 oauth/login 的跳转里解析 client_id，走设备码授权；
 *      需要该 OAuth App 在 GitHub 后台勾选 "Enable Device Flow"；
 *   2) 手动令牌 —— 直接粘贴一个 GitHub Token（经典 PAT，勾选 public_repo）。
 */
public final class Session {

    private static final Path FILE = Theme.dataDir().resolve("session.properties");
    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(15))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    private static volatile String token = "";
    private static volatile Author user = null;

    private Session() {}

    public static String token() { return token == null || token.isBlank() ? null : token; }
    public static Author user() { return user; }
    public static boolean loggedIn() { return token() != null && user != null; }

    /* ---------------- 持久化 ---------------- */

    public static void load() {
        try {
            if (!Files.exists(FILE)) return;
            java.util.Properties p = new java.util.Properties();
            try (InputStream in = Files.newInputStream(FILE)) { p.load(in); }
            token = p.getProperty("token", "");
            String login = p.getProperty("login", "");
            String avatar = p.getProperty("avatar", "");
            if (token != null && !token.isBlank()) user = new Author(login, avatar);
        } catch (IOException ignore) { }
    }

    private static void save(String t, Author u) {
        try {
            Files.createDirectories(FILE.getParent());
            java.util.Properties p = new java.util.Properties();
            p.setProperty("token", t == null ? "" : t);
            p.setProperty("login", u == null ? "" : u.name());
            p.setProperty("avatar", u == null || u.avatarUrl() == null ? "" : u.avatarUrl());
            try (OutputStream out = Files.newOutputStream(FILE)) {
                out.write("# 群档案客户端 · 登录态（本机私有，勿分享）\n".getBytes(StandardCharsets.UTF_8));
                p.store(out, null);
            }
        } catch (IOException ignore) { }
    }

    /** 后台校验身份并落地。 */
    public static void applyToken(String t, Consumer<Author> onOk, Consumer<Exception> onErr) {
        token = t == null ? "" : t.trim();
        Api.async(() -> {
            Author me = Api.me();
            if (me == null) throw new IOException("令牌无效或已过期（请在 GitHub 重新生成）");
            return me;
        }, me -> {
            user = me;
            save(token, me);
            if (onOk != null) onOk.accept(me);
        }, e -> {
            token = "";
            if (onErr != null) onErr.accept(e);
        });
    }

    public static void logout(Runnable after) {
        token = "";
        user = null;
        save("", null);
        Api.async(() -> { try { Api.logout(); } catch (Exception ignore) { } return null; },
                v -> { if (after != null) after.run(); },
                e -> { if (after != null) after.run(); });
    }

    /* ---------------- Device Flow ---------------- */

    public static final class DeviceCode {
        public final String userCode, verificationUri, deviceCode;
        public final int interval, expiresIn;

        DeviceCode(String userCode, String verificationUri, String deviceCode, int interval, int expiresIn) {
            this.userCode = userCode;
            this.verificationUri = verificationUri;
            this.deviceCode = deviceCode;
            this.interval = Math.max(5, interval);
            this.expiresIn = expiresIn <= 0 ? 900 : expiresIn;
        }
    }

    /**
     * 启动设备码登录：先拿到 user_code 回调给界面展示，再轮询换取 token。
     * onCode / onOk / onErr 均会在 EDT 上被调用。
     */
    public static void deviceLogin(Consumer<DeviceCode> onCode,
                                   Consumer<Author> onOk, Consumer<Exception> onErr) {
        Api.async(() -> {
            String clientId = resolveClientId();
            if (clientId == null) throw new IOException(
                    "无法从 oauth/login 解析 client_id（请改用「手动令牌」登录）");
            HttpResponse<String> res = HTTP.send(HttpRequest.newBuilder(
                            URI.create("https://github.com/login/device/code"))
                    .timeout(Duration.ofSeconds(20))
                    .header("Accept", "application/json")
                    .header("User-Agent", "GroupBlackNet-Client/" + Config.VERSION)
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .POST(HttpRequest.BodyPublishers.ofString(
                            "client_id=" + clientId + "&scope=" + java.net.URLEncoder.encode("public_repo,user:email", StandardCharsets.UTF_8)))
                    .build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            Map<String, Object> d = Json.obj(res.body());
            String userCode = Json.str(d, "user_code");
            String deviceCode = Json.str(d, "device_code");
            if (userCode == null || deviceCode == null) {
                String err = Json.str(d, "error_description", Json.str(d, "error", "设备码申请失败"));
                throw new IOException(err + "（若提示 device flow disabled，请在 GitHub OAuth App 里启用 Device Flow）");
            }
            DeviceCode dc = new DeviceCode(userCode,
                    Json.str(d, "verification_uri", "https://github.com/login/device"),
                    deviceCode,
                    Json.intVal(d, "interval", 5),
                    Json.intVal(d, "expires_in", 900));

            // 先把设备码交给界面（EDT），再继续轮询
            if (onCode != null) SwingUtilities.invokeLater(() -> onCode.accept(dc));

            consumeGitHubToken(clientId, dc.deviceCode, dc.interval, dc.expiresIn);
            Author me = Api.me();
            if (me == null) throw new IOException("已取得令牌但校验失败，请重试");
            user = me;
            save(token, me);
            return me;
        }, me -> { if (onOk != null) onOk.accept(me); },
           onErr != null ? onErr : e -> { });
    }

    /** 设备码轮询：拿到 token 写入 Session。 */
    private static void consumeGitHubToken(String clientId, String deviceCode, int interval, int expiresIn)
            throws Exception {
        long deadline = System.currentTimeMillis() + expiresIn * 1000L;
        while (System.currentTimeMillis() < deadline) {
            Thread.sleep(interval * 1000L);
            HttpResponse<String> res = HTTP.send(HttpRequest.newBuilder(
                            URI.create("https://github.com/login/oauth/access_token"))
                    .timeout(Duration.ofSeconds(20))
                    .header("Accept", "application/json")
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .POST(HttpRequest.BodyPublishers.ofString(
                            "client_id=" + clientId
                                    + "&device_code=" + deviceCode
                                    + "&grant_type=urn:ietf:params:oauth:grant-type:device_code"))
                    .build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            Map<String, Object> d = Json.obj(res.body());
            String t = Json.str(d, "access_token");
            if (t != null && !t.isBlank()) { token = t; return; }
            String err = Json.str(d, "error", "");
            if ("authorization_pending".equals(err)) continue;
            if ("slow_down".equals(err)) { Thread.sleep(5000); continue; }
            throw new IOException(Json.str(d, "error_description", "授权失败：" + err));
        }
        throw new IOException("授权超时，请重新发起登录");
    }

    /** 从 oauth/login 的 302 Location 里解析 client_id（公开信息）。 */
    public static String resolveClientId() {
        try {
            String loc = Api.loginRedirect();
            int i = loc.indexOf("client_id=");
            if (i < 0) return null;
            String v = loc.substring(i + "client_id=".length());
            int amp = v.indexOf('&');
            if (amp >= 0) v = v.substring(0, amp);
            return v.isBlank() || "undefined".equals(v) ? null : v;
        } catch (Exception e) {
            return null;
        }
    }

    /** 用系统浏览器打开登录页（网页端登录，登完可复制令牌回来手动登录）。 */
    public static void openBrowserLogin() {
        try {
            java.awt.Desktop.getDesktop().browse(URI.create(Config.OAUTH + "/login"));
        } catch (Exception e) {
            try { new ProcessBuilder("cmd", "/c", "start", "", Config.OAUTH + "/login").start(); }
            catch (IOException ignore) { }
        }
    }

    /** 供界面展示的键值对（调试用）。 */
    public static Map<String, String> snapshot() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("loggedIn", String.valueOf(loggedIn()));
        m.put("login", user == null ? "" : user.name());
        return m;
    }
}
